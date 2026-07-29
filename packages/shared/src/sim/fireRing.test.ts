/**
 * Fire ring (火圈 / 火環, tasks #132 + #195) — the round-pacing hazard.
 *
 * #195 redesign under test:
 *   • THE SHRINK LAW — `fireRingRadius` is a pure function of the TICK (never
 *     of tick history), monotone non-increasing, and identical for two
 *     independently-armed rule sets;
 *   • THE SAFETY PREDICATE — whole-body-inside, and at the closed radius
 *     `inner < 0` so it is false for every champion at every position
 *     (「沒有生存空間」 out of the same arithmetic, no second rule);
 *   • ONLY OUTSIDE BURNS, with a rate that ramps with the shrink progress;
 *   • the SHIPPED config is locked to the owner's numbers (60 / 20 / 0.5), and
 *     the client's cue formula `combatMaxSec - startSec` is proven against the
 *     sim's own tick math.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cover } from "../../testkit/cover";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";
import {
  beginCombatFireRing,
  currentFireRingRadius,
  endCombatFireRing,
  fireRingIsSafe,
  fireRingRadius,
  fireRingRatePerSec,
  fireRingRulesFromConfig,
  isBurnedByFireRing,
  type FireRingRules,
} from "./fireRing";
import { zConfigMatchDoc } from "../content/schema/config";

beforeAll(() => registerSkeletonContent());

const DT = 1 / 30;
/** The shipped arena geometry the ring closes inside. */
const ZONE_R = 24;
/** Champion collision radius (spawnChampion.ts). */
const BODY_R = 0.6;

const step = (w: SimWorld, n = 1): void => {
  for (let i = 0; i < n; i++) w.step(new Map());
};

function champAt(w: SimWorld, seat: number, team: number, x: number, z: number, zone = 0): EntityId {
  return spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x, z },
    zone,
  });
}

/** The shipped ring, in ticks — the exact rules the game-server arms. */
const shippedRules = (): FireRingRules =>
  fireRingRulesFromConfig(
    {
      startSec: 60,
      shrinkSec: 20,
      minRadius: 0.5,
      burnPctPerSecStart: 0.04,
      burnPctPerSecEnd: 0.2,
      maxPctPerSec: 1,
    },
    DT,
  );

/** Live-combat world with one champion at zone 0's centre, armed. */
function armedWorld(rules: FireRingRules, seed = 7): { w: SimWorld; id: EntityId } {
  const w = new SimWorld(SKELETON_ARENA, seed);
  w.combatActive = true;
  const c = SKELETON_ARENA.zones[0]!.center;
  const id = champAt(w, 0, 1, c.x, c.z);
  beginCombatFireRing(w, rules);
  return { w, id };
}

/** Sum this tick's fireRingDamage for `id`. */
function ringDmg(w: SimWorld, id: EntityId): number {
  let sum = 0;
  for (const ev of w.events) {
    if (ev.type === "fireRingDamage" && ev.data.id === id) sum += ev.data.amount as number;
  }
  return sum;
}

// ---------------------------------------------------------------- shrink law
describe("the shrink law (firering-shrink)", () => {
  it("matches the design table exactly at k = 0/150/300/450/600, and clamps past the end", () => {
    cover("firering-shrink");
    const r = shippedRules();
    expect(r.startTicks).toBe(1800);
    expect(r.shrinkTicks).toBe(600);

    // t (s) | k (ticks) | radius | safe radius (inner = radius - 0.6)
    const table: [number, number, number][] = [
      [0, 0, 24.0],
      [5, 150, 18.125],
      [10, 300, 12.25],
      [15, 450, 6.375],
      [20, 600, 0.5],
    ];
    for (const [, k, want] of table) {
      expect(fireRingRadius(r, k, ZONE_R)).toBeCloseTo(want, 12);
      expect(fireRingRadius(r, k, ZONE_R) - BODY_R).toBeCloseTo(want - BODY_R, 12);
    }
    // past the end it CLAMPS — a long round never produces a negative radius
    expect(fireRingRadius(r, 900, ZONE_R)).toBeCloseTo(0.5, 12);
    expect(fireRingRadius(r, 1_000_000, ZONE_R)).toBeCloseTo(0.5, 12);
    // before/at ignition the ring is the zone boundary itself
    expect(fireRingRadius(r, 0, ZONE_R)).toBe(ZONE_R);
    expect(fireRingRadius(r, -5, ZONE_R)).toBe(ZONE_R);
  });

  it("is monotone NON-INCREASING across every one of the 600 shrink ticks", () => {
    cover("firering-shrink");
    const r = shippedRules();
    let prev = fireRingRadius(r, 0, ZONE_R);
    for (let k = 1; k <= 600; k++) {
      const cur = fireRingRadius(r, k, ZONE_R);
      expect(cur).toBeLessThanOrEqual(prev);
      prev = cur;
    }
    // ~1.175 u/s: continuous to the eye, never a staircase
    const perTick = fireRingRadius(r, 0, ZONE_R) - fireRingRadius(r, 1, ZONE_R);
    expect(perTick).toBeCloseTo((ZONE_R - 0.5) / 600, 12);
    expect(perTick * 30).toBeCloseTo(1.175, 6);
  });

  it("two independently-armed rule sets produce bit-identical radii (determinism)", () => {
    cover("firering-shrink");
    const a = shippedRules();
    const b = shippedRules();
    for (let k = 0; k <= 700; k++) {
      // Object.is, not toBeCloseTo: the wire and the digest need bit equality.
      expect(Object.is(fireRingRadius(a, k, ZONE_R), fireRingRadius(b, k, ZONE_R))).toBe(true);
    }
  });
});

// ------------------------------------------------------------ safety predicate
describe("the safety predicate is WHOLE-BODY-INSIDE (firering-shrink)", () => {
  it("at t=0 a champion at 23.39 is safe and one at 23.41 burns", () => {
    cover("firering-shrink");
    const r = shippedRules();
    const radius = fireRingRadius(r, 0, ZONE_R); // 24
    // inner = 24 - 0.6 = 23.4, EXACTLY clampToBoundary's own limit, so ignition
    // burns nobody the collision system would have allowed to stand there.
    expect(fireRingIsSafe(radius, BODY_R, 23.39 * 23.39)).toBe(true);
    expect(fireRingIsSafe(radius, BODY_R, 23.41 * 23.41)).toBe(false);
    expect(fireRingIsSafe(radius, BODY_R, 23.4 * 23.4)).toBe(true); // exactly on it
  });

  it("at t=20 the ring is closed: dist 0 burns — 沒有生存空間, no special case", () => {
    cover("firering-shrink");
    const r = shippedRules();
    const radius = fireRingRadius(r, 600, ZONE_R); // 0.5
    expect(radius - BODY_R).toBeCloseTo(-0.1, 12); // inner < 0
    expect(fireRingIsSafe(radius, BODY_R, 0)).toBe(false);
    for (const d of [0, 0.01, 0.1, 0.4, 1, 5, 23]) {
      expect(fireRingIsSafe(radius, BODY_R, d * d)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------- rate curve
describe("burn rate ramps with the SHRINK, not a staircase (firering-ramp)", () => {
  it("4%/s at ignition → 20%/s once closed, linear in between, capped", () => {
    cover("firering-ramp");
    const r = shippedRules();
    expect(fireRingRatePerSec(r, 0)).toBeCloseTo(0.04, 12);
    expect(fireRingRatePerSec(r, 150)).toBeCloseTo(0.08, 12); // 25% of the way
    expect(fireRingRatePerSec(r, 300)).toBeCloseTo(0.12, 12);
    expect(fireRingRatePerSec(r, 450)).toBeCloseTo(0.16, 12);
    expect(fireRingRatePerSec(r, 600)).toBeCloseTo(0.2, 12);
    expect(fireRingRatePerSec(r, 5000)).toBeCloseTo(0.2, 12); // clamped, not runaway
    expect(fireRingRatePerSec(r, -1)).toBe(0);
  });

  it("respects maxPctPerSec, and an omitted cap does not clamp the authored end", () => {
    cover("firering-ramp");
    const capped = fireRingRulesFromConfig(
      { startSec: 1, shrinkSec: 1, burnPctPerSecStart: 0.5, burnPctPerSecEnd: 1, maxPctPerSec: 0.6 },
      DT,
    );
    expect(fireRingRatePerSec(capped, 30)).toBe(0.6);
    const uncapped = fireRingRulesFromConfig(
      { startSec: 1, shrinkSec: 1, burnPctPerSecStart: 0.5, burnPctPerSecEnd: 1 },
      DT,
    );
    expect(fireRingRatePerSec(uncapped, 30)).toBeCloseTo(1, 12);
  });
});

// ---------------------------------------------------------------- ignition
describe("fire-ring ignition timing (firering-start)", () => {
  it("stays dormant until startTicks, then fires fireRingStart exactly once", () => {
    cover("firering-start");
    const rules = fireRingRulesFromConfig(
      { startSec: 5 * DT, shrinkSec: 10 * DT, minRadius: 0.5, maxPctPerSec: 1 },
      DT,
    );
    expect(rules.startTicks).toBe(5);
    const { w, id } = armedWorld(rules);
    const startHp = w.health.get(id)!.hp;

    let starts = 0;
    for (let i = 0; i < 4; i++) {
      step(w);
      starts += w.events.filter((e) => e.type === "fireRingStart").length;
      expect(ringDmg(w, id)).toBe(0);
    }
    expect(starts).toBe(0);
    expect(w.health.get(id)!.hp).toBe(startHp);

    // tick 5 = startTicks: ignition beat, radius still == the zone boundary, so
    // the champion at the centre (and anyone the collision system allowed) is safe
    step(w);
    expect(w.events.filter((e) => e.type === "fireRingStart")).toHaveLength(1);
    expect(ringDmg(w, id)).toBe(0);
    expect(currentFireRingRadius(w)).toBe(ZONE_R);

    step(w);
    expect(w.events.filter((e) => e.type === "fireRingStart")).toHaveLength(0); // one-shot
  });
});

// ---------------------------------------------------------------- gating
describe("fire-ring gating (firering-gate)", () => {
  it("disarmed world is a pure no-op, and reads as the un-shrunk boundary", () => {
    cover("firering-gate");
    const w = new SimWorld(SKELETON_ARENA, 3);
    w.combatActive = true;
    const id = champAt(w, 0, 1, -40, 0);
    const startHp = w.health.get(id)!.hp;
    step(w, 20);
    expect(w.health.get(id)!.hp).toBe(startHp);
    expect(w.events.some((e) => e.type === "fireRingTick")).toBe(false);
    expect(currentFireRingRadius(w)).toBe(ZONE_R);
    expect(isBurnedByFireRing(w, id)).toBe(false);
  });

  it("armed but combatActive=false does not burn (settle stops the ring, #100)", () => {
    const rules = fireRingRulesFromConfig(
      { startSec: 1 * DT, shrinkSec: 1 * DT, minRadius: 0.5, burnPctPerSecStart: 0.5, burnPctPerSecEnd: 0.5, maxPctPerSec: 1 },
      DT,
    );
    const w = new SimWorld(SKELETON_ARENA, 3);
    const id = champAt(w, 0, 1, -40, 0);
    beginCombatFireRing(w, rules);
    w.combatActive = false; // round settled
    const startHp = w.health.get(id)!.hp;
    step(w, 10);
    expect(w.health.get(id)!.hp).toBe(startHp); // clock never advanced, no burn
    expect(w.fireRingTicks).toBe(0);
    // and the radius FREEZES with the mechanic instead of shrinking on
    expect(currentFireRingRadius(w)).toBe(ZONE_R);
  });

  it("endCombatFireRing disarms and re-idles the system", () => {
    const rules = fireRingRulesFromConfig(
      { startSec: 1 * DT, shrinkSec: 2 * DT, minRadius: 0.5, burnPctPerSecStart: 0.4, burnPctPerSecEnd: 0.4, maxPctPerSec: 1 },
      DT,
    );
    const { w, id } = armedWorld(rules);
    step(w, 4); // ignite + close + burn (the centre is outside a 0.5 ring)
    expect(w.health.get(id)!.hp).toBeLessThan(w.health.get(id)!.maxHp);
    endCombatFireRing(w);
    expect(w.fireRingRules).toBeNull();
    expect(w.fireRingTicks).toBe(-1);
    const hpAfterDisarm = w.health.get(id)!.hp;
    step(w, 10);
    expect(w.events.some((e) => e.type === "fireRingTick")).toBe(false);
    expect(w.health.get(id)!.hp).toBeGreaterThanOrEqual(hpAfterDisarm);
  });

  it("two same-seed armed worlds stay byte-identical (determinism)", () => {
    cover("firering-gate");
    const mk = (): SimWorld => {
      const rules = fireRingRulesFromConfig(
        { startSec: 2 * DT, shrinkSec: 30 * DT, minRadius: 0.5, maxPctPerSec: 1 },
        DT,
      );
      const { w } = armedWorld(rules, 4242);
      step(w, 30);
      return w;
    };
    expect(mk().digest()).toBe(mk().digest());
  });

  it("HARD CONSTRAINT: the burn NEVER routes through world.damageQueue", () => {
    cover("firering-gate");
    // A champion parked at the rim burns every shrink tick. The queue that feeds
    // armor/MR/shields/lifesteal/kill-credit must stay empty the whole time —
    // the ring applies hp directly and emits its own fireRingDamage event.
    const rules = fireRingRulesFromConfig(
      { startSec: 0, shrinkSec: 20, minRadius: 0.5, burnPctPerSecStart: 0.04, burnPctPerSecEnd: 0.2, maxPctPerSec: 1 },
      DT,
    );
    const w = new SimWorld(SKELETON_ARENA, 9);
    w.combatActive = true;
    const c = SKELETON_ARENA.zones[0]!.center;
    const id = champAt(w, 0, 1, c.x, c.z + (ZONE_R - BODY_R - 0.05)); // near the rim
    beginCombatFireRing(w, rules);
    let sawBurn = false;
    for (let t = 0; t < 200; t++) {
      step(w);
      if (ringDmg(w, id) > 0) sawBurn = true;
      expect(w.damageQueue.length).toBe(0); // every tick, no exceptions
      if (!w.health.get(id)!.alive) break;
    }
    expect(sawBurn).toBe(true); // the burn really did happen (else the guard is vacuous)
  });
});

// ---------------------------------------------------------------- schema
describe("config.match@1 fireRing schedule (firering-config)", () => {
  const shipped = (): Record<string, unknown> =>
    JSON.parse(
      readFileSync(join(__dirname, "../../../../content/config/config.match.json"), "utf8"),
    ) as Record<string, unknown>;

  it("locks the OWNER'S numbers: 60 s ignition, a 20 s shrink to 0.5", () => {
    cover("firering-config");
    const parsed = zConfigMatchDoc.parse(shipped());
    // combatMaxSec MUST come down with startSec: at 240 the `fireRing` bed and
    // the minimap rim would cover 75% of combat and the `combat` bed's
    // B-section (#87/#109) would never play.
    expect(parsed.match.combatMaxSec).toBe(100);
    expect(parsed.match.fireRing).toEqual({
      startSec: 60,
      shrinkSec: 20,
      minRadius: 0.5,
      burnPctPerSecStart: 0.04,
      burnPctPerSecEnd: 0.2,
      maxPctPerSec: 1,
      // #L1 — 殭屍王在場 → 回合延長 3 分鐘,火圈同步延後 3 分鐘 (owner
      // 2026-07-30). Pinned INSIDE this object rather than in its own `it`
      // because the whole point of `toEqual` here is that the shipped ring block
      // is exactly these keys and nothing else: a knob added to the schema but
      // never authored into the doc would slip past a narrower assertion.
      boss: { extendCombatSec: 180, delayFireRingSec: 180 },
    });
    // 20 s of backstop left after the ring has fully closed
    expect(parsed.match.fireRing!.startSec + parsed.match.fireRing!.shrinkSec).toBeLessThanOrEqual(
      parsed.match.combatMaxSec,
    );

    const rules = fireRingRulesFromConfig(parsed.match.fireRing!, DT);
    expect(rules.startTicks).toBe(1800);
    expect(rules.shrinkTicks).toBe(600);
    expect(rules.minRadius).toBe(0.5);
  });

  it("an absent fireRing block still validates (optional + additive)", () => {
    const doc = shipped();
    delete (doc.match as Record<string, unknown>).fireRing;
    expect(() => zConfigMatchDoc.parse(doc)).not.toThrow();
  });

  it("rejects a ring that could not FINISH CLOSING before the hard backstop", () => {
    const doc = shipped();
    // 60 + 20 = 80 > 70: ignition fits, the shrink does not. Ignition alone is
    // not enough — a ring still closing when the phase force-ends finishes nobody.
    (doc.match as Record<string, unknown>).combatMaxSec = 70;
    expect(() => zConfigMatchDoc.parse(doc)).toThrow(/startSec/);
  });

  it("drops the retired staircase fields loudly (.strict)", () => {
    cover("firering-config");
    const doc = shipped();
    (doc.match as { fireRing: Record<string, unknown> }).fireRing.stepSec = 1;
    expect(() => zConfigMatchDoc.parse(doc)).toThrow();
  });

  /**
   * THE CUE FORMULA, PROVEN AGAINST THE SIM'S OWN TICK MATH.
   *
   * The client never sees combat-ELAPSED time; the HUD carries
   * `phaseSecondsLeft`, counting DOWN from `combatMaxSec`. So every client-side
   * cue for the ring (`apps/client/src/audio/fireRingWindow.ts`: the tension BGM
   * bed and the minimap danger rim) is driven by
   *
   *     secondsLeftAtIgnition = combatMaxSec - fireRing.startSec
   *
   * #195 moved BOTH numbers (240/180 → 100/60), which is exactly the situation
   * that produced #132's silent 30-second cue drift. Nothing about the
   * derivation inverts — it is asserted here from the TICK side so the client's
   * arithmetic is checked against the sim's, not merely against itself.
   */
  it("ignites with exactly (combatMaxSec - startSec) seconds left — the client's cue formula", () => {
    cover("firering-config");
    const parsed = zConfigMatchDoc.parse(shipped());
    const combatMaxTicks = Math.round(parsed.match.combatMaxSec * 30);
    const rules = fireRingRulesFromConfig(parsed.match.fireRing!, DT);
    const ticksLeftAtIgnition = combatMaxTicks - rules.startTicks;
    expect(ticksLeftAtIgnition / 30).toBe(
      parsed.match.combatMaxSec - parsed.match.fireRing!.startSec,
    );
    expect(ticksLeftAtIgnition / 30).toBe(40);
  });
});
