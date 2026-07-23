/**
 * tickLoop.test.ts — the fixed-timestep pacing guard that keeps the MatchRoom
 * simulation loop from stalling (task #46: the sim intermittently STOPS TICKING
 * mid-match while the client renders on at 60fps).
 *
 * The stall is a fixed-timestep spiral of death: an unbounded catch-up loop
 * that, once the server falls behind real-time, runs ever-longer synchronous
 * bursts and never returns to broadcast a snapshot. planTicks bounds ticks per
 * frame and sheds whole-tick backlog so the loop can never wedge.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { planTicks, MAX_CATCHUP_TICKS } from "./tickLoop";

const TICK_MS = 1000 / 30; // mirror the engine's fixed step

describe("tick-loop catch-up clamp (#46)", () => {
  it("steps normally when dt tracks real time", () => {
    cover("match-tickloop-clamp");
    // half a tick of dt: nothing runs yet, remainder carries forward.
    let p = planTicks(0, TICK_MS / 2, TICK_MS);
    expect(p.steps).toBe(0);
    expect(p.dropped).toBe(false);
    // another half tick tops it over one full tick: exactly one step.
    p = planTicks(p.accumulator, TICK_MS / 2, TICK_MS);
    expect(p.steps).toBe(1);
    expect(p.dropped).toBe(false);
    expect(p.accumulator).toBeLessThan(TICK_MS);
  });

  it("NEVER advances more than the clamp in a single frame (spiral guard)", () => {
    cover("match-tickloop-clamp");
    // a monstrous dt (a 10-second GC pause / process freeze) would ask for 300
    // ticks in one frame — the exact spiral that pins the event loop.
    const p = planTicks(0, 10_000, TICK_MS);
    expect(p.steps).toBe(MAX_CATCHUP_TICKS); // clamped
    expect(p.dropped).toBe(true); // and the surplus backlog was shed
    expect(p.accumulator).toBeLessThan(TICK_MS); // never carries a tick of debt
  });

  it("sheds backlog so the NEXT frame is not itself maxed out", () => {
    cover("match-tickloop-clamp");
    // frame 1: huge dt, clamped + shed.
    const f1 = planTicks(0, 5_000, TICK_MS);
    expect(f1.steps).toBe(MAX_CATCHUP_TICKS);
    expect(f1.dropped).toBe(true);
    // frame 2: a normal dt now runs at most one tick — the debt did NOT persist
    // (a non-shedding loop would still owe ~145 ticks here and spiral).
    const f2 = planTicks(f1.accumulator, TICK_MS, TICK_MS);
    expect(f2.steps).toBeLessThanOrEqual(1);
    expect(f2.dropped).toBe(false);
  });

  it("a steady real-time drip averages one tick per two half-frames (no drift)", () => {
    cover("match-tickloop-clamp");
    let acc = 0;
    let total = 0;
    // 600 half-tick frames == 300 ticks of real time; we must run ~300 steps,
    // never fewer (no lost time) and never spiral (no dropped backlog).
    for (let i = 0; i < 600; i++) {
      const p = planTicks(acc, TICK_MS / 2, TICK_MS);
      acc = p.accumulator;
      total += p.steps;
      expect(p.dropped).toBe(false);
      expect(p.steps).toBeLessThanOrEqual(MAX_CATCHUP_TICKS);
    }
    expect(total).toBe(300);
  });

  it("ignores a bad dt (negative / NaN) instead of corrupting the accumulator", () => {
    cover("match-tickloop-clamp");
    const base = planTicks(0, TICK_MS * 0.9, TICK_MS).accumulator;
    for (const bad of [-1000, Number.NaN, Number.POSITIVE_INFINITY * 0]) {
      const p = planTicks(base, bad, TICK_MS);
      expect(p.steps).toBe(0);
      expect(p.dropped).toBe(false);
      expect(p.accumulator).toBe(base); // untouched
    }
  });
});
