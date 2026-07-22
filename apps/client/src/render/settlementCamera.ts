/**
 * settlementCamera — PURE math for the victory-settlement hero shot (task #25,
 * part B). No Babylon, no state: given the local champion's ground position, its
 * planar facing, and the elapsed time since the freeze, it returns the camera
 * `position` + `target` for a cinematic FRONTAL low-angle shot that slowly
 * orbits and dollies in. CameraRig.setSettlement drives the real camera from
 * this; the math is node-testable in isolation (settlementCamera.test.ts).
 *
 * FRONT-VIEW CONVENTION (render/views/glbFacing)
 * ----------------------------------------------
 * A champion's rendered model faces the world direction of its planar facing
 * `(fx, fz)`: root.rotation.y = atan2(fx, fz) maps the model's local +Z forward
 * onto (fx, fz). So the model's FRONT (its face) points along `facing`. To see
 * that face we place the camera on the SAME side — `pos + facing · dist` — and
 * aim it back at the hero. The camera therefore sits IN FRONT of the model and
 * looks into its face, never behind it.
 *
 * HEROIC LOW ANGLE: the camera height (SETTLE_CAM_HEIGHT) sits BELOW the look
 * target (SETTLE_TARGET_HEIGHT, ~chest/head), so the shot tilts slightly UP at
 * the champion — the classic low-angle "hero" framing. A slow time-based orbit
 * drifts across the front (kept well within ±90° so the face is always visible)
 * while an eased dolly pulls the camera in.
 */
import type { Vec2 } from "@ggd/shared/sim/math/vec2";

export interface CameraPose {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
}

/** Dolly-in ease duration (ms): distance eases from FAR to NEAR over this. */
export const SETTLE_EASE_MS = 2400;
/** Start distance in front of the hero (world units). */
export const SETTLE_DIST_FAR = 6.2;
/** End distance after the dolly-in (world units). */
export const SETTLE_DIST_NEAR = 3.7;
/** Low camera height (world units) — below the look target ⇒ upward hero tilt. */
export const SETTLE_CAM_HEIGHT = 1.15;
/** Look-at height on the champion (~chest/head), above the camera height. */
export const SETTLE_TARGET_HEIGHT = 1.55;
/** Orbit angle at the freeze (rad): begin slightly to one side of dead-front. */
export const SETTLE_ORBIT_START = -0.34;
/** Orbit drift rate (rad/sec): a slow sweep across the front of the model. */
export const SETTLE_ORBIT_RATE = 0.05;

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Cubic ease-out: fast approach that settles gently (0→1). */
function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

/** Unit facing, falling back to +Z when the input is null/degenerate. */
export function normalizeFacing(facing: Vec2 | null | undefined): Vec2 {
  if (!facing) return { x: 0, z: 1 };
  const len = Math.hypot(facing.x, facing.z);
  if (!(len > 1e-6)) return { x: 0, z: 1 };
  return { x: facing.x / len, z: facing.z / len };
}

/**
 * Camera pose for the settlement hero shot at `elapsedMs` after the freeze.
 * `pos` is the champion's ground position (y ignored); `facing` is its planar
 * facing (the direction the model looks). The returned camera sits in front of
 * the model's face, low, orbiting slowly and dollying in.
 */
export function settlementCameraPose(pos: Vec2, facing: Vec2 | null, elapsedMs: number): CameraPose {
  const f = normalizeFacing(facing);
  const t = elapsedMs > 0 ? elapsedMs : 0;

  // dolly: eased pull-in from FAR to NEAR.
  const dist = SETTLE_DIST_FAR + (SETTLE_DIST_NEAR - SETTLE_DIST_FAR) * easeOutCubic(t / SETTLE_EASE_MS);
  // orbit: base angle = the model's front direction, plus a slow time drift.
  const baseAngle = Math.atan2(f.x, f.z);
  const angle = baseAngle + SETTLE_ORBIT_START + (t / 1000) * SETTLE_ORBIT_RATE;
  const dirX = Math.sin(angle);
  const dirZ = Math.cos(angle);

  return {
    position: { x: pos.x + dirX * dist, y: SETTLE_CAM_HEIGHT, z: pos.z + dirZ * dist },
    target: { x: pos.x, y: SETTLE_TARGET_HEIGHT, z: pos.z },
  };
}

/**
 * Signed "in-frontness": the dot of the (hero→camera) horizontal direction with
 * the model's facing. > 0 means the camera is on the face side of the model.
 * Exposed for tests + callers that want to assert the shot stays frontal.
 */
export function frontDot(pose: CameraPose, pos: Vec2, facing: Vec2 | null): number {
  const f = normalizeFacing(facing);
  const dx = pose.position.x - pos.x;
  const dz = pose.position.z - pos.z;
  return dx * f.x + dz * f.z;
}
