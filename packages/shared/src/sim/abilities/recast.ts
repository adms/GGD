import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { AbilityDef } from "../content/defs";
import type { AbilityInstance } from "../stats/statsComp";

/** Input-driven continuation: each accepted press resolves exactly one stage.
 * The ordinary cooldown starts with stage one and continues underneath the
 * window. Finishing, expiry and interruption never refund or reset that clock. */
export function recastInterrupted(world: SimWorld, caster: EntityId): boolean {
  return !world.health.get(caster)?.alive ||
    world.settledZones.has(world.transform.get(caster)?.zone ?? -1) ||
    (world.knockdown.get(caster) ?? 0) > 0 ||
    !!world.status.get(caster)?.effects.some(s => s.expiresAtTick > world.tick &&
      (s.stun || s.silenced || s.root || s.feared));
}

export function currentRecast(world: SimWorld, caster: EntityId, inst: AbilityInstance, def: AbilityDef) {
  const state = inst.recast;
  if (!state) return undefined;
  if (!def.recast || state.abilityId !== inst.abilityId || state.rank !== inst.rank ||
      state.nextStage > def.recast.stages.length || state.expiresAt <= world.tick || recastInterrupted(world, caster)) {
    return undefined;
  }
  return state;
}

/** Called only after a stage resolves, including a miss. No timer executes a stage. */
export function advanceRecast(world: SimWorld, caster: EntityId, inst: AbilityInstance,
  def: AbilityDef, stage: number): void {
  if (!def.recast) return;
  delete inst.recast;
  if (inst.abilityId !== def.id || stage >= def.recast.stages.length || recastInterrupted(world, caster)) return;
  inst.recast = { abilityId: inst.abilityId, rank: inst.rank, nextStage: stage + 1,
    readyAt: world.tick + Math.max(1, Math.ceil(def.recast.minIntervalSec / world.dt)),
    expiresAt: world.tick + Math.ceil(def.recast.windowSec / world.dt) };
}

/** Authoritative projection shared by server snapshots and cast validation. */
export function recastView(world: SimWorld, caster: EntityId, inst: AbilityInstance, def: AbilityDef) {
  const state = currentRecast(world, caster, inst, def);
  return { stage: state ? state.nextStage + 1 : 0,
    windowTicks: state ? Math.max(0, state.expiresAt - world.tick) : 0,
    cooldownTicks: state ? Math.max(0, state.readyAt - world.tick) : inst.cooldownRemainingTicks,
    free: !!state && def.recast?.cost === "first" };
}
