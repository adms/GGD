/**
 * Hit-feel parameterization (task #133) — the per-champion / per-ability
 * override layer on top of the damage-derived ImpactProfile.
 *
 * The sim computes ONE ImpactProfile per landed hit (see `applyImpact` in
 * `damage.ts`). Every field of that profile has a DAMAGE-DERIVED DEFAULT so an
 * un-authored champion/ability still feels right (scaled by tier / impact). A
 * champion's basic-attack or an ability may ship an OPTIONAL `hitFeel` object
 * (content schema, all fields optional) that OVERRIDES individual fields; unset
 * fields fall back to the default. Content is a fixed input, so the whole thing
 * stays deterministic (no rng / no wall-clock) and same-seed replay is
 * byte-identical.
 *
 * This module owns: the override input shape (`HitFeelInput`, mirrored by the
 * zod `zHitFeel` in the content schema), the COSMETIC half of the profile
 * (`ImpactCosmetics` — shake / spark / flash / camKick / exFreeze), the default
 * curves for those, and the merge. The GAMEPLAY half (hitstop / hitstun /
 * knockback) is computed + merged in `damage.ts` where the world state lives.
 */
import type { DamageType } from "../effects/effect";

/** Weight tier for a landed hit; crit is the top tier. Shared with the profile. */
export type ImpactTier = "light" | "medium" | "heavy" | "crit";

/** Camera-shake character: aimed along the hit vector, or a radial ring. */
export type ShakeStyle = "directional" | "omni";

/**
 * Which hit-spark identity the client plays. `hit`/`heavy` are the normal
 * light→heavy escalation; `counter`/`block`/`magic` are situational reads;
 * `ice` is an opt-in elemental spark a content author can request (never a
 * default — the sim has no ice damage type).
 */
export type SparkKind = "hit" | "heavy" | "counter" | "block" | "magic" | "ice";

/**
 * The optional, all-fields-optional override block a champion basic-attack or an
 * ability may carry (content schema `hitFeel`). Each field, when present,
 * REPLACES the corresponding damage-derived default for that hit. The gameplay
 * trio (hitstop/hitstun/knockbackMag) changes the deterministic sim reaction;
 * the rest are cosmetic hints carried on the event for the client channels.
 *
 * MIRRORS `zHitFeel` in `content/schema/ability.ts` — keep the two in sync
 * (same discipline as `sim/content/defs.ts` mirroring the schemas).
 */
export interface HitFeelInput {
  /** freeze ticks for BOTH fighters (overrides the impact-derived freeze). */
  hitstopTicks?: number;
  /** victim-only action-lock ticks (clamped to be >= the resolved hitstop). */
  hitstunTicks?: number;
  /** push distance in units (overrides the impact/type-derived shove). */
  knockbackMag?: number;
  /** camera shake amplitude hint (0..~2; default scales with tier). */
  shakeMag?: number;
  /** shake character (default: directional, omni on crit/EX). */
  shakeStyle?: ShakeStyle;
  /** hit-spark identity (default derived from tier/type/block). */
  sparkKind?: SparkKind;
  /** victim body-flash colour [r,g,b] 0..1 (default by damage type / block). */
  flashColor?: [number, number, number];
  /** victim body-flash duration ms (default scales with tier). */
  flashMs?: number;
  /** one-shot directional camera kick magnitude (default scales with tier). */
  camKick?: number;
  /** cosmetic client-side EX freeze ticks (default: EX hits only). */
  exFreeze?: number;
}

/** The COSMETIC half of the ImpactProfile — always fully resolved (no undefined). */
export interface ImpactCosmetics {
  shakeMag: number;
  shakeStyle: ShakeStyle;
  sparkKind: SparkKind;
  flashColor: [number, number, number];
  flashMs: number;
  camKick: number;
  exFreeze: number;
}

// ---------------------------------------------------------------- DEFAULT CURVE
// All defaults are pure functions of (tier, damage type, block/counter/EX
// flags). The tier itself is derived from the mitigated impact in damage.ts, so
// these curves are ultimately "scaled by the damage number" as the task asks —
// a light auto and a heavy nuke get proportionally different shake/flash/kick
// without any content authoring. Integer/branch/float-constant maths only, no
// rng: same inputs → same cosmetics on every machine.

/** Camera shake amplitude per tier (client scales this into world units). */
const SHAKE_BY_TIER: Record<ImpactTier, number> = { light: 0.35, medium: 0.6, heavy: 0.85, crit: 1.0 };
/** Victim flash duration (ms) per tier — heavier hit holds the flash longer. */
const FLASH_MS_BY_TIER: Record<ImpactTier, number> = { light: 90, medium: 120, heavy: 160, crit: 200 };
/** Directional camera kick magnitude per tier. */
const CAMKICK_BY_TIER: Record<ImpactTier, number> = { light: 0.15, medium: 0.3, heavy: 0.5, crit: 0.65 };

/** Victim flash colours by damage type (physical = damage-red). Block overrides. */
const FLASH_PHYSICAL: [number, number, number] = [1, 0.25, 0.2];
const FLASH_MAGIC: [number, number, number] = [0.7, 0.4, 1.0];
const FLASH_TRUE: [number, number, number] = [1, 1, 1];
/** A guarded hit flashes cool blue-white, not damage-red (distinct block read). */
const FLASH_BLOCK: [number, number, number] = [0.6, 0.8, 1.0];

/** A blocked hit's cosmetics are softer (less shake / kick). */
const BLOCK_SHAKE_MULT = 0.6;
const BLOCK_CAMKICK_MULT = 0.5;
/** EX hits bump the shake and floor the camera kick / add a cosmetic freeze. */
const EX_SHAKE_MULT = 1.25;
const EX_SHAKE_CAP = 1.4;
const EX_CAMKICK_FLOOR = 0.7;
const EX_FREEZE_TICKS = 8;

/**
 * The damage-derived cosmetic default for a landed hit — what an un-authored
 * champion/ability feels like, scaled by tier + situation. `mergeCosmetics`
 * layers any explicit `hitFeel` overrides on top of this.
 */
export function deriveCosmetics(
  tier: ImpactTier,
  type: DamageType,
  isBlock: boolean,
  isCounter: boolean,
  isEX: boolean,
): ImpactCosmetics {
  let shakeMag = SHAKE_BY_TIER[tier];
  if (isEX) shakeMag = Math.min(EX_SHAKE_CAP, shakeMag * EX_SHAKE_MULT);
  if (isBlock) shakeMag *= BLOCK_SHAKE_MULT;

  const shakeStyle: ShakeStyle = tier === "crit" || isEX ? "omni" : "directional";

  let sparkKind: SparkKind;
  if (isBlock) sparkKind = "block";
  else if (isCounter) sparkKind = "counter";
  else if (type === "magic") sparkKind = "magic";
  else if (tier === "heavy" || tier === "crit") sparkKind = "heavy";
  else sparkKind = "hit";

  const flashSrc = isBlock
    ? FLASH_BLOCK
    : type === "magic"
      ? FLASH_MAGIC
      : type === "true"
        ? FLASH_TRUE
        : FLASH_PHYSICAL;

  let camKick = CAMKICK_BY_TIER[tier];
  if (isBlock) camKick *= BLOCK_CAMKICK_MULT;
  if (isEX) camKick = Math.max(camKick, EX_CAMKICK_FLOOR);

  return {
    shakeMag,
    shakeStyle,
    sparkKind,
    flashColor: [flashSrc[0], flashSrc[1], flashSrc[2]],
    flashMs: FLASH_MS_BY_TIER[tier],
    camKick,
    exFreeze: isEX ? EX_FREEZE_TICKS : 0,
  };
}

/** Layer explicit `hitFeel` cosmetic overrides over the derived default. */
export function mergeCosmetics(base: ImpactCosmetics, hf?: HitFeelInput): ImpactCosmetics {
  if (!hf) return base;
  return {
    shakeMag: hf.shakeMag ?? base.shakeMag,
    shakeStyle: hf.shakeStyle ?? base.shakeStyle,
    sparkKind: hf.sparkKind ?? base.sparkKind,
    flashColor: hf.flashColor ? [hf.flashColor[0], hf.flashColor[1], hf.flashColor[2]] : base.flashColor,
    flashMs: hf.flashMs ?? base.flashMs,
    camKick: hf.camKick ?? base.camKick,
    exFreeze: hf.exFreeze ?? base.exFreeze,
  };
}
