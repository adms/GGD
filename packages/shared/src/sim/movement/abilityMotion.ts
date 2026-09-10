import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { Vec2 } from "../math/vec2";
import type { EffectContext } from "../effects/effect";
import type { Obstacle } from "../world/ArenaDef";
import { addScaled, dist, dot, len, lenSq, normalize, scale, sub } from "../math/vec2";
import { moveWithCollision } from "../collision/resolve";
import { worldObstacles } from "../map/gates";
import { segmentHitsAny } from "../map/lineOfSight";
import { Stat } from "../stats/statTypes";
import { canSee } from "../stealth";
import { refusesControl } from "../effects/invulnerable";

/** Source lifetime owns the ride; normal walk semantics are unchanged without this grant. */
export interface DriveGrant {
  accelSec: number;
  brakeSec: number;
  turnFactor: number;
  sharpTurnDot: number;
  sharpTurnSpeed: number;
}
export type DrivePhase = "accelerating" | "cruising" | "turning" | "braking" | "collision" | "stopped";
export interface DriveState {
  sourceId: string;
  zone: number;
  rate: number;
  dir: Vec2;
  phase: DrivePhase;
}
export interface GrappleSpec { range: number; maxTravel: number; hitRadius: number }
export interface GrappleLink {
  caster: EntityId;
  target?: EntityId;
  anchor: Vec2;
  zone: number;
  range: number;
  stopDistance: number;
}

function blockers(world: SimWorld, mover: EntityId, except?: EntityId): Obstacle[] {
  const mt = world.transform.get(mover)!;
  const out = [...worldObstacles(world, mt.zone)];
  for (const [id, t] of world.transform) {
    if (id === mover || id === except || t.zone !== mt.zone || !world.health.get(id)?.alive) continue;
    if (!world.nav.has(id) && !world.structure.has(id) && !world.flower.has(id)) continue;
    out.push({ kind: "circle", center: t.pos, radius: t.radius });
  }
  return out;
}

/** A deterministic first obstruction, including thin segment walls; no stepping over geometry. */
function firstTerrainHit(from: Vec2, dir: Vec2, range: number, obstacles: readonly Obstacle[]): number | undefined {
  if (!segmentHitsAny(from, addScaled(from, dir, range), obstacles, 0)) return undefined;
  let lo = 0, hi = range;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (segmentHitsAny(from, addScaled(from, dir, mid), obstacles, 0)) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** The first legal enemy or blocking terrain catches the line; empty space never becomes an anchor. */
export function startGrapple(ctx: EffectContext, spec: GrappleSpec, speed: number, stopDistance: number): void {
  const { world, caster } = ctx, ct = world.transform.get(caster);
  if (!ct || !world.health.get(caster)?.alive || world.settledZones.has(ct.zone) || !ctx.direction) return;
  const dir = normalize(ctx.direction);
  if (lenSq(dir) < 1e-12 || !(speed > 0)) return;
  const walls = worldObstacles(world, ct.zone);
  const wallDistance = firstTerrainHit(ct.pos, dir, spec.range, walls);
  let caught: EntityId | undefined, distance = wallDistance ?? spec.range + 1;
  for (const [id, t] of [...world.transform].sort(([a], [b]) => a - b)) {
    if (id === caster || t.zone !== ct.zone || !world.nav.has(id) || !world.health.get(id)?.alive ||
        world.team.get(id)?.teamId === world.team.get(caster)?.teamId || !canSee(world, caster, id)) continue;
    const offset = sub(t.pos, ct.pos), along = dot(offset, dir), radius = t.radius + spec.hitRadius;
    const perpendicular2 = Math.max(0, lenSq(offset) - along * along);
    if (along <= 0 || perpendicular2 > radius * radius) continue;
    const hit = Math.max(0, along - Math.sqrt(radius * radius - perpendicular2));
    if (hit <= spec.range && hit < distance) { caught = id; distance = hit; }
  }
  if (caught === undefined && wallDistance === undefined) return;
  if (caught !== undefined && refusesControl(world, caught)) return;
  const mover = caught ?? caster, mt = world.transform.get(mover)!, nav = world.nav.get(mover);
  if (!nav || nav.override?.kind === "leap") return;
  const anchor = caught === undefined ? addScaled(ct.pos, dir, distance) : { ...ct.pos };
  const gap = Math.max(stopDistance, mt.radius + (caught === undefined ? 0.05 : ct.radius));
  const remaining = Math.min(spec.maxTravel, Math.max(0, dist(mt.pos, anchor) - gap));
  if (remaining <= 1e-6) return;
  nav.override = { kind: "knockback", dir: normalize(sub(anchor, mt.pos)), speed, remaining, authored: true,
    grapple: { caster, ...(caught !== undefined ? { target: caught } : {}), anchor, zone: ct.zone, range: spec.range, stopDistance: gap } };
  if (nav.drive) { nav.drive.rate = 0; nav.drive.phase = "stopped"; }
}

/** A link never extends its total travel budget when its anchor moves. */
export function advanceGrapple(world: SimWorld, id: EntityId): boolean {
  const nav = world.nav.get(id), ov = nav?.override;
  if (!nav || !ov || ov.kind === "leap" || !ov.grapple) return false;
  const done = () => { publishAbilityMotion(world, id); return true; };
  const g = ov.grapple, t = world.transform.get(id)!, ct = world.transform.get(g.caster);
  const stop = () => { nav.override = null; t.vel = { x: 0, z: 0 }; };
  if (!ct || !world.health.get(g.caster)?.alive || !world.health.get(id)?.alive ||
      ct.zone !== g.zone || t.zone !== g.zone || world.settledZones.has(g.zone) ||
      (g.target !== undefined && !canSee(world, g.caster, g.target))) { stop(); return done(); }
  const anchor = g.target === undefined ? g.anchor : ct.pos;
  const gap = dist(t.pos, anchor);
  if (gap > g.range + 1e-6 || gap <= g.stopDistance + 1e-6) { stop(); return done(); }
  ov.dir = normalize(sub(anchor, t.pos));
  const travel = Math.min(ov.remaining, ov.speed * world.dt, gap - g.stopDistance);
  const delta = scale(ov.dir, travel), before = { ...t.pos }, desired = addScaled(before, ov.dir, travel);
  const obstacles = blockers(world, id, g.caster), zone = world.arena.zones[t.zone]!;
  // Swept test prevents a thin wall from being skipped by a fast pull.
  const hit = firstTerrainHit(before, ov.dir, travel, obstacles);
  const body = { pos: t.pos, radius: t.radius };
  moveWithCollision(body, hit === undefined ? delta : scale(ov.dir, Math.max(0, hit - t.radius)), zone, obstacles);
  t.pos = body.pos; t.vel = scale(sub(t.pos, before), 1 / world.dt); ov.remaining -= travel;
  if (hit !== undefined || dist(t.pos, desired) > 1e-6 || ov.remaining <= 1e-6 || gap - travel <= g.stopDistance + 1e-6) stop();
  return done();
}

/** Reuses the world's collision integration and existing turn function, with a source-owned speed ramp. */
export function advanceDrive(world: SimWorld, id: EntityId, held: boolean, speedMult: number,
  turn: (from: Vec2, to: Vec2, factor: number) => Vec2, facingOverride?: Vec2 | null): boolean {
  const done = () => { publishAbilityMotion(world, id); return true; };
  const nav = world.nav.get(id)!, t = world.transform.get(id)!;
  const sources = world.stats.get(id)?.sources ?? [];
  let source: import("../stats/modifiers").ModifierSource | undefined;
  for (let i = sources.length - 1; i >= 0; i--) {
    const candidate = sources[i]!;
    if (candidate.drive && (candidate.expiresAtTick === undefined || candidate.expiresAtTick > world.tick)) { source = candidate; break; }
  }
  if (!source || !world.health.get(id)?.alive || world.settledZones.has(t.zone)) { const had = nav.drive; delete nav.drive; if (had) publishAbilityMotion(world, id); return false; }
  const grant = source.drive!;
  if (!nav.drive || nav.drive.sourceId !== source.id || nav.drive.zone !== t.zone) {
    nav.drive = { sourceId: source.id, zone: t.zone, rate: 0, dir: { ...t.facing }, phase: "stopped" };
  }
  const state = nav.drive;
  // Movement direction belongs to the ride; facing still belongs to aim/cast locks.
  if (facingOverride) t.facing = { ...facingOverride };
  if (held) { state.rate = 0; state.phase = "stopped"; t.vel = { x: 0, z: 0 }; return done(); }
  const delta = nav.moveTarget ? sub(nav.moveTarget, t.pos) : null;
  const wanted = delta && lenSq(delta) > 0.01 ? normalize(delta) : null;
  if (wanted) {
    const sharp = dot(state.dir, wanted) < grant.sharpTurnDot;
    state.dir = turn(state.dir, wanted, grant.turnFactor);
    state.rate = sharp ? Math.min(state.rate, grant.sharpTurnSpeed) : Math.min(1, state.rate + world.dt / grant.accelSec);
    state.phase = sharp ? "turning" : state.rate < 1 ? "accelerating" : "cruising";
  } else {
    state.rate = Math.max(0, state.rate - world.dt / grant.brakeSec);
    if (state.phase !== "collision") state.phase = state.rate > 0 ? "braking" : "stopped";
  }
  if (state.rate <= 0) { t.vel = { x: 0, z: 0 }; return done(); }
  const maxSpeed = world.stats.get(id)!.final[Stat.MoveSpeed];
  const speed = maxSpeed * speedMult * state.rate;
  const travel = Math.min(speed * world.dt, wanted && delta ? len(delta) : Infinity);
  const before = { ...t.pos }, desired = addScaled(before, state.dir, travel), obstacles = blockers(world, id);
  const hit = firstTerrainHit(before, state.dir, travel, obstacles);
  const body = { pos: t.pos, radius: t.radius };
  moveWithCollision(body, scale(state.dir, hit === undefined ? travel : Math.max(0, hit - t.radius)), world.arena.zones[t.zone]!, obstacles);
  t.pos = body.pos; if (!facingOverride) t.facing = { ...state.dir }; t.vel = scale(sub(t.pos, before), 1 / world.dt);
  if (hit !== undefined || dist(t.pos, desired) > 1e-6) {
    state.rate = 0; state.phase = "collision"; t.vel = { x: 0, z: 0 };
    nav.moveTarget = null; nav.order = null;
  }
  return done();
}

export function abilityMotionSnapshot(world: SimWorld, id: EntityId): { motionState: string; tetherX: number; tetherZ: number } {
  const nav = world.nav.get(id), ov = nav?.override;
  const g = ov && ov.kind !== "leap" ? ov.grapple : undefined;
  const anchor = g ? g.target === undefined ? g.anchor : world.transform.get(g.caster)?.pos : undefined;
  return { motionState: g ? "pulling" : nav?.drive?.phase ?? "", tetherX: anchor?.x ?? 0, tetherZ: anchor?.z ?? 0 };
}

/** Editor replay records actual movement frames; live clients use the snapshot fields. */
export function publishAbilityMotion(world: SimWorld, id: EntityId): void {
  const t = world.transform.get(id);
  if (t) world.emit("abilityMotion", { id, ...abilityMotionSnapshot(world, id), x: t.pos.x, z: t.pos.z, fx: t.facing.x, fz: t.facing.z });
}
