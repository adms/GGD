/**
 * Picking — PURE math. The cursor is mapped onto the sim's ground plane
 * (y = 0) by ray/plane intersection — never by mesh picking — so the visual
 * click target and the server's planar world always agree. The Babylon side
 * (render/CameraRig) builds the ray; this module does the math, keeping
 * @babylonjs out of input/*.
 */
import type { Vec2 } from "@ggd/shared/sim/math/vec2";

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface Ray3 {
  origin: Vec3Like;
  dir: Vec3Like;
}

/** Intersect a ray with the mathematical ground plane y=0 → planar (x,z). */
export function intersectRayGround(ray: Ray3): Vec2 | null {
  if (Math.abs(ray.dir.y) < 1e-9) return null; // parallel to the plane
  const t = -ray.origin.y / ray.dir.y;
  if (t < 0) return null; // plane is behind the ray
  return { x: ray.origin.x + ray.dir.x * t, z: ray.origin.z + ray.dir.z * t };
}

export interface PickableUnit {
  id: number;
  x: number;
  z: number;
  radius: number;
}

/**
 * pickUnit — nearest unit whose collision circle (+slack for clickability)
 * contains the ground point. Matches the server's circle model, so what you
 * click is what the sim targets.
 */
/**
 * pickNearestUnit — nearest unit within maxRange of a point (gamepad target
 * acquisition). When aimDir is given, units along the aim direction win over
 * strictly-closer units behind the player (console-MOBA feel).
 */
export function pickNearestUnit(
  from: Vec2,
  units: Iterable<PickableUnit>,
  maxRange: number,
  aimDir?: Vec2 | null,
): number | null {
  let best: number | null = null;
  let bestScore = Infinity;
  for (const u of units) {
    const dx = u.x - from.x;
    const dz = u.z - from.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    const d = len - u.radius;
    if (d > maxRange) continue;
    let score = d;
    if (aimDir && len > 1e-9) {
      const align = (dx * aimDir.x + dz * aimDir.z) / len; // -1..1
      score = d - align * 2.5;
    }
    if (score < bestScore) {
      bestScore = score;
      best = u.id;
    }
  }
  return best;
}

export function pickUnit(point: Vec2, units: Iterable<PickableUnit>, slack = 0.45): number | null {
  let best: number | null = null;
  let bestScore = Infinity;
  for (const u of units) {
    const dx = u.x - point.x;
    const dz = u.z - point.z;
    const score = Math.sqrt(dx * dx + dz * dz) - u.radius - slack;
    if (score <= 0 && score < bestScore) {
      bestScore = score;
      best = u.id;
    }
  }
  return best;
}
