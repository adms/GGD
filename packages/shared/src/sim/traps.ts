import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";
import { distSq } from "./math/vec2";
import { runEffects } from "./effects/effectRunner";
import { removeTrap } from "./trapState";
function expired(world: SimWorld, id: EntityId): boolean {
  const a = world.trap.get(id), t = world.transform.get(id);
  return !a || !t || a.expiresAtTick <= world.tick || world.settledZones.has(t.zone) ||
    (a.onOwnerDeath === "despawn" && world.health.get(a.ownerId)?.alive !== true);
}
export function trapSystem(world: SimWorld): void {
  for (const id of world.trap.keys()) if (expired(world, id)) removeTrap(world, id, "expired");
}
/** Called once at the attack damage point, before RNG, projectile or damage. */
export function interceptTrapAttack(world: SimWorld, attacker: EntityId, victim: EntityId): boolean {
  const from = world.transform.get(attacker), to = world.transform.get(victim);
  if (!from || !to || from.zone !== to.zone || !world.health.get(attacker)?.alive || !world.health.get(victim)?.alive) return false;
  for (const [id, a] of [...world.trap].sort((x, y) => x[0] - y[0])) {
    if (expired(world, id) || a.armedAtTick > world.tick) continue;
    const t = world.transform.get(id)!, team = world.team.get(id)?.teamId;
    if (t.zone !== from.zone || team === undefined || world.team.get(attacker)?.teamId === team || world.team.get(victim)?.teamId !== team) continue;
    const point = a.triggerAt === "attacker" ? from.pos : to.pos;
    if (distSq(point, t.pos) > a.radius * a.radius) continue;
    // Remove before payload dispatch: nested effects cannot trigger this trap again.
    const at = { ...t.pos };
    removeTrap(world, id, "triggered");
    world.emit("trapTriggered", { id, owner: a.ownerId, attacker, victim, canceled: a.cancelAttack, zone: t.zone, x: at.x, z: at.z });
    runEffects(a.onTrigger, { world, caster: a.ownerId, rank: a.rank, targets: [attacker], point: at,
      origin: a.origin, abilitySlot: a.castInstance?.slot, castInstance: a.castInstance, rng: world.rng });
    return a.cancelAttack;
  }
  return false;
}
