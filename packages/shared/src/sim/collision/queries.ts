/**
 * queryOverlap — THE spatial seam between abilities/effects and collision.
 * Given any Shape, returns the entity ids whose collision circle overlaps it,
 * sorted ascending (deterministic). Uses the world's broad-phase grid.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { Shape } from "./shapes";
import { boundsOf } from "./shapes";
import { circleVsCircle, circleVsCapsule, pointInCone, closestPointOnSegment } from "./intersect";
import { distSq } from "../math/vec2";

export interface OverlapOptions {
  /** restrict to a zone (PairedDuels: abilities never cross zones) */
  zone?: number;
  /** exclude these ids (e.g. the caster) */
  exclude?: ReadonlySet<EntityId>;
  /** only living units */
  aliveOnly?: boolean;
}

export function queryOverlap(world: SimWorld, shape: Shape, opts: OverlapOptions = {}): EntityId[] {
  const b = boundsOf(shape);
  const candidates = world.grid.queryAABB(b.min, b.max);
  const out: EntityId[] = [];

  for (const id of candidates) {
    if (opts.exclude?.has(id)) continue;
    if (world.projectile.has(id)) continue; // projectiles are not targets
    if (world.reviveCircle.has(id)) continue; // ground area, never a target
    if (world.coin.has(id)) continue; // dropped loot, never a target (task #191)
    const t = world.transform.get(id);
    if (!t) continue;
    if (opts.zone !== undefined && t.zone !== opts.zone) continue;
    if (opts.aliveOnly) {
      const hp = world.health.get(id);
      if (hp && !hp.alive) continue;
    }

    const unit = { kind: "circle" as const, center: t.pos, radius: t.radius };
    let hit = false;
    switch (shape.kind) {
      case "circle":
        hit = circleVsCircle(unit, shape).hit;
        break;
      case "capsule":
        hit = circleVsCapsule(unit, shape).hit;
        break;
      case "cone":
        hit = pointInCone(t.pos, shape, t.radius);
        break;
      case "segment": {
        const q = closestPointOnSegment(t.pos, shape.a, shape.b);
        hit = distSq(t.pos, q) < t.radius * t.radius;
        break;
      }
      case "aabb":
        hit =
          t.pos.x + t.radius >= shape.min.x &&
          t.pos.x - t.radius <= shape.max.x &&
          t.pos.z + t.radius >= shape.min.z &&
          t.pos.z - t.radius <= shape.max.z;
        break;
    }
    if (hit) out.push(id);
  }
  return out; // already ascending (grid returns sorted)
}
