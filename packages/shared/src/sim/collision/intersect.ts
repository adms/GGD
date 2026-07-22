/**
 * Deterministic planar intersection primitives. No trig anywhere — cones use
 * cosine comparisons, sweeps solve quadratics with `Math.sqrt` only.
 */
import type { Vec2 } from "../math/vec2";
import { dot, sub, lenSq, distSq, addScaled, normalize } from "../math/vec2";
import type { Circle, Segment, Capsule, Cone } from "./shapes";

/** Closest point to `p` on segment [a,b]. */
export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ab = sub(b, a);
  const abLen2 = lenSq(ab);
  if (abLen2 < 1e-12) return { x: a.x, z: a.z };
  let t = dot(sub(p, a), ab) / abLen2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return addScaled(a, ab, t);
}

export interface CircleOverlap {
  hit: boolean;
  /** penetration depth (>0 when overlapping) */
  depth: number;
  /** unit direction pushing the FIRST circle away from the second */
  normal: Vec2;
}

const NO_HIT: CircleOverlap = { hit: false, depth: 0, normal: { x: 0, z: 0 } };

export function circleVsCircle(a: Circle, b: Circle): CircleOverlap {
  const rSum = a.radius + b.radius;
  const d2 = distSq(a.center, b.center);
  if (d2 >= rSum * rSum) return NO_HIT;
  const d = Math.sqrt(d2);
  // Coincident centers: push along +x deterministically.
  const normal = d > 1e-9
    ? { x: (a.center.x - b.center.x) / d, z: (a.center.z - b.center.z) / d }
    : { x: 1, z: 0 };
  return { hit: true, depth: rSum - d, normal };
}

export function circleVsSegment(c: Circle, s: Segment): CircleOverlap {
  const q = closestPointOnSegment(c.center, s.a, s.b);
  const d2 = distSq(c.center, q);
  if (d2 >= c.radius * c.radius) return NO_HIT;
  const d = Math.sqrt(d2);
  const normal = d > 1e-9
    ? { x: (c.center.x - q.x) / d, z: (c.center.z - q.z) / d }
    : // Center exactly on the wall: push perpendicular to the segment, +side deterministic.
      normalize({ x: -(s.b.z - s.a.z), z: s.b.x - s.a.x });
  return { hit: true, depth: c.radius - d, normal };
}

export function circleVsCapsule(c: Circle, cap: Capsule): CircleOverlap {
  return circleVsSegment(
    { kind: "circle", center: c.center, radius: c.radius + cap.radius },
    { kind: "segment", a: cap.a, b: cap.b },
  );
}

/**
 * Swept circle vs static circle: a circle of radius `r` moving from `from` by
 * `delta` against a target circle. Returns earliest impact time t in [0,1], or null.
 */
export function sweptCircleVsCircle(
  from: Vec2,
  delta: Vec2,
  r: number,
  target: Circle,
): number | null {
  const R = r + target.radius;
  const m = sub(from, target.center);
  const b = dot(m, delta);
  const c = lenSq(m) - R * R;
  if (c <= 0) return 0; // already overlapping
  const a = lenSq(delta);
  if (a < 1e-12) return null; // not moving
  if (b >= 0) return null; // moving away
  const disc = b * b - a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 && t <= 1 ? t : null;
}

/**
 * Point-in-cone using cosine comparison (no atan2): inside iff within range and
 * the direction to the point deviates from the cone axis by ≤ half-angle.
 * `pointRadius` expands the test for a target circle (approximate, standard MOBA).
 */
export function pointInCone(p: Vec2, cone: Cone, pointRadius = 0): boolean {
  const to = sub(p, cone.apex);
  const d2 = lenSq(to);
  const maxD = cone.range + pointRadius;
  if (d2 > maxD * maxD) return false;
  const d = Math.sqrt(d2);
  if (d < 1e-9) return true; // at the apex
  const cos = dot(to, cone.dir) / d;
  if (cos >= cone.cosHalfAngle) return true;
  // Grazing case: circle edge may reach the cone even if center is outside.
  if (pointRadius > 0 && d > 1e-9) {
    // approximate by widening the angular threshold by asin(r/d) via cos form:
    // cos(θ - φ) ≥ cosθ·cosφ + sinθ·sinφ ; use conservative widening.
    const sinPhi = Math.min(1, pointRadius / d);
    const cosPhi = Math.sqrt(1 - sinPhi * sinPhi);
    const sinHalf = Math.sqrt(Math.max(0, 1 - cone.cosHalfAngle * cone.cosHalfAngle));
    const widened = cone.cosHalfAngle * cosPhi - sinHalf * sinPhi;
    return cos >= widened;
  }
  return false;
}

/** Ray (from, dir unit, maxDist) vs segment — earliest distance, or null. */
export function rayVsSegment(from: Vec2, dir: Vec2, maxDist: number, s: Segment): number | null {
  const r = dir;
  const q = s.a;
  const sv = sub(s.b, s.a);
  const denom = r.x * sv.z - r.z * sv.x;
  if (Math.abs(denom) < 1e-12) return null; // parallel
  const qp = sub(q, from);
  const t = (qp.x * sv.z - qp.z * sv.x) / denom; // distance along ray
  const u = (qp.x * r.z - qp.z * r.x) / denom; // param along segment
  if (t < 0 || t > maxDist || u < 0 || u > 1) return null;
  return t;
}
