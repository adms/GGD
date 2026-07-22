/**
 * combatFeedback — the PURE tunables + math for the client "combat juice" layer
 * (Capcom-style 打擊感). Every decision worth testing lives here and touches
 * neither Babylon nor the DOM: camera-shake magnitude/decay/duration, the
 * hitstop window derived from a damage amount, the hit-flash colour per damage
 * type, and the quality-tier gates that keep the ~700 fps baseline intact.
 *
 * The imperative shells consume these:
 *   • CameraRig      — queues shake impulses, decays them via shakeDecayEnvelope
 *   • ChampionView   — flashColorFor tint + the hitstop freeze window
 *   • GameApp        — impactShakeAmp per event, the two quality-tier gates
 *
 * DETERMINISM NOTE (client only): the sim owns the authoritative hitstop (a
 * deterministic tick freeze of the two involved entities — see the sim half).
 * This module only mirrors the sim's "heavier hit = longer freeze, cap 6 ticks"
 * curve so the STRUCK MODEL's animation freeze reads in lock-step with it; it
 * never feeds the sim, so trig/float here can't desync anything.
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
// hitstop (ChampionView animation freeze)
// ---------------------------------------------------------------------------

/** Cap on the hitstop freeze — mirrors the sim's ~6-tick cap. */
export const HITSTOP_MAX_TICKS = 6;
/** Damage that maps to one extra freeze tick (heavier hit = longer freeze). */
export const HITSTOP_DMG_PER_TICK = 22;

/**
 * Ticks to freeze the struck model's animation for a hit of `amount`. Mirrors
 * the sim's deterministic curve: a floor of 1 tick on any landed hit, +1 per
 * HITSTOP_DMG_PER_TICK of damage, capped at HITSTOP_MAX_TICKS. Pure + integer.
 */
export function hitstopTicksForDamage(amount: number): number {
  if (!(amount > 0)) return 0;
  const extra = Math.floor(amount / HITSTOP_DMG_PER_TICK);
  return Math.min(HITSTOP_MAX_TICKS, 1 + extra);
}

/** The hitstop window in ms for a hit of `amount` (ticks × tick length). */
export function hitstopMsForDamage(amount: number, tickMs: number): number {
  return hitstopTicksForDamage(amount) * tickMs;
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
