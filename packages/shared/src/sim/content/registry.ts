/**
 * Content registries — the lookup seam between the sim and content data.
 * The sim only ever reads via these; how they're populated (TS literals now,
 * JSON ContentLoader later) is invisible to engine code.
 */
import type { AbilityId, AugmentId, ChampionId, ItemId, ProjectileId } from "../../ids";
import type { AbilityDef, AugmentDef, ChampionDef, ItemDef, LootTable, ProjectileDef } from "./defs";

class Registry<K extends string, V> {
  private map = new Map<K, V>();

  register(id: K, v: V): void {
    this.map.set(id, v);
  }
  get(id: K): V {
    const v = this.map.get(id);
    if (!v) throw new Error(`content not registered: ${id}`);
    return v;
  }
  tryGet(id: K): V | undefined {
    return this.map.get(id);
  }
  all(): V[] {
    return [...this.map.values()];
  }
  ids(): K[] {
    return [...this.map.keys()];
  }
  clear(): void {
    this.map.clear();
  }
}

export const Champions = new Registry<ChampionId, ChampionDef>();
export const Abilities = new Registry<AbilityId, AbilityDef>();
export const Items = new Registry<ItemId, ItemDef>();
export const Augments = new Registry<AugmentId, AugmentDef>();
export const Projectiles = new Registry<ProjectileId, ProjectileDef>();
export const LootTables = new Registry<string, LootTable>();

export function registerChampion(def: ChampionDef): void {
  Champions.register(def.id, def);
  for (const slot of ["Q", "W", "E", "R"] as const) {
    Abilities.register(def.abilities[slot].id, def.abilities[slot]);
  }
}
