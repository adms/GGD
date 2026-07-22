/**
 * postFxMath — PURE intensity + decay math for the combat post-processes (the
 * red screen-edge vignette on local damage, and the ripple / heat-distortion
 * on heavy hits + beams). No Babylon here: CombatPostFx is the imperative shell
 * that feeds these numbers into the fragment shader uniforms each frame.
 */

/** Peak red-vignette strength (0..1) at full hp loss. */
export const VIGNETTE_MAX = 0.85;
/** Peak ripple displacement (UV units) fed to the distortion shader. */
export const RIPPLE_MAX = 0.03;

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

export interface RippleInput {
  amount: number;
  crit?: boolean;
  killingBlow?: boolean;
}

/** Damage that maps to the full ripple displacement (before crit/kill boosts). */
const RIPPLE_FULL_DMG = 220;

/**
 * Ripple/heat-distortion strength for an impact — scales with damage, bigger on
 * crit/killingBlow, clamped to RIPPLE_MAX. Pure + monotonic in `amount`.
 */
export function rippleAmpForImpact(input: RippleInput): number {
  const amount = Math.max(0, input.amount);
  if (amount <= 0 && !input.crit && !input.killingBlow) return 0;
  let a = (amount / RIPPLE_FULL_DMG) * RIPPLE_MAX;
  if (input.crit) a *= 1.4;
  if (input.killingBlow) a *= 1.8;
  return Math.min(RIPPLE_MAX, a);
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

/** Half-lives (ms) for the two channels — the vignette lingers, ripple snaps. */
export const VIGNETTE_HALF_LIFE_MS = 220;
export const RIPPLE_HALF_LIFE_MS = 90;
