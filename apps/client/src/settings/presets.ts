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
 * Concrete params a fixed preset WOULD write; null for "auto" (adaptive
 * delegates).
 *
 * ⚠️ `fpsCap` here is the PLATFORM default, not a per-preset value. All three
 * presets author 60 — that field never distinguished them, it was just「預設值」
 * copied three times. Since owner 2026-07-28 the default is 60 desktop / 30
 * mobile, so leaving the literal here would make「高畫質」 mean「順便把手機推回
 * 60」.
 *
 * ⚠️⚠️ 但「這個預設**會不會**真的寫下 fpsCap」不是這個函式決定的 —— 見
 * `applyPreset` 與 `GraphicsSettings.fpsCapFollowsPreset`。
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
 *
 * ── fpsCap 是被**排除**的那一格 (GH#271) ──────────────────────────────────
 * 這裡以前無條件 `...p`,所以玩家在 fps 那一排選的東西一碰畫質預設就沒了 ——
 * 而 Segmented 仍然亮著他選的那個。owner 2026-08-04「我選了 max 反而會變成
 * 固定 30」就是從這個洞掉下去的:選 Max(0) → 動到畫質 → 被寫回 60。
 *
 * 現在由 `g.fpsCapFollowsPreset` 決定（出貨值 false = 玩家贏）。判準寫在
 * `GraphicsSettings.fpsCapFollowsPreset`;`followFpsCap` 這個明寫參數只給測試
 * 用來同時驗兩種模式,出貨路徑一律讀設定裡的那一格。
 */
export function applyPreset(
  g: GraphicsSettings,
  preset: QualityPreset,
  touch = false,
  followFpsCap: boolean = g.fpsCapFollowsPreset,
): GraphicsSettings {
  const p = paramsForPreset(preset, touch);
  if (!p) return { ...g, qualityPreset: "auto" };
  const { fpsCap, ...rest } = p;
  return {
    ...g,
    qualityPreset: preset,
    ...rest,
    fpsCap: followFpsCap ? fpsCap : g.fpsCap,
  };
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
