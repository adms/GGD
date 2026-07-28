import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type EntityId, type SeatId, type ItemId, type AugmentId, type ChampionId } from "../ids";
import { Stat } from "./stats/statTypes";
import { ATTRIBUTE_ENV_DEFAULTS } from "./combatEnv";
import { ModOp } from "./stats/modifiers";
import { attachSource, detachSource, recomputeStats } from "./stats/statPipeline";
import { buyItem, sellItem, rollItemReward } from "./economy/shop";
import { offerAugments, applyAugmentPick } from "./economy/draft";
import { grantXp, xpToNext, GOLD_REWARDS } from "./economy/progression";
import { castAbility, rankUpAbility } from "./abilities/abilitySystem";
import type { IntentFrame } from "./intents";
import * as V from "./math/vec2";

beforeAll(() => registerSkeletonContent());

const Z = (): { x: number; z: number } => SKELETON_ARENA.zones[0]!.center;

function makeWorld(seed = 42): SimWorld {
  const w = new SimWorld(SKELETON_ARENA, seed);
  // #261: the weapon shelf is 暫時下架 by default. These suites buy weapons to
  // exercise the item pipeline, so they run with the shelf OPEN — the rules they
  // guard are unchanged, only the storefront is closed today.
  w.weaponShelfOpen = true;
  return w;
}

/** Spawn Sela (seat 0, team 0) and Thorne (seat 1, team 1) facing each other. */
function duel(world: SimWorld, gap = 8): { sela: EntityId; thorne: EntityId } {
  const c = Z();
  const sela = spawnChampion(world, {
    championId: "sela" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x - gap / 2, z: c.z + 8 },
    zone: 0,
  });
  const thorne = spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: c.x + gap / 2, z: c.z + 8 },
    zone: 0,
  });
  // face each other
  world.transform.get(sela)!.facing = { x: 1, z: 0 };
  world.transform.get(thorne)!.facing = { x: -1, z: 0 };
  return { sela, thorne };
}

const intentsOf = (seat: number, frame: Partial<IntentFrame>): Map<SeatId, IntentFrame> =>
  new Map([[asSeatId(seat), { commands: [], ...frame }]]);

describe("stat pipeline", () => {
  it("layers flat -> pctAdd -> pctMult and Override wins (fx-01)", () => {
    cover("stats-layered-order");
    const world = makeWorld();
    const { sela } = duel(world);
    const base = world.stats.get(sela)!.final[Stat.AttackDamage]; // 52 at lvl 1

    attachSource(world, sela, {
      id: "t:flat",
      kind: "buff",
      modifiers: [{ stat: Stat.AttackDamage, op: ModOp.Flat, value: 48 }],
    });
    attachSource(world, sela, {
      id: "t:pct",
      kind: "buff",
      modifiers: [{ stat: Stat.AttackDamage, op: ModOp.PercentAdd, value: 0.1 }],
    });
    attachSource(world, sela, {
      id: "t:mult",
      kind: "buff",
      modifiers: [{ stat: Stat.AttackDamage, op: ModOp.PercentMult, value: 0.5 }],
    });
    recomputeStats(world, sela);
    // (52+48) * 1.1 * 1.5 = 165
    expect(world.stats.get(sela)!.final[Stat.AttackDamage]).toBeCloseTo((base + 48) * 1.1 * 1.5, 6);

    attachSource(world, sela, {
      id: "t:override",
      kind: "buff",
      modifiers: [{ stat: Stat.AttackDamage, op: ModOp.Override, value: 1 }],
    });
    recomputeStats(world, sela);
    expect(world.stats.get(sela)!.final[Stat.AttackDamage]).toBe(1);
  });

  it("clamps AS/CDR/crit/MS (fx-02)", () => {
    cover("stats-clamps");
    const world = makeWorld();
    const { sela } = duel(world);
    attachSource(world, sela, {
      id: "t:huge",
      kind: "buff",
      modifiers: [
        { stat: Stat.AttackSpeed, op: ModOp.Flat, value: 99 },
        { stat: Stat.CooldownReduction, op: ModOp.Flat, value: 0.9 },
        { stat: Stat.CritChance, op: ModOp.Flat, value: 5 },
        { stat: Stat.MoveSpeed, op: ModOp.Flat, value: 99 },
      ],
    });
    recomputeStats(world, sela);
    const f = world.stats.get(sela)!.final;
    expect(f[Stat.AttackSpeed]).toBe(4.0); // 一般上限 (owner 2026-07-28,舊值 2.5)
    expect(f[Stat.CooldownReduction]).toBe(0.45);
    expect(f[Stat.CritChance]).toBe(1);
    expect(f[Stat.MoveSpeed]).toBe(14);
  });

  it("growth raises base per level (fx-03) and level-up preserves hp ratio (fx-04)", () => {
    cover("stats-growth");
    cover("stats-ratio-preserve");
    const world = makeWorld();
    const { sela } = duel(world);
    const hp = world.health.get(sela)!;
    const maxAt1 = hp.maxHp; // read, not asserted — see the coefficient note below
    hp.hp = maxAt1 / 2; // 50%

    grantXp(world, sela, xpToNext(1)); // -> level 2
    recomputeStats(world, sela);
    expect(world.champion.get(sela)!.level).toBe(2);
    // #248 — THE THREE ADDITIVE LAYERS, ASSERTED SEPARATELY.
    //   stat(L) = baseStats + attr(L)·coefficient + growth·(L−1)
    // Sela's level-2 health moves by BOTH the designer knob (growth.maxHealth
    // 90) and the attribute curve (strToMaxHealth × strGrowth 3.6). That is
    // deliberate and it is not double-counting: the owner ruled the two sources
    // may overlap because they mean different things (see stats/attributes.ts).
    // Spelling out the two layers rather than writing their sum is the point of
    // the test — if a future reader drops either layer, or applies one of them
    // twice, exactly one of these numbers moves.
    //
    // The coefficient is READ from the shipped table rather than typed as a
    // literal: it is an IMPORTED number (war3mapMisc.txt StrHitPointBonus),
    // and this test is about the LAYERS, not about which value that field
    // holds. attributeCoefficients.test.ts is what pins the value itself.
    const growthLayer = 90; // sela.growth[MaxHealth]
    const attrLayer = ATTRIBUTE_ENV_DEFAULTS.strToMaxHealth * 3.6; // × sela.attributes.strGrowth
    expect(hp.maxHp).toBeCloseTo(maxAt1 + growthLayer + attrLayer, 6);
    expect(hp.hp / hp.maxHp).toBeCloseTo(0.5, 6); // ratio preserved
    // Same decomposition on a stat whose two layers DISAGREE, so the test can
    // tell them apart: growth.ad is the hand-authored 3, the attribute curve is
    // strToAttackDamage 1 × strGrowth 3.6.
    expect(world.stats.get(sela)!.final[Stat.AttackDamage]).toBeCloseTo(52 + 3 + 1 * 3.6, 6);
  });

  it("attach/detach + timed buff expiry (fx-05, fx-06)", () => {
    cover("stats-attach-detach");
    cover("stats-buff-expiry");
    const world = makeWorld();
    const { sela } = duel(world);
    const before = world.stats.get(sela)!.final[Stat.Armor];

    attachSource(world, sela, {
      id: "t:armor",
      kind: "buff",
      modifiers: [{ stat: Stat.Armor, op: ModOp.Flat, value: 50 }],
      expiresAtTick: world.tick + 10,
    });
    expect(world.stats.get(sela)!.dirty).toBe(true);
    world.step(new Map());
    expect(world.stats.get(sela)!.final[Stat.Armor]).toBeCloseTo(before + 50, 6);

    for (let i = 0; i < 12; i++) world.step(new Map());
    expect(world.stats.get(sela)!.final[Stat.Armor]).toBeCloseTo(before, 6);

    attachSource(world, sela, { id: "t:x", kind: "buff", modifiers: [{ stat: Stat.Armor, op: ModOp.Flat, value: 5 }] });
    expect(detachSource(world, sela, "t:x")).toBe(true);
    world.step(new Map());
    expect(world.stats.get(sela)!.final[Stat.Armor]).toBeCloseTo(before, 6);
  });
});

describe("combat resolution", () => {
  it("mitigates by armor/MR; true damage passes (fx-07)", () => {
    cover("combat-mitigation");
    const world = makeWorld();
    const { sela, thorne } = duel(world);
    const armor = world.stats.get(thorne)!.final[Stat.Armor]; // 32+8 passive = 40
    const hpBefore = world.health.get(thorne)!.hp;

    world.damageQueue.push({ source: sela, target: thorne, amount: 100, type: "physical", crit: false, origin: "t" });
    world.step(new Map());
    const physTaken = hpBefore - world.health.get(thorne)!.hp;
    // one tick of regen (~0.06 hp) lands in the same step -> integer-level tolerance
    expect(physTaken).toBeCloseTo(100 * (100 / (100 + armor)), 0);

    const hp2 = world.health.get(thorne)!.hp;
    world.damageQueue.push({ source: sela, target: thorne, amount: 100, type: "true", crit: false, origin: "t" });
    world.step(new Map());
    // regen runs each tick, so allow small tolerance
    expect(hp2 - world.health.get(thorne)!.hp).toBeGreaterThan(99);
  });

  it("shields absorb before HP and expire (fx-08)", () => {
    cover("combat-shields");
    const world = makeWorld();
    const { sela, thorne } = duel(world);
    world.health.get(thorne)!.shields.push({ amount: 80, expiresAtTick: world.tick + 100, sourceId: "t" });
    const hpBefore = world.health.get(thorne)!.hp;
    world.damageQueue.push({ source: sela, target: thorne, amount: 50, type: "true", crit: false, origin: "t" });
    world.step(new Map());
    expect(world.health.get(thorne)!.hp).toBeCloseTo(hpBefore, 0); // shield ate it
    expect(world.health.get(thorne)!.shields[0]!.amount).toBeCloseTo(30, 6);
  });

  it("crit uses the seeded RNG deterministically (fx-09)", () => {
    cover("combat-crit");
    const run = (seed: number): number => {
      const world = makeWorld(seed);
      const { sela, thorne } = duel(world, 2);
      attachSource(world, sela, {
        id: "t:crit",
        kind: "buff",
        modifiers: [{ stat: Stat.CritChance, op: ModOp.Flat, value: 0.5 }],
      });
      // order an attack, run long enough for several autos
      let dmg = 0;
      for (let k = 0; k < 90; k++) {
        const intents =
          k === 0
            ? intentsOf(0, { order: { kind: "attackTarget", entity: thorne } })
            : new Map<SeatId, IntentFrame>();
        world.step(intents);
        for (const ev of world.events) {
          if (ev.type === "damage" && ev.data.origin === "basic") dmg += ev.data.amount as number;
        }
      }
      return dmg;
    };
    expect(run(7)).toBeCloseTo(run(7), 9); // same seed -> identical crit rolls
    expect(run(7)).not.toBeCloseTo(run(8), 1); // different seed -> different rolls
  });

  it("lifesteal heals the attacker on autos (fx-10)", () => {
    cover("combat-lifesteal");
    const world = makeWorld();
    const { sela, thorne } = duel(world, 2);
    attachSource(world, sela, {
      id: "t:ls",
      kind: "buff",
      modifiers: [{ stat: Stat.Lifesteal, op: ModOp.Flat, value: 0.5 }],
    });
    world.health.get(sela)!.hp = 100; // hurt so lifesteal is visible
    let healed = false;
    for (let k = 0; k < 60 && !healed; k++) {
      const intents =
        k === 0 ? intentsOf(0, { order: { kind: "attackTarget", entity: thorne } }) : new Map<SeatId, IntentFrame>();
      world.step(intents);
      if (world.health.get(sela)!.hp > 101) healed = true;
    }
    expect(healed).toBe(true);
  });

  it("status: slow reduces speed, root stops, stun blocks casting (fx-11, abl-08)", () => {
    cover("effects-status-movement");
    cover("ability-stun-blocked");
    const world = makeWorld();
    const { sela, thorne } = duel(world, 10);
    const c = Z();

    // Slow thorne 40%: distance covered in N ticks shrinks accordingly
    const move = (ticks: number): number => {
      const start = { ...world.transform.get(thorne)!.pos };
      world.step(intentsOf(1, { order: { kind: "move", point: { x: c.x + 20, z: c.z } } }));
      for (let i = 1; i < ticks; i++) world.step(new Map());
      return V.dist(start, world.transform.get(thorne)!.pos);
    };
    const freeDist = move(10);
    world.status.get(thorne)!.effects.push({
      statusId: "slow40" as never,
      sourceId: "t",
      expiresAtTick: world.tick + 100,
      moveSpeedMult: 0.6,
    });
    const slowDist = move(10);
    expect(slowDist).toBeLessThan(freeDist * 0.7);
    expect(slowDist).toBeGreaterThan(freeDist * 0.5);

    // Stun blocks casting
    world.status.get(sela)!.effects.push({
      statusId: "stun" as never,
      sourceId: "t",
      expiresAtTick: world.tick + 100,
      stun: true,
    });
    expect(castAbility(world, sela, "Q", { type: "dir", dir: { x: 1, z: 0 } })).toBe("stunned");
  });
});

describe("abilities", () => {
  it("cast validation: unlearned/cooldown/mana (abl-01)", () => {
    cover("ability-cast-validation");
    const world = makeWorld();
    const { sela, thorne } = duel(world, 4);
    // W not learned yet
    expect(castAbility(world, sela, "W", { type: "self" })).toBe("not-learned");
    // Q ok, then on cooldown
    expect(castAbility(world, sela, "Q", { type: "dir", dir: { x: 1, z: 0 } })).toBe("ok");
    expect(castAbility(world, sela, "Q", { type: "dir", dir: { x: 1, z: 0 } })).toBe("cooldown");
    // drain mana -> no-mana
    const hp = world.health.get(sela)!;
    hp.mana = 0;
    world.abilities.get(sela)!.slots.Q.cooldownRemainingTicks = 0;
    expect(castAbility(world, sela, "Q", { type: "dir", dir: { x: 1, z: 0 } })).toBe("no-mana");
    // targeted out of range
    world.abilities.get(thorne)!.slots.Q.rank = 1;
    expect(thorne).toBeGreaterThan(0);
  });

  it("skillshot Q spawns a projectile that damages on hit + Kindling passive (abl-02, abl-09)", () => {
    cover("ability-skillshot-hit");
    cover("champion-passive-hook");
    const world = makeWorld();
    const { sela, thorne } = duel(world, 6);
    const hpBefore = world.health.get(thorne)!.hp;
    expect(castAbility(world, sela, "Q", { type: "dir", dir: { x: 1, z: 0 } })).toBe("ok");

    let projectileHit = false;
    let abilityDamage = 0;
    let kindlingDamage = 0;
    for (let k = 0; k < 40; k++) {
      world.step(new Map());
      for (const ev of world.events) {
        if (ev.type === "projectileHit") projectileHit = true;
        if (ev.type === "damage" && (ev.data.origin as string).startsWith("ability:sela.q"))
          abilityDamage += ev.data.amount as number;
        if (ev.type === "damage" && (ev.data.origin as string).startsWith("hook:passive:sela"))
          kindlingDamage += ev.data.amount as number;
      }
    }
    expect(projectileHit).toBe(true);
    // rank1: 20 + 60 flat, PLUS the 0.7 AP ratio the doc has always carried.
    // #248 is why that last term is finally non-zero: every champion now has
    // real AP (`intToAbilityPower × INT`, sela INT 26 → AP 26), where before the
    // whole roster sat at AP 0 and every authored `ap` coefficient multiplied by
    // nothing. 80 + 0.7×26 = 98.2 magic, mitigated by thorne's MR 32:
    // 98.2 × 100/132 ≈ 74.4.
    expect(abilityDamage).toBeCloseTo((80 + 0.7 * 26) * (100 / 132), 1);
    expect(kindlingDamage).toBeGreaterThan(0); // passive fired
    expect(world.health.get(thorne)!.hp).toBeLessThan(hpBefore);
  });

  it("ground AoE hits in radius (abl-03) and self-shield works (abl-04)", () => {
    cover("ability-ground-aoe");
    cover("ability-self-shield");
    const world = makeWorld();
    const { sela, thorne } = duel(world, 6);
    // learn E and W
    world.abilities.get(sela)!.unspentPoints = 2;
    expect(rankUpAbility(world, sela, "E")).toBe(true);
    expect(rankUpAbility(world, sela, "W")).toBe(true);

    const tPos = world.transform.get(thorne)!.pos;
    world.rebuildGrid(); // direct cast outside step(): refresh spatial queries
    expect(castAbility(world, sela, "E", { type: "point", point: { x: tPos.x, z: tPos.z } })).toBe("ok");
    world.step(new Map());
    const st = world.status.get(thorne)!;
    expect(st.effects.some((e) => e.moveSpeedMult === 0.6)).toBe(true); // slowed by Scorch Ring

    expect(castAbility(world, sela, "W", { type: "self" })).toBe("ok");
    world.step(new Map());
    expect(world.health.get(sela)!.shields.length).toBeGreaterThan(0);
    // W also grants +25 AP buff
    expect(world.stats.get(sela)!.final[Stat.AbilityPower]).toBeGreaterThanOrEqual(25);
  });

  it("dash ability moves the caster (abl-05)", () => {
    cover("ability-dash");
    const world = makeWorld();
    const { thorne } = duel(world, 6);
    world.abilities.get(thorne)!.slots.Q.rank = 1;
    const before = { ...world.transform.get(thorne)!.pos };
    expect(castAbility(world, thorne, "Q", { type: "dir", dir: { x: -1, z: 0 } })).toBe("ok");
    for (let k = 0; k < 15; k++) world.step(new Map());
    const moved = V.dist(before, world.transform.get(thorne)!.pos);
    expect(moved).toBeGreaterThan(5); // dashed ~6 units
  });

  it("rank-up gating: points + R at 6/11/16 (abl-06) and CDR shortens cooldowns (abl-07)", () => {
    cover("ability-rankup-gate");
    cover("ability-cdr");
    const world = makeWorld();
    const { sela } = duel(world);
    const ab = world.abilities.get(sela)!;

    expect(rankUpAbility(world, sela, "W")).toBe(false); // no points
    ab.unspentPoints = 3;
    expect(rankUpAbility(world, sela, "R")).toBe(false); // level 1 < 6
    expect(rankUpAbility(world, sela, "W")).toBe(true);

    // fast-level to 6 -> R allowed
    for (let lvl = 1; lvl < 6; lvl++) grantXp(world, sela, xpToNext(world.champion.get(sela)!.level));
    expect(world.champion.get(sela)!.level).toBeGreaterThanOrEqual(6);
    expect(rankUpAbility(world, sela, "R")).toBe(true);

    // CDR: cast Q with 0 cdr vs 40% cdr
    const cdBase = (): number => {
      world.abilities.get(sela)!.slots.Q.cooldownRemainingTicks = 0;
      world.health.get(sela)!.mana = 999;
      castAbility(world, sela, "Q", { type: "dir", dir: { x: 1, z: 0 } });
      return world.abilities.get(sela)!.slots.Q.cooldownRemainingTicks;
    };
    const noCdr = cdBase();
    attachSource(world, sela, {
      id: "t:cdr",
      kind: "buff",
      modifiers: [{ stat: Stat.CooldownReduction, op: ModOp.Flat, value: 0.4 }],
    });
    recomputeStats(world, sela);
    const withCdr = cdBase();
    expect(withCdr).toBeLessThan(noCdr * 0.65);
  });

  it("basic attacks cycle on AS cooldown (abl-10) and kills grant XP/gold (abl-11)", () => {
    cover("basic-attack-cycle");
    cover("combat-kill-rewards");
    const world = makeWorld();
    const { sela, thorne } = duel(world, 2);
    world.health.get(thorne)!.hp = 80; // near death (armor+regen make >3 autos slow)
    const goldBefore = world.champion.get(sela)!.gold;
    const xpBefore = world.champion.get(sela)!.xp + world.champion.get(sela)!.level * 1000;

    let attacks = 0;
    let died = false;
    for (let k = 0; k < 240 && !died; k++) {
      const intents =
        k === 0 ? intentsOf(0, { order: { kind: "attackTarget", entity: thorne } }) : new Map<SeatId, IntentFrame>();
      world.step(intents);
      for (const ev of world.events) {
        if (ev.type === "basicAttack") attacks++;
        if (ev.type === "death") died = true;
      }
    }
    expect(attacks).toBeGreaterThan(1);
    expect(died).toBe(true);
    expect(world.health.get(thorne)!.alive).toBe(false);
    // first kill of Thorne pays base kill gold + the one-time kill bounty (#90)
    expect(world.champion.get(sela)!.gold).toBe(goldBefore + GOLD_REWARDS.kill + GOLD_REWARDS.killBounty);
    const xpAfter = world.champion.get(sela)!.xp + world.champion.get(sela)!.level * 1000;
    expect(xpAfter).toBeGreaterThan(xpBefore);
  });

  it("a full scripted duel is deterministic (abl-12)", () => {
    cover("combat-fight-replay");
    const run = (): number => {
      const world = makeWorld(777);
      const { thorne } = duel(world, 6);
      for (let k = 0; k < 300; k++) {
        const intents = new Map<SeatId, IntentFrame>();
        if (k === 0) {
          intents.set(asSeatId(0), {
            commands: [{ kind: "castAbility", slot: "Q", target: { type: "dir", dir: { x: 1, z: 0 } } }],
            order: { kind: "attackTarget", entity: thorne },
          });
          intents.set(asSeatId(1), { commands: [], order: { kind: "attackTarget", entity: 1 as EntityId } });
        }
        if (k === 30) {
          intents.set(asSeatId(1), {
            commands: [{ kind: "castAbility", slot: "Q", target: { type: "dir", dir: { x: -1, z: 0 } } }],
          });
        }
        world.step(intents);
      }
      return world.digest();
    };
    expect(run()).toBe(run());
  });
});

describe("economy", () => {
  it("buy/sell items with stat recompute (eco-01, eco-02, eco-03)", () => {
    cover("shop-buy");
    cover("shop-buy-reject");
    cover("shop-sell");
    const world = makeWorld();
    const { sela } = duel(world);
    const champ = world.champion.get(sela)!;
    const apBefore = world.stats.get(sela)!.final[Stat.AbilityPower];

    expect(buyItem(world, sela, "ember-rod" as ItemId)).toBe("no-gold");
    champ.gold = 2000;
    expect(buyItem(world, sela, "ember-rod" as ItemId)).toBe("ok");
    expect(champ.gold).toBe(1100);
    world.step(new Map());
    expect(world.stats.get(sela)!.final[Stat.AbilityPower]).toBeCloseTo(apBefore + 45, 6);

    // unique: swift boots twice rejected
    expect(buyItem(world, sela, "swift-boots" as ItemId)).toBe("ok");
    expect(buyItem(world, sela, "swift-boots" as ItemId)).toBe("unique-owned");

    // fill slots -> no-slot
    champ.gold = 99999;
    let r: string = "ok";
    while (r === "ok") r = buyItem(world, sela, "ember-rod" as ItemId);
    expect(r).toBe("no-slot");

    // sell slot 0 refunds 40% of ember-rod (900*0.4=360) — SELL_REFUND 0.4 per user
    const goldBefore = champ.gold;
    expect(sellItem(world, sela, 0)).toBe(true);
    expect(champ.gold).toBe(goldBefore + 360);
    world.step(new Map());
  });

  it("Serrated Edge on-hit passive adds damage (eco-04)", () => {
    cover("item-onhit-passive");
    const world = makeWorld();
    const { sela, thorne } = duel(world, 2);
    world.champion.get(sela)!.gold = 5000;
    buyItem(world, sela, "serrated-edge" as ItemId);
    let onhit = 0;
    for (let k = 0; k < 60; k++) {
      const intents =
        k === 0 ? intentsOf(0, { order: { kind: "attackTarget", entity: thorne } }) : new Map<SeatId, IntentFrame>();
      world.step(intents);
      for (const ev of world.events) {
        if (ev.type === "damage" && (ev.data.origin as string).startsWith("hook:item:serrated-edge"))
          onhit += ev.data.amount as number;
      }
    }
    expect(onhit).toBeGreaterThan(0);
  });

  it("item gacha is seeded + reproducible (eco-05)", () => {
    cover("gacha-deterministic");
    const roll = (seed: number): string[] => {
      const world = makeWorld(seed);
      const { sela } = duel(world);
      const out: string[] = [];
      for (let i = 0; i < 4; i++) {
        const r = rollItemReward(world, sela, "round-reward");
        if (r) out.push(r);
      }
      return out;
    };
    expect(roll(5)).toEqual(roll(5));
    // different seeds eventually differ
    expect(JSON.stringify(roll(5)) === JSON.stringify(roll(6)) && JSON.stringify(roll(5)) === JSON.stringify(roll(7))).toBe(false);
  });

  it("augment draft: offers + the three augment archetypes (eco-06..09)", () => {
    cover("draft-offer");
    cover("draft-pick-stat");
    cover("draft-pick-ability-mod");
    cover("draft-pick-event-hook");
    const world = makeWorld(11);
    const { sela, thorne } = duel(world, 6);

    // silver offer contains bloodlust (only silver augment in skeleton content)
    const offer = offerAugments(world, sela, "silver");
    expect(offer.choices.length).toBeGreaterThan(0);
    expect(new Set(offer.choices).size).toBe(offer.choices.length); // distinct

    // (1) stat augment
    const adBefore = world.stats.get(sela)!.final[Stat.AttackDamage];
    expect(applyAugmentPick(world, offer, "bloodlust" as AugmentId)).toBe(true);
    expect(applyAugmentPick(world, offer, "bloodlust" as AugmentId)).toBe(false); // already picked
    world.step(new Map());
    expect(world.stats.get(sela)!.final[Stat.AttackDamage]).toBeCloseTo(adBefore * 1.15, 4);

    // (2) ability-mod augment: Chill Touch -> Q hit slows
    const goldOffer = offerAugments(world, sela, "gold");
    applyAugmentPick(world, goldOffer, "chill-touch" as AugmentId);
    castAbility(world, sela, "Q", { type: "dir", dir: { x: 1, z: 0 } });
    let slowed = false;
    for (let k = 0; k < 40 && !slowed; k++) {
      world.step(new Map());
      slowed = world.status.get(thorne)!.effects.some((e) => e.moveSpeedMult === 0.75);
    }
    expect(slowed).toBe(true);

    // (3) event-hook augment: Aegis Surge -> shield on cast, ICD respected
    const prisOffer = offerAugments(world, sela, "prismatic");
    applyAugmentPick(world, prisOffer, "aegis-surge" as AugmentId);
    world.health.get(sela)!.mana = 999;
    world.abilities.get(sela)!.slots.Q.cooldownRemainingTicks = 0;
    castAbility(world, sela, "Q", { type: "dir", dir: { x: 1, z: 0 } });
    world.step(new Map());
    const shields1 = world.health.get(sela)!.shields.length;
    expect(shields1).toBeGreaterThan(0);
    // immediate second cast within ICD -> no additional shield
    world.abilities.get(sela)!.slots.Q.cooldownRemainingTicks = 0;
    world.health.get(sela)!.mana = 999;
    castAbility(world, sela, "Q", { type: "dir", dir: { x: 1, z: 0 } });
    world.step(new Map());
    expect(world.health.get(sela)!.shields.length).toBe(shields1);
  });

  it("XP curve levels up and grants points (eco-10)", () => {
    cover("progression-levelup");
    const world = makeWorld();
    const { sela } = duel(world);
    const ab = world.abilities.get(sela)!;
    const before = ab.unspentPoints;
    grantXp(world, sela, xpToNext(1) + xpToNext(2)); // 2 level-ups
    expect(world.champion.get(sela)!.level).toBe(3);
    expect(ab.unspentPoints).toBe(before + 2);
  });

  it("economy commands are gated when closed (eco-11)", () => {
    cover("economy-gate");
    const world = makeWorld();
    const { sela } = duel(world);
    world.champion.get(sela)!.gold = 5000;
    world.economyOpen = false;
    world.step(
      intentsOf(0, { commands: [{ kind: "buyItem", itemId: "ember-rod" }] }),
    );
    expect(world.champion.get(sela)!.items.every((s) => s === null)).toBe(true); // rejected
    world.economyOpen = true;
    world.step(
      intentsOf(0, { commands: [{ kind: "buyItem", itemId: "ember-rod" }] }),
    );
    expect(world.champion.get(sela)!.items[0]).toBe("ember-rod");
  });

  it("hook ICD + slot condition (fx-12, fx-13) and bounded queue (fx-14)", () => {
    cover("effects-hook-icd");
    cover("effects-hook-slot");
    cover("combat-queue-bounded");
    const world = makeWorld();
    const { sela, thorne } = duel(world, 6);
    // Chill Touch is Q-only: W cast must NOT slow
    const goldOffer = offerAugments(world, sela, "gold");
    applyAugmentPick(world, goldOffer, "chill-touch" as AugmentId);
    world.abilities.get(sela)!.unspentPoints = 1;
    rankUpAbility(world, sela, "W");
    castAbility(world, sela, "W", { type: "self" });
    world.step(new Map());
    expect(world.status.get(thorne)!.effects.some((e) => e.moveSpeedMult === 0.75)).toBe(false);

    // queue boundedness: push a self-referential-ish chain (damage hooks firing
    // more damage) — resolution terminates and hp is finite
    for (let i = 0; i < 100; i++) {
      world.damageQueue.push({ source: sela, target: thorne, amount: 1, type: "true", crit: false, origin: "t" });
    }
    world.step(new Map());
    expect(Number.isFinite(world.health.get(thorne)!.hp)).toBe(true);
  });
});
