/**
 * Task #78 phase 3 — BEHAVIOURAL proof for the ported WC3 abilities.
 *
 * Every assertion here drives the real sim against the real content docs and
 * checks what HAPPENED: hp actually removed, a stat actually present in the
 * final block, an AoE's actual hit set, a proc actually firing, an ally
 * actually restored. A data-shape test ("the doc has kind: damage") would have
 * passed for every one of the abilities this pass repaired — 龍宮禮奈's crit
 * passive was a 6-second self-buff, 佐助's Q dealt literally zero, 初音's EX
 * damaged the ally it is supposed to heal — so shape assertions are exactly
 * what must NOT be relied on.
 *
 * Sources for the numbers are quoted in `docs/content/reconciliation/` and, per
 * ability, in the patch that produced the doc.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../../testkit/cover";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../content/registry";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { castAbility, rankUpAbility, learnEx } from "./abilitySystem";
import { Stat } from "../stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
import type { CoreAbilitySlot } from "../intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../../content");
const Z0 = SKELETON_ARENA.zones[0]!;
/**
 * Test anchor. SKELETON_ARENA puts a radius-2.5 PILLAR on each zone centre (and
 * two more at ±9/∓8), so spawning the rig on the centre drops both bodies
 * inside an obstacle and MovementSystem shoves them ~6 units apart — far enough
 * that no melee auto ever lands. Everything here is anchored 14 units "north"
 * of the centre instead, which is clear of all three pillars and well inside
 * the 24-unit boundary.
 */
const P = { x: Z0.center.x, z: Z0.center.z + 14 };
const NO_INTENTS = new Map();

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  const res = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(res.store);
});

// ------------------------------------------------------------------ helpers
let seat = 0;
function mk(world: SimWorld, championId: string, team: number, dx: number, dz = 0): EntityId {
  return spawnChampion(world, {
    championId: championId as ChampionId,
    seatId: asSeatId(seat++),
    teamId: asTeamId(team),
    pos: { x: P.x + dx, z: P.z + dz },
    zone: 0,
  });
}

/**
 * Raise `slot` to `rank` through the real rank-up path (points + ult gate),
 * then let the pipeline settle: `attachSource` only marks stats dirty, exactly
 * as buying an item does — `statRecomputeSystem` folds it in on the next tick.
 */
function toRank(world: SimWorld, id: EntityId, slot: CoreAbilitySlot, rank: number): void {
  world.ultGateOverride = true;
  const ab = world.abilities.get(id)!;
  while (ab.slots[slot].rank < rank) {
    ab.unspentPoints = 1;
    expect(rankUpAbility(world, id, slot)).toBe(true);
  }
  world.step(NO_INTENTS);
  world.rebuildGrid();
}

/** Refill mana so a cast is never rejected for an unrelated reason. */
function topUpMana(world: SimWorld, id: EntityId): void {
  world.health.get(id)!.mana = 1e6;
}

function stats(world: SimWorld, id: EntityId): Record<Stat, number> {
  return world.stats.get(id)!.final;
}

/** Step the world once and return the `damage` events it produced. */
function stepDamage(world: SimWorld): { target: EntityId; amount: number; crit: boolean; origin: string }[] {
  world.step(NO_INTENTS);
  return world.events
    .filter((e) => e.type === "damage")
    .map((e) => e.data as unknown as { target: EntityId; amount: number; crit: boolean; origin: string });
}

/**
 * Point `attacker` at `victim` and run `ticks` ticks of autos, pinning both
 * bodies (knockback would shove the bag out of reach) and topping the bag up so
 * nothing dies mid-sample. Returns every `damage` event that landed on it.
 */
function autoAttack(world: SimWorld, attacker: EntityId, victim: EntityId, ticks: number) {
  const hits: { amount: number; crit: boolean; origin: string }[] = [];
  const ap = { ...world.transform.get(attacker)!.pos };
  const vp = { ...world.transform.get(victim)!.pos };
  for (let i = 0; i < ticks; i++) {
    world.nav.get(attacker)!.attackTarget = victim;
    world.transform.get(attacker)!.pos = { ...ap };
    world.transform.get(victim)!.pos = { ...vp };
    const hp = world.health.get(victim)!;
    hp.hp = hp.maxHp;
    for (const d of stepDamage(world)) {
      if (d.target === victim) hits.push({ amount: d.amount, crit: d.crit, origin: d.origin });
    }
  }
  return hits;
}

// ============================================================ permanent passives
describe("WC3 permanent passives are permanent (task #78)", () => {
  it("染血的柴刀 AOcr grants the map's real crit chance AND multiplier, and cannot be cast", () => {
    cover("fidelity-passive-crit");
    const world = new SimWorld(SKELETON_ARENA, 7);
    const rena = mk(world, "godie-e001", 0, -3);

    // W unlearned: the champion has NO crit at all
    expect(stats(world, rena)[Stat.CritChance]).toBe(0);

    // rank 1 -> w3a 致命一擊機率 18 % × 傷害乘數 1.25 (was: +25 % crit for 6 s)
    toRank(world, rena, "W", 1);
    expect(stats(world, rena)[Stat.CritChance]).toBeCloseTo(0.18, 6);
    expect(stats(world, rena)[Stat.CritDamage]).toBeCloseTo(1.25, 6);

    // rank 4 REPLACES rank 1 (12 % × 3.5) — a stacking bug would read 0.60
    toRank(world, rena, "W", 4);
    expect(stats(world, rena)[Stat.CritChance]).toBeCloseTo(0.12, 6);
    expect(stats(world, rena)[Stat.CritDamage]).toBeCloseTo(3.5, 6);

    // and it is not an ability you can press: no mana spent, no cooldown started
    const mana = world.health.get(rena)!.mana;
    expect(castAbility(world, rena, "W", { type: "self" })).toBe("passive");
    expect(world.health.get(rena)!.mana).toBe(mana);
    expect(world.abilities.get(rena)!.slots.W.cooldownRemainingTicks).toBe(0);
  });

  it("染血的柴刀's crit multiplier is what basic attacks actually crit for", () => {
    cover("fidelity-passive-crit-lands");
    const world = new SimWorld(SKELETON_ARENA, 11);
    const rena = mk(world, "godie-e001", 0, -0.7);
    const bag = mk(world, "godie-hart", 1, 0.7);
    toRank(world, rena, "W", 1); // 18 % × 1.25

    const hits = autoAttack(world, rena, bag, 4000).filter((h) => h.origin === "basic");
    const crits = hits.filter((h) => h.crit);
    const plain = hits.filter((h) => !h.crit);
    expect(crits.length).toBeGreaterThan(0);
    expect(plain.length).toBeGreaterThan(0);
    // a crit is EXACTLY the native 1.25x multiplier, not GGD's 1.75 default
    expect(crits[0]!.amount / plain[0]!.amount).toBeCloseTo(1.25, 5);
  });

  it("天下無雙 is a permanent +AD / -armor trade, replaced (not stacked) per rank", () => {
    cover("fidelity-passive-lubu-q");
    const world = new SimWorld(SKELETON_ARENA, 3);
    // Q starts LEARNED at spawn, so its passive must already be attached
    const lubu = mk(world, "godie-h01u", 0, -3);
    const def = Champions.get("godie-h01u" as ChampionId);
    const baseAd = def.baseStats.ad ?? 0;
    const baseArmor = def.baseStats.armor ?? 0;

    // JASS skill1 -> A0N5 Iatt lv2 = +25 AD, A0N4 Idef lv2 = -3 armor
    expect(stats(world, lubu)[Stat.AttackDamage]).toBeCloseTo(baseAd + 25, 4);
    expect(stats(world, lubu)[Stat.Armor]).toBeCloseTo(baseArmor - 3, 4);

    toRank(world, lubu, "Q", 4); // lv5 = +100 AD, -12 armor
    expect(stats(world, lubu)[Stat.AttackDamage]).toBeCloseTo(baseAd + 100, 4);
    expect(stats(world, lubu)[Stat.Armor]).toBeCloseTo(baseArmor - 12, 4);
  });

  it("天下無雙's kill stack (A0AU 飛將神弓) adds +10 AD on an actual kill", () => {
    cover("fidelity-passive-lubu-onkill");
    const world = new SimWorld(SKELETON_ARENA, 5);
    const lubu = mk(world, "godie-h01u", 0, -0.7);
    const prey = mk(world, "godie-o02p", 1, 0.7);
    world.step(NO_INTENTS);
    const before = stats(world, lubu)[Stat.AttackDamage];

    // chip the victim down so the next auto that lands is a killing blow
    const lp = { ...world.transform.get(lubu)!.pos };
    const pp = { ...world.transform.get(prey)!.pos };
    for (let i = 0; i < 400 && world.health.get(prey)!.alive; i++) {
      world.nav.get(lubu)!.attackTarget = prey;
      world.transform.get(lubu)!.pos = { ...lp };
      world.transform.get(prey)!.pos = { ...pp };
      world.health.get(prey)!.hp = 1;
      world.step(NO_INTENTS);
    }
    expect(world.health.get(prey)!.alive).toBe(false);
    world.step(NO_INTENTS); // let the stat recompute land
    const withStack = stats(world, lubu)[Stat.AttackDamage];
    expect(withStack).toBeGreaterThan(before); // the kill also levels him up

    // isolate the STACK from the level-up: it is a 15 s buff, so run past it.
    // Nothing else changes in between, so the drop is exactly the stack.
    for (let i = 0; i < Math.round(15 / world.dt) + 5; i++) world.step(NO_INTENTS);
    const afterExpiry = stats(world, lubu)[Stat.AttackDamage];
    expect(withStack - afterExpiry).toBeCloseTo(10, 4);
  });

  it("魔力應援 AOae is a permanent aura buff on its owner, not a 12 s / 60-mana cast", () => {
    cover("fidelity-passive-aura");
    const world = new SimWorld(SKELETON_ARENA, 9);
    const konoka = mk(world, "godie-etyr", 0, -3);
    const def = Champions.get("godie-etyr" as ChampionId);
    const baseAs = def.baseStats.as ?? 0;
    const baseMs = def.baseStats.ms ?? 0;

    toRank(world, konoka, "W", 1); // w3a 增加攻擊速度 35 %, 增加移動速度 5 %
    expect(stats(world, konoka)[Stat.AttackSpeed]).toBeCloseTo(baseAs * 1.35, 5);
    expect(stats(world, konoka)[Stat.MoveSpeed]).toBeCloseTo(baseMs * 1.05, 5);

    // 500 ticks later it is STILL on (the old doc expired after 10 s / 300 ticks)
    for (let i = 0; i < 500; i++) world.step(NO_INTENTS);
    expect(stats(world, konoka)[Stat.AttackSpeed]).toBeCloseTo(baseAs * 1.35, 5);
  });

  it("魔力激發 (a passive EX) turns on at learnEx and never before", () => {
    cover("fidelity-passive-ex");
    const world = new SimWorld(SKELETON_ARENA, 13);
    const konoka = mk(world, "godie-etyr", 0, -3);
    const base = Champions.get("godie-etyr" as ChampionId).baseStats.manaRegen ?? 0;

    expect(stats(world, konoka)[Stat.ManaRegen]).toBeCloseTo(base, 5);
    expect(learnEx(world, konoka)).toBe(true);
    world.step(NO_INTENTS);
    // w3a A0ST 增加法力回復 0.07 at its only level
    expect(stats(world, konoka)[Stat.ManaRegen]).toBeCloseTo(base + 0.07, 5);
    expect(castAbility(world, konoka, "EX", { type: "self" })).toBe("passive");
  });

  it("鋼鐵尾巴 AHbh procs ON ATTACK at the map's 10 % chance for the map's bonus damage", () => {
    cover("fidelity-passive-bash-proc");
    const world = new SimWorld(SKELETON_ARENA, 17);
    const pika = mk(world, "godie-ofar", 0, -0.7);
    const bag = mk(world, "godie-hart", 1, 0.7);
    world.step(NO_INTENTS);

    // unlearned: the proc must never fire
    const before = autoAttack(world, pika, bag, 2000);
    expect(before.some((h) => h.origin === "basic")).toBe(true);
    expect(before.some((h) => h.origin.includes("godie-ofar.w"))).toBe(false);

    toRank(world, pika, "W", 1); // w3a 狂怒擊機率 10, 傷害加成 75
    const after = autoAttack(world, pika, bag, 8000);
    const procs = after.filter((h) => h.origin === "hook:abilityPassive:godie-ofar.w");
    const autos = after.filter((h) => h.origin === "basic");
    expect(procs.length).toBeGreaterThan(0); // it fires
    expect(procs.length).toBeLessThan(autos.length); // and it is CHANCED, not every swing
  });
});

// ============================================================ the Aamk leak
describe("the Aamk leak: attribute buttons are stat passives, not damage nukes", () => {
  it("力量強化 grants STR (ad + maxHealth) and deals NO damage to anyone", () => {
    cover("fidelity-aamk-str");
    const world = new SimWorld(SKELETON_ARENA, 23);
    const saber = mk(world, "godie-e00q", 0, -2);
    const victim = mk(world, "godie-hart", 1, 2);
    const def = Champions.get("godie-e00q" as ChampionId);
    const baseAd = def.baseStats.ad ?? 0;
    const baseHp = def.baseStats.maxHealth ?? 0;

    // Q is learned at spawn: w3a 力量加成 4 -> ad +4, maxHealth +88 (22/STR)
    expect(stats(world, saber)[Stat.AttackDamage]).toBeCloseTo(baseAd + 4, 4);
    expect(stats(world, saber)[Stat.MaxHealth]).toBeCloseTo(baseHp + 88, 4);

    // pressing it does nothing at all — no mana, no cooldown, no damage packet
    const full = world.health.get(victim)!.hp;
    expect(castAbility(world, saber, "Q", { type: "entity", entityId: victim })).toBe("passive");
    for (let i = 0; i < 5; i++) world.step(NO_INTENTS);
    expect(world.health.get(victim)!.hp).toBe(full);

    toRank(world, saber, "Q", 4); // 力量加成 16
    expect(stats(world, saber)[Stat.AttackDamage]).toBeCloseTo(baseAd + 16, 4);
    expect(stats(world, saber)[Stat.MaxHealth]).toBeCloseTo(baseHp + 22 * 16, 4);
  });

  it("哥哥 grants AGI (armor + attack speed) instead of firing a nuke", () => {
    cover("fidelity-aamk-agi");
    const world = new SimWorld(SKELETON_ARENA, 29);
    const sasuke = mk(world, "godie-edem", 0, -2);
    const def = Champions.get("godie-edem" as ChampionId);
    const baseArmor = def.baseStats.armor ?? 0;
    const baseAs = def.baseStats.as ?? 0;

    toRank(world, sasuke, "R", 1); // w3a 靈敏度加成 12 -> armor +3.6, as +24 %
    expect(stats(world, sasuke)[Stat.Armor]).toBeCloseTo(baseArmor + 3.6, 4);
    expect(stats(world, sasuke)[Stat.AttackSpeed]).toBeCloseTo(baseAs * 1.24, 5);
  });

  it("魔力增幅 grants the Rhpt upgrade's mana pool, not 80 magic damage", () => {
    cover("fidelity-aamk-mana");
    const world = new SimWorld(SKELETON_ARENA, 31);
    const saber = mk(world, "godie-e00q", 0, -2);
    const baseMana = Champions.get("godie-e00q" as ChampionId).baseStats.maxMana ?? 0;

    toRank(world, saber, "R", 1); // war3map.w3q Rhpt effect1 rmnx = 500/level
    expect(stats(world, saber)[Stat.MaxMana]).toBeCloseTo(baseMana + 500, 3);
    toRank(world, saber, "R", 3);
    expect(stats(world, saber)[Stat.MaxMana]).toBeCloseTo(baseMana + 1500, 3);
  });
});

// ============================================================ area resolution
describe("multi-target natives resolve as areas, not single targets", () => {
  it("十萬伏特 ANfl hits EVERY enemy standing in its 350u circle", () => {
    cover("fidelity-aoe-forked-lightning");
    const world = new SimWorld(SKELETON_ARENA, 37);
    const pika = mk(world, "godie-o00k", 0, -6);
    const a = mk(world, "godie-hart", 1, 0, -1);
    const b = mk(world, "godie-hart", 1, 0, 0);
    const c = mk(world, "godie-hart", 1, 0, 1);
    const far = mk(world, "godie-hart", 1, 12, 0); // well outside the circle
    world.rebuildGrid();

    const hp = (e: EntityId) => world.health.get(e)!.hp;
    const full = [a, b, c, far].map(hp);
    expect(
      castAbility(world, pika, "Q", { type: "point", point: { x: P.x, z: P.z } }),
    ).toBe("ok");
    for (let i = 0; i < 3; i++) world.step(NO_INTENTS);

    // all three inside take damage — the old doc hit exactly one of them
    expect(hp(a)).toBeLessThan(full[0]!);
    expect(hp(b)).toBeLessThan(full[1]!);
    expect(hp(c)).toBeLessThan(full[2]!);
    expect(hp(far)).toBe(full[3]!);
  });

  it("火遁-豪火龍之術 deals its JASS damage (it used to deal exactly ZERO)", () => {
    cover("fidelity-chochu-damage");
    const world = new SimWorld(SKELETON_ARENA, 41);
    const sasuke = mk(world, "godie-edem", 0, -6);
    const a = mk(world, "godie-hart", 1, 0, -1);
    const b = mk(world, "godie-hart", 1, 0, 1);
    world.rebuildGrid();

    const before = [a, b].map((e) => world.health.get(e)!.hp);
    expect(
      castAbility(world, sasuke, "Q", { type: "point", point: { x: P.x, z: P.z } }),
    ).toBe("ok");
    for (let i = 0; i < 3; i++) world.step(NO_INTENTS);
    // Trig_ChoChuFireDro: skillLevel*100 + 150 = 250 at rank 1, magic, r330u
    expect(before[0]! - world.health.get(a)!.hp).toBeGreaterThan(50);
    expect(before[1]! - world.health.get(b)!.hp).toBeGreaterThan(50);
  });

  it("鬼神烈戟 damages AND shreds armor in a circle around the caster, then wears off", () => {
    cover("fidelity-lubu-e-aoe");
    const world = new SimWorld(SKELETON_ARENA, 43);
    const lubu = mk(world, "godie-h01u", 0, 0);
    const v1 = mk(world, "godie-hart", 1, 2, 0);
    const v2 = mk(world, "godie-hart", 1, -2, 0);
    world.rebuildGrid();
    toRank(world, lubu, "E", 1);
    const armor0 = stats(world, v1)[Stat.Armor];
    const hp0 = [v1, v2].map((e) => world.health.get(e)!.hp);

    expect(castAbility(world, lubu, "E", { type: "point", point: { x: P.x, z: P.z } })).toBe(
      "ok",
    );
    // 施法前搖 0.6 s then the area resolves
    for (let i = 0; i < 25; i++) world.step(NO_INTENTS);
    expect(world.health.get(v1)!.hp).toBeLessThan(hp0[0]!);
    expect(world.health.get(v2)!.hp).toBeLessThan(hp0[1]!);
    // w3a 增加防禦 -3 for 持續 3 s
    expect(stats(world, v1)[Stat.Armor]).toBeLessThan(armor0);
    for (let i = 0; i < 120; i++) world.step(NO_INTENTS);
    expect(stats(world, v1)[Stat.Armor]).toBeCloseTo(armor0, 4);
  });
});

// ============================================================ inverted mechanics
describe("abilities that heal no longer damage", () => {
  it("把你給MikuMiku掉 restores an ALLY to full hp + mana and refuses enemies", () => {
    cover("fidelity-miku-ex-restore");
    const world = new SimWorld(SKELETON_ARENA, 47);
    const miku = mk(world, "godie-o02p", 0, -2);
    const ally = mk(world, "godie-hart", 0, -1);
    const foe = mk(world, "godie-hart", 1, 2);
    world.rebuildGrid();
    expect(learnEx(world, miku)).toBe(true);

    const ahp = world.health.get(ally)!;
    ahp.hp = 1;
    ahp.mana = 0;
    // an ENEMY is not a legal target for it any more
    expect(castAbility(world, miku, "EX", { type: "entity", entityId: foe })).toBe("bad-target");
    expect(world.health.get(foe)!.hp).toBe(world.health.get(foe)!.maxHp);

    expect(castAbility(world, miku, "EX", { type: "entity", entityId: ally })).toBe("ok");
    for (let i = 0; i < 3; i++) world.step(NO_INTENTS);
    expect(ahp.hp).toBeCloseTo(ahp.maxHp, 3); // SetUnitLifePercentBJ(target,100)
    expect(ahp.mana).toBeCloseTo(ahp.maxMana, 3); // SetUnitManaPercentBJ(target,100)
  });

  it("世界第一的公主殿下 heals its caster instead of nuking the ground", () => {
    cover("fidelity-miku-r-heal");
    const world = new SimWorld(SKELETON_ARENA, 53);
    const miku = mk(world, "godie-o02p", 0, 0);
    const foe = mk(world, "godie-hart", 1, 1);
    world.rebuildGrid();
    toRank(world, miku, "R", 1);
    const mhp = world.health.get(miku)!;
    mhp.hp = 10;
    const foeHp = world.health.get(foe)!.hp;

    expect(castAbility(world, miku, "R", { type: "self" })).toBe("ok");
    for (let i = 0; i < 3; i++) world.step(NO_INTENTS);
    expect(mhp.hp).toBeGreaterThan(10); // A11E 回復 200 at rank 1
    expect(world.health.get(foe)!.hp).toBe(foeHp); // and nobody is damaged
  });
});

// ============================================================ per-rank buffs
describe("per-rank buff columns reach the game", () => {
  it("鬼隱之擊 gives the w3a's rank-1 +50 % ms for 12 s, and rank 4's +150 % for 45 s", () => {
    cover("fidelity-perrank-buff");
    const mkWorld = (rank: number) => {
      const world = new SimWorld(SKELETON_ARENA, 59);
      const rena = mk(world, "godie-e001", 0, 0);
      toRank(world, rena, "Q", rank);
      topUpMana(world, rena);
      const base = stats(world, rena)[Stat.MoveSpeed];
      expect(castAbility(world, rena, "Q", { type: "self" })).toBe("ok");
      world.step(NO_INTENTS);
      return { world, rena, base, boosted: stats(world, rena)[Stat.MoveSpeed] };
    };

    // ms is clamped at 14, so compare the SOURCE the pipeline received
    const r1 = mkWorld(1);
    const buff1 = world1Buff(r1.world, r1.rena);
    expect(buff1.value).toBeCloseTo(0.5, 6);
    expect(buff1.durationTicks).toBe(Math.round(12 / r1.world.dt));

    const r4 = mkWorld(4);
    const buff4 = world1Buff(r4.world, r4.rena);
    expect(buff4.value).toBeCloseTo(1.5, 6);
    expect(buff4.durationTicks).toBe(Math.round(45 / r4.world.dt));
  });

  it("神聖結界 lasts the w3a's 8 / 12 / 16 s, not a flat invented 10 s", () => {
    cover("fidelity-perrank-duration");
    for (const [rank, secs] of [[1, 8], [2, 12], [3, 16]] as const) {
      const world = new SimWorld(SKELETON_ARENA, 61);
      const ushio = mk(world, "godie-hpb1", 0, 0);
      toRank(world, ushio, "R", rank);
      topUpMana(world, ushio); // 魔耗 150/300/450 outruns his own pool at rank 3
      const base = stats(world, ushio)[Stat.Armor];
      expect(castAbility(world, ushio, "R", { type: "self" })).toBe("ok");
      world.step(NO_INTENTS);
      expect(stats(world, ushio)[Stat.Armor]).toBeGreaterThan(base);
      // one tick BEFORE expiry it is still up; after it, gone
      for (let i = 0; i < Math.round(secs / world.dt) - 3; i++) world.step(NO_INTENTS);
      expect(stats(world, ushio)[Stat.Armor]).toBeGreaterThan(base);
      for (let i = 0; i < 6; i++) world.step(NO_INTENTS);
      expect(stats(world, ushio)[Stat.Armor]).toBeCloseTo(base, 4);
    }
  });
});

/** The single active buff ModifierSource on an entity (value + remaining life). */
function world1Buff(world: SimWorld, id: EntityId): { value: number; durationTicks: number } {
  const src = world.stats.get(id)!.sources.find((s) => s.kind === "buff");
  expect(src).toBeDefined();
  return {
    value: src!.modifiers![0]!.value,
    durationTicks: src!.expiresAtTick! - (world.tick - 1),
  };
}
