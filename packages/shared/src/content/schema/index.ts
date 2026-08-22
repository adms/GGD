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
import { zMapDoc } from "./map";
import { zConfigDoc } from "./config";
import { zModelDoc } from "./model";
import { zVfxCollectionDoc } from "./vfx";
import { zSkinDoc } from "./skin";
import { zTemplateDoc } from "./template";
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
  // GH#324 —— **作者層**的地圖版面。⭐ `arena@1` 是產生器從這裡編譯出來的碰撞真相，
  // runtime 只認 arena；`map@1` 是人寫的來源。兩者的關係見 docs/_新場地計畫.md。
  maps: { schemaTag: "map@1", schema: zMapDoc, label: "Maps" },
  config: { schemaTag: "config@1", schema: zConfigDoc, label: "Config" },
  models: { schemaTag: "model@1", schema: zModelDoc, label: "Models" },
  // the vfx collection also accepts ribbon@1 docs (union on `schema`)
  vfx: { schemaTag: "vfx@1", schema: zVfxCollectionDoc, label: "VFX" },
  skins: { schemaTag: "skin@1", schema: zSkinDoc, label: "Skins" },
  // 鑄技工坊 (Skill Forge, #141/#205): parameterised behaviour templates. An
  // ability doc references one via `template:{ref,params}` and the pure expand()
  // fills its behaviour half at registry time — no sim change, layered on schema.
  "ability-templates": {
    schemaTag: "template@1",
    schema: zTemplateDoc,
    label: "Ability Templates",
  },
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
export * from "./condition";
export * from "./effect";
export * from "./ability";
export * from "./champion";
export * from "./item";
export * from "./augment";
export * from "./projectile";
export * from "./statusEffect";
export * from "./lootTable";
export * from "./arena";
export * from "./arenaScenery";
// GH#324 —— 地圖版面與它的規格文件。⚠️ 一定要從這個 barrel 出去：
// 編輯器與後台只吃 `@ggd/shared/content`，漏掉這兩行的話它們就只能繞路
// 深進 `schema/*`（而那條路沒有守衛在看，遲早會指到搬走的檔案）。
export * from "./map";
export * from "./mapSpecDoc";
// 混音（owner 2026-08-17）—— 和 mapSpecDoc 同一條路：schema 住自己的檔案，
// 但**一定要從這個 barrel 出去**，否則後台與編輯器只能繞路深進 `schema/*`。
// ⚠️ 型別由這一行負責，⛔ config.ts 不再 re-export 一次（兩條 star export
// 匯出同一個名字會互相遮蔽）。
export * from "./audioMixDoc";
// 練習模式（GH#343）—— 同上；後台的 `PRACTICE_SPEC` 與 game-server 的
// `resolvePracticeRules` 都從這個 barrel 拿。
export * from "./practiceDoc";
// 排名獎勵（owner 2026-08-17）—— 同上；後台的 `RANKING_SPEC` 從這個 barrel 拿
// `zConfigRankingDoc`。⚠️ 型別由這一行負責，⛔ config.ts 不再 re-export 一次
// （兩條 star export 匯出同一個名字會互相遮蔽）。
export * from "./rankingDoc";
// 地端產圖的風格（owner 2026-08-17）—— 同上；後台的 `ICON_STYLE_SPEC` 從這個
// barrel 拿 `zConfigIconStyleDoc`。⚠️ 型別由這一行負責，⛔ config.ts 不再
// re-export 一次（兩條 star export 匯出同一個名字會互相遮蔽）。
export * from "./iconStyleDoc";
export * from "./config";
export * from "./model";
export * from "./vfx";
export * from "./skin";
export * from "./template";
export * from "./abilityVfxBindings";
export * from "./comboStrikesDoc";
export * from "./ownerKnobsDoc";
