/**
 * settings/presets — pure preset → concrete-graphics mapping and first-boot
 * auto-detect. low/medium/high write real values; "auto" returns null (the
 * adaptive manager owns those fields). Unit-tested; no DOM/Babylon.
 */
import type { FpsCap, GraphicsSettings, QualityPreset } from "./types";
import { defaultFpsCap } from "../render/frameCap";

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

/**
 * Concrete params for a fixed preset; null for "auto" (adaptive delegates).
 *
 * ⚠️ `fpsCap` is overridden by the PLATFORM, not by the preset. All three
 * presets author 60 — that field never distinguished them, it was just「預設值」
 * copied three times. Since owner 2026-07-28 the default is 60 desktop / 30
 * mobile, so leaving the literal here would make picking any preset on a phone
 * silently undo the platform default, with the settings page still showing the
 * preset the player chose.
 */
export function paramsForPreset(
  preset: QualityPreset,
  touch = false,
): PresetParams | null {
  if (preset === "auto") return null;
  return { ...PRESET_PARAMS[preset], fpsCap: defaultFpsCap(touch) as FpsCap };
}

/**
 * Apply a preset onto a graphics settings object. Fixed presets overwrite the
 * concrete fields; "auto" only flips the selector (adaptive controls values).
 */
export function applyPreset(
  g: GraphicsSettings,
  preset: QualityPreset,
  touch = false,
): GraphicsSettings {
  const p = paramsForPreset(preset, touch);
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
