/**
 * 殭屍王 #247 —— 無視碰撞穿透地形 · 每回合最多一次 · 腳下圈圈只是視覺
 *
 * owner, 2026-08-01, from a real match:
 *   「殭屍王 應該要可以無視碰撞穿透地形 不然被卡住永遠走不到」
 *   「每回合最多只會出現一次殭屍王，不會無限出場」
 *   「殭屍王底下圈圈會比較大，但不影響無碰撞」
 *
 * ── WHAT EACH GUARD IS SHAPED AGAINST ──────────────────────────────────────
 *
 * ⑦ 「掃屬性代替掃行為」 is the shape this file exists to avoid. 「the config
 *    field says 1」 and 「`world.flight` has an entry」 are PROPERTIES; owner's
 *    complaints are BEHAVIOURS. So:
 *      · 無碰撞 is measured as the king's CLOSEST APPROACH to a pillar's centre
 *        over a real `movementSystem` walk — 0.0 means it went through, ≥3.6
 *        (the two radii) means the collision layer still stopped it;
 *      · 「不會無限出場」 is measured by running a REAL round in which the old
 *        code DID summon two kings (two champions each crossing the threshold)
 *        and counting the bodies in `world.mob`;
 *      · 「圈圈不影響碰撞」 is measured by walking the SAME king through the SAME
 *        pillar under two configs that differ ONLY in the ring numbers and
 *        asserting the two paths are byte-identical.
 *
 * ⑤ 「被測的不是出貨的那個」: every king below enters through `summonMobBoss`,
 *    the one door a king can enter the world by, and carries the grant that
 *    `mobRulesFromConfig` resolved from a real `mobWaves` config — never a
 *    hand-written `world.flight.set`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import {
  type MobRules,
  type MobWavesConfigLike,
  MOB_MODEL_KEY,
  MOB_RING_MAX_DIAMETER,
  DEFAULT_MOB_RING_DIAMETER,
  DEFAULT_MOB_RING_SIZE_FOLLOW,
  BOSS_MAX_PER_ROUND_UNCAPPED,
  bossSpawnCapKey,
  bossSpawnCapReached,
  mobGroundRingDiameter,
  mobProfile,
  mobRulesFromConfig,
  mobVisualJson,
  parseMobVisualJson,
  spawnMob,
  summonMobBoss,
} from "./mobs";
import { flightIgnoresObstacles, flightIgnoresUnits, flightStaysInBoundary, isFlying } from "./flight";
import { movementSystem } from "./systems/MovementSystem";
import { beginCombatMobs, endCombatMobs } from "./systems/MobSystem";
import { DEFAULT_MOB_WAVES_CONFIG } from "../content/schema/config";

beforeAll(() => registerSkeletonContent());

/**
 * The zone-0 pillar the king walks at. Read off {@link SKELETON_ARENA} rather
 * than restated, so a future arena edit moves the test with the map instead of
 * silently aiming it at empty floor.
 */
const ZONE = SKELETON_ARENA.zones[0]!;
const PILLAR = ZONE.obstacles[0]! as { kind: "circle"; center: { x: number; z: number }; radius: number };

/** A `mobWaves` config with the king armed cheaply, plus whatever `over` says. */
function cfgWith(over: Partial<NonNullable<MobWavesConfigLike["boss"]>>, mobOver = {}): MobWavesConfigLike {
  const base = DEFAULT_MOB_WAVES_CONFIG as unknown as MobWavesConfigLike;
  return {
    ...base,
    // waves never fire on their own: every mob below is spawned by hand so the
    // counts these tests assert are the counts these tests created.
    firstWaveSec: 100000,
    mob: { ...base.mob, ...mobOver },
    boss: {
      ...base.boss!,
      // 3, not the shipped 100: the round tests kill zombies one at a time
      // through the real death pipeline and 100 of those says nothing 3 does
      // not. The SHIPPED 100 boundary is pinned in mobs.boss.test.ts.
      killThreshold: 3,
      // hero derivation off — it needs a champion doc and would make the king's
      // hp/speed depend on the random draw, which none of these tests are about.
      championSource: "fixed",
      championId: "thorne",
      heroHpMult: undefined,
      heroDamageMult: undefined,
      hpFlatBonus: undefined,
      heroLevelSource: "fixed",
      heroLevel: 1,
      moveSpeedMult: undefined,
      moveSpeed: 6,
      hpMult: undefined,
      maxHp: 500,
      ...over,
    },
    special: undefined,
  };
}

function rulesWith(over: Partial<NonNullable<MobWavesConfigLike["boss"]>>, mobOver = {}): MobRules {
  return mobRulesFromConfig(cfgWith(over, mobOver), 3);
}

function newWorld(seed = 1): SimWorld {
  const w = new SimWorld(SKELETON_ARENA, seed);
  w.combatActive = true;
  return w;
}

const bossesIn = (w: SimWorld): EntityId[] =>
  [...w.mob.entries()].filter(([, m]) => m.kind === "boss").map(([id]) => id);

/**
 * Walk `id` at `target` for `ticks` real `movementSystem` steps and return the
 * CLOSEST it ever came to the pillar's centre.
 *
 * `nav.moveTarget` is written directly instead of going through the AI: this
 * measures the movement/collision layer, which is the only layer 無視碰撞 lives
 * in, and `orderSystem`'s chase resolution writes exactly this field. The grant
 * being tested still comes from the shipped `summonMobBoss` path.
 */
function closestApproachToPillar(
  w: SimWorld,
  id: EntityId,
  target: { x: number; z: number },
  ticks: number,
): number {
  let best = Infinity;
  for (let i = 0; i < ticks; i++) {
    const nav = w.nav.get(id)!;
    nav.moveTarget = { x: target.x, z: target.z };
    movementSystem(w);
    const p = w.transform.get(id)!.pos;
    const dx = p.x - PILLAR.center.x;
    const dz = p.z - PILLAR.center.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < best) best = d;
  }
  return best;
}

/** Place a king at `from` and walk it straight through the pillar to `to`. */
function walkKingThroughPillar(rules: MobRules, ticks = 240): { closest: number; id: EntityId; w: SimWorld } {
  const w = newWorld();
  const id = summonMobBoss(w, 0, rules, 0 as unknown as EntityId, 3)!;
  // Start on one side of the pillar, aim at the mirrored point on the other —
  // a straight line whose midpoint IS the pillar centre.
  const from = { x: PILLAR.center.x - 8, z: PILLAR.center.z };
  const to = { x: PILLAR.center.x + 8, z: PILLAR.center.z };
  const t = w.transform.get(id)!;
  t.pos = { x: from.x, z: from.z };
  return { closest: closestApproachToPillar(w, id, to, ticks), id, w };
}

// ─────────────────────────────────────────────── A. 無視碰撞、穿透地形 ──────

describe("#247 A — 殭屍王無視碰撞穿透地形", () => {
  it("SHIPPED: the king walks THROUGH the pillar; with 無碰撞 off it never gets near it", () => {
    cover("mob-boss-noclip");
    // THE BEHAVIOUR, measured: closest approach to the pillar's centre.
    const on = walkKingThroughPillar(rulesWith({ noClip: true }));
    const off = walkKingThroughPillar(rulesWith({ noClip: false }));

    // ⚠️ 王的半徑**讀出貨設定**,不寫死。owner 2026-08-02 把它從 1.8 減半成 0.9
    // （「殭屍王體型可以減半」→「可以也減判定」），而寫死 1.8 會讓這兩行在一次
    // 平衡調整之後說假話：它們會紅，但紅的理由不是「無碰撞壞了」。
    const KING_R = DEFAULT_MOB_WAVES_CONFIG.boss!.radius!;
    // Through the middle of it: 圓心真的進到柱子裡面（柱心距離小於柱子半徑）。
    expect(on.closest).toBeLessThan(PILLAR.radius);
    // Stopped/deflected: 碰撞層不讓兩個身體重疊,所以還在碰撞的王不可能靠得比
    // 兩個半徑之和更近。
    expect(off.closest).toBeGreaterThanOrEqual(PILLAR.radius + KING_R - 1e-6);
    // …and the two are not the same number by accident.
    expect(off.closest - on.closest).toBeGreaterThan(2);
  });

  it("the SHIPPED doc has 無碰撞 ON — owner's answer, not the test's", () => {
    cover("mob-boss-noclip");
    expect(DEFAULT_MOB_WAVES_CONFIG.boss?.noClip).toBe(true);
    expect(DEFAULT_MOB_WAVES_CONFIG.boss?.noClipUnits).toBe(true);
    expect(DEFAULT_MOB_WAVES_CONFIG.boss?.noClipObstacles).toBe(true);
    expect(DEFAULT_MOB_WAVES_CONFIG.boss?.noClipStayInside).toBe(true);
  });

  it("`noClip: false` writes NO grant at all — a pre-#247 arena is untouched", () => {
    cover("mob-boss-noclip");
    const w = newWorld();
    const id = summonMobBoss(w, 0, rulesWith({ noClip: false }), 0 as unknown as EntityId, 3)!;
    expect(isFlying(w, id)).toBe(false);
    expect(w.flight.size).toBe(0);
  });

  it("穿過其他單位: 30 zombies packed onto the king do not shove it one unit", () => {
    cover("mob-boss-noclip");
    const run = (noClipUnits: boolean): number => {
      const w = newWorld();
      const rules = rulesWith({ noClip: true, noClipUnits });
      const king = summonMobBoss(w, 0, rules, 0 as unknown as EntityId, 3)!;
      const kt = w.transform.get(king)!;
      kt.pos = { x: ZONE.center.x, z: ZONE.center.z };
      const start = { x: kt.pos.x, z: kt.pos.z };
      // A crowd sitting ON the king — the round-9 firehose, compressed.
      for (let i = 0; i < 30; i++) {
        const z = spawnMob(w, 0, rules, 1, i);
        w.transform.get(z)!.pos = { x: ZONE.center.x + (i % 5) * 0.1, z: ZONE.center.z + (i % 7) * 0.1 };
      }
      // `w.step`, not a bare `movementSystem`: the soft-separation pass queries
      // `world.grid`, and the broad phase is rebuilt inside `step`. Calling the
      // system alone leaves the grid empty, every pair invisible, and the test
      // green for a reason that has nothing to do with flight (失敗形狀 ④).
      for (let i = 0; i < 60; i++) w.step(new Map());
      const p = w.transform.get(king)!.pos;
      return Math.hypot(p.x - start.x, p.z - start.z);
    };
    // Not shoved at all: 「穿過身體」 means the separation pass skips it entirely.
    expect(run(true)).toBeLessThan(1e-9);
    // …and the same crowd DOES move a king that collides, so the assertion is
    // about the exemption and not about zombies happening to sit still.
    expect(run(false)).toBeGreaterThan(0.5);
  });

  it("⭐ the ARENA BOUNDARY is still enforced — 無碰撞 is not 「走出場外」", () => {
    cover("mob-boss-noclip");
    const w = newWorld();
    const rules = rulesWith({ noClip: true });
    const id = summonMobBoss(w, 0, rules, 0 as unknown as EntityId, 3)!;
    const t = w.transform.get(id)!;
    t.pos = { x: ZONE.center.x, z: ZONE.center.z };
    // Aim far outside the disc and give it plenty of time to get there.
    const far = { x: ZONE.center.x + 1000, z: ZONE.center.z };
    for (let i = 0; i < 400; i++) {
      w.nav.get(id)!.moveTarget = { x: far.x, z: far.z };
      movementSystem(w);
    }
    const p = w.transform.get(id)!.pos;
    const fromCentre = Math.hypot(p.x - ZONE.center.x, p.z - ZONE.center.z);
    // `clampToBoundary` keeps the whole BODY inside, so the centre stops one
    // radius short of the rim.
    expect(fromCentre).toBeLessThanOrEqual(ZONE.boundaryRadius + 1e-6);
    expect(flightStaysInBoundary(w, id)).toBe(true);
    // It really did travel — otherwise this passes on a king that never moved.
    expect(fromCentre).toBeGreaterThan(10);
  });

  it("the grant reads back as all three permissions the config asked for", () => {
    cover("mob-boss-noclip");
    const w = newWorld();
    const id = summonMobBoss(
      w,
      0,
      rulesWith({ noClip: true, noClipUnits: false, noClipObstacles: true, noClipStayInside: false }),
      0 as unknown as EntityId,
      3,
    )!;
    // Each of the three is its OWN decision — a single boolean would make these
    // three assertions the same assertion.
    expect(flightIgnoresUnits(w, id)).toBe(false);
    expect(flightIgnoresObstacles(w, id)).toBe(true);
    expect(flightStaysInBoundary(w, id)).toBe(false);
  });

  it("a king that somehow acquires a StatsComp KEEPS its no-clip across a real step", () => {
    cover("mob-boss-noclip");
    const w = newWorld();
    beginCombatMobs(w, rulesWith({ noClip: true }), [0]);
    const id = summonMobBoss(w, 0, w.mobRules!, 0 as unknown as EntityId, 3)!;
    expect(isFlying(w, id)).toBe(true);
    // Today a mob has no StatsComp, so `flightSystem` never looks at it. THIS is
    // the day someone gives it one: without the `world.mob.has(id)` guard in
    // `flightSystem`, the reconcile finds no `flight` source and deletes the
    // grant — the king silently starts getting stuck again and nothing else in
    // the repo goes red (失敗形狀 ③).
    w.stats.set(id, {
      base: [] as unknown as never,
      final: [] as unknown as never,
      sources: [],
    } as unknown as never);
    w.step(new Map());
    expect(isFlying(w, id)).toBe(true);
    expect(flightIgnoresObstacles(w, id)).toBe(true);
  });

  it("the grant dies with the king — `destroy` leaves no stale entry to inherit", () => {
    cover("mob-boss-noclip");
    const w = newWorld();
    const id = summonMobBoss(w, 0, rulesWith({ noClip: true }), 0 as unknown as EntityId, 3)!;
    expect(w.flight.size).toBe(1);
    w.destroy(id);
    expect(w.flight.size).toBe(0);
  });
});

// ────────────────────────────────────────────── B. 每回合最多出現一次 ──────

describe("#247 B — 每回合最多只會出現一次殭屍王", () => {
  it("the pure boundary: at cap-1 it is open, at cap it is closed", () => {
    cover("mob-boss-round-cap");
    expect(bossSpawnCapReached({ maxPerRound: 1 }, 0)).toBe(false);
    expect(bossSpawnCapReached({ maxPerRound: 1 }, 1)).toBe(true);
    expect(bossSpawnCapReached({ maxPerRound: 3 }, 2)).toBe(false);
    expect(bossSpawnCapReached({ maxPerRound: 3 }, 3)).toBe(true);
    // ABSENT = 今天的無限出場, so an arena authored before #247 is unchanged.
    expect(bossSpawnCapReached({}, 999)).toBe(false);
    expect(bossSpawnCapReached({}, BOSS_MAX_PER_ROUND_UNCAPPED - 1)).toBe(false);
    expect(bossSpawnCapReached(null, 5)).toBe(false);
  });

  it("the SHIPPED doc caps at 1 per ZONE — owner's number and owner's reading", () => {
    cover("mob-boss-round-cap");
    expect(DEFAULT_MOB_WAVES_CONFIG.boss?.maxPerRound).toBe(1);
    expect(DEFAULT_MOB_WAVES_CONFIG.boss?.maxPerRoundScope).toBe("zone");
  });

  it("⭐ a REAL round in which the old code summoned TWO kings now holds exactly one", () => {
    cover("mob-boss-round-cap");
    // Two champions in ONE zone, each farming past the threshold. `bossSummonsAt`
    // is per-champion, so BOTH fire — that is the 「無限出場」 owner watched, and
    // `repeatable` cannot see it because neither champion repeated.
    const run = (maxPerRound: number): number => {
      const w = newWorld();
      const rules = rulesWith({ noClip: true, maxPerRound, maxPerRoundScope: "zone" });
      beginCombatMobs(w, rules, [0]);
      const a = spawnChampion(w, {
        championId: "thorne" as ChampionId,
        seatId: asSeatId(0),
        teamId: asTeamId(0),
        pos: { x: ZONE.center.x - 4, z: ZONE.center.z },
        zone: 0,
      });
      const b = spawnChampion(w, {
        championId: "thorne" as ChampionId,
        seatId: asSeatId(1),
        teamId: asTeamId(1),
        pos: { x: ZONE.center.x + 4, z: ZONE.center.z },
        zone: 0,
      });
      for (const hero of [a, b]) {
        for (let k = 0; k < 3; k++) {
          const z = spawnMob(w, 0, w.mobRules!, 1, k);
          w.damageQueue.push({
            source: hero,
            target: z,
            amount: 1_000_000,
            type: "true",
            crit: false,
            origin: "ability",
          });
          w.step(new Map());
        }
      }
      return bossesIn(w).length;
    };
    // owner's answer.
    expect(run(1)).toBe(1);
    // …and the SAME round with the cap opened summons two, which is the proof
    // that the round really did reach the second summon and the assertion above
    // is not passing because nothing happened (失敗形狀 ④).
    expect(run(99)).toBe(2);
  });

  it("the cap RESETS on the next round, not on a timer", () => {
    cover("mob-boss-round-cap");
    const w = newWorld();
    const rules = rulesWith({ noClip: true, maxPerRound: 1 });
    beginCombatMobs(w, rules, [0]);
    expect(summonMobBoss(w, 0, rules, 0 as unknown as EntityId, 3)).not.toBeNull();
    expect(summonMobBoss(w, 0, rules, 0 as unknown as EntityId, 6)).toBeNull();
    // …no amount of TIME opens it inside the same round…
    for (let i = 0; i < 600; i++) w.step(new Map());
    expect(summonMobBoss(w, 0, rules, 0 as unknown as EntityId, 9)).toBeNull();
    // …the ROUND does.
    endCombatMobs(w);
    beginCombatMobs(w, rules, [0]);
    expect(summonMobBoss(w, 0, rules, 0 as unknown as EntityId, 3)).not.toBeNull();
  });

  it("scope `zone` gives every duel its own king; `match` shares one", () => {
    cover("mob-boss-round-cap");
    const count = (scope: "zone" | "match"): number => {
      const w = newWorld();
      const rules = rulesWith({ noClip: true, maxPerRound: 1, maxPerRoundScope: scope });
      beginCombatMobs(w, rules, [0, 1]);
      summonMobBoss(w, 0, rules, 0 as unknown as EntityId, 3);
      summonMobBoss(w, 1, rules, 0 as unknown as EntityId, 3);
      return bossesIn(w).length;
    };
    expect(count("zone")).toBe(2);
    expect(count("match")).toBe(1);
    // the key that makes one map serve both scopes, and why -1 is safe
    expect(bossSpawnCapKey(0, "zone")).toBe(0);
    expect(bossSpawnCapKey(3, "zone")).toBe(3);
    expect(bossSpawnCapKey(3, "match")).toBe(-1);
    expect(bossSpawnCapKey(3, undefined)).toBe(3);
  });

  it("a blocked summon costs NOTHING — no body, no round extension, no event", () => {
    cover("mob-boss-round-cap");
    const w = newWorld();
    const rules = rulesWith({ noClip: true, maxPerRound: 1 });
    beginCombatMobs(w, rules, [0]);
    summonMobBoss(w, 0, rules, 0 as unknown as EntityId, 3);
    const mobsAfterFirst = w.mob.size;
    w.events.length = 0;
    expect(summonMobBoss(w, 0, rules, 0 as unknown as EntityId, 6)).toBeNull();
    expect(w.mob.size).toBe(mobsAfterFirst);
    // ⚠️ THE EVENT IS THE PROOF, and it covers the #L1 round extension too: the
    // cap gate returns BEFORE `extendRoundForBoss`, and the extension's only
    // observable output is `extendedTicks` on this very payload. No event ⇒ no
    // body, no clock move, no 「回合延長 180 秒」 banner for a king that never came.
    expect(w.events.map((e) => e.type)).toEqual([]);
  });
});

// ───────────────────────────────── C. 腳下圈圈放大,但不影響無碰撞 ──────

describe("#247 C — 腳下圈圈只是視覺,和碰撞完全獨立", () => {
  it("the ring tracks 體型倍率 when `follow` is 1 and ignores it when 0", () => {
    cover("mob-boss-ring");
    const t = { tintStrength: 0.65, groundRingDiameter: 1.25, groundRingSizeFollow: 1 };
    // the shipped king: 體型 10 倍 → 圈圈 10 倍
    expect(mobGroundRingDiameter(10, t)).toBeCloseTo(12.5, 9);
    // the shipped zombie: 體型 0.68 → a ring SMALLER than a player's
    expect(mobGroundRingDiameter(0.68, t)).toBeCloseTo(0.85, 9);
    // 1× is exactly the champion ring, so the feature is invisible until used
    expect(mobGroundRingDiameter(1, t)).toBeCloseTo(1.25, 9);
    // follow 0 = every kind the same size, whatever the body
    const flat = { ...t, groundRingSizeFollow: 0 };
    expect(mobGroundRingDiameter(10, flat)).toBeCloseTo(1.25, 9);
    expect(mobGroundRingDiameter(0.68, flat)).toBeCloseTo(1.25, 9);
  });

  it("never negative, never wider than the ceiling, and the ceiling is stated", () => {
    cover("mob-boss-ring");
    // follow > 1 against a sub-1 size drives the bracket negative — a mirrored
    // ring is a rendering bug, not a small ring.
    expect(mobGroundRingDiameter(0.1, { groundRingDiameter: 2, groundRingSizeFollow: 2 })).toBe(0);
    // the legal-but-absurd corner: max diameter × max follow × a huge 體型倍率
    expect(mobGroundRingDiameter(50, { groundRingDiameter: 8, groundRingSizeFollow: 2 })).toBe(
      MOB_RING_MAX_DIAMETER,
    );
    // and the ceiling is the duel zone's own radius, said out loud
    expect(MOB_RING_MAX_DIAMETER).toBe(ZONE.boundaryRadius);
  });

  it("the table survives the wire, and a pre-#247 payload keeps its tint", () => {
    cover("mob-boss-ring");
    const rules = rulesWith({}, { groundRingDiameter: 4, groundRingSizeFollow: 0.5 });
    const back = parseMobVisualJson(mobVisualJson(rules));
    expect(back.groundRingDiameter).toBe(4);
    expect(back.groundRingSizeFollow).toBe(0.5);
    // ⚠️ PER FIELD, not all-or-nothing: an older shard sends only `tintStrength`
    // and must still get its tint honoured rather than being reset wholesale.
    const old = parseMobVisualJson('{"tintStrength":0.2}');
    expect(old.tintStrength).toBe(0.2);
    expect(old.groundRingDiameter).toBe(DEFAULT_MOB_RING_DIAMETER);
    expect(old.groundRingSizeFollow).toBe(DEFAULT_MOB_RING_SIZE_FOLLOW);
    // out-of-range values fall back per key, they do not poison the table
    const bad = parseMobVisualJson('{"tintStrength":0.2,"groundRingDiameter":900}');
    expect(bad.tintStrength).toBe(0.2);
    expect(bad.groundRingDiameter).toBe(DEFAULT_MOB_RING_DIAMETER);
  });

  it("⭐ changing the ring changes NOTHING the king collides with — same path, byte for byte", () => {
    cover("mob-boss-ring");
    // THE SENTENCE OWNER WROTE, as an experiment: two worlds identical except
    // for the two ring numbers. If a ring number ever reached the body radius,
    // the steering/collision layer would deflect differently and the paths
    // would diverge on the first tick that touches the pillar.
    const tiny = rulesWith({ noClip: false }, { groundRingDiameter: 0, groundRingSizeFollow: 0 });
    const huge = rulesWith({ noClip: false }, { groundRingDiameter: 8, groundRingSizeFollow: 2 });

    // the sim body is untouched…
    expect(mobProfile(huge, "boss").radius).toBe(mobProfile(tiny, "boss").radius);
    expect(mobProfile(huge, "normal").radius).toBe(mobProfile(tiny, "normal").radius);
    expect(mobProfile(huge, "boss").attackRangeSq).toBe(mobProfile(tiny, "boss").attackRangeSq);

    // …and so is every position on a real 240-tick walk into a pillar.
    const path = (rules: MobRules): string => {
      const w = newWorld();
      const id = summonMobBoss(w, 0, rules, 0 as unknown as EntityId, 3)!;
      const t = w.transform.get(id)!;
      t.pos = { x: PILLAR.center.x - 8, z: PILLAR.center.z };
      const pts: string[] = [];
      for (let i = 0; i < 240; i++) {
        w.nav.get(id)!.moveTarget = { x: PILLAR.center.x + 8, z: PILLAR.center.z };
        movementSystem(w);
        const p = w.transform.get(id)!.pos;
        pts.push(`${p.x},${p.z}`);
      }
      return pts.join("|");
    };
    expect(path(huge)).toBe(path(tiny));
    // the walk really happened (an all-zero path would make the line above vacuous)
    expect(path(tiny).length).toBeGreaterThan(500);
  });

  it("the ring numbers reach `MobRules` untouched by the collision fields", () => {
    cover("mob-boss-ring");
    const rules = rulesWith({}, { groundRingDiameter: 6, groundRingSizeFollow: 1.5, radius: 0.6 });
    expect(rules.groundRingDiameter).toBe(6);
    expect(rules.groundRingSizeFollow).toBe(1.5);
    expect(rules.radius).toBe(0.6);
    // out-of-schema values are clamped at the arm seam, not passed through
    const wild = rulesWith({}, { groundRingDiameter: -5, groundRingSizeFollow: 99 });
    expect(wild.groundRingDiameter).toBe(0);
    expect(wild.groundRingSizeFollow).toBe(2);
  });
});
