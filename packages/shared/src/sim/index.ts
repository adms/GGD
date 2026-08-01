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
// task #247 — the leap primitive. The pure arc helpers are exported because the
// CLIENT's render tests derive the expected curve from the same source the sim
// runs (a hand-copied formula in the test would be free to drift from it).
export {
  leapHeightMilli,
  leapHeightAt,
  leapPosAt,
  leapTicks,
  resolveLandingPoint,
  startLeap,
  cancelLeap,
  isAirborne,
  MIN_LEAP_TICKS,
} from "./movement/leap";
export { leapSystem } from "./systems/LeapSystem";

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
export { visualStackCount } from "./stats/visualStacks";
export {
  resourceStatSystem,
  liveResource,
  resourceSignature,
  hasResourceModifier,
} from "./stats/resourceStats";
export {
  auraSystem,
  auraSourceId,
  resolveAuraRadius,
  activeAuraSources,
  type AuraDef,
  type AuraAffects,
  type AuraOrigin,
} from "./aura/aura";
export * from "./effects/effect";
export { runEffects } from "./effects/effectRunner";
export { fireHooks } from "./effects/hooks";
export { castAbility, rankUpAbility, type CastResult } from "./abilities/abilitySystem";
export {
  DEFAULT_RECOVERY_SEC,
  MAX_RECOVERY_SEC,
  connectRuleOf,
  recoveryTicksFor,
  isRecovering,
  type ConnectRule,
} from "./abilities/abilityRecovery";
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
export {
  fireRingRulesFromConfig,
  fireRingRatePerSec,
  beginCombatFireRing,
  endCombatFireRing,
  type FireRingRules,
  type FireRingConfigLike,
} from "./fireRing";
export { fireRingSystem } from "./systems/FireRingSystem";
export {
  coinRulesFromConfig,
  coinDropPos,
  coinBudgetFor,
  dropCoinCommand,
  spawnCoin,
  beginCombatCoins,
  endCombatCoins,
  GOLD_COIN_MODEL_KEY,
  type CoinRules,
  type CoinConfigLike,
  type CoinDropRejection,
} from "./coins";
export { coinSystem } from "./systems/CoinSystem";
