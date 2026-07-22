/**
 * Pure math for the login ENTER TRANSITION (task #20): the ~1.4 s cinematic that
 * swoops the ArcRotateCamera FORWARD + ZOOMS onto a floating arena island
 * ("mount-and-fly-onto-island"), then ends on a WHITE FLASH before the screen
 * switches. No Babylon, no DOM — plain numbers so vitest can pin the camera
 * keyframes + flash curve without a GPU. LoginScene is the imperative shell that
 * drives the live camera/overlay from these functions; AuthScreen decides WHICH
 * path (swoop / quick-flash / instant) to run via `chooseEnterMode`.
 */
import { clamp01, type CameraPose } from "./math";

export interface EnterTransitionConfig {
  /** total swoop duration (ms) — spec: ~1.2–1.6 s */
  durationMs: number;
  /** progress 0..1 at which the white flash begins ramping in */
  flashStart: number;
  /** camera radius at the END of the swoop (zoomed in onto the island) */
  approachRadius: number;
  /** multiply the start beta to pitch the camera DOWN onto the island */
  betaScale: number;
  /** radians of alpha turn during the dive (curves toward the island) */
  alphaSwing: number;
}

export const DEFAULT_ENTER_TRANSITION: EnterTransitionConfig = {
  durationMs: 1400,
  flashStart: 0.5,
  approachRadius: 7,
  betaScale: 0.82,
  alphaSwing: 0.55,
};

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smooth ease-in-out (cubic). `easeInOut(0)=0`, `easeInOut(1)=1`, monotone. */
export function easeInOut(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * Interpolate the swoop camera pose at progress `p01` between the drift pose
 * `from` (t=0) and the on-island pose `to` (t=1), eased. Writes into `out` so
 * the render loop stays allocation-free.
 */
export function enterCameraPose(out: CameraPose, p01: number, from: CameraPose, to: CameraPose): CameraPose {
  const e = easeInOut(p01);
  out.alpha = lerp(from.alpha, to.alpha, e);
  out.beta = lerp(from.beta, to.beta, e);
  out.radius = lerp(from.radius, to.radius, e);
  out.targetY = lerp(from.targetY, to.targetY, e);
  return out;
}

/**
 * White-flash overlay alpha (0..1) at progress `p01`: transparent until
 * `flashStart`, then ramps linearly to fully-white by the end. Clamped so any
 * out-of-range input is safe.
 */
export function enterFlashAlpha(p01: number, flashStart: number): number {
  const p = clamp01(p01);
  if (p >= 1) return 1; // completion is always fully white
  const s = flashStart < 0 ? 0 : flashStart > 1 ? 1 : flashStart;
  if (p <= s || s >= 1) return 0; // transparent until the flash begins
  return clamp01((p - s) / (1 - s));
}

/**
 * The on-island target pose for a swoop: zoom the radius WAY in (fly onto the
 * island), pitch the camera down onto it, curve the orbit toward it, and look at
 * the island's height. `from` is the live drift pose the swoop starts from.
 */
export function islandApproachPose(
  island: { x: number; y: number; z: number },
  from: CameraPose,
  cfg: EnterTransitionConfig = DEFAULT_ENTER_TRANSITION,
): CameraPose {
  return {
    alpha: from.alpha + cfg.alphaSwing,
    beta: from.beta * cfg.betaScale,
    radius: cfg.approachRadius,
    targetY: island.y,
  };
}

/**
 * Which enter path to run. Under reduced motion we skip the swoop AND the flash
 * (photosensitivity-safe → proceed instantly); with the WebGL scene live we run
 * the full cinematic swoop; otherwise (WebGL off, motion allowed) a quick white
 * flash. Pure so AuthScreen's decision is unit-tested without a DOM.
 */
export type EnterMode = "swoop" | "flash" | "instant";

export function chooseEnterMode(reducedMotion: boolean, sceneReady: boolean): EnterMode {
  if (reducedMotion) return "instant";
  return sceneReady ? "swoop" : "flash";
}

// ---------------------------------------------------------------------------
// RETURN transition (task #26): app → login plays the enter swoop IN REVERSE —
// the scene STARTS on the island close-up (the enter end-state) and eases back
// OUT/UP to the resting sky vista, with one big angry roar at the pull-back.
// ---------------------------------------------------------------------------

export interface ReturnTransitionConfig {
  /** total pull-back duration (ms) — spec: ~1.2–1.6 s, mirrors the enter swoop */
  durationMs: number;
}

export const DEFAULT_RETURN_TRANSITION: ReturnTransitionConfig = {
  durationMs: 1400,
};

/**
 * Interpolate the RETURN pose at progress `p01`: the exact inverse of the enter
 * swoop — starts at the on-island `approach` pose (t=0, where the enter swoop
 * ENDED) and eases back out to the `resting` sky-vista pose (t=1, where the
 * enter swoop STARTED). Same eased lerp as {@link enterCameraPose}, endpoints
 * swapped; writes into `out` so the render loop stays allocation-free.
 */
export function returnCameraPose(out: CameraPose, p01: number, approach: CameraPose, resting: CameraPose): CameraPose {
  return enterCameraPose(out, p01, approach, resting);
}

/**
 * Which return-intro path to run when the user comes BACK to the login screen
 * from the app (lobby/match/settlement). With the WebGL scene live and motion
 * allowed → the reverse pull-back swoop; under reduced motion or with WebGL off
 * → skip the swoop entirely (AuthScreen still plays a soft angry roar and shows
 * the login immediately). Pure so the decision is unit-tested without a DOM.
 */
export type ReturnMode = "swoop" | "skip";

export function chooseReturnMode(reducedMotion: boolean, sceneReady: boolean): ReturnMode {
  return !reducedMotion && sceneReady ? "swoop" : "skip";
}
