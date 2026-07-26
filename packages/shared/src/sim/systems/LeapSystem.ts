/**
 * LeapSystem (task #247) — owns the whole parabolic arc: planar position,
 * height, and the landing detonation. Runs IMMEDIATELY BEFORE movementSystem,
 * which then sees `nav.override.kind === "leap"` and skips the body entirely.
 *
 * TERRAIN CROSSING IS THE POINT, so for the whole flight the body is out of the
 * planar physics world:
 *   1. no per-tick collision — `t.pos` is written ABSOLUTELY from `leapPosAt`;
 *      `moveWithCollision` (the call that stops a body at a wall) is never made,
 *      and `steerAroundObstacles` is never consulted (MovementSystem's override
 *      branch precedes its steering branch, exactly as for a dash today),
 *   2. not separated and does not separate — the unit-vs-unit pass skips
 *      airborne bodies on BOTH loops (a body 11 units up must neither shove
 *      someone standing underneath nor be shoved off its arc),
 *   3. not pushed out / not clamped mid-flight — the post-separation pass skips
 *      airborne bodies too (a leap over a pillar that pushed out every tick
 *      would be teleported sideways at apex),
 *   4. on the LANDING tick the body re-enters physics normally — and that pass
 *      is a no-op, because `to` was already relaxed at takeoff and
 *      `leapPosAt(N,N)` returns it verbatim. Asserted in leap.test.ts, not
 *      assumed.
 *
 * Import direction: this file imports effectRunner (the landing must run
 * effects) and movement/leap.ts; NOTHING imports it back, so the
 * effectRunner → MovementSystem cycle stays broken.
 */
import type { SimWorld } from "../SimWorld";
import type { EntityId } from "../../ids";
import { runEffects } from "../effects/effectRunner";
import { fireHooks } from "../effects/hooks";
import { enemiesInCircle, resolveAbilityRadius } from "../abilities/abilitySystem";
import { leapHeightAt, leapPosAt, cancelLeap } from "../movement/leap";
import { sub, scale, normalize, lenSq } from "../math/vec2";

export function leapSystem(world: SimWorld): void {
  // id order (world.transform is the same ordered store MovementSystem walks)
  for (const [id, t] of world.transform) {
    const nav = world.nav.get(id);
    const ov = nav?.override;
    if (!ov || ov.kind !== "leap") continue;

    // Death mid-air: drop to the floor on the death tick so the #220 dissolve
    // plays on the ground. `onLand` deliberately does NOT run — a killed leaper
    // deals no landing damage.
    const hp = world.health.get(id);
    if (hp && !hp.alive) {
      cancelLeap(world, id);
      continue;
    }

    // Combat-juice HITSTOP freezes the arc: `elapsed` does not advance, so the
    // body hangs mid-air for the freeze window and resumes on the EXACT same
    // curve — a direct benefit of the absolute-parametric formulation (the arc
    // is a pure function of `elapsed`, not of accumulated motion).
    if ((world.hitstop.get(id) ?? 0) > 0) {
      t.vel = { x: 0, z: 0 };
      continue;
    }

    ov.elapsed++;
    const k = ov.elapsed;
    const N = ov.ticks;
    const before = { x: t.pos.x, z: t.pos.z };
    t.pos = leapPosAt(ov.from, ov.to, k, N);
    t.vel = scale(sub(t.pos, before), 1 / world.dt);
    // face the direction of travel (a vertical inPlace leap keeps its facing)
    const travel = sub(ov.to, ov.from);
    if (lenSq(travel) > 1e-12) t.facing = normalize(travel);

    if (k < N) {
      world.airborne.set(id, { y: leapHeightAt(k, N, ov.apexMilli), scaleMul: 1 });
      continue;
    }

    // ---- LANDING TICK ----
    // Height is exactly 0 here (branch, not arithmetic) and `t.pos` is
    // bit-identical to the point proved legal at takeoff.
    world.airborne.delete(id);
    nav.override = null;
    detonate(world, id, ov.casterId, ov.landRadius, ov.rank, ov.origin, ov.onLand, ov.slot);
  }
}

function detonate(
  world: SimWorld,
  flyerId: EntityId,
  casterId: EntityId,
  landRadius: number,
  rank: number,
  origin: string,
  onLand: import("../effects/effect").EffectDef[],
  slot: import("../intents").CastableSlot | undefined,
): void {
  const t = world.transform.get(flyerId);
  if (!t) return;
  const point = { x: t.pos.x, z: t.pos.z };
  // The discrete 爆裂 cue for the impact — the SAME `explosion` event
  // CastResolveSystem emits for a ground blast, so the client's existing
  // handler plays the WarStomp/ThunderClap pair the JASS plays at j:34288.
  world.emit("explosion", { caster: casterId, abilityId: origin, x: point.x, z: point.z });
  if (onLand.length === 0) return;
  // combat-env `abilityRange` (#136) shrinks the landing AoE through the same
  // seam as every other ability radius, so displayed == actual.
  const targets =
    landRadius > 0
      ? enemiesInCircle(world, casterId, point, resolveAbilityRadius(world, landRadius))
      : [];
  runEffects(onLand, {
    world,
    caster: casterId,
    rank,
    targets,
    point,
    origin,
    ...(slot !== undefined ? { abilitySlot: slot } : {}),
    rng: world.rng,
  });
  for (const hitId of targets) {
    if (hitId !== casterId) fireHooks(world, casterId, "onAbilityHit", hitId, slot);
  }
}
