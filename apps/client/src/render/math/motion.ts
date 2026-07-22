/**
 * Pure motion/orientation math for the render layer — NO Babylon, NO React.
 * Kept dependency-free so it is unit-testable in the node vitest environment.
 *
 * The sim carries facing as a unit direction vector (fx, fz); the 3D model's
 * Y-rotation is `atan2(fx, fz)`. Turning a model by writing that angle every
 * frame SNAPS (the character instantly faces the authoritative direction). To
 * turn visually we nlerp the *facing vector* toward the target each frame with
 * a frame-rate-independent exponential factor, then convert to a yaw angle.
 */

export interface Facing2 {
  x: number;
  z: number;
}

const EPS = 1e-9;

/**
 * Planar distance (world units) above which a position change is a TELEPORT
 * rather than locomotion — respawn, round reset, zone change, blink.
 *
 * Budget: MoveSpeed is clamped to 14 u/s (≈0.47 u per 30 Hz tick) and the
 * fastest dash override in content runs at 30 u/s (≈1.0 u/tick). A render
 * frame is at most 100 ms (GameApp clamps dtMs), i.e. 3 ticks ≈ 3.0 u for a
 * dash, so 4 u still clears every legitimate motion — while a respawn or zone
 * change moves tens of units (arena zone centres are ~56 u apart).
 *
 * Used as a PER-TICK budget by the snapshot interpolation buffer and as a
 * per-frame budget by the animation-rate derivations, which must not read a
 * relocation as a burst of sprinting.
 */
export const TELEPORT_STEP_UNITS = 4;

/** Facing vector → Y-rotation (matches ChampionView's atan2(fx, fz) convention). */
export function facingToYaw(fx: number, fz: number): number {
  return Math.atan2(fx, fz);
}

/**
 * Frame-rate-independent smoothing weight for an exponential approach at
 * `ratePerSec` (larger = snappier). Returns a value in [0, 1]: `1 - e^(-rate·dt)`.
 * dt is in milliseconds. rate<=0 → 0 (no movement); very large dt → ~1.
 */
export function smoothingAlpha(ratePerSec: number, dtMs: number): number {
  if (ratePerSec <= 0 || dtMs <= 0) return 0;
  const a = 1 - Math.exp(-ratePerSec * (dtMs / 1000));
  return a < 0 ? 0 : a > 1 ? 1 : a;
}

/**
 * Rotate the unit facing `cur` a bounded fraction `alpha` (0..1) toward
 * `target`, via nlerp (linear blend of the two unit vectors, then renormalize).
 * Always returns a UNIT vector and never over-rotates past the target:
 *   - alpha<=0            → `cur` (normalized): no snap.
 *   - alpha>=1            → `target` (normalized).
 *   - zero-length target  → keep `cur` (nothing to aim at).
 *   - zero-length cur     → adopt `target` (no prior orientation to preserve).
 *   - exactly-opposite    → step to `target` (the degenerate 180° midpoint).
 */
export function nlerpFacing(cur: Facing2, target: Facing2, alpha: number): Facing2 {
  const tl2 = target.x * target.x + target.z * target.z;
  const cl2 = cur.x * cur.x + cur.z * cur.z;

  if (tl2 < EPS) return cl2 < EPS ? { x: 0, z: 1 } : normalize2(cur, cl2);
  const t = normalize2(target, tl2);
  if (cl2 < EPS) return t;
  const c = normalize2(cur, cl2);

  const a = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha;
  if (a === 0) return c;
  if (a === 1) return t;

  const nx = c.x + (t.x - c.x) * a;
  const nz = c.z + (t.z - c.z) * a;
  const nl2 = nx * nx + nz * nz;
  if (nl2 < EPS) return t; // cur and target were ~antiparallel → resolve toward target
  const nl = Math.sqrt(nl2);
  return { x: nx / nl, z: nz / nl };
}

/** Convenience: nlerp `cur` toward `target` for one `dtMs` frame at `ratePerSec`. */
export function smoothFacing(
  cur: Facing2,
  target: Facing2,
  dtMs: number,
  ratePerSec: number,
): Facing2 {
  return nlerpFacing(cur, target, smoothingAlpha(ratePerSec, dtMs));
}

function normalize2(v: Facing2, l2: number): Facing2 {
  const l = Math.sqrt(l2);
  return { x: v.x / l, z: v.z / l };
}

/**
 * 1-D Catmull-Rom spline value at `t` (0..1) on the segment p1→p2, using the
 * neighbouring samples p0 and p3 to shape the tangents (C1-continuous motion,
 * removing the velocity kinks of plain linear interpolation).
 *
 * `hasP0`/`hasP3` say whether real neighbours exist; at a buffer edge the
 * tangent falls back to the one-sided difference. This makes constant-velocity
 * (equally-spaced, collinear) data reproduce the exact linear result, so the
 * spline is a strict smoothing upgrade over lerp for straight motion.
 */
export function catmullRom1D(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
  hasP0 = true,
  hasP3 = true,
): number {
  // Hermite tangents (uniform parameterization). One-sided at the edges.
  const m1 = hasP0 ? (p2 - p0) / 2 : p2 - p1;
  const m2 = hasP3 ? (p3 - p1) / 2 : p2 - p1;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * p1 + h10 * m1 + h01 * p2 + h11 * m2;
}
