/**
 * combatFeedback — the PURE tunables + math AND the SINGLE ORCHESTRATOR for the
 * client "combat juice" layer (Capcom-style 打擊感). Every decision worth testing
 * lives here and touches neither Babylon nor the DOM: camera-shake
 * magnitude/decay/duration, the hit-flash colour per damage type, the
 * quality-tier gates that keep the ~700 fps baseline intact — and, new here,
 * `planImpactFeedback`, which turns ONE sim `ImpactProfile` into ONE coordinated
 * set of reactions so every channel crosses the light→heavy boundary on the
 * SAME frame at the SAME threshold (the audit's "single unified hit-weight"
 * fix — no more five decoupled constants each picking their own "heavy" cut).
 *
 * The imperative shells consume these:
 *   • CameraRig      — queues shake impulses, decays them via shakeDecayEnvelope
 *   • EntityViewRegistry — on `hitImpact`, calls planImpactFeedback and DISPATCHES
 *       the freeze + victim flash + attacker flash it returns onto the two views
 *   • GameApp        — impactShakeAmp per event, the two quality-tier gates; a
 *       LATER camera wave consumes the plan's `shake` REQUEST
 *
 * AUTHORITATIVE HITSTOP (client only): the sim owns the freeze — a deterministic
 * tick freeze of the two involved entities carried on `ImpactProfile.hitstopTicks`
 * (replicated in world.hitstop). The client NO LONGER re-derives a freeze curve
 * from the damage amount; it reads the sim's tick count verbatim so the struck
 * model un-freezes EXACTLY with the body, and a fully-blocked hit (dmg 0 but
 * impact ≥ the sim's floor) still freezes both bodies. This module never feeds
 * the sim, so trig/float here can't desync anything.
 */
import type { Quality } from "./RenderConfig";

// ---------------------------------------------------------------------------
// hit flash (ChampionView)
// ---------------------------------------------------------------------------

export type DmgType = "physical" | "magic" | "true";

/**
 * VICTIM FLASH colour for a landed hit. RED on every damage type; magic gets a
 * magenta variant so the type still reads.
 *
 * Why not white (the previous physical/true colour): the overlay draws with
 * ALPHA_COMBINE, i.e. a straight lerp `out = base·(1−a) + flash·a`, so a white
 * flash can only push all three channels UP. Measured against the real w3x
 * tints in content/config/unit-tints.json, that is a no-op on every pale model —
 * ΔLuminance 0.03 for an untinted light rig, 0.04 for 白木老樹精, 0.09 for
 * 神性的流失 — while red moves two channels DOWN and stays legible everywhere
 * (ΔRGB 0.44–0.68 across the same set, including pure-black 老二 and the pale
 * models white fails on entirely).
 */
export function flashColorFor(dmgType: string | undefined): [number, number, number] {
  return dmgType === "magic" ? [1, 0.35, 0.9] : [1, 0.15, 0.15];
}

/**
 * ATTACKER (source) flash on a LANDED hit — a brief WHITE impact pop on the
 * body that dealt the blow (task #69). The victim's red flash reads "I'm being
 * hit"; the attacker needs the complementary "I connected" beat, which melee
 * autos were missing entirely. White (not red) so it never reads as the
 * attacker taking damage, and short so back-to-back autos don't strobe. Drawn
 * through the same per-mesh renderOverlay channel as the victim flash, so it
 * likewise never mutates a shared .glb material.
 */
export const ATTACKER_FLASH_RGB: readonly [number, number, number] = [1, 1, 1];
/** Attacker impact-pop duration (ms) — shorter than the victim flash. */
export const ATTACKER_FLASH_MS = 70;

/** Overlay strength of the hit flash (0..1). */
export const FLASH_ALPHA = 0.6;
/**
 * Hit-flash duration. 80 ms was ~2.4 sim ticks at 30 Hz — long enough to be
 * dropped by a frame hitch. Autos land only every ~2 s, so there is no strobe
 * risk in going longer, and 130 ms reads as a deliberate hit.
 */
export const FLASH_MS = 130;

// ---------------------------------------------------------------------------
// ImpactProfile — the ONE sim-computed hit-weight (client-side mirror)
// ---------------------------------------------------------------------------

/**
 * Client mirror of the sim's `ImpactProfile` (packages/shared sim/combat/damage).
 * The wire carries it untyped on `hitImpact.data.profile` (Record<string,unknown>);
 * this is the shape the client narrows it to. Kept verbatim in step with the
 * STAGE-1 contract — do not diverge the field set.
 */
export type ImpactTier = "light" | "medium" | "heavy" | "crit";
export interface ImpactProfile {
  tier: ImpactTier;
  /** authoritative freeze ticks applied to BOTH fighters (crit/guardBreak-emphasised). */
  hitstopTicks: number;
  /** victim-only action-lock ticks (>= hitstopTicks). Client does not gate on it. */
  hitstunTicks: number;
  /** unit push direction (victim away from source); {0,0} when none. */
  knockbackDir: { x: number; z: number };
  /** push distance actually applied this hit (0 = no shove). */
  knockbackMag: number;
  isEX: boolean;
  isBlock: boolean;
  isCounter?: boolean;
}

/**
 * Narrow an untyped `hitImpact.data.profile` into an ImpactProfile, or null when
 * the field is absent/malformed (older replays, non-hit events). Defensive:
 * the client must never throw on a wire payload it doesn't recognise.
 */
export function asImpactProfile(v: unknown): ImpactProfile | null {
  if (typeof v !== "object" || v === null) return null;
  const p = v as Record<string, unknown>;
  const tier = p.tier;
  if (tier !== "light" && tier !== "medium" && tier !== "heavy" && tier !== "crit") return null;
  if (typeof p.hitstopTicks !== "number") return null;
  const dir = p.knockbackDir as { x?: unknown; z?: unknown } | undefined;
  return {
    tier,
    hitstopTicks: p.hitstopTicks,
    hitstunTicks: typeof p.hitstunTicks === "number" ? p.hitstunTicks : 0,
    knockbackDir: {
      x: typeof dir?.x === "number" ? dir.x : 0,
      z: typeof dir?.z === "number" ? dir.z : 0,
    },
    knockbackMag: typeof p.knockbackMag === "number" ? p.knockbackMag : 0,
    isEX: Boolean(p.isEX),
    isBlock: Boolean(p.isBlock),
    isCounter: p.isCounter === undefined ? undefined : Boolean(p.isCounter),
  };
}

// ---------------------------------------------------------------------------
// tier weight table — the SINGLE scalar every channel scales from
// ---------------------------------------------------------------------------

/**
 * Per-tier reaction tunables. `weight` (0..1) is the one scalar shake/spark/sfx
 * scale from so light→heavy crosses on the same tier for every channel. The
 * flash durations stay short (收尾精準): even a crit flash clears well under
 * 200 ms so back-to-back hits never strobe.
 */
interface TierFx {
  /** 0..1 hit-weight — shake amp, damage-number emphasis, sfx variant all scale from this. */
  weight: number;
  /** victim red/magenta flash duration (ms) and overlay strength (0..1). */
  flashMs: number;
  flashAlpha: number;
  /** attacker white "I connected" pop — shorter + lighter than the victim flash. */
  attackerMs: number;
  attackerAlpha: number;
}

const TIER_FX: Record<ImpactTier, TierFx> = {
  light: { weight: 0.35, flashMs: 110, flashAlpha: 0.5, attackerMs: 60, attackerAlpha: 0.45 },
  medium: { weight: 0.6, flashMs: 130, flashAlpha: 0.6, attackerMs: 70, attackerAlpha: 0.55 },
  heavy: { weight: 0.85, flashMs: 160, flashAlpha: 0.72, attackerMs: 85, attackerAlpha: 0.68 },
  crit: { weight: 1.0, flashMs: 185, flashAlpha: 0.85, attackerMs: 95, attackerAlpha: 0.8 },
};

/** 0..1 hit-weight for a tier — the single scalar every channel scales from. */
export function tierWeight(tier: ImpactTier): number {
  return TIER_FX[tier].weight;
}

// ---------------------------------------------------------------------------
// planImpactFeedback — the ONE orchestrator
// ---------------------------------------------------------------------------

/** A flash instruction: overlay colour, strength, and how long to hold it. */
export interface FlashSpec {
  rgb: [number, number, number];
  alpha: number;
  ms: number;
}

/**
 * A camera-shake REQUEST (not an applied shake). combatFeedback is the single
 * authority for how hard a tier shakes; the CAMERA wave (GameApp/CameraRig)
 * consumes this and layers on the local-perspective (taken vs self) + quality
 * multipliers it alone knows. `dir` is the knockback vector, reserved for the
 * future directional camera kick (audit P1). `amp` is the pre-multiplier base.
 */
export interface ShakeRequest {
  amp: number;
  durationMs: number;
  dir: { x: number; z: number };
}

/**
 * The coordinated reaction set for ONE landed hit, all keyed off ONE tier.
 * `freeze*` are AUTHORITATIVE (the sim's hitstopTicks, never re-derived), so the
 * animation freeze un-freezes exactly with the body and a fully-blocked hit
 * (dmg 0, impact ≥ the sim floor) still freezes both fighters.
 */
export interface ImpactFeedbackPlan {
  tier: ImpactTier;
  isBlock: boolean;
  isEX: boolean;
  /** authoritative sim freeze applied to BOTH fighters. 0 = no freeze (chip). */
  freezeTicks: number;
  freezeMs: number;
  /** victim red/magenta flash, tier-scaled intensity + duration. */
  victimFlash: FlashSpec;
  /** attacker white pop, tier-scaled. */
  attackerFlash: FlashSpec;
  /** camera-shake REQUEST — consumed by the camera wave, NOT applied here. */
  shake: ShakeRequest;
  // ----- reserved hook / request points (a LATER wave consumes them) --------
  // SPARKS  : VfxSystem already reads `profile` off the same hitImpact event;
  //           it should switch its spark heaviness to `tier` (do NOT spawn here).
  // CAMERA  : consume `shake` (amp + dir) — a directional kick is a follow-up.
  // SFX     : combatSfx should pick a light/med/heavy variant off `tier` (audit
  //           "SFX weight tiering") — do NOT play audio here.
  // NUMBER  : the floating damage number (#92) already emphasises crit/kill; it
  //           should read `tier` so its pop crosses the same boundary. Spawned
  //           in the UI layer, not here.
}

/**
 * Turn ONE sim `ImpactProfile` into ONE coordinated reaction set. Pure: returns
 * data, dispatches nothing (the imperative shell applies freeze + flashes and
 * hands `shake` to the camera wave). Every channel is scaled by the SAME tier,
 * except the freeze, which is taken VERBATIM from the sim's authoritative tick
 * count so the client and sim un-freeze on the identical frame.
 */
export function planImpactFeedback(
  profile: ImpactProfile,
  ctx: { dmgType?: string; tickMs: number },
): ImpactFeedbackPlan {
  const fx = TIER_FX[profile.tier];
  const amp = Math.min(SHAKE_MAX_AMP, fx.weight * SHAKE_MAX_AMP);
  return {
    tier: profile.tier,
    isBlock: profile.isBlock,
    isEX: profile.isEX,
    freezeTicks: profile.hitstopTicks,
    freezeMs: Math.max(0, profile.hitstopTicks) * ctx.tickMs,
    victimFlash: { rgb: flashColorFor(ctx.dmgType), alpha: fx.flashAlpha, ms: fx.flashMs },
    attackerFlash: { rgb: [...ATTACKER_FLASH_RGB], alpha: fx.attackerAlpha, ms: fx.attackerMs },
    shake: { amp, durationMs: shakeDurationMs(amp), dir: { ...profile.knockbackDir } },
  };
}

// ---------------------------------------------------------------------------
// camera shake (CameraRig + GameApp)
// ---------------------------------------------------------------------------

/** Absolute cap on a single shake impulse's amplitude (world units). */
export const SHAKE_MAX_AMP = 0.85;
/** Damage → base amplitude slope (world units per point of damage). */
const SHAKE_DMG_SLOPE = 0.006;
/** Multipliers layered onto the base amplitude. */
const SHAKE_CRIT_MULT = 1.5;
const SHAKE_KILL_MULT = 2.2;
/** Taking damage shakes harder than landing your own hit (self = a tiny kick). */
const SHAKE_TAKEN_MULT = 1.4;
const SHAKE_SELF_MULT = 0.45;

export interface ImpactShakeInput {
  amount: number;
  crit?: boolean;
  killingBlow?: boolean;
  /** true = the local player is the victim; false = the local player's own hit. */
  taken?: boolean;
}

/**
 * Peak shake amplitude (world units) for an impact. Scales with damage, is
 * bigger on crit/killingBlow, stronger when you TAKE damage than when you land
 * a hit, and is clamped to SHAKE_MAX_AMP. Pure + monotonic in `amount`.
 */
export function impactShakeAmp(input: ImpactShakeInput): number {
  const amount = Math.max(0, input.amount);
  if (amount <= 0) return 0;
  let amp = amount * SHAKE_DMG_SLOPE;
  if (input.crit) amp *= SHAKE_CRIT_MULT;
  if (input.killingBlow) amp *= SHAKE_KILL_MULT;
  amp *= input.taken ? SHAKE_TAKEN_MULT : SHAKE_SELF_MULT;
  return Math.min(SHAKE_MAX_AMP, amp);
}

/** Shake impulse duration (ms): a bigger hit rings out a little longer. */
export function shakeDurationMs(amp: number): number {
  const a = Math.max(0, Math.min(SHAKE_MAX_AMP, amp));
  return 160 + (a / SHAKE_MAX_AMP) * 300; // 160..460 ms
}

/**
 * Decaying envelope of a shake impulse over its life: 1 at birth, 0 at (and
 * past) `durationMs`, quadratic ease-out in between so the shake dies smoothly
 * instead of cutting off. Pure; the sole "shake impulse decay math".
 */
export function shakeDecayEnvelope(ageMs: number, durationMs: number): number {
  if (!(durationMs > 0) || ageMs <= 0) return ageMs <= 0 ? 1 : 0;
  if (ageMs >= durationMs) return 0;
  const t = 1 - ageMs / durationMs;
  return t * t;
}

// ---------------------------------------------------------------------------
// quality-tier gates (GameApp) — keep the ~700 fps baseline; low tier off
// ---------------------------------------------------------------------------

/**
 * Whether the heavy full-screen post-fx (red vignette + ripple/heat-distortion)
 * may run. OFF on the mobile/low tier — a full-screen pass is the one thing
 * that can dent the fps baseline on weak GPUs. Camera shake / flash / particles
 * stay on every tier (they are near-free).
 */
export function heavyPostFxEnabled(quality: Quality): boolean {
  return quality === "desktop";
}

/** Camera-shake amplitude multiplier per tier (gently reduced on mobile). */
export function cameraShakeScaleFor(quality: Quality): number {
  return quality === "mobile" ? 0.5 : 1;
}
