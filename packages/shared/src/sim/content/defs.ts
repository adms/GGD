/**
 * Content definition schemas (champion / ability / item / augment / projectile).
 * Pure data shapes — authored as TS literals in the skeleton, migrated to
 * external JSON by the content pipeline (same shapes, Zod-validated).
 */
import type { AbilityId, AugmentId, ChampionId, ItemId, ProjectileId } from "../../ids";
import type { Stat, StatBlock } from "../stats/statTypes";
import type { StatModifier, HookDef } from "../stats/modifiers";
import type { EffectDef } from "../effects/effect";
import type { AbilitySlot, CoreAbilitySlot } from "../intents";

export type CastType = "targeted" | "skillshot" | "ground" | "self" | "dash";

/**
 * One rank of an ability's PERMANENT passive. WC3 authors passives per ability
 * level, so this is a rank-indexed array rather than a single block: rank N
 * uses `ranks[N-1]` (clamped to the last entry), and rank 0 (unlearned) grants
 * nothing at all.
 */
export interface AbilityPassiveRank {
  modifiers?: StatModifier[];
  hooks?: HookDef[];
}

/**
 * `ability@1.passive` — the missing half of the ability schema.
 *
 * A large share of the imported WC3 kit is PERMANENT: Critical Strike (`AOcr`),
 * Bash (`AHbh`), Evasion (`AEev`), the aura family (`AOae`/`AHab`), the
 * attribute buttons (`Aamk`). Their native `Cool` is 0 — they are not cast.
 * Without this field the importer had nowhere to put them and every one shipped
 * as an ACTIVATED `self` + `applyBuff` with an invented cooldown and mana cost,
 * i.e. a different ability. A passive ability is attached as a `ModifierSource`
 * the moment its rank goes above 0 and re-attached (at the new rank's values)
 * on every rank-up — the same `attachSource`/`detachSource` path items use.
 */
export interface AbilityPassive {
  /** display name (defaults to the ability's own name) */
  name?: string;
  ranks: AbilityPassiveRank[];
}

export interface AbilityDef {
  id: AbilityId;
  name: string;
  slot: AbilitySlot;
  castType: CastType;
  maxRank: number;
  /** per rank (index rank-1) */
  cooldown: number[]; // seconds
  manaCost: number[];
  range: number;
  /** skillshot width or AoE radius */
  radius?: number;
  targetsEnemies?: boolean;
  effects: EffectDef[];
  /**
   * Permanent passive granted while this ability's rank > 0 (see
   * `AbilityPassive`). An ability with a passive AND an empty `effects` array
   * is passive-ONLY: `castAbility` rejects it with "passive" before paying any
   * cost, exactly as WC3 refuses to cast a passive button.
   */
  passive?: AbilityPassive;
  vfxKey?: string;
  /**
   * Cast time (seconds) — the wind-up before effects fire. Default 0 = instant
   * (skeleton behavior). With ct>0 the caster enters a cast state, pays mana +
   * cooldown up-front, and effects resolve `round(ct/dt)` ticks later.
   */
  castTimeSec?: number;
  /** Root the caster for the cast duration (default true). */
  rootWhileCasting?: boolean;
  /**
   * RECOVERY (後搖) — seconds of post-resolve commitment (no cast, no basic
   * attack). Absent = `DEFAULT_RECOVERY_SEC` (0.6 s), not 0. A landed hit on an
   * enemy CANCELS it, which is the whole combo rule. See
   * `sim/abilities/abilityRecovery.ts`.
   */
  recoverySec?: number;
  /** Whether the recovery also roots (default false: output lock only). */
  recoveryRoots?: boolean;
  /**
   * Icon path relative to content/ ("assets/icons/abilities/<id>.png",
   * w3x BLP→PNG). Absent = client falls back to letter-tile rendering.
   */
  icon?: string;
}

export interface ChampionDef {
  id: ChampionId;
  name: string;
  role: string;
  attackType: "melee" | "ranged";
  modelKey: string;
  baseStats: Partial<StatBlock>;
  /** additive per level beyond 1 */
  growth: Partial<Record<Stat, number>>;
  /**
   * Ranged auto-attack projectile speed (GGD units/sec, ~= WC3 missile speed
   * × the import distance factor). Ignored for melee. Default applied by the
   * BasicAttackSystem when absent.
   */
  missileSpeed?: number;
  /**
   * Wind-up before a basic attack's hit lands (seconds). Melee applies damage
   * at this point; ranged launches its projectile here. Default per attackType.
   */
  attackDamagePoint?: number;
  /**
   * Base attack-cadence multiplier (dimensionless, default 1.0). The real
   * interval = baseAttackTime / attackSpeed; 1.0 reproduces the classic 1/AS.
   */
  baseAttackTime?: number;
  abilities: Record<CoreAbilitySlot, AbilityDef>;
  /**
   * Optional per-hero "EX 技能" ability id (slot "EX"), unlocked at the arena
   * EX-unlock point. Absent = this hero has no EX skill. Resolved via the
   * Abilities registry (standalone ability doc), not embedded above.
   */
  exAbility?: AbilityId;
  passive?: { name: string; hooks?: HookDef[]; modifiers?: StatModifier[] };
  /**
   * Icon path relative to content/ ("assets/icons/champions/<id>.png",
   * w3x BLP→PNG). Absent = client falls back to text-only rendering.
   */
  icon?: string;
  /**
   * WC3 vertex-colour MULTIPLY `[r,g,b]`, each 0..1 (task #49). Applied by the
   * client per-material as `texture.rgb * tint`; absent = untinted. Purely
   * visual — the sim never reads it, it rides along so registry reads stay
   * typed (same treatment as `icon`).
   */
  tint?: [number, number, number];
  /** Opacity 0..1; absent = 1 (opaque). Visual only, like `tint`. */
  alpha?: number;
  /** AI hints (Q/W/E/R only) */
  skillOrder: CoreAbilitySlot[];
  buildPriority: ItemId[];
  tags: string[];
}

export interface ItemDef {
  id: ItemId;
  name: string;
  cost: number;
  tier: number;
  unique?: boolean;
  modifiers?: StatModifier[];
  passive?: HookDef[];
  iconKey?: string;
  /**
   * Icon path relative to content/ ("assets/icons/items/<id>.png", w3x
   * BLP→PNG). Absent = client falls back to text-only rendering. `iconKey`
   * above is the legacy skeleton-era symbolic key — unrelated.
   */
  icon?: string;
  tags: string[];
}

export type AugmentTier = "silver" | "gold" | "prismatic";

export interface AugmentDef {
  id: AugmentId;
  name: string;
  description: string;
  tier: AugmentTier;
  weight: number;
  modifiers?: StatModifier[];
  hooks?: HookDef[];
  tags: string[];
}

export interface ProjectileDef {
  id: ProjectileId;
  speed: number;
  maxRange: number;
  hitRadius: number;
  pierce?: boolean;
  vfxKey?: string;
  /** RENDER-ONLY 3D body shape for the flying missile (see projectile@1). */
  meshShape?: "bolt" | "orb" | "shard";
}

export interface LootTable {
  id: string;
  entries: { itemId: ItemId; weight: number }[];
}
