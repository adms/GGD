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
