/**
 * Planar collision shapes. All shapes live on the ground plane (x,z).
 * Cones are represented by a unit direction + cosine of the half-angle so that
 * containment tests need no trigonometry (dot-product comparison only).
 */
import type { Vec2 } from "../math/vec2";

export interface Circle {
  kind: "circle";
  center: Vec2;
  radius: number;
}

/** A wall / obstacle edge from `a` to `b`. */
export interface Segment {
  kind: "segment";
  a: Vec2;
  b: Vec2;
}

/** A swept circle (thick line) — skillshot beams, projectile sweeps. */
export interface Capsule {
  kind: "capsule";
  a: Vec2;
  b: Vec2;
  radius: number;
}

/** Cone from `apex` opening around unit `dir`; `cosHalfAngle` = cos(θ/2). */
export interface Cone {
  kind: "cone";
  apex: Vec2;
  dir: Vec2;
  cosHalfAngle: number;
  range: number;
}

export interface AABB {
  kind: "aabb";
  min: Vec2;
  max: Vec2;
}

export type Shape = Circle | Segment | Capsule | Cone | AABB;

export const circle = (center: Vec2, radius: number): Circle => ({
  kind: "circle",
  center,
  radius,
});
export const segment = (a: Vec2, b: Vec2): Segment => ({ kind: "segment", a, b });
export const capsule = (a: Vec2, b: Vec2, radius: number): Capsule => ({
  kind: "capsule",
  a,
  b,
  radius,
});
export const cone = (apex: Vec2, dir: Vec2, cosHalfAngle: number, range: number): Cone => ({
  kind: "cone",
  apex,
  dir,
  cosHalfAngle,
  range,
});
export const aabb = (min: Vec2, max: Vec2): AABB => ({ kind: "aabb", min, max });

/** Conservative bounding box for any shape (used for broad-phase). */
export function boundsOf(s: Shape): AABB {
  switch (s.kind) {
    case "circle":
      return aabb(
        { x: s.center.x - s.radius, z: s.center.z - s.radius },
        { x: s.center.x + s.radius, z: s.center.z + s.radius },
      );
    case "segment":
      return aabb(
        { x: Math.min(s.a.x, s.b.x), z: Math.min(s.a.z, s.b.z) },
        { x: Math.max(s.a.x, s.b.x), z: Math.max(s.a.z, s.b.z) },
      );
    case "capsule":
      return aabb(
        { x: Math.min(s.a.x, s.b.x) - s.radius, z: Math.min(s.a.z, s.b.z) - s.radius },
        { x: Math.max(s.a.x, s.b.x) + s.radius, z: Math.max(s.a.z, s.b.z) + s.radius },
      );
    case "cone":
      // conservative: full disc of the cone's range
      return aabb(
        { x: s.apex.x - s.range, z: s.apex.z - s.range },
        { x: s.apex.x + s.range, z: s.apex.z + s.range },
      );
    case "aabb":
      return s;
  }
}
