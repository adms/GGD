/**
 * RenderConfig — the client quality tier. "mobile" (auto-detected on touch
 * devices / <=4 logical cores, manual override in the HUD settings corner)
 * caps hardware scaling at 1.5x and halves particle budgets to hold 60 fps on
 * iPhone; "desktop" keeps the 2x retina cap. Plain module state (discrete —
 * changed by user action only); the Renderer subscribes to re-apply scaling
 * live. No @babylonjs imports needed here.
 */
import { autoQuality, type Quality } from "../input/mobileDetect";

export type { Quality };
export type QualityOverride = Quality | "auto";

const STORAGE_KEY = "ggd.quality";

let override: QualityOverride = "auto";
const listeners = new Set<(q: Quality) => void>();

/** Load the persisted override (call once at boot; storage-safe). */
export function initRenderConfig(storage?: Pick<Storage, "getItem" | "setItem">): void {
  const store = storage ?? safeLocalStorage();
  const saved = store?.getItem(STORAGE_KEY);
  if (saved === "mobile" || saved === "desktop" || saved === "auto") override = saved;
}

export function qualityOverride(): QualityOverride {
  return override;
}

/** Override resolution: explicit override wins, otherwise auto-detect. */
export function resolveQuality(auto: Quality, ovr: QualityOverride): Quality {
  return ovr === "auto" ? auto : ovr;
}

export function effectiveQuality(): Quality {
  return resolveQuality(autoQuality(), override);
}

export function setQualityOverride(
  next: QualityOverride,
  storage?: Pick<Storage, "getItem" | "setItem">,
): void {
  override = next;
  (storage ?? safeLocalStorage())?.setItem(STORAGE_KEY, next);
  const q = effectiveQuality();
  for (const fn of listeners) fn(q);
}

/** Subscribe to quality changes (returns an unsubscriber). */
export function onQualityChange(fn: (q: Quality) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** DPR cap per tier: iPhone's 3x DPR triples fill cost for no MOBA-distance gain. */
export function dprCapFor(quality: Quality): number {
  return quality === "mobile" ? 1.5 : 2;
}

/**
 * Engine hardware scaling level (render-resolution divisor) for a given user
 * resolutionScale (0.5–1.0) and device DPR. `level = 1 / (min(dpr,cap)·scale)`:
 * scale 1.0 keeps the tier's retina cap, scale 0.5 halves the render buffer on
 * top of it. Higher level = fewer pixels = cheaper fill.
 */
export function resolutionToHardwareScaling(
  resolutionScale: number,
  dpr: number,
  cap = 2,
): number {
  const effDpr = Math.min(Math.max(dpr, 1), Math.max(cap, 1));
  const scale = Math.min(Math.max(resolutionScale, 0.4), 1);
  return 1 / (effDpr * scale);
}

/**
 * Legacy tier→scaling: 1/min(dpr,cap) at full resolutionScale. Kept for the
 * mobile quality-tier API; new code drives resolutionToHardwareScaling.
 */
export function hardwareScalingFor(quality: Quality, dpr: number): number {
  return resolutionToHardwareScaling(1, dpr, dprCapFor(quality));
}

/** Particle budget multiplier (burst counts, emit rates, capacities). */
export function particleScaleFor(quality: Quality): number {
  return quality === "mobile" ? 0.5 : 1;
}

/** Clamp a particleDensity setting (0–1) into the vfx budget multiplier. */
export function particleBudgetScale(density: number): number {
  return Number.isFinite(density) ? Math.min(Math.max(density, 0), 1) : 1;
}

function safeLocalStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null; // WKWebView private mode throws on access
  }
}
