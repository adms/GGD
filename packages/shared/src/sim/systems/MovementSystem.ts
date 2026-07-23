/**
 * MovementSystem — integrates navigation into positions with collision:
 *   1. dash/knockback overrides win over normal movement,
 *   2. normal movement steers toward moveTarget at move speed (respecting
 *      root/stun and slow multipliers), with SMOOTH TURNING (facing rotates
 *      toward the move/attack direction by a bounded nlerp step instead of
 *      snapping), a short ACCELERATION RAMP (full speed over ~ACCEL_TICKS) and
 *      OBSTACLE AVOIDANCE (a pillar on the straight line to the destination is
 *      rounded on a tangent — see collision/avoid.ts — because collision alone
 *      can push a body out of a wall but never past one),
 *   3. wall push-out + slide + boundary clamp (per zone),
 *   4. unit-vs-unit soft separation (pairs within the same zone, ascending id).
 * Deterministic: entities iterate in id order; separation pairs are ordered;
 * turning uses vector nlerp only (NO trig — see math/vec2.ts).
 *
 * Design note (LoL-style): movement DIRECTION is the ordered direction
 * immediately — units go where told while the body visually turns (the one
 * exception is the obstacle-avoidance deflection above, which is a hard
 * geometric necessity, not a smoothing). Facing is cosmetic/aiming state, so
 * decoupling it from the velocity keeps controls responsive and needs no speed
 * clamp while turning.
 */
import type { SimWorld } from "../SimWorld";
import type { Vec2 } from "../math/vec2";
import { sub, len, scale, normalize, addScaled, dot, cross, perp, lenSq } from "../math/vec2";
import { moveWithCollision, separatePair, clampToBoundary, pushOutOfObstacle } from "../collision/resolve";
import { steerAroundObstacles } from "../collision/avoid";
import { Stat } from "../stats/statTypes";

/** Fallback move speed (units/sec) for entities without a stats component. */
const BASE_MOVE_SPEED = 6;

/**
 * Per-tick turn factor for facing nlerp (0..1). ~0.35 converges from a 90°
 * turn in ~6 ticks (200ms @30Hz) and bounds the per-tick rotation to ~28°.
 */
export const TURN_FACTOR = 0.35;

/** Facing snaps instead of lerping when already this closely aligned. */
const TURN_SNAP_DOT = 0.9995;

/** Ticks to reach full move speed from standstill (start/stop jerk removal). */
export const ACCEL_TICKS = 3;

/**
 * Rotate `facing` toward unit direction `desired` by one bounded nlerp step:
 * facing' = normalize(lerp(facing, goal, k)). When the two are nearly opposite
 * (dot < -0.95) the lerp degenerates (sum ~ 0), so the goal is replaced by the
 * perpendicular on the turn side (sign of cross; counter-clockwise on exact
 * 180°) — the unit pivots through 90° deterministically. NO trig.
 */
export function turnToward(facing: Vec2, desired: Vec2, k: number = TURN_FACTOR): Vec2 {
  if (lenSq(desired) < 1e-12) return facing;
  if (lenSq(facing) < 1e-12) return desired; // degenerate current facing
  const d = dot(facing, desired);
  if (d >= TURN_SNAP_DOT) return desired; // aligned: settle exactly
  let goal = desired;
  if (d < -0.95) {
    const p = perp(facing);
    goal = cross(facing, desired) >= 0 ? p : scale(p, -1);
  }
  const out = normalize({
    x: facing.x + (goal.x - facing.x) * k,
    z: facing.z + (goal.z - facing.z) * k,
  });
  return out.x === 0 && out.z === 0 ? desired : out;
}

export function movementSystem(world: SimWorld): void {
  const dt = world.dt;

  for (const [id, t] of world.transform) {
    if (world.projectile.has(id)) continue; // projectiles integrate in their own system
    const nav = world.nav.get(id);
    if (!nav) continue;
    const hp = world.health.get(id);
    if (hp && !hp.alive) {
      t.vel = { x: 0, z: 0 };
      continue;
    }

    // Combat-juice HITSTOP: freeze the whole body — including any dash/knockback
    // override — for the freeze window, so the on-impact "hold" reads before the
    // knockback slide plays out. Deterministic (see SimWorld.hitstop docs).
    if ((world.hitstop.get(id) ?? 0) > 0) {
      t.vel = { x: 0, z: 0 };
      continue;
    }

    // Status: root/stun stop movement; slows scale speed; stun also freezes
    // turning (rooted units may still rotate in place, LoL-style).
    let speedMult = 1;
    let rooted = false;
    let stunned = false;
    const st = world.status.get(id);
    if (st) {
      for (const e of st.effects) {
        if (e.expiresAtTick <= world.tick) continue;
        if (e.root || e.stun) rooted = true;
        if (e.stun) stunned = true;
        if (e.moveSpeedMult !== undefined) speedMult *= e.moveSpeedMult;
      }
    }
    // Casting an ability with cast time roots the caster (channel lock).
    const abComp = world.abilities.get(id);
    if (abComp?.cast?.rooted) rooted = true;
    // Post-resolve RECOVERY roots ONLY when the ability opted in
    // (`recoveryRoots: true`). The default deliberately leaves footwork free —
    // startup already hard-roots, and stacking a second root on every ability
    // press reads as a frozen game. See abilities/abilityRecovery.ts DECISION 2.
    if (abComp?.recovery && abComp.recovery.roots && abComp.recovery.ticksLeft > 0) rooted = true;
    // Knockdown (prone): rooted like a hard CC. The knockback override is
    // evaluated below BEFORE normal steering, so the victim still slides out,
    // then lies grounded until the getup. Turning is frozen too (stunned).
    if ((world.knockdown.get(id) ?? 0) > 0) {
      rooted = true;
      stunned = true;
    }

    const zone = world.arena.zones[t.zone] ?? world.arena.zones[0]!;

    // 1) Movement override (dash/knockback) — ignores root by design (dashes
    //    committed before CC still complete; knockbacks are forced).
    if (nav.override) {
      const ov = nav.override;
      const stepLen = Math.min(ov.speed * dt, ov.remaining);
      const delta = scale(ov.dir, stepLen);
      const before = { x: t.pos.x, z: t.pos.z };
      const body = { pos: t.pos, radius: t.radius };
      moveWithCollision(body, delta, zone);
      t.pos = body.pos;
      ov.remaining -= stepLen;
      const moved = len(sub(t.pos, before));
      // Dash stopped early by a wall → end the dash.
      if (moved + 1e-6 < stepLen || ov.remaining <= 1e-6) nav.override = null;
      // Velocity is what the body ACTUALLY did (see the note in step 2).
      t.vel = scale(sub(t.pos, before), 1 / dt);
      continue;
    }

    // 2) Normal steering toward moveTarget.
    let moved = false;
    if (nav.moveTarget && !rooted) {
      const to = sub(nav.moveTarget, t.pos);
      const d = len(to);
      if (d > 1e-6) {
        moved = true;
        const baseSpeed = world.stats.get(id)?.final[Stat.MoveSpeed] || BASE_MOVE_SPEED;
        // acceleration ramp: full speed reached over ACCEL_TICKS ticks
        const ramp = Math.min(1, (t.accel ?? 0) + 1 / ACCEL_TICKS);
        t.accel = ramp;
        const speed = baseSpeed * speedMult * ramp;
        const stepLen = Math.min(speed * dt, d);
        // Steer AROUND a pillar standing in the way. Collision alone can only
        // push a body out of a wall, never past one, so a unit whose target sits
        // straight behind an obstacle used to cancel its whole step every tick
        // and freeze on the spot (the zone-centre pillar sits exactly between
        // the two middle spawns). Re-evaluated every tick, stateless.
        const dir = steerAroundObstacles(
          t.pos,
          t.radius,
          { x: to.x / d, z: to.z / d },
          d,
          zone.obstacles,
        );
        // body turns toward the move direction; motion is the ordered direction
        t.facing = turnToward(t.facing, dir);
        const before = { x: t.pos.x, z: t.pos.z };
        const body = { pos: t.pos, radius: t.radius };
        moveWithCollision(body, scale(dir, stepLen), zone);
        t.pos = body.pos;
        // Velocity is the ACTUAL post-collision displacement, never the intent:
        // a blocked unit must not report 5.8 u/s while standing still, or the
        // animation layer (and any future stuck-detection) is lied to.
        t.vel = scale(sub(t.pos, before), 1 / dt);
      }
    }
    if (!moved) {
      t.vel = { x: 0, z: 0 };
      t.accel = 0;
      // standing still (e.g. attacking in range): keep turning toward the
      // attack target so autos/aim read correctly; stun freezes rotation too.
      if (!stunned && nav.attackTarget !== null) {
        const tgt = world.transform.get(nav.attackTarget);
        if (tgt && tgt.zone === t.zone) {
          const toTgt = sub(tgt.pos, t.pos);
          if (lenSq(toTgt) > 1e-12) t.facing = turnToward(t.facing, normalize(toTgt));
        }
      }
    }
  }

  // 4) Unit-vs-unit soft separation within each zone (ascending id pairs via
  //    the spatial grid; grid returns sorted ids).
  for (const [id, t] of world.transform) {
    if (world.projectile.has(id)) continue;
    // revive circles are ground area, not bodies — they never push and are
    // never pushed (they are also absent from the grid, so the inner loop
    // can never see one either)
    if (world.reviveCircle.has(id)) continue;
    const hp = world.health.get(id);
    if (hp && !hp.alive) continue;
    const near = world.grid.queryCircle(t.pos, t.radius + 2);
    for (const otherId of near) {
      if (otherId <= id) continue; // each pair once, ordered
      if (world.projectile.has(otherId)) continue;
      const o = world.transform.get(otherId);
      if (!o || o.zone !== t.zone) continue;
      const oHp = world.health.get(otherId);
      if (oHp && !oHp.alive) continue;
      // STATIC props (flowers + neutral guardians, task #89): units are pushed
      // out of them like a soft pillar but the prop itself never moves. A
      // guardian is authoritative terrain placed at the zone centre by
      // GuardianSystem — it must stay put even when a champion body overlaps it.
      const aStatic = world.flower.has(id) || world.structure.has(id);
      const bStatic = world.flower.has(otherId) || world.structure.has(otherId);
      if (aStatic && bStatic) continue;
      if (aStatic || bStatic) {
        const anchor = aStatic ? t : o;
        const mover = aStatic ? { pos: o.pos, radius: o.radius } : { pos: t.pos, radius: t.radius };
        pushOutOfObstacle(mover, { kind: "circle", center: anchor.pos, radius: anchor.radius });
        if (aStatic) o.pos = mover.pos;
        else t.pos = mover.pos;
        continue;
      }
      const a = { pos: t.pos, radius: t.radius };
      const b = { pos: o.pos, radius: o.radius };
      separatePair(a, b, 0.6);
      t.pos = a.pos;
      o.pos = b.pos;
    }
  }

  // Post-separation: never leave anyone inside a wall or outside the boundary.
  for (const [id, t] of world.transform) {
    if (world.projectile.has(id)) continue;
    if (world.reviveCircle.has(id)) continue; // stays exactly on the corpse
    // Neutral guardians (task #89) are authoritative fixed terrain: never shove
    // them out of an obstacle or clamp them — GuardianSystem places one at the
    // zone CENTRE, which legitimately coincides with the centre pillar, and a
    // push-out would eject it ~one body-width off its post every combat tick.
    if (world.structure.has(id)) continue;
    const zone = world.arena.zones[t.zone] ?? world.arena.zones[0]!;
    const body = { pos: t.pos, radius: t.radius };
    for (const ob of zone.obstacles) pushOutOfObstacle(body, ob);
    clampToBoundary(body, zone);
    t.pos = body.pos;
  }
}

/** Helper for abilities: begin a dash override on an entity. */
export function startDash(
  world: SimWorld,
  id: import("../../ids").EntityId,
  dir: { x: number; z: number },
  speed: number,
  distance: number,
): void {
  const nav = world.nav.get(id);
  if (!nav) return;
  const d = normalize(dir);
  if (d.x === 0 && d.z === 0) return;
  nav.override = { kind: "dash", dir: d, speed, remaining: distance };
}

/** Predictive helper used by aiming: where will a target be after `secs`? */
export function extrapolate(pos: { x: number; z: number }, vel: { x: number; z: number }, secs: number): { x: number; z: number } {
  return addScaled(pos, vel, secs);
}

/** Whether `vel` is moving toward `point` (used by AI kiting later). */
export function movingToward(pos: { x: number; z: number }, vel: { x: number; z: number }, point: { x: number; z: number }): boolean {
  return dot(vel, sub(point, pos)) > 0;
}
