/**
 * The collection table — one Zod schema per collection. Every document is
 * `{ id, schema: "<tag>@1", ...payload }` stored at `content/<collection>/<id>.json`
 * (filename stem == id).
 */
import { z } from "zod";
import { zChampionDoc } from "./champion";
import { zAbilityDoc } from "./ability";
import { zItemDoc } from "./item";
import { zAugmentDoc } from "./augment";
import { zProjectileDoc } from "./projectile";
import { zStatusEffectDoc } from "./statusEffect";
import { zLootTableDoc } from "./lootTable";
import { zArenaDoc } from "./arena";
import { zConfigDoc } from "./config";
import { zModelDoc } from "./model";
import { zVfxCollectionDoc } from "./vfx";
import { zSkinDoc } from "./skin";
import { zId } from "./common";

export interface CollectionSpec {
  /** the doc discriminator, e.g. "ability@1" */
  schemaTag: string;
  schema: z.ZodTypeAny;
  label: string;
}

export const COLLECTIONS = {
  champions: { schemaTag: "champion@1", schema: zChampionDoc, label: "Champions" },
  abilities: { schemaTag: "ability@1", schema: zAbilityDoc, label: "Abilities" },
  items: { schemaTag: "item@1", schema: zItemDoc, label: "Items" },
  augments: { schemaTag: "augment@1", schema: zAugmentDoc, label: "Augments" },
  projectiles: { schemaTag: "projectile@1", schema: zProjectileDoc, label: "Projectiles" },
  "status-effects": {
    schemaTag: "status-effect@1",
    schema: zStatusEffectDoc,
    label: "Status Effects",
  },
  "loot-tables": { schemaTag: "loot-table@1", schema: zLootTableDoc, label: "Loot Tables" },
  arenas: { schemaTag: "arena@1", schema: zArenaDoc, label: "Arenas" },
  config: { schemaTag: "config@1", schema: zConfigDoc, label: "Config" },
  models: { schemaTag: "model@1", schema: zModelDoc, label: "Models" },
  // the vfx collection also accepts ribbon@1 docs (union on `schema`)
  vfx: { schemaTag: "vfx@1", schema: zVfxCollectionDoc, label: "VFX" },
  skins: { schemaTag: "skin@1", schema: zSkinDoc, label: "Skins" },
} as const satisfies Record<string, CollectionSpec>;

export type CollectionName = keyof typeof COLLECTIONS;

export const COLLECTION_NAMES = Object.keys(COLLECTIONS) as CollectionName[];

export function isCollectionName(s: string): s is CollectionName {
  return Object.prototype.hasOwnProperty.call(COLLECTIONS, s);
}

/** Minimal envelope every doc must satisfy before collection-schema parse. */
export const zDocEnvelope = z
  .object({ id: zId, schema: z.string().min(1) })
  .passthrough();

export * from "./common";
export * from "./effect";
export * from "./ability";
export * from "./champion";
export * from "./item";
export * from "./augment";
export * from "./projectile";
export * from "./statusEffect";
export * from "./lootTable";
export * from "./arena";
export * from "./config";
export * from "./model";
export * from "./vfx";
export * from "./skin";
