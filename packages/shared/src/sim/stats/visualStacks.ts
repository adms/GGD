/**
 * VISIBLE STACKS (task #244) — how many stacks on an entity are meant to be
 * SEEN, summed across every `ModifierSource` the content flagged
 * `applyBuff.stackVisual`.
 *
 * Champion-agnostic on purpose: the CONTENT declares a stack visible, so any
 * future "the silhouette grows as you earn it" mechanic gets the same treatment
 * without touching netcode or adding a per-champion branch. The snapshot turns
 * the number into two `ENTITY_FLAG` threshold bits (see `GROWTH_TIER_STACKS`).
 *
 * Pure read: no allocation beyond the accumulator, no rng, no wall clock, and
 * expired sources are skipped with the same `expiresAtTick <= world.tick` test
 * `recomputeStats` uses, so the count can never disagree with the stats.
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";

export function visualStackCount(world: SimWorld, id: EntityId): number {
  const sc = world.stats.get(id);
  if (!sc) return 0;
  let n = 0;
  for (const src of sc.sources) {
    if (src.visualStacks !== true) continue;
    if (src.expiresAtTick !== undefined && src.expiresAtTick <= world.tick) continue;
    n += src.stacks ?? 1;
  }
  return n;
}
