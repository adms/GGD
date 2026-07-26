/**
 * TASK #247 (client half) — the fly height REACHES the renderer and interpolates.
 *
 * The failure this guards against is the exact bug #247 exists to fix: a sim
 * that leaps and a client that shows a champion sliding along the floor. So the
 * assertions are about the seam, not about Babylon:
 *   1. `h` survives the interpolation buffer and is smooth between ticks,
 *   2. the teleport classifier became 3-D — a body killed at apex SNAPS down
 *      instead of being smeared through the air — while staying a NO-OP for
 *      every grounded entity that shipped before this task.
 *
 * There used to be a third case here, for the `sc` temporary-scale channel. It
 * has been deleted along with the channel (#247 follow-up): the sim wrote a
 * literal 1 at every site, so the test hand-fed the buffer 1.2/1.9/1.0 samples
 * no server could ever produce and proved nothing about the game. See the note
 * in packages/shared/src/protocol/schema.ts.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { InterpolationBuffer } from "./InterpolationBuffer";
import { TELEPORT_STEP_UNITS } from "../render/math/motion";
import { leapHeightAt, leapTicks } from "@ggd/shared/sim";

/** The shipped 蒼月潮 07-03 arc: apex 11.00 GGD units over 43 ticks. */
const N = leapTicks(1.44);
const APEX_MILLI = 11000;

describe("#247 render seam — fly height reaches the client", () => {
  it("interpolates h between snapshots instead of dropping it", () => {
    cover("leap-render-height");
    const buf = new InterpolationBuffer();
    for (let k = 0; k <= N; k++) {
      buf.push(1, { tick: k, x: k * 0.3, z: 0, fx: 1, fz: 0, h: leapHeightAt(k, N, APEX_MILLI) });
    }
    // exactly on a tick: the authoritative value
    const atApex = buf.sample(1, Math.floor(N / 2))!;
    expect(atApex.h).toBeCloseTo(leapHeightAt(Math.floor(N / 2), N, APEX_MILLI), 6);
    // BETWEEN ticks: a real in-between value, not a hold and not 0
    const mid = buf.sample(1, 5.5)!;
    expect(mid.h).toBeGreaterThan(leapHeightAt(5, N, APEX_MILLI));
    expect(mid.h).toBeLessThan(leapHeightAt(6, N, APEX_MILLI));
    // and the whole arc really did leave the ground
    let peak = 0;
    for (let f = 0; f <= N; f += 0.25) peak = Math.max(peak, buf.sample(1, f)!.h);
    expect(peak).toBeGreaterThan(10.9);
    // both ends are on the floor
    expect(buf.sample(1, 0)!.h).toBe(0);
    expect(buf.sample(1, N)!.h).toBe(0);
  });

  it("no REAL leap step is misclassified as a teleport", () => {
    // The largest legitimate per-tick height step is at takeoff: 4·A·(N-1)/N².
    // 43-tick / 11.00 u arc → 1.00 u; 25-tick / 18.33 u vertical → 2.82 u.
    for (const [ticks, apexMilli] of [
      [43, 11000],
      [25, 18330],
      [13, 5500],
    ] as const) {
      const step = leapHeightAt(1, ticks, apexMilli);
      expect(step, `${ticks}-tick arc takeoff step`).toBeLessThan(TELEPORT_STEP_UNITS);
    }
    // …so the buffer glides the arc rather than snapping through it.
    const buf = new InterpolationBuffer();
    for (let k = 0; k <= 4; k++) {
      buf.push(1, { tick: k, x: 0, z: 0, fx: 1, fz: 0, h: leapHeightAt(k, N, APEX_MILLI) });
    }
    const a = buf.sample(1, 2)!.h;
    const b = buf.sample(1, 2.5)!.h;
    const c = buf.sample(1, 3)!.h;
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThan(c); // strictly between = interpolated, not held
  });

  it("a champion KILLED AT APEX snaps to the floor rather than being smeared down", () => {
    const buf = new InterpolationBuffer();
    buf.push(1, { tick: 0, x: 0, z: 0, fx: 1, fz: 0, h: 10.5 });
    buf.push(1, { tick: 1, x: 0, z: 0, fx: 1, fz: 0, h: 11 });
    buf.push(1, { tick: 2, x: 0, z: 0, fx: 1, fz: 0, h: 0 }); // death: 11 u in one tick
    // mid-bracket HOLDS at the pre-drop sample (the blink treatment) …
    expect(buf.sample(1, 1.5)!.h).toBe(11);
    // … and the drop happens at the tick boundary.
    expect(buf.sample(1, 2)!.h).toBe(0);
  });

  it("the 3-D classifier is a BEHAVIOURAL NO-OP for grounded entities", () => {
    // Every pre-#247 sample carries no `h`, so dh === 0 and the budget is the
    // same planar one. A walking body must still interpolate, not snap.
    const buf = new InterpolationBuffer();
    for (let k = 0; k <= 4; k++) buf.push(1, { tick: k, x: k * 0.2, z: 0, fx: 1, fz: 0 });
    const mid = buf.sample(1, 2.5)!;
    expect(mid.x).toBeGreaterThan(0.4);
    expect(mid.x).toBeLessThan(0.6);
    expect(mid.h).toBe(0);
  });
});
