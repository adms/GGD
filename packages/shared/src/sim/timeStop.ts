import type { EntityId, TeamId } from "../ids";
import type { SimWorld } from "./SimWorld";
import type { DamagePacket } from "./combat/damage";
import { distSq, lenSq, type Vec2 } from "./math/vec2";

export const TIME_STOP_MAX_DURATION_SEC = 5;
export const TIME_STOP_MAX_RADIUS = 12;
export const TIME_STOP_MAX_HITS = 128;

/** Fixed local field. Its deadline always uses match time, even when its owner
 * is inside another field. Damage packets retain their original cast credit. */
export interface TimeStopField {
  owner: EntityId;
  team: TeamId;
  origin: string;
  zone: number;
  round: number;
  point: Vec2;
  radius: number;
  expiresAtTick: number;
  maxQueuedHits: number;
  hits: DamagePacket[];
}

function fieldAlive(world: SimWorld, field: TimeStopField): boolean {
  return field.round === world.round && !world.settledZones.has(field.zone) &&
    world.health.get(field.owner)?.alive === true && (world.health.get(field.owner)?.hp ?? 0) > 0 &&
    world.transform.get(field.owner)?.zone === field.zone;
}

function contains(world: SimWorld, field: TimeStopField, id: EntityId): boolean {
  const t = world.transform.get(id);
  const owner = world.projectile.get(id)?.ownerId ?? id;
  const team = world.team.get(owner)?.teamId;
  return t !== undefined && t.zone === field.zone && team !== undefined && team !== field.team &&
    distSq(t.pos, field.point) <= field.radius * field.radius;
}

export function isTimeStopped(world: SimWorld, id: EntityId): boolean {
  // Boolean membership is order-independent; this is a hot per-entity query.
  for (const field of world.timeStop.values()) {
    if (field.expiresAtTick > world.tick && fieldAlive(world, field) && contains(world, field, id)) return true;
  }
  return false;
}

/** Pause at a swept boundary, so a fast enemy projectile cannot cross a whole
 * field between samples. Returns the allowed fraction of this movement. */
export function timeStopProjectileFraction(world: SimWorld, id: EntityId, delta: Vec2): number {
  const t = world.transform.get(id), p = world.projectile.get(id);
  if (!t || !p || world.timeStop.size === 0) return 1;
  const team = world.team.get(p.ownerId)?.teamId;
  let fraction = 1;
  // Minimum intersection is order-independent.
  for (const f of world.timeStop.values()) {
    if (!fieldAlive(world, f) || f.expiresAtTick <= world.tick || f.zone !== t.zone || team === undefined || team === f.team) continue;
    const x = t.pos.x - f.point.x, z = t.pos.z - f.point.z;
    const c = x * x + z * z - f.radius * f.radius;
    if (c <= 1e-9) return 0;
    const a = lenSq(delta), b = 2 * (x * delta.x + z * delta.z);
    const d = b * b - 4 * a * c;
    if (a <= 0 || d < 0) continue;
    const enter = (-b - Math.sqrt(d)) / (2 * a);
    if (enter >= 0 && enter <= fraction) fraction = enter;
  }
  return fraction;
}

/** Only the field owner's hits on enemies inside that field are deferred.
 * Overflow is discarded visibly; it must never turn into immediate damage.
 * Multiple allied fields do not duplicate a hit. */
export function deferTimeStopHit(world: SimWorld, packet: DamagePacket): boolean {
  if (packet.timeStopReleased) return false;
  for (const [id, f] of [...world.timeStop].sort((a, b) => a[0] - b[0])) {
    if (f.owner !== packet.source || f.expiresAtTick <= world.tick || !fieldAlive(world, f) || !contains(world, f, packet.target)) continue;
    const accepted = f.hits.length < f.maxQueuedHits;
    if (accepted) f.hits.push({ ...packet });
    world.emit(accepted ? "timeStopHitQueued" : "timeStopHitOverflow", { id, owner: f.owner, target: packet.target, count: f.hits.length });
    return true;
  }
  return false;
}

export function removeTimeStop(world: SimWorld, id: EntityId, reason: string, release: boolean): void {
  const f = world.timeStop.get(id);
  if (!f) return;
  world.timeStop.delete(id);
  world.transform.delete(id);
  if (release) for (const hit of f.hits) {
    if (world.health.get(hit.target)?.alive && world.transform.get(hit.target)?.zone === f.zone) {
      world.damageQueue.push({ ...hit, timeStopReleased: true });
    }
  }
  world.emit("timeStopEnd", { id, owner: f.owner, zone: f.zone, reason, released: release ? f.hits.length : 0 });
}

/** Death/despawn/round restoration discards pending hits; never let a revived
 * body inherit a field or be hit by packets queued against its previous life. */
export function forgetTimeStopsFor(world: SimWorld, entity: EntityId): void {
  for (const [id, f] of [...world.timeStop].sort((a, b) => a[0] - b[0])) {
    if (id === entity || f.owner === entity) removeTimeStop(world, id, "body-reset", false);
    else f.hits = f.hits.filter(h => h.target !== entity);
  }
}

export function timeStopSystem(world: SimWorld): void {
  for (const [id, f] of [...world.timeStop].sort((a, b) => a[0] - b[0])) {
    if (!fieldAlive(world, f)) removeTimeStop(world, id, "cancelled", false);
    else if (f.expiresAtTick <= world.tick) removeTimeStop(world, id, "elapsed", true);
  }
}

export function digestTimeStops(world: SimWorld, mix: (n: number) => void): void {
  for (const [id, field] of [...world.timeStop].sort((a, b) => a[0] - b[0])) {
    const text = JSON.stringify(["time-stop-v1", id, field], (_key, value) => value instanceof Set ? [...value].sort() : value);
    mix(text.length); for (let i = 0; i < text.length; i++) mix(text.charCodeAt(i));
  }
}
