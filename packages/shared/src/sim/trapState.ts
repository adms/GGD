import type { EntityId } from "../ids";
import type { EffectDef } from "./effects/effect";
import type { CastInstance } from "./content/castInstance";
import type { SimWorld } from "./SimWorld";
export const TRAP_MAX_ALIVE = 8;
export const TRAP_MAX_RADIUS = 12;
export const TRAP_MAX_DURATION_SEC = 30;
export interface TrapComp {
  ownerId: EntityId;
  origin: string;
  rank: number;
  expiresAtTick: number;
  armedAtTick: number;
  radius: number;
  triggerAt: "attacker" | "victim";
  cancelAttack: boolean;
  onOwnerDeath: "despawn" | "persist";
  onTrigger: EffectDef[];
  castInstance?: CastInstance;
}
export function removeTrap(world: SimWorld, id: EntityId, reason: string): void {
  const trap = world.trap.get(id), t = world.transform.get(id);
  if (!trap) return;
  world.emit("trapRemoved", { id, owner: trap.ownerId, reason, zone: t?.zone });
  world.destroy(id);
}
/** Include pending payload and timing even without cast-credit hooks. */
export function digestTraps(world: SimWorld, mix: (n: number) => void): void {
  for (const [id, trap] of [...world.trap].sort((a, b) => a[0] - b[0])) {
    const c = trap.castInstance;
    const text = JSON.stringify(["trap-v1", id, world.transform.get(id), world.team.get(id),
      trap.ownerId, trap.origin, trap.rank, trap.expiresAtTick, trap.armedAtTick,
      trap.radius, trap.triggerAt, trap.cancelAttack, trap.onOwnerDeath, trap.onTrigger,
      c ? [c.caster, c.abilityId, c.slot, c.tick, c.serial, [...c.creditedHooks].sort()] : null]);
    mix(text.length); for (let i = 0; i < text.length; i++) mix(text.charCodeAt(i));
  }
}
