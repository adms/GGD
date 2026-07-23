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

/** One field where a champion's embedded ability copy disagrees with the standalone doc. */
export interface AbilityMirrorDrift {
  readonly championId: string;
  readonly slot: "Q" | "W" | "E" | "R";
  readonly abilityId: string;
  readonly field: string;
  /** value in content/abilities/<id>.json — the one that now wins at runtime */
  readonly standalone: unknown;
  /** value in content/champions/<id>.json `abilities[slot]` — ignored unless the standalone omits it */
  readonly embedded: unknown;
}

/**
 * Find every field where a champion's embedded ability copy disagrees with the
 * standalone ability doc (the MIRROR RULE the content editor enforces on save,
 * and that any hand edit to one file alone breaks).
 *
 * Since `registerChampion` made the standalone doc authoritative this no longer
 * changes what the sim does — but it is still worth shouting about, because the
 * embedded copy is what a stale champion doc will keep showing anywhere that
 * reads `Champions.get(id).abilities[slot]` off a doc that never went through
 * registration (raw-doc consumers: the codex browser, the admin content page).
 *
 * Pure: takes the store, mutates nothing.
 */
export function auditAbilityMirrorDrift(store: ContentStore): AbilityMirrorDrift[] {
  const standalone = new Map<string, Record<string, unknown>>();
  for (const d of store.all<AbilityDef>("abilities")) {
    standalone.set(d.id, d as unknown as Record<string, unknown>);
  }

  const out: AbilityMirrorDrift[] = [];
  for (const champ of store.all<ChampionDef>("champions")) {
    for (const slot of ["Q", "W", "E", "R"] as const) {
      const emb = champ.abilities[slot] as unknown as Record<string, unknown> | undefined;
      if (!emb) continue;
      const std = standalone.get(champ.abilities[slot]!.id);
      if (!std) continue; // embedded-only ability: nothing to disagree with
      for (const field of [...new Set([...Object.keys(std), ...Object.keys(emb)])].sort()) {
        if (field === "schema") continue; // only the standalone doc carries a schema tag
        const a = std[field];
        const b = emb[field];
        if (a === b || stable(a) === stable(b)) continue;
        out.push({
          championId: champ.id,
          slot,
          abilityId: champ.abilities[slot]!.id,
          field,
          standalone: a,
          embedded: b,
        });
      }
    }
  }
  return out;
}

/** Order-insensitive-enough structural compare for drift detection. */
function stable(v: unknown): string {
  return JSON.stringify(v) ?? "undefined";
}

/**
 * Register every loaded doc.
 *
 * ORDER IS LOAD-BEARING: standalone `abilities` go in BEFORE `champions`, and
 * `registerChampion` will not overwrite an ability that is already registered
 * (it only fills fields the standalone doc omits). That is what makes
 * `content/abilities/<id>.json` the source of truth rather than the
 * denormalised copy embedded in the champion doc. See `registerChampion`.
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
