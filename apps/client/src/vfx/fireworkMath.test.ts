/**
 * The victory-firework timeline contract (task #93).
 *
 * The two tiers are asserted against the things that would quietly ruin them:
 *
 *   TIER 2 (chicken) — the HOLD. A shaped firework that never stops moving is
 *     unreadable, and "unreadable" is the one failure mode the task forbids.
 *     The hold is therefore a tested invariant with a numeric floor, not a
 *     tuning value someone can shave to 300 ms to tighten the pacing.
 *   TIER 1 (round win) — LENGTH and VARIETY. It fires every round, so the
 *     volley is capped short and every round's scatter must differ.
 *
 * Plus the framing math, which is what makes "full-screen" mean full-screen on
 * a phone in portrait as well as on an ultrawide.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  CHICKEN_BREAK_MS,
  CHICKEN_TIMELINE,
  CHICKEN_TOTAL_MS,
  DRIFT_MAX,
  DROOP_MAX,
  SMALL_LAUNCH_MS,
  SMALL_SHOT_COUNT,
  SMALL_VOLLEY_MS,
  burstEase,
  chickenBurstState,
  fitScale,
  framePoint,
  frustumHalfExtents,
  launchEase,
  smallShotState,
  smallTint,
  smallVolley,
} from "./fireworkMath";

describe("tier 2 — the roast-chicken burst", () => {
  it("is idle before it is fired and done after it ends", () => {
    expect(chickenBurstState(-1).visible).toBe(false);
    expect(chickenBurstState(-1).phase).toBe("idle");
    const done = chickenBurstState(CHICKEN_TOTAL_MS + 1);
    expect(done.phase).toBe("done");
    expect(done.visible).toBe(false);
    expect(done.alpha).toBe(0);
  });

  it("launches before it forms — nothing of the shape shows during the rise", () => {
    cover("firework-timeline");
    for (let t = 0; t < CHICKEN_BREAK_MS; t += 40) {
      const s = chickenBurstState(t);
      expect(s.phase).toBe("launch");
      expect(s.expand).toBe(0);
    }
    expect(chickenBurstState(CHICKEN_BREAK_MS).phase).toBe("expand");
  });

  it("rushes outward and OVERSHOOTS before settling (a shell, not a tween)", () => {
    const mid = chickenBurstState(CHICKEN_BREAK_MS + CHICKEN_TIMELINE.expandMs * 0.55);
    const end = chickenBurstState(CHICKEN_BREAK_MS + CHICKEN_TIMELINE.expandMs - 1);
    expect(mid.expand).toBeGreaterThan(0.5);
    // past equilibrium on the way in, exactly as drag-braked particles do
    expect(Math.max(mid.expand, end.expand)).toBeGreaterThan(1.0);
    // and the burst front decelerates rather than moving linearly
    expect(burstEase(0.5)).toBeGreaterThan(0.8);
    expect(launchEase(0.5)).toBeGreaterThan(0.5);
  });

  it("HOLDS the formation still and fully lit long enough to be read", () => {
    cover("firework-timeline");
    // this is the acceptance criterion in numeric form
    expect(CHICKEN_TIMELINE.holdMs).toBeGreaterThanOrEqual(1000);
    const from = CHICKEN_BREAK_MS + CHICKEN_TIMELINE.expandMs;
    const to = from + CHICKEN_TIMELINE.holdMs;
    for (let t = from; t < to; t += 25) {
      const s = chickenBurstState(t);
      expect(s.phase).toBe("hold");
      expect(s.alpha).toBe(1); // never dimming while it is being read
      expect(s.expand).toBeGreaterThan(0.98); // and never moving much
      expect(s.expand).toBeLessThan(1.02);
      expect(s.droop).toBeLessThan(0.07);
      expect(s.cool).toBeLessThan(0.2); // still golden, not yet ember
    }
  });

  it("droops under gravity, spreads and cools to ember, then goes out", () => {
    cover("firework-timeline");
    const from = CHICKEN_BREAK_MS + CHICKEN_TIMELINE.expandMs + CHICKEN_TIMELINE.holdMs;
    let prevDroop = -1;
    let prevAlpha = 2;
    for (let t = from; t < CHICKEN_TOTAL_MS; t += 25) {
      const s = chickenBurstState(t);
      expect(s.phase).toBe("droop");
      expect(s.droop).toBeGreaterThanOrEqual(prevDroop); // sag only grows
      expect(s.alpha).toBeLessThanOrEqual(prevAlpha); // light only fades
      prevDroop = s.droop;
      prevAlpha = s.alpha;
    }
    const last = chickenBurstState(CHICKEN_TOTAL_MS - 1);
    expect(last.droop).toBeGreaterThan(DROOP_MAX * 0.9);
    expect(last.drift).toBeGreaterThan(1);
    expect(last.drift).toBeLessThanOrEqual(DRIFT_MAX);
    expect(last.cool).toBeGreaterThan(0.9);
    expect(last.alpha).toBeLessThan(0.02); // reaches black, never sticks lit
  });

  it("flashes white across the break to cover the formation snapping in", () => {
    expect(chickenBurstState(CHICKEN_BREAK_MS).flash).toBeCloseTo(1, 2);
    expect(chickenBurstState(CHICKEN_BREAK_MS + 200).flash).toBe(0);
  });

  it("stays under ~4.5 s end to end", () => {
    expect(CHICKEN_TOTAL_MS).toBeLessThan(4500);
    expect(CHICKEN_TOTAL_MS).toBeGreaterThan(3000);
  });
});

describe("tier 1 — the round-win volley", () => {
  it("is SHORT: it plays every round and must not become tiresome", () => {
    cover("firework-small-volley");
    expect(SMALL_VOLLEY_MS).toBeLessThan(1600);
  });

  it("scatters differently every round, but identically for the same round", () => {
    cover("firework-small-volley");
    const a = smallVolley(1);
    const b = smallVolley(1);
    const c = smallVolley(2);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    // by round four the player has seen four different layouts
    const layouts = new Set([1, 2, 3, 4].map((r) => JSON.stringify(smallVolley(r))));
    expect(layouts.size).toBe(4);
  });

  it("keeps every shell in frame and in the upper half, clear of the HUD", () => {
    for (const round of [0, 1, 2, 3, 7, 99]) {
      for (const s of smallVolley(round)) {
        expect(Math.abs(s.u)).toBeLessThan(0.96);
        expect(s.v).toBeGreaterThan(0); // above centre: away from the fighters
        expect(s.v).toBeLessThan(0.95);
        expect(s.scale).toBeGreaterThan(0.5);
        expect(s.scale).toBeLessThan(1.5);
      }
    }
  });

  it("staggers the shells so it reads as a volley, not one big bang", () => {
    const shots = smallVolley(3);
    expect(shots).toHaveLength(SMALL_SHOT_COUNT);
    const delays = shots.map((s) => s.delayMs).sort((x, y) => x - y);
    expect(delays[0]).toBeLessThan(120);
    expect(delays[delays.length - 1]).toBeGreaterThan(300);
    expect(new Set(delays).size).toBe(delays.length);
  });

  it("breaks each shell EXACTLY ONCE across a 60 fps sweep", () => {
    cover("firework-small-volley");
    // a level-triggered test would re-fire the burst every frame and the pool
    // would LRU-steal its own live systems, turning a peony into a smear
    for (const shot of smallVolley(5)) {
      let breaks = 0;
      let launches = 0;
      for (let t = 0; t <= SMALL_VOLLEY_MS + 200; t += 16.7) {
        const st = smallShotState(shot, t - 16.7, t);
        if (st.breaks) breaks++;
        if (st.phase === "launch") launches++;
      }
      expect(breaks).toBe(1);
      // and it actually rises first — no shell pops out of nothing
      expect(launches).toBeGreaterThan(SMALL_LAUNCH_MS / 16.7 - 3);
    }
  });

  it("breaks exactly once for a long frame too (a hitch must not skip it)", () => {
    const shot = smallVolley(9)[0]!;
    let breaks = 0;
    for (let t = 0; t <= SMALL_VOLLEY_MS + 200; t += 250) {
      if (smallShotState(shot, t - 250, t).breaks) breaks++;
    }
    expect(breaks).toBe(1);
  });

  it("uses festival colours, not team colours", () => {
    const tints = [0, 0.2, 0.5, 0.99].map(smallTint);
    expect(new Set(tints.map((t) => t.join(","))).size).toBeGreaterThan(2);
    for (const t of tints) for (const c of t) expect(c).toBeGreaterThanOrEqual(0);
  });
});

describe("framing", () => {
  it("derives frustum extents and frame positions consistently", () => {
    const { halfW, halfH } = frustumHalfExtents(0.8, 1.6, 20);
    expect(halfH).toBeCloseTo(Math.tan(0.4) * 20, 6);
    expect(halfW).toBeCloseTo(halfH * 1.6, 6);
    expect(framePoint(1, 1, 0.8, 1.6, 20)).toEqual({ x: halfW, y: halfH });
    expect(framePoint(0, 0, 0.8, 1.6, 20)).toEqual({ x: 0, y: 0 });
  });

  it("fits the bird inside the frame at every aspect, portrait included", () => {
    cover("firework-framing");
    const W = 1.98;
    const H = 1.34;
    for (const aspect of [0.46, 0.75, 1, 1.6, 1.78, 2.4, 3.2]) {
      const s = fitScale(W, H, 0.8, aspect, 26, 0.86);
      const { halfW, halfH } = frustumHalfExtents(0.8, aspect, 26);
      // a width-only fit runs the drumsticks off the top on a tall screen
      expect(W * s).toBeLessThanOrEqual(halfW * 2 + 1e-9);
      expect(H * s).toBeLessThanOrEqual(halfH * 2 + 1e-9);
      // ...and it still fills the frame: this is the "enormous" requirement
      expect(Math.max((W * s) / (halfW * 2), (H * s) / (halfH * 2))).toBeCloseTo(0.86, 6);
    }
  });
});
