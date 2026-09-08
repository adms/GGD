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
import { DEFAULT_IMPACT_FEEL, type ImpactFeelRules } from "./impactFeel";
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

/**
 * The COSMETIC half of the ImpactProfile.
 *
 * Everything here is fully resolved by the sim EXCEPT the two flash fields,
 * which are PRESENT ONLY WHEN CONTENT AUTHORED THEM. That asymmetry is
 * deliberate and load-bearing — see FLASH IS NOT THE SIM'S TO DEFAULT below.
 */
export interface ImpactCosmetics {
  shakeMag: number;
  shakeStyle: ShakeStyle;
  sparkKind: SparkKind;
  /**
   * AUTHORED-ONLY victim body-flash colour. `undefined` = no content override,
   * and the client then uses its own measured damage-type palette.
   * PRESENCE IS THE SIGNAL — do not "helpfully" fill this in with a default.
   */
  flashColor?: [number, number, number];
  /** AUTHORED-ONLY victim body-flash duration (ms). `undefined` = client tier default. */
  flashMs?: number;
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
/** Directional camera kick magnitude per tier. */
const CAMKICK_BY_TIER: Record<ImpactTier, number> = { light: 0.15, medium: 0.3, heavy: 0.5, crit: 0.65 };

// ─────────────────────────── FLASH IS NOT THE SIM'S TO DEFAULT ───────────────
// This module used to resolve a full damage-type flash palette here —
// FLASH_PHYSICAL [1,.25,.2] / FLASH_MAGIC [.7,.4,1] / FLASH_TRUE [1,1,1] /
// FLASH_BLOCK [.6,.8,1] plus a FLASH_MS_BY_TIER curve. Every one of those
// constants was DEAD: it rode the wire on ImpactProfile.flashColor and the
// client then threw it away and used its own `flashColorFor()`. Four constants
// that looked live, shipped in every hitImpact, and never once reached a pixel.
//
// They are deleted rather than re-wired, because the client is the correct
// owner: picking the flash colour is a CONTRAST decision about the overlay's
// ALPHA_COMBINE blend against the real model tints, and that measurement lives
// in render/combatFeedback.ts (which is why FLASH_TRUE's white was wrong —
// white can only push channels UP, so it is a no-op on every pale model).
//
// What the sim keeps is the part only the sim knows: WHAT THE CONTENT ASKED
// FOR. `flashColor`/`flashMs` are therefore passed through when authored and
// LEFT UNDEFINED when not. That presence/absence IS the wire signal the client
// needs to tell "the author chose this hue" from "nobody chose anything" —
// without it the client cannot honour an override without also overriding the
// 99% of hits (every basic attack; no champion doc authors a flash) whose
// colour is carrying the physical-vs-magic damage-type read.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Clamp band for an AUTHORED `flashMs`. The flash must clear before the next
 * hit or back-to-back autos strobe — the client's crit flash is 185 ms and the
 * whole channel is built around "even a crit clears well under 200 ms" (收尾精準).
 * `zHitFeel` enforces the same 260 ms ceiling at authoring time so a bad value
 * is a LOUD content error; this runtime clamp is only the second line of
 * defence for an already-built bundle. 30 ms floor ≈ 1 sim tick — anything
 * shorter cannot survive a frame hitch and would read as "the flash is broken".
 */
export const AUTHORED_FLASH_MS_MIN = 30;
export const AUTHORED_FLASH_MS_MAX = 260;

// ⭐ 這六格搬去 `sim/combat/impactFeel.ts` 了（2026-09-01）——
//   它們現在住在 `content/config/combat-feel.json` 的 `impactFeel`，
//   ⛔ 在此之前**只有改程式碰得到**（大目標：所有功能都要可 JSON 操作設定）。
//   出貨值逐格不變，見 `DEFAULT_IMPACT_FEEL`。

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
  /**
   * ⭐ 演出量值（`config.combat-feel@1` 的 `impactFeel.*`）。缺席 ⇒ 出貨值
   * ⇒ 行為逐位元不變。⛔ 在 2026-09-01 之前這六格是這個檔的模組層常數。
   */
  feel: ImpactFeelRules = DEFAULT_IMPACT_FEEL,
): ImpactCosmetics {
  let shakeMag = SHAKE_BY_TIER[tier];
  if (isEX) shakeMag = Math.min(feel.exShakeCap, shakeMag * feel.exShakeMult);
  if (isBlock) shakeMag *= feel.blockShakeMult;

  const shakeStyle: ShakeStyle = tier === "crit" || isEX ? "omni" : "directional";

  let sparkKind: SparkKind;
  if (isBlock) sparkKind = "block";
  else if (isCounter) sparkKind = "counter";
  else if (type === "magic") sparkKind = "magic";
  else if (tier === "heavy" || tier === "crit") sparkKind = "heavy";
  else sparkKind = "hit";

  let camKick = CAMKICK_BY_TIER[tier];
  if (isBlock) camKick *= feel.blockCamKickMult;
  if (isEX) camKick = Math.max(camKick, feel.exCamKickFloor);

  // NOTE: no flashColor / flashMs here on purpose — un-authored means ABSENT,
  // not "some default the client will ignore". See the block comment above.
  return {
    shakeMag,
    shakeStyle,
    sparkKind,
    camKick,
    exFreeze: isEX ? feel.exFreezeTicks : 0,
  };
}

/** Clamp one authored 0..1 colour component (schema-checked; belt and braces). */
function unitClamp(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Layer explicit `hitFeel` cosmetic overrides over the derived default.
 *
 * The flash pair is the odd one out: there is no base to fall back to, so an
 * absent override stays ABSENT (the client supplies the damage-type default).
 * `flashMs` is clamped into the strobe-safe band on the way through — content
 * is a fixed input, so the clamp is deterministic and replay-safe.
 */
export function mergeCosmetics(base: ImpactCosmetics, hf?: HitFeelInput): ImpactCosmetics {
  if (!hf) return base;
  const out: ImpactCosmetics = {
    shakeMag: hf.shakeMag ?? base.shakeMag,
    shakeStyle: hf.shakeStyle ?? base.shakeStyle,
    sparkKind: hf.sparkKind ?? base.sparkKind,
    camKick: hf.camKick ?? base.camKick,
    exFreeze: hf.exFreeze ?? base.exFreeze,
  };
  const c = hf.flashColor ?? base.flashColor;
  if (c) out.flashColor = [unitClamp(c[0]), unitClamp(c[1]), unitClamp(c[2])];
  const ms = hf.flashMs ?? base.flashMs;
  if (ms !== undefined) {
    out.flashMs = Math.min(AUTHORED_FLASH_MS_MAX, Math.max(AUTHORED_FLASH_MS_MIN, ms));
  }
  return out;
}
