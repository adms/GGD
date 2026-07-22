/**
 * Planar 2D vector on the ground plane. The sim is strictly planar: `x` and `z`
 * are the ground-plane axes (matching the 3D world's floor); there is NO `y`.
 *
 * DETERMINISM: no trigonometry (`Math.sin/cos/atan2`) is used here — only
 * add/sub/scale/dot and `Math.sqrt`, which are IEEE-deterministic. Facing is
 * carried as a unit direction vector, never as an angle.
 */
export interface Vec2 {
  x: number;
  z: number;
}

export const v2 = (x = 0, z = 0): Vec2 => ({ x, z });
export const clone = (a: Vec2): Vec2 => ({ x: a.x, z: a.z });
export const set = (out: Vec2, x: number, z: number): Vec2 => {
  out.x = x;
  out.z = z;
  return out;
};
export const copy = (out: Vec2, a: Vec2): Vec2 => set(out, a.x, a.z);

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, z: a.z + b.z });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, z: a.z * s });
export const addScaled = (a: Vec2, b: Vec2, s: number): Vec2 => ({
  x: a.x + b.x * s,
  z: a.z + b.z * s,
});

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.z * b.z;
/** 2D cross product (scalar) — sign gives orientation. */
export const cross = (a: Vec2, b: Vec2): number => a.x * b.z - a.z * b.x;

export const lenSq = (a: Vec2): number => a.x * a.x + a.z * a.z;
export const len = (a: Vec2): number => Math.sqrt(lenSq(a));

export const distSq = (a: Vec2, b: Vec2): number => {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
};
export const dist = (a: Vec2, b: Vec2): number => Math.sqrt(distSq(a, b));

/** Returns a unit vector, or {x:0,z:0} for a zero-length input. */
export const normalize = (a: Vec2): Vec2 => {
  const l = len(a);
  return l > 1e-9 ? { x: a.x / l, z: a.z / l } : { x: 0, z: 0 };
};

/** Perpendicular (rotate +90°) without trig. */
export const perp = (a: Vec2): Vec2 => ({ x: -a.z, z: a.x });

/** Clamp a vector's magnitude to at most `max`. */
export const clampLen = (a: Vec2, max: number): Vec2 => {
  const l2 = lenSq(a);
  if (l2 <= max * max || l2 < 1e-18) return clone(a);
  const l = Math.sqrt(l2);
  return { x: (a.x / l) * max, z: (a.z / l) * max };
};

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  z: a.z + (b.z - a.z) * t,
});

export const equalsApprox = (a: Vec2, b: Vec2, eps = 1e-6): boolean =>
  Math.abs(a.x - b.x) <= eps && Math.abs(a.z - b.z) <= eps;
