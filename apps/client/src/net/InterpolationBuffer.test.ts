/**
 * client-03 (client-interp): remote entities interpolate INTERP_DELAY_MS behind
 * the newest authoritative tick, lerping between bracketing snapshot samples.
 * The delay is imported, never written as a literal, so this suite keeps
 * passing (and keeps MEANING the same thing) when the latency budget moves.
 * roster-10 (client-teleport-snap): a discontinuous sample (respawn / round
 * reset / blink) is SNAPPED across, not glided across — and it must not poison
 * the Catmull-Rom tangents of the neighbouring brackets either.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { TICK_MS, INTERP_DELAY_MS } from "@ggd/shared/constants";
import { InterpolationBuffer } from "./InterpolationBuffer";
import { TimeSync } from "./TimeSync";

describe("InterpolationBuffer + TimeSync (client-03)", () => {
  it("renders ~INTERP_DELAY_MS behind the estimated server tick", () => {
    cover("client-interp");
    const ts = new TimeSync();
    ts.noteServerTick(100, 5000);
    expect(ts.ready).toBe(true);
    expect(ts.estimateServerTick(5000)).toBeCloseTo(100, 6);
    // the render clock trails by exactly the interp delay
    const delayTicks = INTERP_DELAY_MS / TICK_MS;
    expect(ts.estimateServerTick(5000) - ts.renderTick(5000)).toBeCloseTo(delayTicks, 6);
    // and advances in real time between patches
    expect(ts.renderTick(5000 + TICK_MS * 2) - ts.renderTick(5000)).toBeCloseTo(2, 6);
  });

  it("lerps between the two bracketing samples", () => {
    cover("client-interp");
    const buf = new InterpolationBuffer();
    // entity moving +1 x per tick, sampled every other tick — deliberately a
    // SPARSER cadence than the live 30/30 one, so the bracket maths is still
    // exercised for gaps > 1 tick (a dropped patch produces exactly that)
    buf.push(7, { tick: 10, x: 10, z: 0, fx: 1, fz: 0 });
    buf.push(7, { tick: 12, x: 12, z: 2, fx: 0, fz: 1 });
    buf.push(7, { tick: 14, x: 14, z: 4, fx: 0, fz: 1 });

    const mid = buf.sample(7, 11)!;
    expect(mid.x).toBeCloseTo(11, 9);
    expect(mid.z).toBeCloseTo(1, 9);

    const threeQ = buf.sample(7, 13.5)!;
    expect(threeQ.x).toBeCloseTo(13.5, 9);
    expect(threeQ.z).toBeCloseTo(3.5, 9);
  });

  it("clamps at the buffer edges (no extrapolation) and handles unknowns", () => {
    cover("client-interp");
    const buf = new InterpolationBuffer();
    buf.push(1, { tick: 5, x: 5, z: 0, fx: 1, fz: 0 });
    buf.push(1, { tick: 7, x: 7, z: 0, fx: 1, fz: 0 });
    expect(buf.sample(1, 2)!.x).toBe(5); // before oldest → oldest
    expect(buf.sample(1, 99)!.x).toBe(7); // after newest → newest (no extrapolation)
    expect(buf.sample(42, 6)).toBeNull(); // unknown entity
  });

  it("ignores stale out-of-order samples and prunes removed entities", () => {
    cover("client-interp");
    const buf = new InterpolationBuffer();
    buf.push(1, { tick: 10, x: 10, z: 0, fx: 1, fz: 0 });
    buf.push(1, { tick: 8, x: 999, z: 0, fx: 1, fz: 0 }); // stale — dropped
    expect(buf.sample(1, 9)!.x).toBe(10);

    buf.push(2, { tick: 10, x: 1, z: 1, fx: 1, fz: 0 });
    buf.prune(new Set([1]));
    expect(buf.sample(2, 10)).toBeNull();
    expect(buf.has(1)).toBe(true);
  });

  it("SNAPS across a teleport instead of gliding through the arena", () => {
    cover("client-teleport-snap");
    const buf = new InterpolationBuffer();
    buf.push(3, { tick: 10, x: -56, z: 0, fx: 1, fz: 0 });
    buf.push(3, { tick: 12, x: -55.6, z: 0, fx: 1, fz: 0 }); // normal walking
    buf.push(3, { tick: 14, x: 24, z: 4, fx: -1, fz: 0 }); // respawn in zone 1

    // anywhere inside the teleport bracket we still render the OLD position…
    for (const t of [12, 12.5, 13, 13.99]) {
      const p = buf.sample(3, t)!;
      expect(p.x).toBe(-55.6);
      expect(p.z).toBe(0);
    }
    // …and the jump happens at the tick boundary, in one step
    expect(buf.sample(3, 14)!.x).toBe(24);
  });

  it("a teleport neighbour does not poison an ordinary bracket's tangent", () => {
    cover("client-teleport-snap");
    const walk = new InterpolationBuffer();
    const jump = new InterpolationBuffer();
    // identical constant-velocity history; `jump` additionally teleports after
    for (const [id, buf] of [
      [1, walk],
      [1, jump],
    ] as const) {
      buf.push(id, { tick: 10, x: 10, z: 0, fx: 1, fz: 0 });
      buf.push(id, { tick: 11, x: 11, z: 0, fx: 1, fz: 0 });
      buf.push(id, { tick: 12, x: 12, z: 0, fx: 1, fz: 0 });
    }
    walk.push(1, { tick: 13, x: 13, z: 0, fx: 1, fz: 0 });
    jump.push(1, { tick: 13, x: 900, z: 0, fx: 1, fz: 0 }); // teleport at 13

    // the 11→12 bracket is ordinary in BOTH buffers and must render identically:
    // the teleport sitting in the p3 slot must be dropped from the tangent.
    expect(jump.sample(1, 11.5)!.x).toBeCloseTo(walk.sample(1, 11.5)!.x, 12);
    expect(jump.sample(1, 11.5)!.x).toBeCloseTo(11.5, 12);
  });

  it("post-teleport motion resumes cleanly (no drag back toward the old spot)", () => {
    cover("client-teleport-snap");
    const buf = new InterpolationBuffer();
    buf.push(5, { tick: 10, x: -56, z: 0, fx: 1, fz: 0 });
    buf.push(5, { tick: 11, x: 24, z: 0, fx: 1, fz: 0 }); // teleport
    buf.push(5, { tick: 12, x: 24.4, z: 0, fx: 1, fz: 0 }); // walking again
    buf.push(5, { tick: 13, x: 24.8, z: 0, fx: 1, fz: 0 });
    // 11→12 is normal movement; its p0 is the pre-teleport sample and must be
    // ignored, otherwise the tangent yanks the entity back across the map.
    const p = buf.sample(5, 11.5)!;
    expect(p.x).toBeCloseTo(24.2, 6);
  });

  it("keeps interpolating the fastest legitimate motion (dash ≈ 1 u/tick)", () => {
    cover("client-teleport-snap");
    const buf = new InterpolationBuffer();
    // a 30 u/s dash sampled every other tick → 2 u per bracket: NOT a teleport
    buf.push(6, { tick: 10, x: 0, z: 0, fx: 1, fz: 0 });
    buf.push(6, { tick: 12, x: 2, z: 0, fx: 1, fz: 0 });
    buf.push(6, { tick: 14, x: 4, z: 0, fx: 1, fz: 0 });
    expect(buf.sample(6, 13)!.x).toBeCloseTo(3, 9);
  });

  it("end-to-end: sampling at the render tick trails the entity by INTERP_DELAY_MS", () => {
    cover("client-interp");
    const ts = new TimeSync();
    const buf = new InterpolationBuffer();
    // server ticks arrive in real time: tick k at time k*TICK_MS, entity x = tick
    for (let k = 30; k <= 60; k += 2) {
      ts.noteServerTick(k, k * TICK_MS);
      buf.push(9, { tick: k, x: k, z: 0, fx: 1, fz: 0 });
    }
    const nowMs = 60 * TICK_MS;
    const pose = buf.sample(9, ts.renderTick(nowMs))!;
    // entity is at x=60 "now"; rendered INTERP_DELAY_MS behind → x ≈ 60 - delayTicks
    expect(pose.x).toBeCloseTo(60 - INTERP_DELAY_MS / TICK_MS, 1);
  });
});
