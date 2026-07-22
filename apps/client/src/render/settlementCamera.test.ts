/**
 * settle-cam-front / settle-cam-dolly: the pure victory-settlement hero-shot
 * math. The camera must sit IN FRONT of the model (on its facing side per the
 * glbFacing convention), at a heroic LOW angle (camera below the look target),
 * and DOLLY IN over time — all without any Babylon.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import type { Vec2 } from "@ggd/shared/sim/math/vec2";
import {
  settlementCameraPose,
  frontDot,
  normalizeFacing,
  SETTLE_TARGET_HEIGHT,
  SETTLE_CAM_HEIGHT,
} from "./settlementCamera";

describe("settlement camera front-view (settle-cam-front)", () => {
  it("places the camera in front of the model's face for any facing", () => {
    cover("settle-cam-front");
    const pos: Vec2 = { x: 5, z: -3 };
    // sweep facings around the circle; the camera must stay on the facing side
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      const facing: Vec2 = { x: Math.sin(a), z: Math.cos(a) };
      for (const t of [0, 1500, 5000, 12000, 20000]) {
        const pose = settlementCameraPose(pos, facing, t);
        // "in front" = the hero→camera vector points along the model's facing
        expect(frontDot(pose, pos, facing)).toBeGreaterThan(0);
      }
    }
  });

  it("looks back AT the hero (target is the champion position)", () => {
    cover("settle-cam-front");
    const pos: Vec2 = { x: 2, z: 8 };
    const pose = settlementCameraPose(pos, { x: 0, z: 1 }, 1000);
    expect(pose.target.x).toBeCloseTo(pos.x, 6);
    expect(pose.target.z).toBeCloseTo(pos.z, 6);
    expect(pose.target.y).toBeCloseTo(SETTLE_TARGET_HEIGHT, 6);
  });

  it("is a heroic LOW angle — camera height sits below the look target", () => {
    cover("settle-cam-front");
    const pose = settlementCameraPose({ x: 0, z: 0 }, { x: 0, z: 1 }, 800);
    expect(pose.position.y).toBeCloseTo(SETTLE_CAM_HEIGHT, 6);
    expect(pose.position.y).toBeLessThan(pose.target.y); // tilts up at the hero
  });

  it("frames dead-front facing on the +Z side (facing +Z ⇒ camera z > hero z)", () => {
    cover("settle-cam-front");
    const pose = settlementCameraPose({ x: 0, z: 0 }, { x: 0, z: 1 }, 0);
    expect(pose.position.z).toBeGreaterThan(0);
  });

  it("normalizes a degenerate facing to +Z", () => {
    cover("settle-cam-front");
    expect(normalizeFacing(null)).toEqual({ x: 0, z: 1 });
    expect(normalizeFacing({ x: 0, z: 0 })).toEqual({ x: 0, z: 1 });
    const n = normalizeFacing({ x: 3, z: 4 });
    expect(Math.hypot(n.x, n.z)).toBeCloseTo(1, 6);
  });
});

describe("settlement camera dolly-in (settle-cam-dolly)", () => {
  it("pulls the camera closer to the hero over time", () => {
    cover("settle-cam-dolly");
    const pos: Vec2 = { x: 0, z: 0 };
    const facing: Vec2 = { x: 0, z: 1 };
    const distAt = (t: number): number => {
      const p = settlementCameraPose(pos, facing, t);
      return Math.hypot(p.position.x - pos.x, p.position.z - pos.z);
    };
    const d0 = distAt(0);
    const dMid = distAt(1200);
    const dEnd = distAt(3000);
    expect(d0).toBeGreaterThan(dMid); // dollying in
    expect(dMid).toBeGreaterThan(dEnd - 0.5); // still no farther than the start
    expect(dEnd).toBeLessThan(d0);
  });
});
