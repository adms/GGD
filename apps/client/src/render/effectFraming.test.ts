/**
 * effectFraming — the camera model itself.
 *
 * These are not gates on any feature; they are the assertions that the RULER is
 * right, because every gate built on it inherits its errors. The numbers below
 * come from the shipped constants (`CAMERA_PITCH_RAD`, `DOLLY_MIN`,
 * `FLOOR_TOP_Y`) and are re-derived here rather than copied, so a rig change
 * that moves them fails LOUDLY here first — which is precisely what did NOT
 * happen when #161 raised the pitch 55° → 68° and silently invalidated every
 * framing decision #93 had made.
 */
import { describe, it, expect } from "vitest";
import { CAMERA_PITCH_RAD, DOLLY_MIN } from "./CameraRig";
import {
  ARENA_FLOOR_RADIUS,
  combatCameraPose,
  frameOccupancy,
  checkVisibility,
  groundTargetOf,
  poseLookingAt,
  settlementFramingPose,
  verticalHeadroom,
  sampleVerticalSegment,
  visibleGroundSamples,
} from "./effectFraming";

const ASPECT = 16 / 9;

describe("combat camera pose", () => {
  it("matches the shipped rig: eye 9.27 u up, 3.75 u back, view axis DIVING at the pitch", () => {
    const pose = combatCameraPose({ x: 0, z: 0 });
    expect(pose.eye.y).toBeCloseTo(DOLLY_MIN * Math.sin(CAMERA_PITCH_RAD), 6);
    expect(pose.eye.z).toBeCloseTo(-DOLLY_MIN * Math.cos(CAMERA_PITCH_RAD), 6);
    // THE fact behind #235: forward points DOWN, hard. Anything placed a long
    // way along it is underground.
    expect(pose.fwd.y).toBeCloseTo(-Math.sin(CAMERA_PITCH_RAD), 6);
    expect(pose.fwd.y).toBeLessThan(-0.9);
    expect(groundTargetOf(pose).x).toBeCloseTo(0, 6);
    expect(groundTargetOf(pose).z).toBeCloseTo(0, 6);
  });

  it("has an orthonormal basis with no roll", () => {
    const pose = combatCameraPose({ x: 3, z: -4 }, { yawRad: 0.7 });
    const dot = (a: typeof pose.fwd, b: typeof pose.fwd): number => a.x * b.x + a.y * b.y + a.z * b.z;
    expect(dot(pose.fwd, pose.right)).toBeCloseTo(0, 6);
    expect(dot(pose.fwd, pose.up)).toBeCloseTo(0, 6);
    expect(dot(pose.right, pose.up)).toBeCloseTo(0, 6);
    expect(pose.right.y).toBeCloseTo(0, 6); // no roll ⇒ screen-right is horizontal
  });
});

describe("occlusion — the axis #93 never tested", () => {
  const pose = combatCameraPose({ x: 0, z: 0 });

  it("calls a point under the arena floor OCCLUDED even when it is dead centre of frame", () => {
    // straight down the view axis, 22 u out: exactly where the round-win volley
    // used to live.
    const p = {
      x: pose.eye.x + pose.fwd.x * 22,
      y: pose.eye.y + pose.fwd.y * 22,
      z: pose.eye.z + pose.fwd.z * 22,
    };
    const f = frameOccupancy(p, pose, { aspect: ASPECT });
    expect(p.y).toBeLessThan(-9); // ~11 u below the floor
    expect(f.onFrame).toBe(true); // …and perfectly framed
    expect(f.occluded).toBe(true); // …and invisible
    expect(f.visible).toBe(false);
  });

  it("does not claim occlusion outside the floor disc", () => {
    const far = { x: ARENA_FLOOR_RADIUS + 5, y: -3, z: 0 };
    expect(frameOccupancy(far, pose, { aspect: ASPECT }).occluded).toBe(false);
  });

  it("reports NOTHING DRAWN for an empty sample set instead of passing vacuously", () => {
    const r = checkVisibility([], pose);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/drew NOTHING/);
  });
});

describe("the vertical budget", () => {
  const pose = combatCameraPose({ x: 0, z: 0 });

  it("is ~5.2 u above the followed champion and SHRINKS toward the top of frame", () => {
    const centre = verticalHeadroom(pose, { x: 0, z: 0 }, { aspect: ASPECT });
    expect(centre).toBeGreaterThan(5);
    expect(centre).toBeLessThan(5.4);
    // up-screen (+z) costs headroom, down-screen buys it
    expect(verticalHeadroom(pose, { x: 0, z: 3 }, { aspect: ASPECT })).toBeLessThan(centre);
    expect(verticalHeadroom(pose, { x: 0, z: -3 }, { aspect: ASPECT })).toBeGreaterThan(centre);
  });

  it("is 0 where the ground itself is off-frame (no beam can help there)", () => {
    expect(verticalHeadroom(pose, { x: 0, z: 12 }, { aspect: ASPECT })).toBe(0);
  });

  it("grows with the dolly — zooming out really does buy vertical room", () => {
    const near = verticalHeadroom(combatCameraPose({ x: 0, z: 0 }, { dolly: 10 }), { x: 0, z: 0 }, { aspect: ASPECT });
    const far = verticalHeadroom(combatCameraPose({ x: 0, z: 0 }, { dolly: 24 }), { x: 0, z: 0 }, { aspect: ASPECT });
    expect(far).toBeGreaterThan(near * 2);
  });

  it("bounds a vertical segment: everything up to the headroom is framed, past it is not", () => {
    const h = verticalHeadroom(pose, { x: 0, z: 0 }, { aspect: ASPECT });
    const inside = checkVisibility(sampleVerticalSegment({ x: 0, z: 0 }, 0, h * 0.98), pose, { aspect: ASPECT });
    expect(inside.ok).toBe(true);
    const outside = checkVisibility(sampleVerticalSegment({ x: 0, z: 0 }, 0, h * 1.6), pose, { aspect: ASPECT });
    expect(outside.ok).toBe(false);
    expect(outside.reason).toMatch(/OFF-FRAME/);
  });
});

describe("the visible ground patch", () => {
  it("is small at the default dolly — barely 8 u deep", () => {
    const pose = combatCameraPose({ x: 0, z: 0 });
    const g = visibleGroundSamples(pose, { aspect: ASPECT, steps: 41 });
    expect(g.length).toBeGreaterThan(0);
    const zs = g.map((s) => s.z);
    const depth = Math.max(...zs) - Math.min(...zs);
    expect(depth).toBeGreaterThan(5);
    expect(depth).toBeLessThan(11);
  });
});

describe("settlement camera", () => {
  it("looks slightly UP, which is why the same camera-space placement behaves oppositely", () => {
    const pose = settlementFramingPose({ x: 0, z: 0 }, { x: 0, z: 1 }, 0);
    expect(pose.eye.y).toBeCloseTo(1.15, 6);
    expect(pose.fwd.y).toBeGreaterThan(0);
  });

  it("frames the roast chicken's own anchor above the floor, unoccluded", () => {
    const pose = settlementFramingPose({ x: 0, z: 0 }, { x: 0, z: 1 }, 0);
    const D = 26; // CHICKEN_DISTANCE
    const p = {
      x: pose.eye.x + pose.fwd.x * D,
      y: pose.eye.y + pose.fwd.y * D,
      z: pose.eye.z + pose.fwd.z * D,
    };
    const f = frameOccupancy(p, pose, { aspect: ASPECT });
    expect(p.y).toBeGreaterThan(0);
    expect(f.visible).toBe(true);
  });
});

describe("poseLookingAt", () => {
  it("builds the same basis the rig would for an arbitrary eye/target", () => {
    const pose = poseLookingAt({ x: 0, y: 5, z: -5 }, { x: 0, y: 0, z: 0 });
    expect(pose.fwd.y).toBeLessThan(0);
    expect(Math.hypot(pose.fwd.x, pose.fwd.y, pose.fwd.z)).toBeCloseTo(1, 6);
  });
});
