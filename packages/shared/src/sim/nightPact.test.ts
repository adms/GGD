/**
 * 71-00 暗夜契約 — the owner's 2026-07-30 re-design, made falsifiable.
 *
 * 「可以是有該技能英雄在場上的時候,敵我英雄死亡會生成一個旗子,具備黑夜靈氣 buff,
 *   帶來暗夜效果,回合結束則一起被清除」
 *
 * Every `it` is one half of that sentence, driven through a REAL
 * `SimWorld.step()` — not by calling `nightPactSystem` by hand, because a system
 * that works when poked but is wired into the wrong slot is failure mode ② (「算
 * 出來了但從沒送到」). Every assertion about the aura reads the FINAL number off
 * the stat pipeline rather than the presence of a source (failure mode ⑦, 「掃
 * 屬性代替掃行為」).
 *
 * MUTATIONS VERIFIED (break the line → suite red → restore); named in the report.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { Abilities, Champions } from "./content/registry";
import { spawnChampion } from "./spawnChampion";
import { Stat } from "./stats/statTypes";
import { queryOverlap } from "./collision/queries";
import { circle } from "./collision/shapes";
import { isAutoTargetable } from "./targeting";
import { grantImmunity } from "./effects/invulnerable";
import {
  NIGHT_PACT_AURA_SOURCE_ID,
  beginCombatNightPact,
  endCombatNightPact,
  nightFlagIds,
  nightPactRulesFromConfig,
  nightPactSystem,
  type NightPactConfigLike,
} from "./nightPact";
import { DEFAULT_NIGHT_PACT_CONFIG, zNightPactConfig } from "../content/schema/config";
import type { AbilityDef, ChampionDef } from "./content/defs";
import { asSeatId, asTeamId, type AbilityId, type ChampionId, type EntityId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";

const NO_INTENTS = new Map<SeatId, IntentFrame>();
const Z0 = SKELETON_ARENA.zones[0]!;

/**
 * Fixtures stand on ONE clear line, `x = centre.x + 12`: the skeleton zone has a
 * `radius: 2.5` pillar on its exact centre, and a body spawned inside an
 * obstacle is shoved out over the following ticks — which would silently change
 * every distance this suite measures. (Copied from auraCarrier.test.ts.)
 */
const LINE_X = Z0.center.x + 12;
const P = (dz: number): { x: number; z: number } => ({ x: LINE_X, z: Z0.center.z + dz });

/** 死之王 stand-in and an ordinary hero, both synthetic — see registerPair(). */
const KING = "np-death-king" as ChampionId;
const PLAIN = "np-plain" as ChampionId;
const KING_INNATE = "np-death-king.passive" as AbilityId;
const PLAIN_INNATE = "np-plain.passive" as AbilityId;

/** The shipped block, but pointed at the synthetic innate. */
const CFG: NightPactConfigLike = {
  ...DEFAULT_NIGHT_PACT_CONFIG,
  abilityIds: [KING_INNATE],
  manaBurn: { ...DEFAULT_NIGHT_PACT_CONFIG.manaBurn },
};
const RADIUS = CFG.auraRadius; // 6.42

/**
 * SYNTHETIC champions, not the real `godie-u00k`: this suite must not go red
 * because a concurrent content lane re-balanced a hero. The REAL doc is pinned
 * separately at the bottom, by reading the registry.
 */
function registerPair(): void {
  const innate = (id: AbilityId): AbilityDef =>
    ({
      id,
      name: id,
      slot: "PASSIVE",
      innateKind: "passive",
      castType: "self",
      maxRank: 1,
      cooldown: [0],
      manaCost: [0],
      range: 0,
      effects: [],
      passive: { ranks: [{ modifiers: [] }] },
    }) as unknown as AbilityDef;
  Abilities.register(KING_INNATE, innate(KING_INNATE));
  Abilities.register(PLAIN_INNATE, innate(PLAIN_INNATE));
  const thorne = Champions.get("thorne" as ChampionId);
  const body = (id: ChampionId, innateId: AbilityId): ChampionDef =>
    ({ ...thorne, id, passiveAbility: innateId }) as unknown as ChampionDef;
  Champions.register(KING, body(KING, KING_INNATE));
  Champions.register(PLAIN, body(PLAIN, PLAIN_INNATE));
}

beforeAll(() => {
  registerSkeletonContent();
  registerPair();
});

let world: SimWorld;
let seat = 0;

beforeEach(() => {
  world = new SimWorld(SKELETON_ARENA, 20260730);
  world.combatActive = true;
  beginCombatNightPact(world, nightPactRulesFromConfig(CFG));
});

function spawn(champion: ChampionId, team: 0 | 1, at: { x: number; z: number }): EntityId {
  return spawnChampion(world, {
    championId: champion,
    seatId: asSeatId(seat++),
    teamId: asTeamId(team),
    pos: at,
    zone: 0,
  });
}

/**
 * Kill a champion THE WAY COMBAT DOES: drop hp to 0 and let the NEXT `step()`'s
 * real `deathSystem` flip `alive` and emit the `death` event.
 *
 * Emitting `death` from the test instead would prove nothing: `step()` clears
 * `world.events` at the top, so a hand-emitted event is gone before any system
 * sees it — and a suite that "worked" that way would only be testing itself.
 */
function mortallyWound(victim: EntityId): void {
  world.health.get(victim)!.hp = 0;
}

const msOf = (id: EntityId): number => world.stats.get(id)!.final[Stat.MoveSpeed];
const regenOf = (id: EntityId): number => world.stats.get(id)!.final[Stat.HealthRegen];
const hasAura = (id: EntityId): boolean =>
  world.stats.get(id)!.sources.some((s) => s.id === NIGHT_PACT_AURA_SOURCE_ID);

describe("71-00 暗夜契約 — 旗子 / 黑夜靈氣 / 回合結束清除", () => {
  it("NO carrier on the field → a hero death raises NOTHING", () => {
    const a = spawn(PLAIN, 0, P(0));
    const b = spawn(PLAIN, 1, P(3));
    world.step(NO_INTENTS);
    expect(nightFlagIds(world), "baseline: no flags").toEqual([]);

    mortallyWound(b);
    world.step(NO_INTENTS);

    expect(nightFlagIds(world), "no 暗夜契約 anywhere → no flag").toEqual([]);
    expect(hasAura(a), "…and nobody is under 黑夜靈氣").toBe(false);
  });

  it("carrier on the field → a hero death raises a REAL flag entity, on the body", () => {
    const king = spawn(KING, 0, P(0));
    const victim = spawn(PLAIN, 1, P(5));
    world.step(NO_INTENTS);
    const before = world.transform.size;

    mortallyWound(victim);
    world.step(NO_INTENTS);

    const flags = nightFlagIds(world);
    expect(flags.length, "exactly one flag").toBe(1);
    expect(world.transform.size, "…and it is a real new entity").toBe(before + 1);
    const ft = world.transform.get(flags[0]!)!;
    // ON THE BODY — read against the corpse's OWN transform on the tick it fell,
    // not a position captured before the step (the separation pass moves bodies
    // every tick, and a stale literal would be asserting the wrong thing).
    const corpse = world.transform.get(victim)!;
    expect(ft.pos.x).toBeCloseTo(corpse.pos.x, 6);
    expect(ft.pos.z).toBeCloseTo(corpse.pos.z, 6);
    expect(ft.zone).toBe(0);
    // 敵我都算: the victim was on the OTHER team from the king.
    expect(world.team.get(king)!.teamId).not.toBe(world.team.get(victim)!.teamId);
    // The flag itself is furniture, not a unit.
    expect(world.health.has(flags[0]!), "no Health → unattackable, not in digest hp").toBe(false);
    expect(world.team.has(flags[0]!), "no TeamComp → cannot corrupt teamAliveInZone").toBe(false);
  });

  it("an ALLY death raises one too — 「敵我英雄死亡」, both directions", () => {
    spawn(KING, 0, P(0));
    const ally = spawn(PLAIN, 0, P(5));
    world.step(NO_INTENTS);
    mortallyWound(ally);
    world.step(NO_INTENTS);
    expect(nightFlagIds(world).length).toBe(1);
  });

  it("walking INTO a flag doubles move speed; walking OUT gives it back", () => {
    const king = spawn(KING, 0, P(0));
    const victim = spawn(PLAIN, 1, P(20)); // dies FAR away
    world.step(NO_INTENTS);
    const base = msOf(king);
    const baseRegen = regenOf(king);

    mortallyWound(victim);
    world.step(NO_INTENTS);
    expect(nightFlagIds(world).length).toBe(1);
    // 20 units away, radius 6.42 → still outside.
    world.step(NO_INTENTS);
    expect(msOf(king), "outside the ring: nothing").toBeCloseTo(base, 6);

    // Step INTO the ring (the reconcile is what is under test, not movement).
    world.transform.get(king)!.pos = P(18);
    world.step(NO_INTENTS); // attaches, marks dirty
    world.step(NO_INTENTS); // statRecomputeSystem folds it in
    expect(msOf(king), "+100 % move speed").toBeCloseTo(base * 2, 5);
    expect(regenOf(king), "+30 flat hp regen").toBeCloseTo(baseRegen + CFG.healthRegenFlat, 5);

    // Step back OUT.
    world.transform.get(king)!.pos = P(0);
    world.step(NO_INTENTS);
    world.step(NO_INTENTS);
    expect(msOf(king), "the buff is RETURNED, not sticky").toBeCloseTo(base, 5);
    expect(regenOf(king)).toBeCloseTo(baseRegen, 5);
    expect(hasAura(king)).toBe(false);
  });

  it("beneficiary 'owner' (shipped): a team-mate standing in the same ring gets NOTHING", () => {
    const king = spawn(KING, 0, P(0));
    const mate = spawn(PLAIN, 0, P(2));
    const victim = spawn(PLAIN, 1, P(1));
    world.step(NO_INTENTS);
    const mateBase = msOf(mate);
    mortallyWound(victim);
    world.step(NO_INTENTS);
    world.step(NO_INTENTS);

    expect(msOf(king), "死之王 is buffed").toBeGreaterThan(0);
    expect(hasAura(king)).toBe(true);
    expect(hasAura(mate), "…the team-mate is not (default beneficiary = owner)").toBe(false);
    expect(msOf(mate)).toBeCloseTo(mateBase, 6);
  });

  it("beneficiary 'team' is the SAME code path, one field away", () => {
    world.nightPactRules = nightPactRulesFromConfig({ ...CFG, beneficiary: "team" });
    const king = spawn(KING, 0, P(0));
    const mate = spawn(PLAIN, 0, P(2));
    const enemy = spawn(PLAIN, 1, P(1));
    world.step(NO_INTENTS);
    const mateBase = msOf(mate);
    const enemyBase = msOf(enemy);
    mortallyWound(enemy);
    world.step(NO_INTENTS);
    world.step(NO_INTENTS);

    expect(msOf(mate), "the team-mate now shares 黑夜靈氣").toBeCloseTo(mateBase * 2, 5);
    // The corpse is dead, so it holds nothing regardless of team.
    expect(hasAura(enemy)).toBe(false);
    expect(enemyBase).toBeGreaterThan(0);
  });

  it("stacking: 'max' collapses two overlapping flags to ONE dose; 'add' sums them", () => {
    // READ THE REGEN, NOT THE MOVE SPEED. `ms` is clamped by the shipped speed
    // cap (14 u/s), so at ×3 the two modes would look identical and this test
    // would pass for the wrong reason — the exact 「斷言方向跟缺陷無關」 trap.
    const king = spawn(KING, 0, P(0));
    const v1 = spawn(PLAIN, 1, P(1));
    const v2 = spawn(PLAIN, 1, P(2));
    world.step(NO_INTENTS);
    const base = regenOf(king);

    mortallyWound(v1);
    mortallyWound(v2);
    world.step(NO_INTENTS);
    world.step(NO_INTENTS);
    expect(nightFlagIds(world).length, "two deaths, two flags").toBe(2);
    expect(regenOf(king), "max: two flags are still ONE +30").toBeCloseTo(base + 30, 4);

    world.nightPactRules = nightPactRulesFromConfig({ ...CFG, stacking: "add" });
    world.step(NO_INTENTS);
    world.step(NO_INTENTS);
    expect(regenOf(king), "add: two flags are +60").toBeCloseTo(base + 60, 4);
  });

  it("maxFlagsPerZone is a real cap, not decoration", () => {
    world.nightPactRules = nightPactRulesFromConfig({ ...CFG, maxFlagsPerZone: 2 });
    spawn(KING, 0, P(0));
    const victims = [spawn(PLAIN, 1, P(1)), spawn(PLAIN, 1, P(2)), spawn(PLAIN, 1, P(3))];
    world.step(NO_INTENTS);
    for (const v of victims) mortallyWound(v);
    world.step(NO_INTENTS);
    expect(nightFlagIds(world).length).toBe(2);
  });

  it("ROUND END clears every flag AND every 黑夜靈氣 — 「回合結束則一起被清除」", () => {
    const king = spawn(KING, 0, P(0));
    const victim = spawn(PLAIN, 1, P(1));
    world.step(NO_INTENTS);
    const base = msOf(king);
    mortallyWound(victim);
    world.step(NO_INTENTS);
    world.step(NO_INTENTS);
    expect(nightFlagIds(world).length).toBe(1);
    expect(msOf(king)).toBeCloseTo(base * 2, 5);

    endCombatNightPact(world);

    expect(world.nightFlag.size, "world.nightFlag is EMPTY").toBe(0);
    // …and the entity is gone from every store, not just the marker map.
    for (const id of world.transform.keys()) expect(world.nightFlag.has(id)).toBe(false);
    expect(hasAura(king), "the aura source is stripped too").toBe(false);
    world.step(NO_INTENTS); // disarmed: nightPactSystem returns immediately
    expect(msOf(king), "…so the next round starts at the base number").toBeCloseTo(base, 5);
  });

  it("a settled zone (#216) raises no more flags", () => {
    spawn(KING, 0, P(0));
    const victim = spawn(PLAIN, 1, P(1));
    world.step(NO_INTENTS);
    world.settledZones.add(0);
    mortallyWound(victim);
    world.step(NO_INTENTS);
    expect(nightFlagIds(world)).toEqual([]);
  });

  it("the flag cannot be targeted, hit or shoved — it is out of the broad-phase", () => {
    const king = spawn(KING, 0, P(0));
    const enemy = spawn(PLAIN, 1, P(1));
    world.step(NO_INTENTS);
    mortallyWound(enemy);
    world.step(NO_INTENTS);
    const flag = nightFlagIds(world)[0]!;

    // REBUILD FIRST. The flag was created LATE in the tick that just ran, i.e.
    // after that tick's `rebuildGrid()`, so without this line the query would
    // miss it whether or not the skip exists — and the guard would be vacuous
    // (mutation-verified: with the rebuild, deleting the skip turns this red).
    world.rebuildGrid();
    const hits = queryOverlap(world, circle(world.transform.get(flag)!.pos, 30), {
      zone: 0,
      exclude: new Set<EntityId>(),
      aliveOnly: false,
    });
    expect(hits.includes(flag), "no AoE, projectile or auto-acquire can find it").toBe(false);
    expect(isAutoTargetable(world, king, flag), "…and it is not an auto-attack target").toBe(false);
  });

  it("DISARMED: no flags, no aura, and the rng stream is UNTOUCHED", () => {
    // Two worlds, same seed, same script: one disarmed, one armed. If the
    // mechanic drew from `world.rng` for a match with nobody near a carrier,
    // every existing replay would shift — so the two streams must agree.
    const run = (armed: boolean): number => {
      const w = new SimWorld(SKELETON_ARENA, 424242);
      w.combatActive = true;
      if (armed) beginCombatNightPact(w, nightPactRulesFromConfig(CFG));
      const a = spawnChampion(w, {
        championId: PLAIN,
        seatId: asSeatId(90),
        teamId: asTeamId(0),
        pos: P(0),
        zone: 0,
      });
      const b = spawnChampion(w, {
        championId: PLAIN,
        seatId: asSeatId(91),
        teamId: asTeamId(1),
        pos: P(4),
        zone: 0,
      });
      w.step(NO_INTENTS);
      const hp = w.health.get(b)!;
      hp.hp = 0;
      hp.alive = false;
      w.emit("death", { id: b });
      w.step(NO_INTENTS);
      expect(w.nightFlag.size, "no carrier on either side → no flag either way").toBe(0);
      expect(w.stats.get(a)!.sources.some((s) => s.id === NIGHT_PACT_AURA_SOURCE_ID)).toBe(false);
      return w.rng.next();
    };
    expect(run(true)).toBe(run(false));
  });

  it("mana burn: an ENEMY cast near 死之王 loses ALL mana; an ALLY cast never does", () => {
    // `world.events` is cleared at the TOP of `step()`, so an `abilityCast`
    // emitted from a test is only readable within the same tick — this half is
    // therefore driven by calling the system directly. Its SLOT is not what is
    // under test here (the flag tests above prove the wiring through step()).
    world.nightPactRules = nightPactRulesFromConfig({
      ...CFG,
      manaBurn: { enabled: true, radius: 8, chance: 1, damage: 25 },
    });
    const king = spawn(KING, 0, P(0));
    const enemy = spawn(PLAIN, 1, P(2));
    const mate = spawn(PLAIN, 0, P(2));
    const farEnemy = spawn(PLAIN, 1, P(20));
    world.step(NO_INTENTS);
    for (const id of [enemy, mate, farEnemy]) {
      const hp = world.health.get(id)!;
      hp.mana = hp.maxMana;
      expect(hp.mana, "fixture: everyone starts with mana").toBeGreaterThan(0);
    }
    const enemyHpBefore = world.health.get(enemy)!.hp;

    world.events.length = 0;
    world.emit("abilityCast", { caster: enemy, slot: "Q", abilityId: "x" });
    world.emit("abilityCast", { caster: mate, slot: "Q", abilityId: "x" });
    world.emit("abilityCast", { caster: farEnemy, slot: "Q", abilityId: "x" });
    world.emit("abilityCast", { caster: king, slot: "Q", abilityId: "x" });
    nightPactSystem(world);

    expect(world.health.get(enemy)!.mana, "魔力全失 = to ZERO, not a fraction").toBe(0);
    expect(
      world.damageQueue.some((p) => p.target === enemy && p.source === king && p.amount === 25),
      "…並且受到傷害 — a REAL packet (GH#298), so the interception layer can see it",
    ).toBe(true);
    expect(world.health.get(enemy)!.hp, "…and NOT written behind the queue's back").toBe(enemyHpBefore);
    expect(world.health.get(mate)!.mana, "an ALLY casting beside 死之王 is safe").toBeGreaterThan(0);
    expect(world.health.get(farEnemy)!.mana, "an enemy 20u away is out of range").toBeGreaterThan(0);
    expect(world.health.get(king)!.mana, "死之王 never burns itself").toBeGreaterThan(0);
    expect(world.events.some((e) => e.type === "nightPactBurn"), "…and it is announced").toBe(true);

    // chance 0 = the roll really gates it (so the chance:1 case is not vacuous).
    world.nightPactRules = nightPactRulesFromConfig({
      ...CFG,
      manaBurn: { enabled: true, radius: 8, chance: 0, damage: 25 },
    });
    const hp2 = world.health.get(mate)!;
    hp2.mana = hp2.maxMana;
    world.events.length = 0;
    world.emit("abilityCast", { caster: enemy, slot: "Q", abilityId: "x" });
    const e2 = world.health.get(enemy)!;
    e2.mana = e2.maxMana;
    nightPactSystem(world);
    expect(world.health.get(enemy)!.mana, "chance 0 → never").toBeGreaterThan(0);
  });

  /**
   * GH#298 — THE BEARING LINE. 「並且受到傷害」 was `chp.hp -= burn.damage`, i.e.
   * a write no interception could ever see. This asserts the CONSEQUENCE, not
   * the shape: two identical enemy casters, one wearing 無敵, and only the naked
   * one bleeds. MUTATION: restore the bare `hp -=` → the 無敵 caster bleeds → red.
   */
  it("GH#298 the burn is queued, so 無敵 really refuses it", () => {
    world.nightPactRules = nightPactRulesFromConfig({
      ...CFG,
      manaBurn: { enabled: true, radius: 8, chance: 1, damage: 25 },
    });
    spawn(KING, 0, P(0));
    const naked = spawn(PLAIN, 1, P(2));
    const warded = spawn(PLAIN, 1, P(-2));
    world.step(NO_INTENTS);
    grantImmunity(world, warded, {
      physicalUntil: 0,
      magicUntil: 0,
      trueUntil: world.tick + 100,
      controlUntil: 0,
    });
    const before = new Map([naked, warded].map((id) => [id, world.health.get(id)!.hp] as const));

    world.events.length = 0;
    for (const id of [naked, warded]) world.emit("abilityCast", { caster: id, slot: "Q", abilityId: "x" });
    nightPactSystem(world); // slot 9c′ — the drain (slot 8)已經跑過了
    world.step(NO_INTENTS); // …so the packet lands on the NEXT tick's slot 8

    expect(before.get(naked)! - world.health.get(naked)!.hp, "an unprotected caster bleeds").toBeGreaterThan(0);
    expect(
      world.health.get(warded)!.hp,
      "無敵 refuses it — a bare `hp -=` could never see this",
    ).toBeGreaterThanOrEqual(before.get(warded)!);
  });

  it("the shipped default block validates against its own Zod schema", () => {
    expect(() => zNightPactConfig.parse(DEFAULT_NIGHT_PACT_CONFIG)).not.toThrow();
    // 「並且受到傷害」 has NO number in the source map (A0HH's only data fields are
    // the neutered Elune's-Grace reduction columns Def1/Def5 = 1.0, and the
    // rawcode never appears in war3map.j), so the shipped damage is 0 and the
    // owner decides. If someone "fills it in" without a ruling, this goes red.
    expect(DEFAULT_NIGHT_PACT_CONFIG.manaBurn.damage).toBe(0);
    expect(DEFAULT_NIGHT_PACT_CONFIG.manaBurn.chance).toBeCloseTo(0.12, 6);
    expect(DEFAULT_NIGHT_PACT_CONFIG.msPercent).toBe(1.0);
    expect(DEFAULT_NIGHT_PACT_CONFIG.healthRegenFlat).toBe(30);
    expect(DEFAULT_NIGHT_PACT_CONFIG.abilityIds).toContain("godie-u00k.passive");
  });

  it("EVERY field has an UPPER bound, not just a lower one (#277)", () => {
    const over = {
      ...DEFAULT_NIGHT_PACT_CONFIG,
      auraRadius: 500, // a raw un-converted WC3 number
    };
    expect(() => zNightPactConfig.parse(over)).toThrow();
    expect(() =>
      zNightPactConfig.parse({ ...DEFAULT_NIGHT_PACT_CONFIG, maxFlagsPerZone: 999 }),
    ).toThrow();
    expect(() =>
      zNightPactConfig.parse({
        ...DEFAULT_NIGHT_PACT_CONFIG,
        manaBurn: { ...DEFAULT_NIGHT_PACT_CONFIG.manaBurn, chance: 5 },
      }),
    ).toThrow();
  });

  it("RADIUS is a real boundary — measured against the flag's OWN position", () => {
    const king = spawn(KING, 0, P(0));
    // z = 8 keeps every probe point well inside the zone's `boundaryRadius: 24`
    // — `clampToBoundary` would otherwise drag the "just outside" probe BACK
    // toward the centre and into the ring, and the test would fail for a reason
    // that has nothing to do with the radius under test.
    const victim = spawn(PLAIN, 1, P(8));
    world.step(NO_INTENTS);
    const base = msOf(king);
    mortallyWound(victim);
    world.step(NO_INTENTS);
    const flagPos = { ...world.transform.get(nightFlagIds(world)[0]!)!.pos };

    // Offsets are taken from where the flag ACTUALLY stands, not from where the
    // victim was told to spawn: the separation pass moves bodies every tick, so
    // a literal offset would be measuring the wrong distance.
    const at = (d: number): { x: number; z: number } => ({ x: flagPos.x, z: flagPos.z + d });

    world.transform.get(king)!.pos = at(RADIUS - 0.05);
    world.step(NO_INTENTS);
    world.step(NO_INTENTS);
    expect(msOf(king), "just inside").toBeCloseTo(base * 2, 4);

    world.transform.get(king)!.pos = at(RADIUS + 0.5);
    world.step(NO_INTENTS);
    world.step(NO_INTENTS);
    expect(msOf(king), "just outside").toBeCloseTo(base, 4);
  });
});
