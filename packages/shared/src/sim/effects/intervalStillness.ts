import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { ModifierSource } from "../stats/modifiers";
import { bodyMoved, bodyPosition, type BodyPosition } from "../movement/bodyPosition";

export interface StillnessSample extends BodyPosition { tick: number; since: number; round: number }
/** Sample every interval event, including events blocked by the ordinary ICD.
 * Missed ticks (death/intermission), new rounds and any actual motion restart
 * the waiting window. No wall clock, RNG or extra periodic payout scheduler.
 */
export function intervalStillness(world: SimWorld, owner: EntityId, src: ModifierSource, hi: number, seconds: number): boolean {
  const position = bodyPosition(world, owner);
  if (!position || !world.combatActive || world.settledZones.has(position.zone)) {
    if (src.hookStillness) src.hookStillness[hi] = undefined;
    return false;
  }
  const samples = src.hookStillness ?? (src.hookStillness = []);
  const before = samples[hi];
  const continued = before && before.tick >= world.tick - 1 && before.tick <= world.tick &&
    before.round === world.round && !bodyMoved(before, position);
  const sample = { ...position, tick: world.tick, since: continued ? before.since : world.tick, round: world.round };
  samples[hi] = sample;
  return world.tick - sample.since >= Math.max(1, Math.ceil(seconds / world.dt));
}
