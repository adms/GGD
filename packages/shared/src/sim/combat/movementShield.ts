import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { bodyMoved, bodyPosition } from "../movement/bodyPosition";

/** Ending this pool is expiration, not a hostile shield-break trigger. Other
 * shields retain their identity, credit, amount and deadline.
 */
export function expireMovedShields(world: SimWorld, target?: EntityId): void {
  const ids = target === undefined ? world.health.keys() : [target];
  for (const id of ids) {
    const hp = world.health.get(id);
    if (!hp) continue;
    for (const shield of hp.shields) {
      if (!shield.moveBreakAnchor || shield.expiresAtTick <= world.tick) continue;
      const now = bodyPosition(world, id);
      if (!hp.alive || !now || bodyMoved(shield.moveBreakAnchor, now)) shield.expiresAtTick = world.tick;
    }
  }
}
