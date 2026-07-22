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
  sameCharacterInRoster,
  heroNumberCollisions,
  type IdentityAbility,
  type IdentityChampion,
  type CharacterGroup,
  type HeroNumberCollision,
} from "./championIdentity";
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
