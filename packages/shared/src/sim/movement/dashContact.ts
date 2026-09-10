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
export function dashContacts(world: SimWorld, caster: EntityId, from: Vec2, to: Vec2,
  scope: NonNullable<DashOverride["stopOnHit"]>): { target: EntityId; point: Vec2; at: number }[] {
  const actor = world.transform.get(caster), team = world.team.get(caster);
  if (!actor || !team || world.settledZones.has(actor.zone)) return [];
  const delta = sub(to, from); const contacts: { target: EntityId; point: Vec2; at: number }[] = [];
  for (const [id, body] of world.transform) {
    if (id === caster || world.projectile.has(id) || body.zone !== actor.zone || !world.health.get(id)?.alive) continue;
    const other = world.team.get(id);
    if (!other || other.teamId === team.teamId || (scope === "enemyChampion" && !world.champion.has(id))) continue;
    if (dot(sub(body.pos, from), delta) < 0) continue;
    const at = sweptCircleVsCircle(from, delta, actor.radius, { kind: "circle", center: body.pos, radius: body.radius });
    if (at === null || !hasLineOfSight(from, body.pos, worldObstacles(world, actor.zone))) continue;
    contacts.push({ target: id, point: addScaled(from, delta, at), at });
  }
  return contacts.sort((a, b) => a.at - b.at || a.target - b.target);
}

/** Stop-mode retains the same earliest-contact and entity-id tie break. */
export function dashContact(world: SimWorld, caster: EntityId, from: Vec2, to: Vec2,
  scope: NonNullable<DashOverride["stopOnHit"]>): { target: EntityId; point: Vec2 } | null {
  const contact = dashContacts(world, caster, from, to, scope)[0];
  return contact ? { target: contact.target, point: contact.point } : null;
}
