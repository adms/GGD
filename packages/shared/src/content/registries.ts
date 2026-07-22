/**
 * Content-side registries for the NEW collections (arenas/config/models/vfx/
 * status-effects) + `registerAll`, which pushes a loaded ContentStore into
 * BOTH the existing sim registries (their register() API unchanged) and these.
 */
import {
  Abilities,
  Augments,
  Items,
  LootTables,
  Projectiles,
  registerChampion,
} from "../sim/content/registry";
import type {
  AbilityDef,
  AugmentDef,
  ChampionDef,
  ItemDef,
  LootTable,
  ProjectileDef,
} from "../sim/content/defs";
import type { ContentStore } from "./store";
import type { ArenaDoc } from "./schema/arena";
import type { ConfigDoc } from "./schema/config";
import type { ModelDoc } from "./schema/model";
import type { AnyVfxDoc, RibbonDoc, VfxDoc } from "./schema/vfx";
import type { StatusEffectDoc } from "./schema/statusEffect";
import type { SkinDoc } from "./schema/skin";

class ContentRegistry<V extends { id: string }> {
  private map = new Map<string, V>();

  register(v: V): void {
    this.map.set(v.id, v);
  }
  get(id: string): V {
    const v = this.map.get(id);
    if (!v) throw new Error(`content not registered: ${id}`);
    return v;
  }
  tryGet(id: string): V | undefined {
    return this.map.get(id);
  }
  all(): V[] {
    return [...this.map.values()];
  }
  ids(): string[] {
    return [...this.map.keys()];
  }
  clear(): void {
    this.map.clear();
  }
}

export const Arenas = new ContentRegistry<ArenaDoc>();
export const Configs = new ContentRegistry<ConfigDoc>();
export const Models = new ContentRegistry<ModelDoc>();
export const VfxDefs = new ContentRegistry<VfxDoc>();
/** ribbon@1 docs (same `vfx` collection, split out at registration). */
export const RibbonDefs = new ContentRegistry<RibbonDoc>();
export const StatusEffects = new ContentRegistry<StatusEffectDoc>();
export const Skins = new ContentRegistry<SkinDoc>();

/**
 * Register every loaded doc. Leaf collections first; champions go through
 * `registerChampion` so their embedded abilities land in the Abilities
 * registry exactly as the TS-literal path did.
 */
export function registerAll(store: ContentStore): void {
  for (const d of store.all<ProjectileDef>("projectiles")) Projectiles.register(d.id, d);
  for (const d of store.all<ItemDef>("items")) Items.register(d.id, d);
  for (const d of store.all<AugmentDef>("augments")) Augments.register(d.id, d);
  for (const d of store.all<AbilityDef>("abilities")) Abilities.register(d.id, d);
  for (const d of store.all<ChampionDef>("champions")) registerChampion(d);
  for (const d of store.all<LootTable>("loot-tables")) LootTables.register(d.id, d);
  for (const d of store.all<ArenaDoc>("arenas")) Arenas.register(d);
  for (const d of store.all<ConfigDoc>("config")) Configs.register(d);
  for (const d of store.all<ModelDoc>("models")) Models.register(d);
  for (const d of store.all<AnyVfxDoc>("vfx")) {
    if (d.schema === "ribbon@1") RibbonDefs.register(d);
    else VfxDefs.register(d);
  }
  for (const d of store.all<StatusEffectDoc>("status-effects")) StatusEffects.register(d);
  for (const d of store.all<SkinDoc>("skins")) Skins.register(d);
}
