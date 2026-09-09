import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { Vec2 } from "../math/vec2";
import type { DashOverride } from "../components";
import { addScaled, sub, dot } from "../math/vec2";
import { sweptCircleVsCircle } from "../collision/intersect";
import { hasLineOfSight } from "../map/lineOfSight";
import { worldObstacles } from "../map/gates";

/** Sweep only the displacement already permitted by wall collision. Earliest
 * contact wins, ties by entity id; iteration order cannot choose the victim.
 */
export function dashContact(world: SimWorld, caster: EntityId, from: Vec2, to: Vec2,
  scope: NonNullable<DashOverride["stopOnHit"]>): { target: EntityId; point: Vec2 } | null {
  const actor = world.transform.get(caster), team = world.team.get(caster);
  if (!actor || !team || world.settledZones.has(actor.zone)) return null;
  const delta = sub(to, from); let best = Infinity; let target: EntityId | undefined;
  for (const [id, body] of world.transform) {
    if (id === caster || world.projectile.has(id) || body.zone !== actor.zone || !world.health.get(id)?.alive) continue;
    const other = world.team.get(id);
    if (!other || other.teamId === team.teamId || (scope === "enemyChampion" && !world.champion.has(id))) continue;
    if (dot(sub(body.pos, from), delta) < 0) continue;
    const at = sweptCircleVsCircle(from, delta, actor.radius, { kind: "circle", center: body.pos, radius: body.radius });
    if (at === null || !hasLineOfSight(from, body.pos, worldObstacles(world, actor.zone))) continue;
    if (at < best || (at === best && (target === undefined || id < target))) { best = at; target = id; }
  }
  return target === undefined ? null : { target, point: addScaled(from, delta, best) };
}
