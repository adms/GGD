/**
 * RecoverySystem — ages the caster's post-resolve commitment (後搖) and applies
 * the same interrupts a cast gets. See `abilities/abilityRecovery.ts` for the
 * design (hit-cancels-recovery = the combo system).
 *
 * PLACEMENT (step 2a — BEFORE castResolveSystem, so before anything can arm a
 * fresh recovery this tick). Consequence, and it is the exact mirror of the
 * hitstop/hitstun convention in HitstopSystem:
 *
 *   armed with N ticks on tick T  ->  aged on ticks T+1 .. T+N  ->  free at T+N.
 *
 * So the gates in `castAbility` (via commandSystem, step 3), `basicAttackSystem`
 * (step 6) and `movementSystem` (step 5, only when `roots`) refuse on exactly N
 * ticks, never N-1.
 *
 * INTERRUPT — death, stun and knockdown clear the recovery outright, matching
 * CastResolveSystem's interrupt set. The caster is in a strictly worse state
 * already (dead / hard-CC'd); holding the commitment on top would double-punish
 * and would also survive the CC, leaving them locked out after they got up.
 *
 * HITSTOP PAUSES it (does not clear it), same as a cast wind-up: during the
 * shared on-impact freeze the whole body is held, so draining the recovery
 * clock through a frame nothing else advances in would be a free refund.
 * HITSTUN deliberately does NOT pause it — hitstun is its own victim-side
 * action lock and simply overlaps; extending recovery because you got hit would
 * punish the same mistake twice.
 *
 * Deterministic: integer decrements, per-entity independent, iteration order
 * irrelevant. No wall-clock, no rng.
 */
import type { SimWorld } from "../SimWorld";

export function recoveryDecaySystem(world: SimWorld): void {
  for (const [id, ab] of world.abilities) {
    const rec = ab.recovery;
    if (!rec) continue;

    const hp = world.health.get(id);
    const st = world.status.get(id);
    const stunned = st?.effects.some((e) => e.stun && e.expiresAtTick > world.tick) ?? false;
    if (!hp?.alive || stunned || (world.knockdown.get(id) ?? 0) > 0) {
      ab.recovery = null;
      world.emit("recoveryEnd", {
        caster: id,
        slot: rec.slot,
        abilityId: rec.abilityId,
        reason: "interrupt",
        ticksSaved: rec.ticksLeft,
      });
      continue;
    }

    // shared on-impact freeze: hold the clock, do not refund it
    if ((world.hitstop.get(id) ?? 0) > 0) continue;

    rec.ticksLeft--;
    if (rec.ticksLeft <= 0) {
      ab.recovery = null;
      world.emit("recoveryEnd", {
        caster: id,
        slot: rec.slot,
        abilityId: rec.abilityId,
        reason: "elapsed",
        ticksSaved: 0,
      });
    }
  }
}
