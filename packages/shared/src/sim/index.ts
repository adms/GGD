/** Public surface of the deterministic simulation core. */
export * from "./math/vec2";
export { Rng } from "./math/rng";

export * from "./intents";
export * from "./components";
export { SimWorld, type SimEvent } from "./SimWorld";

export * from "./collision/shapes";
export * from "./collision/intersect";
export { SpatialHash } from "./collision/spatialHash";
export * from "./collision/resolve";
export { queryOverlap, type OverlapOptions } from "./collision/queries";

export * from "./world/ArenaDef";
export { orderSystem } from "./systems/OrderSystem";
export { movementSystem, startDash } from "./systems/MovementSystem";

export * from "./stats/statTypes";
export * from "./stats/modifiers";
export {
  COMBAT_ENV_KEYS,
  DEFAULT_COMBAT_ENV,
  STAT_ENV_KEY,
  normalizeCombatEnv,
  parseCombatEnvJson,
  type CombatEnvKey,
  type CombatEnvMultipliers,
} from "./combatEnv";
export type { StatsComp, AbilitiesComp, AbilityInstance } from "./stats/statsComp";
export {
  type PlayerMatchStats,
  createMatchStats,
  getMatchStats,
  ASSIST_WINDOW_TICKS,
  MULTIKILL_WINDOW_TICKS,
} from "./stats/matchStats";
export {
  type Grade,
  type RankEntry,
  GRADES,
  GRADE_CUTS,
  grade,
  gradeFromScore,
  compositeScore,
  perMatchRanks,
} from "./stats/rating";
export {
  recomputeStats,
  attachSource,
  detachSource,
  statRecomputeSystem,
} from "./stats/statPipeline";
export * from "./effects/effect";
export { runEffects } from "./effects/effectRunner";
export { fireHooks } from "./effects/hooks";
export { castAbility, rankUpAbility, type CastResult } from "./abilities/abilitySystem";
export { addShield, type DamagePacket } from "./combat/damage";
export * from "./economy/shop";
export * from "./economy/draft";
export * from "./economy/progression";
export * from "./content/defs";
export * from "./content/registry";
export { registerSkeletonContent, SELA, THORNE } from "./content/skeleton";
export { spawnChampion, type SpawnChampionArgs } from "./spawnChampion";
export {
  FLOWER_RADIUS,
  FLOWER_MODEL_KEY,
  FLOWER_CLEARANCE,
  flowerRulesFromConfig,
  flowersAliveInZone,
  pickFlowerSpawnPos,
  spawnFlower,
  beginCombatFlowers,
  endCombatFlowers,
  type FlowerRules,
  type FlowerConfigLike,
} from "./flowers";
export { flowerSystem } from "./systems/FlowerSystem";
