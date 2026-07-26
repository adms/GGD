/**
 * tickHealth — the process-wide sim-health counter (task #272).
 *
 * This file tests the AGGREGATOR in isolation, which is exactly the kind of
 * test that cannot prove the feature works: deleting the `tickHealth.noteShed`
 * / `tickHealth.noteTick` calls out of rooms/MatchRoom.ts would leave every
 * assertion here green while the counter stays at zero forever. The line that
 * carries the feature is guarded by ./tickHealthWiring.test.ts; this file only
 * proves the maths and the log format.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import {
  TickHealth,
  TICK_COST_WINDOW,
  TICK_SHED_LOG_TAG,
  SHED_LOG_HEAD,
  SHED_LOG_EVERY,
  formatShedLog,
} from "./tickHealth";
import { planTicks } from "./tickLoop";

const TICK_MS = 1000 / 30;

describe("sim tick health counters (tick-health-counters)", () => {
  it("starts at a truthful zero — no sheds, no ticks, no fabricated percentiles", () => {
    cover("tick-health-counters");
    const h = new TickHealth();
    const s = h.snapshot();
    expect(s.ticks).toBe(0);
    expect(s.shedEvents).toBe(0);
    expect(s.shedTicks).toBe(0);
    expect(s.shedBehindMs).toBe(0);
    // null, not 0 — "never happened" and "happened at the unix epoch" are not
    // the same statement, and an operator reads the difference.
    expect(s.lastShedAtMs).toBeNull();
    expect(s.lastShedMatch).toBeNull();
    expect(s.window).toBe(0);
    expect(s.p50Ms).toBe(0);
  });

  it("counts shed EVENTS and shed TICKS separately, and names the last one", () => {
    cover("tick-health-counters");
    const h = new TickHealth();
    h.noteShed("m-1", 4, 1_700_000_000_000, TICK_MS);
    h.noteShed("m-2", 11, 1_700_000_005_000, TICK_MS);
    const s = h.snapshot();
    // one shed can throw away 1 tick or 100; `dropped: boolean` could not tell
    // those apart, which is why droppedTicks exists at all.
    expect(s.shedEvents).toBe(2);
    expect(s.shedTicks).toBe(15);
    expect(s.shedBehindMs).toBeCloseTo(15 * TICK_MS, 2);
    expect(s.lastShedAtMs).toBe(1_700_000_005_000);
    expect(s.lastShedMatch).toBe("m-2");
    expect(s.lastShedTicks).toBe(11);
  });

  it("the shed count really moves when planTicks really sheds (end-to-end maths)", () => {
    cover("tick-health-counters");
    const h = new TickHealth();
    // a 1-second stall against a 33.3ms tick asks for 30 ticks; the clamp runs
    // 5 and abandons the rest.
    const plan = planTicks(0, 1000, TICK_MS);
    expect(plan.dropped).toBe(true);
    // …and the clamp itself is UNCHANGED by the new field (#272 is observation
    // only): same steps, same carried accumulator as before.
    expect(plan.steps).toBe(5);
    expect(plan.accumulator).toBeLessThan(TICK_MS);
    // THE INVARIANT, asserted instead of a magic number: what ran, what was
    // shed, and what is still carried must account for the entire stall — the
    // counter can neither lose sim time nor invent it.
    expect(
      plan.steps * TICK_MS + plan.droppedTicks * TICK_MS + plan.accumulator,
      "run + shed + carried must equal the elapsed wall clock",
    ).toBeCloseTo(1000, 6);
    // 24, not the naive 30−5=25: the accumulator carries 33.3ms of sub-tick
    // remainder out of this frame, and that debt was NOT thrown away.
    expect(plan.droppedTicks).toBe(24);
    h.noteShed("m-x", plan.droppedTicks, 1, TICK_MS);
    expect(h.snapshot().shedTicks).toBe(24);
    expect(h.snapshot().shedBehindMs).toBeCloseTo(24 * TICK_MS, 2);
  });

  it("a healthy plan sheds nothing — droppedTicks is 0, not a phantom count", () => {
    cover("tick-health-counters");
    // MatchRoom drives the loop at TICK_MS/2, so this is the normal case.
    let acc = 0;
    for (let i = 0; i < 200; i++) {
      const p = planTicks(acc, TICK_MS / 2, TICK_MS);
      acc = p.accumulator;
      expect(p.dropped).toBe(false);
      expect(p.droppedTicks).toBe(0);
    }
  });

  it("per-tick percentiles catch the shape sheds CANNOT see: always late, never clamped", () => {
    cover("tick-health-percentiles");
    const h = new TickHealth();
    // Every tick costs 40ms against a 33.3ms budget — 20% behind real-time,
    // forever. MatchRoom is called at TICK_MS/2, so the accumulator never owes
    // the ~200ms a single shed needs: shedEvents stays 0 while the server is
    // measurably overloaded. THIS is why the percentiles exist.
    for (let i = 0; i < 100; i++) h.noteTick(40);
    const s = h.snapshot();
    expect(s.shedEvents).toBe(0);
    expect(s.ticks).toBe(100);
    expect(s.p50Ms).toBeCloseTo(40, 3);
    expect(s.p99Ms).toBeCloseTo(40, 3);
    expect(s.p50Ms).toBeGreaterThan(TICK_MS); // the alarm an operator can read
  });

  it("percentiles are real order statistics, and max is all-time (not windowed)", () => {
    cover("tick-health-percentiles");
    const h = new TickHealth();
    for (let i = 1; i <= 100; i++) h.noteTick(i); // 1..100 ms
    const s = h.snapshot();
    expect(s.window).toBe(100);
    expect(s.p50Ms).toBe(50);
    expect(s.p95Ms).toBe(95);
    expect(s.p99Ms).toBe(99);
    expect(s.maxMs).toBe(100);
    // the window is ROLLING: flood it with cheap ticks and the percentiles
    // recover, but the worst tick ever seen is not quietly forgotten.
    for (let i = 0; i < TICK_COST_WINDOW; i++) h.noteTick(1);
    const t = h.snapshot();
    expect(t.window).toBe(TICK_COST_WINDOW);
    expect(t.p99Ms).toBe(1);
    expect(t.maxMs).toBe(100);
    expect(t.ticks).toBe(100 + TICK_COST_WINDOW);
  });

  it("a bad clock cannot poison the percentiles (NaN / negative samples)", () => {
    cover("tick-health-percentiles");
    const h = new TickHealth();
    h.noteTick(Number.NaN);
    h.noteTick(-5);
    h.noteTick(Number.POSITIVE_INFINITY);
    const s = h.snapshot();
    expect(s.ticks).toBe(3); // the ticks DID run; only the samples were junk
    expect(s.window).toBe(0);
    expect(s.p99Ms).toBe(0);
    expect(s.maxMs).toBe(0);
  });

  it("the log is throttled but the COUNTER never is — the #46 log-flood fix", () => {
    cover("tick-health-log");
    const h = new TickHealth();
    // The pre-#272 warn had no throttle at all: a persistently-late 30Hz room
    // could emit up to 60 lines/second. Mirrors MatchRoom.onLoopFault's shape.
    let logged = 0;
    for (let i = 0; i < 1000; i++) {
      if (h.noteShed("m", 1, i, TICK_MS)) logged++;
    }
    expect(h.snapshot().shedEvents).toBe(1000); // every event counted
    expect(h.snapshot().shedTicks).toBe(1000);
    // head + the periodic ones (300/600/900) — bounded, and far below 1000
    expect(logged).toBe(SHED_LOG_HEAD + 3);
    expect(logged).toBeLessThan(1000 / SHED_LOG_EVERY + SHED_LOG_HEAD + 1);
  });

  it("the log line is ONE fixed grep-able format with every number in it", () => {
    cover("tick-health-log");
    const h = new TickHealth();
    h.noteTick(12.5);
    h.noteShed("match-42", 7, 1_700_000_000_000, TICK_MS);
    const line = formatShedLog("match-42", 7, h.snapshot());
    // the one token an operator greps for
    expect(line.startsWith(`[${TICK_SHED_LOG_TAG}]`)).toBe(true);
    for (const kv of [
      "match=match-42",
      "shedTicks=7",
      "shedEvents=1",
      "totalShedTicks=7",
      "behindMs=",
      "tickP50Ms=12.5",
      "tickP99Ms=12.5",
      "tickMaxMs=12.5",
      "window=1",
    ]) {
      expect(line, `the grep format must carry ${kv}`).toContain(kv);
    }
    // …and it still carries #46's sentence, so the instruction already written
    // into docs/_延遲改進計畫.md (grep `sim fell behind real-time`) keeps working.
    expect(line).toContain("sim fell behind real-time");
    expect(line.includes("\n")).toBe(false); // one line, one event
  });
});
