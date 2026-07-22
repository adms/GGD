/**
 * Movement collision resolution — LoL-style:
 *  - units softly push each other apart (no hard blocking),
 *  - walls/obstacles push out and let you slide along them,
 *  - the zone boundary hard-clamps everyone inside.
 * Deterministic: callers iterate entities in sorted id order; every push is a
 * pure function of positions.
 */
import type { Vec2 } from "../math/vec2";
import { sub, addScaled, lenSq, normalize, dot } from "../math/vec2";
import { circleVsCircle, circleVsSegment } from "./intersect";
import type { Obstacle, ZoneDef } from "../world/ArenaDef";

export interface Body {
  pos: Vec2;
  radius: number;
}

/**
 * Soft unit-vs-unit separation: mutually push two overlapping bodies apart by
 * half the penetration each (weighted equally). `strength` < 1 makes the push
 * springy over several ticks instead of instant (MOBA feel).
 */
export function separatePair(a: Body, b: Body, strength = 0.5): void {
  const ov = circleVsCircle(
    { kind: "circle", center: a.pos, radius: a.radius },
    { kind: "circle", center: b.pos, radius: b.radius },
  );
  if (!ov.hit) return;
  const push = ov.depth * 0.5 * strength;
  a.pos = addScaled(a.pos, ov.normal, push);
  b.pos = addScaled(b.pos, ov.normal, -push);
}

/** Push a body fully out of a single obstacle (hard, walls don't yield). */
export function pushOutOfObstacle(body: Body, obstacle: Obstacle): void {
  if (obstacle.kind === "circle") {
    const ov = circleVsCircle(
      { kind: "circle", center: body.pos, radius: body.radius },
      { kind: "circle", center: obstacle.center, radius: obstacle.radius },
    );
    if (ov.hit) body.pos = addScaled(body.pos, ov.normal, ov.depth);
  } else {
    const ov = circleVsSegment(
      { kind: "circle", center: body.pos, radius: body.radius },
      { kind: "segment", a: obstacle.a, b: obstacle.b },
    );
    if (ov.hit) body.pos = addScaled(body.pos, ov.normal, ov.depth);
  }
}

/** Hard-clamp a body inside a circular zone boundary. */
export function clampToBoundary(body: Body, zone: ZoneDef): void {
  const maxR = zone.boundaryRadius - body.radius;
  const off = sub(body.pos, zone.center);
  const d2 = lenSq(off);
  if (d2 <= maxR * maxR) return;
  const n = normalize(off);
  body.pos = addScaled(zone.center, n, maxR);
}

/**
 * Move a body by `delta` with collide-and-SLIDE: apply the full step, push out
 * of whatever it hit, then re-apply the part of the step that was TANGENTIAL to
 * the surface so contact deflects motion instead of cancelling it. Two
 * relaxation passes per resolve settle corner cases (two pillars, pillar +
 * boundary). Stable at MOBA speeds; deterministic (pure position math).
 */
export function moveWithCollision(body: Body, delta: Vec2, zone: ZoneDef): void {
  const start = body.pos;
  body.pos = { x: start.x + delta.x, z: start.z + delta.z };
  relax(body, zone);

  // Collide-and-SLIDE. `relax` only pushes straight back OUT along the surface
  // normal, so a head-on step is cancelled in full and the body does not move at
  // all — the documented behaviour above was never actually implemented, and a
  // unit walking into a pillar stood still forever. Recover the tangential half:
  // the total correction IS the surface normal, so strip the into-surface
  // component from the original delta and re-apply what is left.
  const cx = body.pos.x - (start.x + delta.x);
  const cz = body.pos.z - (start.z + delta.z);
  if (cx * cx + cz * cz <= 1e-12) return; // nothing was hit
  const n = normalize({ x: cx, z: cz });
  if (n.x === 0 && n.z === 0) return;
  if (dot(delta, n) >= 0) return; // correction is not opposing the motion
  const slide = slideVelocity(delta, n);
  if (lenSq(slide) <= 1e-12) return; // dead-on: no tangential component to keep
  body.pos = { x: start.x + slide.x, z: start.z + slide.z };
  relax(body, zone);
}

/** Push a body out of every obstacle + the boundary (2 passes settle corners). */
function relax(body: Body, zone: ZoneDef): void {
  for (let pass = 0; pass < 2; pass++) {
    for (const ob of zone.obstacles) pushOutOfObstacle(body, ob);
    clampToBoundary(body, zone);
  }
}

/**
 * Compute the slide-adjusted velocity for a body already touching a surface:
 * removes the into-wall component. Used to avoid "grinding" against a wall.
 */
export function slideVelocity(vel: Vec2, surfaceNormal: Vec2): Vec2 {
  const into = dot(vel, surfaceNormal);
  if (into >= 0) return vel;
  return { x: vel.x - surfaceNormal.x * into, z: vel.z - surfaceNormal.z * into };
}
