/**
 * Ability passives — the sync between `AbilityDef.passive` and the entity's
 * `ModifierSource` list.
 *
 * WC3's permanent passives (Critical Strike `AOcr`, Bash `AHbh`, the aura
 * family `AOae`/`AHab`, the attribute buttons `Aamk` …) have `Cool = 0`: they
 * are never cast, they are simply ON once the hero has learned them, and their
 * columns are authored per ability LEVEL. This module is the whole port:
 *
 *   rank 0            -> no source
 *   rank N (N >= 1)   -> one source `abilityPassive:<abilityId>` carrying
 *                        `passive.ranks[N-1]` (clamped to the last entry)
 *
 * It reuses `attachSource`/`detachSource`, so passives ride the same stat
 * pipeline and hook dispatch as items and augments — no new code path, nothing
 * to keep in sync at damage time, and the sync is a pure function of the
 * ability ranks (deterministic, replay-safe).
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { AbilityDef } from "../content/defs";
import type { ModifierSource } from "../stats/modifiers";
import { Abilities } from "../content/registry";
import { attachSource, detachSource } from "../stats/statPipeline";

/** Stable, collision-free source id for one ability's passive. */
export function abilityPassiveSourceId(abilityId: string): string {
  return `abilityPassive:${abilityId}`;
}

/** True when the ability can only ever be passive (no castable effects). */
export function isPassiveOnly(def: AbilityDef): boolean {
  return def.passive !== undefined && def.effects.length === 0;
}

function rankBlock(def: AbilityDef, rank: number): ModifierSource | null {
  const p = def.passive;
  if (!p || rank <= 0 || p.ranks.length === 0) return null;
  const block = p.ranks[Math.min(rank, p.ranks.length) - 1]!;
  if (!block.modifiers?.length && !block.hooks?.length) return null;
  return {
    id: abilityPassiveSourceId(def.id),
    kind: "passive",
    ...(block.modifiers ? { modifiers: block.modifiers } : {}),
    ...(block.hooks ? { hooks: block.hooks } : {}),
  };
}

/**
 * Reconcile every ability-passive source on `id` with the entity's CURRENT
 * ability ranks. Idempotent: safe to call on spawn, on rank-up and on EX
 * unlock. Iterates Q/W/E/R then EX in fixed order so the `sources` array (and
 * therefore Override resolution + hook firing order) is deterministic.
 */
export function syncAbilityPassives(world: SimWorld, id: EntityId): void {
  const ab = world.abilities.get(id);
  if (!ab) return;

  const instances: { abilityId: string; rank: number }[] = [];
  for (const slot of ["Q", "W", "E", "R"] as const) {
    const inst = ab.slots[slot];
    instances.push({ abilityId: inst.abilityId, rank: inst.rank });
  }
  if (ab.exSlot) instances.push({ abilityId: ab.exSlot.abilityId, rank: ab.exSlot.rank });

  for (const inst of instances) {
    const def = Abilities.tryGet(inst.abilityId as never) as AbilityDef | undefined;
    if (!def?.passive) continue;
    const want = rankBlock(def, inst.rank);
    const sourceId = abilityPassiveSourceId(def.id);
    // Always detach first: a rank-up must REPLACE the previous rank's block,
    // never stack with it.
    detachSource(world, id, sourceId);
    if (want) attachSource(world, id, want);
  }
}
