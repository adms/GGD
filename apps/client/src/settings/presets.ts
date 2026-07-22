/**
 * settings/presets — pure preset → concrete-graphics mapping and first-boot
 * auto-detect. low/medium/high write real values; "auto" returns null (the
 * adaptive manager owns those fields). Unit-tested; no DOM/Babylon.
 */
import type { FpsCap, GraphicsSettings, QualityPreset } from "./types";

/** The concrete graphics values a fixed preset writes. */
export interface PresetParams {
  resolutionScale: number;
  particleDensity: number;
  shadows: boolean;
  drawDistance: number;
  antialias: boolean;
  fpsCap: FpsCap;
}

export const PRESET_PARAMS: Record<"low" | "medium" | "high", PresetParams> = {
  low: {
    resolutionScale: 0.6,
    particleDensity: 0.3,
    shadows: false,
    drawDistance: 55,
    antialias: false,
    fpsCap: 60,
  },
  medium: {
    resolutionScale: 0.85,
    particleDensity: 0.6,
    shadows: true,
    drawDistance: 90,
    antialias: true,
    fpsCap: 60,
  },
  high: {
    resolutionScale: 1.0,
    particleDensity: 1.0,
    shadows: true,
    drawDistance: 140,
    antialias: true,
    fpsCap: 60,
  },
};

/** Concrete params for a fixed preset; null for "auto" (adaptive delegates). */
export function paramsForPreset(preset: QualityPreset): PresetParams | null {
  return preset === "auto" ? null : PRESET_PARAMS[preset];
}

/**
 * Apply a preset onto a graphics settings object. Fixed presets overwrite the
 * concrete fields; "auto" only flips the selector (adaptive controls values).
 */
export function applyPreset(g: GraphicsSettings, preset: QualityPreset): GraphicsSettings {
  const p = paramsForPreset(preset);
  if (!p) return { ...g, qualityPreset: "auto" };
  return { ...g, qualityPreset: preset, ...p };
}

export interface DetectEnv {
  hardwareConcurrency: number;
  /** navigator.deviceMemory (GB); undefined on browsers that omit it. */
  deviceMemory?: number;
  touch: boolean;
}

/**
 * First-boot recommended preset from device hints: touch → medium (low on very
 * weak devices), desktop → high (medium on weak CPUs / low memory).
 */
export function autoDetectPreset(env: DetectEnv): "low" | "medium" | "high" {
  const cores = env.hardwareConcurrency > 0 ? env.hardwareConcurrency : 4;
  const mem = env.deviceMemory;
  if (env.touch) {
    if (cores <= 3 || (mem !== undefined && mem < 3)) return "low";
    return "medium";
  }
  if (cores <= 4 || (mem !== undefined && mem <= 4)) return "medium";
  return "high";
}
