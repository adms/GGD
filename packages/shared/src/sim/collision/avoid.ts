/**
 * Obstacle-avoidance steering — the "walk AROUND the pillar" half of movement.
 *
 * `moveWithCollision` can only ever push a body OUT of a wall; it cannot invent
 * a way past one. A unit steering dead-on into a pillar therefore had its whole
 * step cancelled every tick and stood there forever (the zone-centre pillar sits
 * exactly between the two middle spawn slots, so this was reproducible in every
 * match). This module supplies the missing half: when the straight path to the
 * destination is blocked by a circular obstacle, steer along the TANGENT of that
 * obstacle's clearance circle instead, re-evaluated every tick until the path is
 * clear. It is a steering rule, not a path planner — cheap (a handful of dot
 * products over the 3 pillars in a zone) and stateless.
 *
 * DETERMINISM: pure float algebra — add/mul/dot/cross and `Math.sqrt` only. The
 * tangent is reached by rotating the unit vector toward the obstacle by an angle
 * whose sine/cosine are known in closed form (sin = R/D, cos = √(1 − sin²)), so
 * no trigonometry is involved and no state is carried between ticks.
 */
import type { Vec2 } from "../math/vec2";
import { cross, dot, perp } from "../math/vec2";
import type { Obstacle, ObstacleCircle } from "../world/ArenaDef";

/** Extra clearance kept while rounding an obstacle (world units). */
export const AVOID_MARGIN = 0.3;

/** |perpendicular offset| below this counts as a DEAD-ON approach. */
const HEAD_ON_EPS = 1e-6;

/**
 * Adjust a desired unit direction so it rounds the first blocking obstacle.
 *
 * @param pos           current position
 * @param radius        body radius
 * @param dir           UNIT direction toward the destination
 * @param distToTarget  distance remaining to the destination
 * @param obstacles     the zone's obstacles (segments are ignored — a glancing
 *                      wall is already handled by collide-and-slide)
 * @returns a unit direction: `dir` when the path is clear, else the tangent.
 */
export function steerAroundObstacles(
  pos: Vec2,
  radius: number,
  dir: Vec2,
  distToTarget: number,
  obstacles: readonly Obstacle[],
  margin: number = AVOID_MARGIN,
): Vec2 {
  let blocker: ObstacleCircle | null = null;
  let blockerTo: Vec2 = { x: 0, z: 0 };
  let bestT = Infinity;

  // The destination itself (dir is the unit vector toward it).
  const destX = pos.x + dir.x * distToTarget;
  const destZ = pos.z + dir.z * distToTarget;

  for (const ob of obstacles) {
    if (ob.kind !== "circle") continue;
    const to = { x: ob.center.x - pos.x, z: ob.center.z - pos.z };
    const along = dot(to, dir);
    if (along <= 0) continue; // behind us
    if (along >= distToTarget) continue; // at or past the destination
    // An UNREACHABLE destination — one INSIDE the obstacle, e.g. a click on the
    // pillar — must never trigger avoidance: rounding a circle you were told to
    // stand in is an endless orbit. Walk straight in and let the push-out park
    // the body against the surface, which is what the order actually means.
    // (A chase destination is another unit's centre, always outside the wall.)
    const dx = destX - ob.center.x;
    const dz = destZ - ob.center.z;
    if (dx * dx + dz * dz < ob.radius * ob.radius) continue;
    const blockR = ob.radius + radius;
    const off = cross(dir, to); // signed perpendicular offset (dir is unit)
    if (off * off >= blockR * blockR) continue; // the path misses this body
    if (along < bestT) {
      bestT = along;
      blocker = ob;
      blockerTo = to;
    }
  }

  if (!blocker) return dir;

  const d2 = blockerTo.x * blockerTo.x + blockerTo.z * blockerTo.z;
  if (d2 < 1e-12) return dir; // standing on the centre: nothing sensible to do
  const d = Math.sqrt(d2);
  const u = { x: blockerTo.x / d, z: blockerTo.z / d };

  // Which side to round it on. Normally the SHORT way: the side the obstacle
  // centre is NOT on. Dead-on there is no geometric preference, and picking a
  // body-relative side (e.g. "always my left") would send two units charging
  // each other through the same pillar around OPPOSITE sides — they would then
  // orbit 180° apart forever. So the dead-on tie-break is WORLD-SPACE (prefer
  // the pass point with the greater x, then the greater z): both units choose
  // the same side of the pillar, pass on that side, and meet.
  const off = cross(dir, blockerTo);
  let ccw: boolean;
  if (off > HEAD_ON_EPS) ccw = false;
  else if (off < -HEAD_ON_EPS) ccw = true;
  else {
    const p = perp(u); // the +side pass offset
    ccw = p.x > 1e-9 || (p.x >= -1e-9 && p.z > 0);
  }

  // Rotate `u` onto the tangent of the clearance circle (radius R at distance
  // D): sin = R/D, cos = √(1 − sin²). Inside the ring (D ≤ R — i.e. already
  // hugging the obstacle) the tangent degenerates to pure perpendicular travel.
  const r = blocker.radius + radius + margin;
  let s = r / d;
  let c: number;
  if (s >= 1) {
    s = 1;
    c = 0;
  } else {
    c = Math.sqrt(1 - s * s);
  }
  return ccw
    ? { x: u.x * c - u.z * s, z: u.x * s + u.z * c }
    : { x: u.x * c + u.z * s, z: -u.x * s + u.z * c };
}
