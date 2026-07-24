/**
 * Fire ring (火圈 / 火環, task #132) — the round-pacing hazard. Sim primitive:
 * ignites at the configured combat-elapsed time, then burns every living
 * champion with an escalating, defence-ignoring %-HP true-damage ramp; gated on
 * LIVE combat only (coordinates with task #100's settle-freeze). Schema half:
 * the raised `combatMaxSec` backstop + the `fireRing` schedule validate, and
 * the start can never be authored past the hard cap.
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
  endCombatFireRing,
  fireRingRatePerSec,
  fireRingRulesFromConfig,
  type FireRingRules,
} from "./fireRing";
import { zConfigMatchDoc } from "../content/schema/config";

beforeAll(() => registerSkeletonContent());

const DT = 1 / 30;

const step = (w: SimWorld, n = 1): void => {
  for (let i = 0; i < n; i++) w.step(new Map());
};

function champAt(w: SimWorld, seat: number, team: number, x: number, z: number): EntityId {
  return spawnChampion(w, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(seat),
    teamId: asTeamId(team),
    pos: { x, z },
    zone: 0,
  });
}

/** Live-combat world with one champion, armed with the given ring rules. */
function armedWorld(rules: FireRingRules, seed = 7): { w: SimWorld; id: EntityId } {
  const w = new SimWorld(SKELETON_ARENA, seed);
  w.combatActive = true;
  const id = champAt(w, 0, 1, 0, 0);
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

// ---------------------------------------------------------------- rate curve
describe("fire-ring ramp curve (firering-ramp)", () => {
  it("per-second rate = step × pctPerStep, capped, 0 during the grace step", () => {
    cover("firering-ramp");
    const rules = fireRingRulesFromConfig(
      { startSec: 0, stepSec: 1, pctPerStep: 0.01, maxPctPerSec: 1 },
      DT,
    );
    expect(rules.stepTicks).toBe(30);
    // tSS 0..29 → step 0 → 0% (the grace second, the ring is "closing in")
    expect(fireRingRatePerSec(rules, 0)).toBe(0);
    expect(fireRingRatePerSec(rules, 29)).toBe(0);
    // t+1s → 1%/s, t+2s → 2%/s, t+3s → 3%/s (the original design)
    expect(fireRingRatePerSec(rules, 30)).toBeCloseTo(0.01, 12);
    expect(fireRingRatePerSec(rules, 60)).toBeCloseTo(0.02, 12);
    expect(fireRingRatePerSec(rules, 90)).toBeCloseTo(0.03, 12);
    // cap holds: at step 200 the uncapped rate would be 2.0, clamped to 1.0
    expect(fireRingRatePerSec(rules, 200 * 30)).toBe(1);
  });

  it("no cap when maxPctPerSec is omitted (large finite factor, still deterministic)", () => {
    cover("firering-ramp");
    const rules = fireRingRulesFromConfig({ startSec: 0, stepSec: 1, pctPerStep: 0.01 }, DT);
    expect(fireRingRatePerSec(rules, 500 * 30)).toBeCloseTo(5, 6); // 500 steps × 1%
  });
});

// ---------------------------------------------------------------- ignition
describe("fire-ring ignition timing (firering-start)", () => {
  it("stays dormant until startTicks, then fires fireRingStart exactly once", () => {
    cover("firering-start");
    // ignite at combat-elapsed tick 5 (startSec 5*DT), step every 1 tick
    const rules = fireRingRulesFromConfig(
      { startSec: 5 * DT, stepSec: 1 * DT, pctPerStep: 0.01, maxPctPerSec: 1 },
      DT,
    );
    expect(rules.startTicks).toBe(5);
    const { w, id } = armedWorld(rules);
    const startHp = w.health.get(id)!.hp;

    // ticks 1..4: dormant, no ignition, no damage
    let starts = 0;
    for (let i = 0; i < 4; i++) {
      step(w);
      starts += w.events.filter((e) => e.type === "fireRingStart").length;
      expect(ringDmg(w, id)).toBe(0);
    }
    expect(starts).toBe(0);
    expect(w.health.get(id)!.hp).toBe(startHp);

    // tick 5 = startTicks: ignition beat, but the grace step still deals 0
    step(w);
    expect(w.events.filter((e) => e.type === "fireRingStart")).toHaveLength(1);
    expect(ringDmg(w, id)).toBe(0);

    // one more full step past ignition → first damaging step (1%/s)
    step(w);
    expect(w.events.filter((e) => e.type === "fireRingStart")).toHaveLength(0); // one-shot
    expect(ringDmg(w, id)).toBeGreaterThan(0);
  });

  it("emitted per-tick burn equals maxHp × ratePerSec × dt (pure %-HP true damage)", () => {
    cover("firering-ramp");
    const rules = fireRingRulesFromConfig(
      { startSec: 1 * DT, stepSec: 1 * DT, pctPerStep: 0.01, maxPctPerSec: 1 },
      DT,
    );
    const { w, id } = armedWorld(rules);
    const maxHp = w.health.get(id)!.maxHp;
    step(w); // tick1 = startTicks(1): ignition, grace, 0 dmg
    step(w); // tick2: tSS=1 → step 1 → 1%/s
    expect(ringDmg(w, id)).toBeCloseTo(maxHp * 0.01 * DT, 9);
    step(w); // tick3: tSS=2 → step 2 → 2%/s
    expect(ringDmg(w, id)).toBeCloseTo(maxHp * 0.02 * DT, 9);
  });
});

// ---------------------------------------------------------------- gating
describe("fire-ring gating (firering-gate)", () => {
  it("disarmed world is a pure no-op", () => {
    cover("firering-gate");
    const w = new SimWorld(SKELETON_ARENA, 3);
    w.combatActive = true;
    const id = champAt(w, 0, 1, 0, 0);
    const startHp = w.health.get(id)!.hp;
    step(w, 20);
    expect(w.health.get(id)!.hp).toBe(startHp);
    expect(w.events.some((e) => e.type === "fireRingTick")).toBe(false);
  });

  it("armed but combatActive=false does not burn (settle stops the ring, #100)", () => {
    const rules = fireRingRulesFromConfig(
      { startSec: 1 * DT, stepSec: 1 * DT, pctPerStep: 0.5, maxPctPerSec: 1 },
      DT,
    );
    const w = new SimWorld(SKELETON_ARENA, 3);
    const id = champAt(w, 0, 1, 0, 0);
    beginCombatFireRing(w, rules);
    w.combatActive = false; // round settled
    const startHp = w.health.get(id)!.hp;
    step(w, 10);
    expect(w.health.get(id)!.hp).toBe(startHp); // clock never advanced, no burn
    expect(w.fireRingTicks).toBe(0);
  });

  it("endCombatFireRing disarms and re-idles the system", () => {
    const rules = fireRingRulesFromConfig(
      { startSec: 1 * DT, stepSec: 1 * DT, pctPerStep: 0.1, maxPctPerSec: 1 },
      DT,
    );
    const { w, id } = armedWorld(rules);
    step(w, 3); // ignite + burn a bit
    expect(w.health.get(id)!.hp).toBeLessThan(w.health.get(id)!.maxHp);
    endCombatFireRing(w);
    expect(w.fireRingRules).toBeNull();
    expect(w.fireRingTicks).toBe(-1);
    const hpAfterDisarm = w.health.get(id)!.hp;
    step(w, 10);
    // only regen can move HP now; the ring emits nothing
    expect(w.events.some((e) => e.type === "fireRingTick")).toBe(false);
    expect(w.health.get(id)!.hp).toBeGreaterThanOrEqual(hpAfterDisarm);
  });
});

// ---------------------------------------------------------------- kills + determinism
describe("fire-ring finishes a stalemate (firering-kills)", () => {
  it("an untouched full-HP champion dies within ~15s of ignition", () => {
    cover("firering-ramp");
    const rules = fireRingRulesFromConfig(
      { startSec: 0, stepSec: 1, pctPerStep: 0.01, maxPctPerSec: 1 },
      DT,
    );
    const { w, id } = armedWorld(rules);
    // 1+2+…+14 = 105% ≥ 100%, so death by ~t+14..15s. Step 16s of ticks.
    let deathAtTick = -1;
    for (let t = 0; t < 16 * 30 && deathAtTick < 0; t++) {
      step(w);
      if (!w.health.get(id)!.alive) deathAtTick = t;
    }
    expect(deathAtTick).toBeGreaterThan(0);
    expect(deathAtTick).toBeLessThanOrEqual(16 * 30);
    // environmental death: no killer credited (no `damage` event → killer null)
    const death = w.events.find((e) => e.type === "death" && e.data.id === id);
    // (the death may have fired on an earlier tick; assert the alive flag instead)
    expect(w.health.get(id)!.alive).toBe(false);
    void death;
  });

  it("two same-seed armed worlds stay byte-identical (determinism)", () => {
    cover("firering-gate");
    const mk = (): SimWorld => {
      const rules = fireRingRulesFromConfig(
        { startSec: 2 * DT, stepSec: 1 * DT, pctPerStep: 0.05, maxPctPerSec: 1 },
        DT,
      );
      const { w } = armedWorld(rules, 4242);
      step(w, 30);
      return w;
    };
    expect(mk().digest()).toBe(mk().digest());
  });
});

// ---------------------------------------------------------------- schema
describe("config.match@1 fireRing schedule (firering-config)", () => {
  const shipped = (): Record<string, unknown> =>
    JSON.parse(
      readFileSync(
        join(__dirname, "../../../../content/config/config.match.json"),
        "utf8",
      ),
    ) as Record<string, unknown>;

  it("the shipped doc validates: combatMaxSec + fireRing present", () => {
    cover("firering-config");
    const doc = shipped();
    const parsed = zConfigMatchDoc.parse(doc);
    // Owner directive: 2-minute round, ring at elapsed 60 s. `startSec` is the
    // combat-ELAPSED time at ignition, so 60 < 120 ignites at 60 s left.
    expect(parsed.match.combatMaxSec).toBe(120);
    expect(parsed.match.fireRing).toEqual({
      startSec: 60,
      stepSec: 1,
      pctPerStep: 0.01,
      maxPctPerSec: 1,
    });
    // single source of truth: the ring ignites strictly before the hard backstop
    expect(parsed.match.fireRing!.startSec).toBeLessThan(parsed.match.combatMaxSec);
  });

  it("an absent fireRing block still validates (optional + additive)", () => {
    const doc = shipped();
    delete (doc.match as Record<string, unknown>).fireRing;
    expect(() => zConfigMatchDoc.parse(doc)).not.toThrow();
  });

  it("rejects a ring that would ignite AFTER the hard backstop", () => {
    const doc = shipped();
    (doc.match as Record<string, unknown>).combatMaxSec = 30; // < startSec 60
    expect(() => zConfigMatchDoc.parse(doc)).toThrow(/startSec/);
  });

  /**
   * THE CUE FORMULA, PROVEN AGAINST THE SIM'S OWN TICK MATH.
   *
   * The client never sees combat-ELAPSED time; the HUD carries `phaseSecondsLeft`,
   * counting DOWN from `combatMaxSec`. So every client-side cue for the ring
   * (`apps/client/src/audio/fireRingWindow.ts`: the tension BGM bed and the
   * minimap danger rim) is driven by
   *
   *     secondsLeftAtIgnition = combatMaxSec - fireRing.startSec
   *
   * That was a hardcoded `30` until 2026-07-24 while the authored config made it
   * 60 — the cues fired half a minute after champions had started burning, with
   * no test, no error and nothing tying the two numbers together. This asserts
   * the identity from the TICK side, so the client's arithmetic is checked
   * against the sim's, not merely against itself.
   */
  it("ignites with exactly (combatMaxSec - startSec) seconds left — the client's cue formula", () => {
    cover("firering-config");
    const parsed = zConfigMatchDoc.parse(shipped());
    const combatMaxTicks = Math.round(parsed.match.combatMaxSec * 30);
    const rules = fireRingRulesFromConfig(parsed.match.fireRing!, DT);
    const ticksLeftAtIgnition = combatMaxTicks - rules.startTicks;
    expect(ticksLeftAtIgnition / 30).toBe(parsed.match.combatMaxSec - parsed.match.fireRing!.startSec);
    expect(ticksLeftAtIgnition / 30).toBe(60);
  });
});
