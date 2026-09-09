import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { AbilityDef } from "../content/defs";
import { consumableStatusStacks } from "../statusConsumption";

/** Snapshot the cost once before validation/payment. A stance changes the
 * price, never the shared ability instance or its running cooldown. */
export function resolveStatusCost(world: SimWorld, caster: EntityId, cost: AbilityDef["statusCost"]): AbilityDef["statusCost"] {
  const rule = cost?.countWhileStatus;
  if (!cost || !rule) return cost;
  return consumableStatusStacks(world, caster, rule.statusId, rule.appliedBy === "self" ? caster : undefined) > 0
    ? { ...cost, count: rule.count } : cost;
}
