/**
 * postFxMath — PURE intensity + decay math for the combat post-process (the red
 * screen-edge vignette on local damage). No Babylon here: CombatPostFx is the
 * imperative shell that feeds these numbers into the fragment shader uniforms
 * each frame.
 *
 * The ripple / heat-distortion channel that used to live here was removed with
 * its shader in task #196 — see CombatPostFx's module doc for why a radial
 * screen warp is unsalvageable in a camera rig that always looks at the local
 * champion's feet.
 */

/** Peak red-vignette strength (0..1) at full hp loss. */
export const VIGNETTE_MAX = 0.85;

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/**
 * Red screen-edge vignette intensity for a chunk of hp lost this hit, as a
 * fraction of max hp (0..1). Concave (sqrt) so even a small chip reads, and a
 * big hit still slams to VIGNETTE_MAX. Pure + monotonic + clamped.
 */
export function vignetteIntensityForHpLoss(hpLostFrac: number): number {
  const f = clamp01(hpLostFrac);
  return Math.sqrt(f) * VIGNETTE_MAX;
}

/**
 * Exponentially decay an intensity toward 0 over `dtMs`, given a half-life.
 * `intensity * 0.5^(dt/halfLife)`, snapped to 0 below a tiny epsilon so the
 * shell can drop the post-process pass when everything is idle (zero steady-
 * state cost). Pure.
 */
export function decayIntensity(intensity: number, dtMs: number, halfLifeMs: number): number {
  if (!(intensity > 0)) return 0;
  if (!(halfLifeMs > 0) || dtMs <= 0) return intensity;
  const next = intensity * Math.pow(0.5, dtMs / halfLifeMs);
  return next < 1e-3 ? 0 : next;
}

/** Half-life (ms) for the vignette channel — it lingers after the flare. */
export const VIGNETTE_HALF_LIFE_MS = 220;
export const RIPPLE_HALF_LIFE_MS = 90;

// ---------------------------------------------------------------------------
// FIRE-RING BURN TINT (task #195) — 「角色被火燒到畫面會變半透明紅」
// ---------------------------------------------------------------------------

/**
 * Peak burn-tint strength (0..1). Deliberately well under 1: the screen must
 * read as ON FIRE, not as BROKEN. At 0.42 the arena, the HP bars and the
 * ability icons all stay legible through the wash, which matters because the
 * player is being told to RUN somewhere — a tint that hides the ring would
 * punish them for the feedback meant to save them.
 */
export const BURN_MAX = 0.42;

/**
 * Half-life (ms) of the burn tint once the burning stops. Short enough that
 * stepping back inside the ring reads as immediate relief, long enough that the
 * 30 Hz snapshot cadence (33 ms) cannot make it strobe between two ticks that
 * happen to straddle the boundary.
 */
export const BURN_HALF_LIFE_MS = 260;

/**
 * Target burn-tint strength for a per-second burn rate (fraction of maxHp).
 *
 * The shipped ring runs 4 %/s → 20 %/s, so `BURN_FULL_RATE` is the ramp's end:
 * the wash starts as a hint and reaches full only when the ring has closed and
 * there is nowhere left to stand. Concave (sqrt) like the damage vignette, so
 * the first seconds of burning are unmistakable rather than subliminal.
 * Pure, monotonic, clamped.
 */
export const BURN_FULL_RATE = 0.2;

export function burnTintForRate(ratePerSec: number): number {
  const f = clamp01(ratePerSec / BURN_FULL_RATE);
  return Math.sqrt(f) * BURN_MAX;
}
