/**
 * `@ggd/shared/content` — the content pipeline's browser-safe surface:
 * Zod schemas (single source of truth), hashing (pure), the ContentLoader +
 * HttpContentSource, referential integrity, and the content registries.
 *
 * Node-only pieces (FsContentSource, fs index/manifest builders) live in
 * `@ggd/shared/content/node`.
 */
export * from "./schema/index";
export * from "./types";
export * from "./errors";
export { sha256Hex } from "./sha256";
export { HASH_HEX_LEN, stableStringify, hashDoc, hashCollection, contentVersion } from "./hash";
export { ContentStore } from "./store";
export { ContentLoader, validateDoc, type LoadResult } from "./loader";
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
  StatusEffects,
  registerAll,
  auditAbilityMirrorDrift,
  type AbilityMirrorDrift,
} from "./registries";
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
