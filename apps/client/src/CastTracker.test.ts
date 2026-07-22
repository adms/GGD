import { describe, it, expect } from "vitest";
import { cover } from "../../../packages/shared/testkit/cover";
import { TICK_MS } from "@ggd/shared/constants";
import { CastTracker } from "./CastTracker";

const begin = (caster: number, slot: string, castTimeSec: number) => ({
  type: "castBegin",
  data: { caster, slot, abilityId: "a", ticks: Math.round((castTimeSec * 1000) / TICK_MS), castTimeSec },
});

describe("CastTracker (cast bar pure logic)", () => {
  it("castBegin → fraction rises 0→1 over the cast time", () => {
    cover("castbar-progress");
    const t = new CastTracker();
    t.handleEvent(begin(7, "R", 2), 1000);
    // at start
    expect(t.progressFor(7, 1000)!.fraction).toBeCloseTo(0, 3);
    expect(t.progressFor(7, 1000)!.kind).toBe("cast");
    expect(t.progressFor(7, 1000)!.slot).toBe(3); // R
    // halfway (1s into a 2s cast)
    expect(t.progressFor(7, 2000)!.fraction).toBeCloseTo(0.5, 2);
    // full
    expect(t.progressFor(7, 3000)!.fraction).toBeCloseTo(1, 2);
    // no cast for an unrelated entity
    expect(t.progressFor(99, 2000)).toBeNull();
  });

  it("castEnd clears the bar", () => {
    cover("castbar-clear");
    const t = new CastTracker();
    t.handleEvent(begin(7, "Q", 1.5), 0);
    expect(t.progressFor(7, 500)).not.toBeNull();
    t.handleEvent({ type: "castEnd", data: { caster: 7, slot: "Q", abilityId: "a" } }, 750);
    expect(t.progressFor(7, 800)).toBeNull();
  });

  it("castInterrupt clears the bar (stun/death mid-cast)", () => {
    cover("castbar-interrupt");
    const t = new CastTracker();
    t.handleEvent(begin(7, "W", 3), 0);
    expect(t.progressFor(7, 1000)!.fraction).toBeCloseTo(1 / 3, 2);
    t.handleEvent({ type: "castInterrupt", data: { caster: 7, slot: "W", abilityId: "a" } }, 1200);
    expect(t.progressFor(7, 1300)).toBeNull();
  });

  it("attackWindup shows a self-expiring bar but never clobbers an ability cast", () => {
    cover("castbar-windup");
    const t = new CastTracker();
    // windup: 6 ticks
    t.handleEvent({ type: "attackWindup", data: { source: 5, target: 6, ticks: 6, ranged: false } }, 0);
    const p = t.progressFor(5, 0);
    expect(p!.kind).toBe("windup");
    expect(p!.slot).toBe(-1);
    // expires after its duration
    expect(t.progressFor(5, 6 * TICK_MS + 1)).toBeNull();
    // an in-progress cast is NOT overwritten by a wind-up
    t.handleEvent(begin(5, "R", 2), 100);
    t.handleEvent({ type: "attackWindup", data: { source: 5, target: 6, ticks: 6, ranged: false } }, 150);
    expect(t.progressFor(5, 200)!.kind).toBe("cast");
  });
});
