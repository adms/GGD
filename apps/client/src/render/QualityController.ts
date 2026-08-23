/**
 * QualityController — the applier seam. It reads the SettingsStore and the
 * AdaptiveManager and publishes a single flattened RenderParams that the
 * consumers subscribe to: the Renderer (hardware scaling / AA), the VfxSystem
 * (particle budget), the GameApp loop (fps cap, draw-distance cull, interp
 * delay, damage-number cap) and the Lighting (shadows).
 *
 * Preset resolution:
 *  - "auto"  → the full adaptive ladder owns resolution/particles/shadows/cull;
 *  - fixed   → the stored preset values are used, and if `dynamicResolution`
 *              is on the adaptive ladder may still nudge resolution downward,
 *              but only as far as FIXED_PRESET_RES_FLOOR (see AdaptiveQuality).
 * No Babylon here — consumers apply the numbers behind the render seam.
 */
import { settingsStore } from "../settings";
import type { CombatTextScope, FpsCap, GraphicsSettings, Settings } from "../settings";
import {
  ADAPTIVE_LADDER,
  AdaptiveManager,
  fixedPresetResolution,
  type FrameStats,
} from "./AdaptiveQuality";
import { lodTierForPreset, subscribeModelLodPolicy, type ModelLodTier } from "./modelLod";
import { airScatterEnabled } from "./airScatter";

export interface RenderParams {
  resolutionScale: number;
  particleDensity: number;
  shadows: boolean;
  drawDistance: number;
  antialias: boolean;
  fpsCap: FpsCap;
  interpolationDelayMs: number;
  /**
   * intent 送出率 (task #282). 它跟 `fpsCap` **刻意分開**:一個是「畫幾張」,
   * 一個是「操作送出去幾次」,#282 的缺陷正是這兩件事被同一個 `if` 綁在一起。
   * 走這條 seam 是為了跟 `interpolationDelayMs` 一樣拿到 live 更新 ——
   * 玩家改設定不用重開一場。
   */
  intentHz: number;
  damageNumberCap: number;
  /** how much of the fight gets a floating number (task #92). */
  combatTextScope: CombatTextScope;
  /**
   * Which .glb tier AssetManager fetches (task #115). Derived from the FIXED
   * preset only — never from the adaptive rung, because changing it costs a
   * network fetch rather than a per-frame GPU knob (see render/modelLod.ts).
   */
  modelLod: ModelLodTier;
  /**
   * 空氣漫反射開不開（GH#610）。⭐ 這是**解析過後**的布林，⛔ 不是設定裡那一格
   * 三態的原值 —— 畫質預設與適應梯子都有一票（判準在 `render/airScatter.ts`），
   * 而 `Lighting` 只想知道「這一幀要不要有空氣」。
   */
  airScatter: boolean;
  /** current adaptive ladder index (for the perf overlay). */
  adaptiveLevel: number;
  /** whether the adaptive manager is currently in control of quality. */
  adaptiveActive: boolean;
}

/** adaptive target = the fps cap, or 60 when uncapped. */
function targetFor(cap: FpsCap): number {
  return cap === 0 ? 60 : cap;
}

function isAdaptiveActive(g: GraphicsSettings): boolean {
  return g.qualityPreset === "auto" || g.dynamicResolution;
}

export class QualityController {
  private readonly adaptive = new AdaptiveManager(60);
  private params: RenderParams;
  private readonly listeners = new Set<(p: RenderParams) => void>();
  private off: (() => void) | null = null;
  private offPolicy: (() => void) | null = null;

  constructor(private readonly store = settingsStore) {
    this.adaptive.setTargetFps(targetFor(this.store.graphics().fpsCap));
    this.params = this.compute(this.store.get());
  }

  /** Wire up the settings subscription (call once at boot). */
  init(): void {
    if (this.off) return;
    this.off = this.store.subscribe((s) => {
      this.adaptive.setTargetFps(targetFor(s.graphics.fpsCap));
      this.recompute();
    });
    // #115 — the preset→model-tier table is CONTENT (`config/model-lod.json`),
    // and content lands a few hundred ms after this controller first computes
    // its params. Without this subscription the operator's table would be
    // parsed, correct, and dead: `modelLod` would keep the boot-time value for
    // the whole session and no subscriber would ever be told otherwise.
    this.offPolicy = subscribeModelLodPolicy(() => this.recompute());
  }

  dispose(): void {
    this.off?.();
    this.off = null;
    this.offPolicy?.();
    this.offPolicy = null;
    this.listeners.clear();
  }

  getParams(): RenderParams {
    return this.params;
  }

  frameStats(): FrameStats {
    return this.adaptive.stats();
  }

  subscribe(fn: (p: RenderParams) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Feed one frame's WORK cost (pre-cap ms) + the clock. Drives the adaptive
   * ladder; recomputes + notifies subscribers when the level changes.
   */
  sample(workMs: number, nowMs: number): void {
    if (!isAdaptiveActive(this.store.graphics())) return;
    if (this.adaptive.sample(workMs, nowMs)) this.recompute();
  }

  private recompute(): void {
    this.params = this.compute(this.store.get());
    for (const fn of this.listeners) fn(this.params);
  }

  private compute(s: Settings): RenderParams {
    const g = s.graphics;
    const rung = ADAPTIVE_LADDER[Math.min(this.adaptive.level, ADAPTIVE_LADDER.length - 1)]!;
    const adaptiveActive = isAdaptiveActive(g);

    let resolutionScale = g.resolutionScale;
    let particleDensity = g.particleDensity;
    let shadows = g.shadows;
    let drawDistance = g.drawDistance;

    if (g.qualityPreset === "auto") {
      resolutionScale = rung.resolutionScale;
      particleDensity = rung.particleDensity;
      shadows = rung.shadows;
      drawDistance = rung.drawDistance;
    } else if (g.dynamicResolution) {
      // fixed preset + dynamic resolution: the ladder may only pull resolution
      // DOWN from the preset base (never above it) and only as far as
      // FIXED_PRESET_RES_FLOOR; everything else stays put.
      resolutionScale = fixedPresetResolution(g.resolutionScale, rung.resolutionScale);
    }

    return {
      resolutionScale,
      particleDensity,
      shadows,
      drawDistance,
      antialias: g.antialias,
      fpsCap: g.fpsCap,
      interpolationDelayMs: s.network.interpolationDelayMs,
      // NEVER from the adaptive ladder: dropping frames under load is a quality
      // trade, dropping the player's inputs is not one they agreed to.
      intentHz: s.network.intentHz,
      damageNumberCap: g.damageNumberCap,
      // scope is a READABILITY choice, never an adaptive one: the ladder may
      // shrink the density cap under load, but it must not silently stop
      // showing the player their own damage.
      combatTextScope: g.combatTextScope,
      modelLod: lodTierForPreset(g.qualityPreset),
      // ⚠️ 梯子沒在管事的時候（固定預設 + 關掉動態解析度）要餵 0,⛔ 不是
      // `this.adaptive.level` —— 那個值會停在上一次它還在管事時的那一階,
      // 於是玩家把動態解析度關掉之後,空氣就被一個**沒有人在更新**的數字關著。
      airScatter: airScatterEnabled(
        g.airScatter,
        g.qualityPreset,
        adaptiveActive ? this.adaptive.level : 0,
      ),
      adaptiveLevel: this.adaptive.level,
      adaptiveActive,
    };
  }
}

/** Process-wide controller shared by the render seam + loop. */
export const qualityController = new QualityController();
