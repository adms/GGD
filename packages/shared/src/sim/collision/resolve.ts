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
import { circleVsCircle, circleVsSegment, circleVsBox } from "./intersect";
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
  } else if (obstacle.kind === "box") {
    // GH#324 —— graybox 的牆。⛔ 不可以退化成 4 條線段（見 `circleVsBox` 的檔頭）。
    const ov = circleVsBox({ kind: "circle", center: body.pos, radius: body.radius }, obstacle);
    if (ov.hit) body.pos = addScaled(body.pos, ov.normal, ov.depth);
  } else {
    const ov = circleVsSegment(
      { kind: "circle", center: body.pos, radius: body.radius },
      { kind: "segment", a: obstacle.a, b: obstacle.b },
    );
    if (ov.hit) body.pos = addScaled(body.pos, ov.normal, ov.depth);
  }
}

/**
 * Hard-clamp a body inside the zone boundary.
 *
 * ⭐ GH#324 —— 矩形分區逐軸夾，圓形分區**逐字沿用原本那段**。
 *
 * ⚠️ 圓那一半刻意**一個字都不改**，而且這不是潔癖：`relax()` 每一步呼叫它兩次，
 * 所以它在**移動路徑**上。第一版我把兩種形狀都改走統一的 helper，
 * `attackStandstill.test.ts` 的「被擠在柱子上磨蹭時照樣出手」立刻紅了 ——
 * 那條測試量的是 `(pos − before)/dt` 的抖動，而抖動對這裡的每一個浮點細節敏感。
 * ⇒ 既有 6 張圓形場地必須走**位元相同**的那條路，新形狀才另開分支。
 */
export function clampToBoundary(body: Body, zone: ZoneDef): void {
  const b = zone.bounds;
  if (b !== undefined && b.kind === "rect") {
    // 矩形：逐軸夾。⚠️ 只在真的出界時才指派（與圓那一半的可觀測性一致）。
    const maxX = Math.max(0, b.halfW - body.radius);
    const maxZ = Math.max(0, b.halfD - body.radius);
    const dx = body.pos.x - zone.center.x;
    const dz = body.pos.z - zone.center.z;
    if (dx >= -maxX && dx <= maxX && dz >= -maxZ && dz <= maxZ) return;
    body.pos = {
      x: zone.center.x + Math.min(maxX, Math.max(-maxX, dx)),
      z: zone.center.z + Math.min(maxZ, Math.max(-maxZ, dz)),
    };
    return;
  }
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
/**
 * @param obstacles ⭐ GH#324 —— 這一 tick **真的擋路**的障礙物（gate 過濾之後）。
 * 省略 = `zone.obstacles`，也就是既有行為（沒有 gate 的場地永遠走這一條）。
 */
export function moveWithCollision(
  body: Body,
  delta: Vec2,
  zone: ZoneDef,
  obstacles: readonly Obstacle[] = zone.obstacles,
): void {
  const start = body.pos;
  body.pos = { x: start.x + delta.x, z: start.z + delta.z };
  relax(body, zone, obstacles);

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

/**
 * Push a body out of every obstacle + the boundary (2 passes settle corners).
 *
 * Exported as `relaxBody` (task #247) so a LEAP can prove its landing point
 * legal with the EXACT same relaxation the walker uses — a future change to
 * wall geometry then cannot make the two disagree about where a body may stand.
 */
export function relaxBody(
  body: Body,
  zone: ZoneDef,
  obstacles: readonly Obstacle[] = zone.obstacles,
): void {
  relax(body, zone, obstacles);
}

function relax(
  body: Body,
  zone: ZoneDef,
  obstacles: readonly Obstacle[] = zone.obstacles,
): void {
  for (let pass = 0; pass < 2; pass++) {
    for (const ob of obstacles) pushOutOfObstacle(body, ob);
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
