/**
 * `@ggd/shared/content` — the content pipeline's browser-safe surface:
 * Zod schemas (single source of truth), hashing (pure), the ContentLoader +
 * HttpContentSource, referential integrity, and the content registries.
 *
 * Node-only pieces (FsContentSource, fs index/manifest builders) live in
 * `@ggd/shared/content/node`.
 */
export * from "./schema/index";
// 道具卡片的渲染時解析 (owner 2026-08-02「排版連在一起不好閱讀」)。純函式,
// 不動 owner 的 description 一個字 —— 見 itemCardText.ts 的檔頭。
export * from "./itemCardText";
// ⭐ 卡面上**推導出來**的數字（魔抗減傷 %）渲染時現算 —— 見 itemCardDerived.ts 檔頭。
export * from "./itemCardDerived";
// 對戰錄影政策 (owner 2026-08-02「請幫我預設打開」)。缺文件 = 出貨預設 = 開著,
// 理由寫在 replayPolicy.ts 的檔頭 —— 內容載入失敗不可以順手把錄影關掉。
export * from "./replayPolicy";
export * from "./types";
export * from "./errors";
export { sha256Hex } from "./sha256";
export { HASH_HEX_LEN, stableStringify, hashDoc, hashCollection, contentVersion } from "./hash";
export { ContentStore } from "./store";
export {
  AUTHORING_RULES_SCHEMA,
  buildAuthoringRules,
  type AuthoringRule,
  type AuthoringRulesManifest,
  type ConfigReader,
} from "./authoringRules";
export {
  ContentLoader,
  validateDoc,
  type LoadResult,
  type QuarantineEntry,
} from "./loader";
// 退場的抽獎池 (owner 2026-08-01). `rulesFromDoc` 在 game-server 側讀同一支
// `scheduledRetiredTables`,所以「退場」只有一個定義,不會有第二份漂走的規則。
export {
  RetiredLootTableError,
  retiredLootTables,
  scheduledRetiredTables,
  validateRetiredLootTables,
  type RetiredTableUse,
} from "./retiredLootTables";
export { HttpContentSource, type HttpContentSourceOptions } from "./sources/HttpContentSource";
export {
  BundleContentSource,
  type BundleContentSourceOptions,
} from "./sources/BundleContentSource";
export { FallbackContentSource } from "./sources/FallbackContentSource";
// #189 durable content overlay: the pure merge that lays the platform's data/
// overlay over the shipped content tree (both consumers share this one seam).
export {
  OverlayContentSource,
  emptyOverlayBundle,
  isOverlayEmpty,
  splitOverlayKey,
  mergeCollectionIndex,
  type OverlayBundle,
} from "./overlay";
export {
  CONTENT_BUNDLE_SCHEMA,
  CONTENT_BUNDLE_FILE,
  buildContentBundle,
  serializeContentBundle,
  parseContentBundle,
  manifestFromBundle,
  indexFromBundle,
  type ContentBundle,
  type BundleCollection,
  type BundleEntry,
} from "./bundle";
export {
  REFERENCES,
  extractRefs,
  validateReferences,
  type RefEdge,
  type RefReport,
} from "./refs";
export {
  Arenas,
  Configs,
  Models,
  VfxDefs,
  RibbonDefs,
  // GH#392 —— attachment@1（穿在骨頭上的模型）的登錄表。
  AttachmentDefs,
  StatusEffects,
  registerAll,
  auditAbilityMirrorDrift,
  DEGRADED_ABILITY_NOTE,
  type AbilityMirrorDrift,
  type RegisterAllOptions,
} from "./registries";
// 模板展開的 fail-soft 那一半:一支技能的模板壞掉只降級那一支,而降級留下的紀錄
// 在 console 消失之後還讀得到。壞掉的 ref 曾經會讓 registerAll 整包擲錯 = 0 隻英雄。
export {
  TEMPLATE_FAILURE_LOG_CAP,
  recordTemplateExpansionFailures,
  templateExpansionFailures,
  clearTemplateExpansionFailures,
  templateExpansionFailureSummary,
  type TemplateExpansionFailure,
} from "./templates/failures";
export {
  hasTemplateBinding,
  resolveTemplateExpansion,
  type TemplateResolution,
  type TemplateResolveFailure,
  type TemplateFailurePhase,
} from "./templates/resolve";
export {
  HERO_NUMBER_RE,
  RANDOM_HERO_POOL_IDS,
  heroNumberFromAbilityName,
  heroNumberOf,
  nameComponents,
  sharesNameComponent,
  isStandInModel,
  compareCanonical,
  isSameCharacter,
  groupCharacters,
  characterKeys,
  distinctCharacters,
  alternateForms,
  baseFormOf,
  sameCharacterInRoster,
  heroNumberCollisions,
  type IdentityAbility,
  type IdentityChampion,
  type CharacterGroup,
  type HeroNumberCollision,
} from "./championIdentity";
export {
  CHAMPION_FORM_PAIRS,
  FORM_PAIR_BY_ALTERNATE_ID,
  FORM_PAIR_BY_BASE_ID,
  isAlternateForm,
  isAlternateFormId,
  isBaseForm,
  counterpartFormId,
  baseFormIdOf,
  isW3xFormPair,
  type ChampionFormPair,
  type PerLevelSeconds,
} from "./championForms";
// #249 GH#288 —— 變身「看得出來」:tint / scale / 球體掛件,全部後台可調。
export {
  resolveFormVisual,
  authoredFormVisual,
  authoredStatusVisual,
  composeBodyVisual,
  NEUTRAL_FORM_VISUAL,
  FORM_TINT_NEUTRAL,
  FORM_ATTACH_DEFAULT_BONE,
  FORM_VISUAL_BOUNDS,
  type FormVisual,
  type FormAttachment,
} from "./championFormVisuals";
// GH#392 —— 「穿在骨頭上的模型」。兩個來源（變身外觀表 / `attachment@1` 文件）
// 折成一個型別，所以渲染層只有一條接線。(c) 播動畫就是在這裡長出來的。
export {
  wornFromAttachmentDoc,
  wornFromFormAttachment,
  type WornAttachment,
} from "./wornAttachments";
// 「變身前/後共用就好」 (owner 2026-07-26): a base and its alternate are ONE
// character, so one generated voice pack serves both halves of a w3x form pair.
export {
  planFormVoiceShares,
  applyFormVoiceShares,
  type FormVoiceShare,
  type FormShareDirection,
} from "./voiceFormSharing";
export {
  BLOCKING_FOOTPRINTS,
  NON_BLOCKING,
  classifyModel,
  circleObstacleForDecor,
  auditArenaCollision,
  type ModelClass,
  type CollisionGap,
  type CollisionAudit,
} from "./arenaCollision";
// 鑄技工坊 (Skill Forge, #141/#205): the PURE expander both the sim (registry
// registration) and the editor (form + try-in-preview) import, so「表單看到的」
// ==「遊戲跑的」, plus the runtime param-schema synthesis the editor form walks.
export {
  GGD_PER_WC3,
  round2,
  toLen,
  // the SEPARATE vertical ruler (#247b) — altitude is set by the camera, not by
  // the map's geometry, so a fly height never goes through `toLen`.
  GGD_APEX_PER_WC3,
  round3,
  toApex,
  SIM_CAPABILITIES,
  missingCaps,
  expand,
  isExpandable,
  mergeExpansion,
  eject,
  type SimCapability,
  type ExpandResult,
} from "./templates/expand";
export {
  paramsSchemaFor,
  defaultParamsFor,
  describeUnit,
} from "./templates/paramsSchema";
