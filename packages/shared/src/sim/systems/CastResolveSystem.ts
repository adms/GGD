/**
 * CastResolveSystem — ticks down in-progress ability casts (cast time > 0) and
 * fires their effects deterministically when the wind-up elapses. Runs BEFORE
 * commandSystem so a cast begun on tick T resolves exactly round(ct/dt) ticks
 * later, and a cast that finishes this tick clears its root before movement.
 *
 * Interrupt: a stunned or dead caster loses the cast (mana already spent at
 * cast-begin, LoL-style — no refund). No effects fire on an interrupt.
 */
import type { SimWorld } from "../SimWorld";
import { Abilities } from "../content/registry";
import { runEffects } from "../effects/effectRunner";
import { fireHooks } from "../effects/hooks";
import { enemiesInCircle, resolveAbilityRadius } from "../abilities/abilitySystem";
import { armRecovery } from "../abilities/abilityRecovery";

export function castResolveSystem(world: SimWorld): void {
  for (const [id, ab] of world.abilities) {
    const cast = ab.cast;
    if (!cast) continue;

    const hp = world.health.get(id);
    const st = world.status.get(id);
    const stunned = st?.effects.some((e) => e.stun && e.expiresAtTick > world.tick) ?? false;

    // interrupt: death, stun, or a knockdown cancels the cast (mana stays spent)
    if (!hp?.alive || stunned || (world.knockdown.get(id) ?? 0) > 0) {
      ab.cast = null;
      world.emit("castInterrupt", { caster: id, slot: cast.slot, abilityId: cast.abilityId });
      continue;
    }

    // Combat-juice hitstop PAUSES the cast wind-up (a mid-channel hit hitches
    // the animation) without interrupting it or refunding — resumes after.
    if ((world.hitstop.get(id) ?? 0) > 0) continue;
    // Combat-juice HITSTUN (victim-only) also pauses the cast: the defender is
    // action-locked past the shared freeze (frame advantage) so a mid-channel
    // hit hitches the wind-up longer for the one who got hit. No refund/
    // interrupt — resumes after. See combat/damage.ts.
    if ((world.hitstun.get(id) ?? 0) > 0) continue;

    cast.ticksLeft--;
    if (cast.ticksLeft > 0) continue;

    // wind-up elapsed — resolve.
    ab.cast = null;
    const def = Abilities.get(cast.abilityId);
    // GROUND AoE: re-query the circle NOW instead of trusting the membership
    // snapshotted at cast-begin. With a cast time the snapshot hit whoever
    // stood there when the key was pressed even if they walked out, and missed
    // anyone who walked in — an AoE that ignores the telegraph it just drew.
    // Everything else (targeted / self / skillshot / dash) keeps its resolved
    // target: those are locked at cast-begin by design.
    const targets =
      def.castType === "ground" && cast.point
        ? // combat-env `abilityRange` (task #136) shrinks the resolve-time AoE too
          enemiesInCircle(world, id, cast.point, resolveAbilityRadius(world, def.radius ?? 1))
        : cast.targets;
    runEffects(def.effects, {
      world,
      caster: id,
      rank: cast.rank,
      targets,
      point: cast.point,
      direction: cast.direction,
      origin: `ability:${cast.abilityId}`,
      abilitySlot: cast.slot,
      rng: world.rng,
    });
    fireHooks(world, id, "onAbilityCast", targets[0], cast.slot);
    for (const hitId of targets) {
      if (hitId !== id) fireHooks(world, id, "onAbilityHit", hitId, cast.slot);
    }
    world.emit("castEnd", { caster: id, slot: cast.slot, abilityId: cast.abilityId });
    // RECOVERY begins at the END of startup — this tick, never later. Effects
    // above only QUEUED their damage; combatResolveSystem drains it later in
    // the SAME tick (step 8), so a connect cancels this recovery immediately.
    armRecovery(world, id, cast.slot, def, targets);
  }
}
