/**
 * client-roster: pure render-motion math.
 *  - yaw smoothing (client-yaw-smooth): nlerp of a facing vector converges to
 *    the target, takes a bounded step (never snaps), and stays unit-length;
 *  - interpolation easing (client-interp-ease): the Catmull-Rom sampler is
 *    C1-smooth yet reproduces linear results for constant-velocity data.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  catmullRom1D,
  facingToYaw,
  nlerpFacing,
  smoothFacing,
  smoothingAlpha,
  type Facing2,
} from "./motion";

const mag = (f: Facing2): number => Math.hypot(f.x, f.z);
const angleTo = (f: Facing2, t: Facing2): number => {
  const d = (f.x * t.x + f.z * t.z) / (mag(f) * mag(t));
  return Math.acos(Math.min(1, Math.max(-1, d)));
};

describe("yaw smoothing (client-yaw-smooth)", () => {
  it("facingToYaw matches the atan2(fx,fz) convention", () => {
    cover("client-yaw-smooth");
    expect(facingToYaw(0, 1)).toBeCloseTo(0, 9); // +Z → 0
    expect(facingToYaw(1, 0)).toBeCloseTo(Math.PI / 2, 9); // +X → 90°
    expect(facingToYaw(0, -1)).toBeCloseTo(Math.PI, 9);
  });

  it("smoothingAlpha is frame-rate independent and bounded to [0,1]", () => {
    cover("client-yaw-smooth");
    expect(smoothingAlpha(0, 16)).toBe(0);
    expect(smoothingAlpha(14, 0)).toBe(0);
    const a = smoothingAlpha(14, 16);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
    // a larger timestep advances further toward the target
    expect(smoothingAlpha(14, 32)).toBeGreaterThan(a);
    expect(smoothingAlpha(14, 100000)).toBeCloseTo(1, 6);
  });

  it("takes a bounded step toward the target — never snaps", () => {
    cover("client-yaw-smooth");
    const cur: Facing2 = { x: 0, z: 1 }; // facing +Z (yaw 0)
    const target: Facing2 = { x: 1, z: 0 }; // facing +X (yaw 90°)
    const next = smoothFacing(cur, target, 16, 14);
    const yaw = facingToYaw(next.x, next.z);
    expect(yaw).toBeGreaterThan(0); // it moved
    expect(yaw).toBeLessThan(Math.PI / 2 - 0.2); // but nowhere near a snap to 90°
    expect(mag(next)).toBeCloseTo(1, 9); // always unit length
    // the step never overshoots the remaining arc
    expect(angleTo(cur, next)).toBeLessThanOrEqual(angleTo(cur, target) + 1e-9);
  });

  it("converges monotonically to the target over many frames", () => {
    cover("client-yaw-smooth");
    let cur: Facing2 = { x: 0, z: 1 };
    const target: Facing2 = { x: 1, z: 0 };
    let prevErr = angleTo(cur, target);
    for (let i = 0; i < 120; i++) {
      cur = smoothFacing(cur, target, 16, 14);
      const err = angleTo(cur, target);
      expect(err).toBeLessThanOrEqual(prevErr + 1e-9); // never turns away
      prevErr = err;
    }
    expect(prevErr).toBeLessThan(1e-3); // effectively aligned
  });

  it("alpha extremes and degenerate inputs behave", () => {
    cover("client-yaw-smooth");
    // alpha 0 keeps cur, alpha 1 adopts target
    expect(nlerpFacing({ x: 0, z: 1 }, { x: 1, z: 0 }, 0)).toEqual({ x: 0, z: 1 });
    expect(nlerpFacing({ x: 0, z: 1 }, { x: 3, z: 0 }, 1)).toEqual({ x: 1, z: 0 });
    // zero-length target → keep cur; zero-length cur → adopt target
    expect(nlerpFacing({ x: 0, z: 1 }, { x: 0, z: 0 }, 0.5)).toEqual({ x: 0, z: 1 });
    expect(nlerpFacing({ x: 0, z: 0 }, { x: 5, z: 0 }, 0.5)).toEqual({ x: 1, z: 0 });
  });
});

describe("interpolation easing (client-interp-ease)", () => {
  it("passes through the segment endpoints exactly", () => {
    cover("client-interp-ease");
    expect(catmullRom1D(5, 10, 20, 25, 0)).toBeCloseTo(10, 9);
    expect(catmullRom1D(5, 10, 20, 25, 1)).toBeCloseTo(20, 9);
  });

  it("reproduces the exact linear result for constant-velocity data", () => {
    cover("client-interp-ease");
    // equally-spaced collinear samples → the spline is the straight line
    expect(catmullRom1D(10, 12, 14, 16, 0.5)).toBeCloseTo(13, 9);
    // one-sided endpoint tangents keep straight lines straight (buffer edges)
    expect(catmullRom1D(10, 10, 12, 14, 0.5, false, true)).toBeCloseTo(11, 9);
    expect(catmullRom1D(10, 12, 14, 14, 0.75, true, false)).toBeCloseTo(13.5, 9);
  });

  it("eases (differs from linear) when the neighbouring velocity changes", () => {
    cover("client-interp-ease");
    // p2→p3 accelerates (1→3): the curve bends below the 0→1 chord early on
    const eased = catmullRom1D(0, 0, 1, 3, 0.5);
    const linear = 0.5;
    expect(eased).not.toBeCloseTo(linear, 3);
    expect(eased).toBeLessThan(linear);
    // still stays within a sane neighbourhood of the bracket
    expect(eased).toBeGreaterThan(-0.5);
    expect(eased).toBeLessThan(1.5);
  });
});
