/**
 * AdaptiveQuality — the "auto" quality brain. PURE decision logic + a thin
 * stateful manager; no Babylon here (the applier lives in QualityController).
 *
 * A rolling window of frame-COST samples (the ms actually spent doing frame
 * work, measured before any fps-cap sleep) yields avg/p95/min fps. When the
 * measured capability sits below target−margin for a sustained window we step
 * DOWN one ladder level; when it sits comfortably above target for a longer
 * window we step UP. A neutral hysteresis band + a minimum dwell time keep it
 * from thrashing on noisy input. The ladder degrades in a fixed order:
 * resolution → particles → shadows → draw distance.
 *
 * ---------------------------------------------------------------------------
 * ⭐ 2026-08-23 —— 階梯吃的是**整幀**成本，⛔ 不再只是 rAF 的 `workMs`
 * ---------------------------------------------------------------------------
 * A5 lane 量到（逐字）：
 *
 * > 「AdaptiveQuality **只讀 `workMs`** ⇒ 瀏覽器合成／reflow／GC／shader 編譯／
 * >  React reconcile **這一段再大它也不會降畫質** —— 「fps 好看卻很卡」
 * >  有了可指名的解釋」
 *
 * `workMs` 是 rAF 回呼自己頭尾相減的數字，所以它**結構上**看不見迴圈外面的
 * 一切。一台真的在掉幀的機器（合成吃掉 8 ms／幀）在它眼裡是
 * 「4 ms 工作 ⇒ 250 fps 的餘裕」⇒ 階梯不但不降，還會**往上爬**。
 *
 * ⚠️ 但是**不可以**直接把 `wallMs` 塞進來取代 `workMs`：牆上間隔的下界是
 * 「fps 上限」與「面板更新率」兩者的較大值，所以一台健康的機器**永遠**只會
 * 量到 60 —— 而爬上去的門檻是 `target + upMargin = 72`。⇒ 階梯一旦降下去就
 * **再也回不來**（`stepAdaptive` 的中性帶會把它永遠鎖在那一級）。
 *
 * ⭐ 所以規則是**一個判斷、兩種回報**（`adaptiveFrameCostMs`）：
 *
 * | 這一幀 | 回報什麼 | 為什麼 |
 * |---|---|---|
 * | **準時**（`wallMs ≤ 期限 × 容忍`） | `workMs` —— **餘裕** | 準時的時候「還有多少空間」才是唯一有資訊量的問題 |
 * | **遲到** | `wallMs` —— **整幀** | 遲到的那一幀⛔ 沒有閒置過，⛔ 不可以扣掉一段沒發生的「上限閒置」 |
 *
 * ⇒ 健康的機器行為與 2026-08-23 之前**逐位元相同**（準時 ⇒ 只看 workMs），
 * 而合成／GC／reflow 吃掉的那一段第一次進得了決策。
 *
 * ⚠️ ⛔ **`perfBus.workMs` / `capabilityFps` 不可以跟著換意思** —— 那兩格回答的是
 * 「這台機器畫得動幾張」，而 `perf/diag.ts` 的 `unaccountedMs` 是用它們相減出來的。
 * 所以誠實的 `workMs` 滾動視窗留在 `frameWorkWindow`，⛔ 不是跟階梯共用一個。
 */

// ⛔ 出貨預設只有一個住處 —— `config.model-lod@1` 的 Zod schema（第〇·四守則）。
//    ⚠️ 這是這個檔唯一的 import：它是純決策邏輯，⛔ 不碰 Babylon。
import { DEFAULT_ADAPTIVE_COST_MODE } from "@ggd/shared/content/schema/config/modelLod";


/** One rung of the degradation ladder (index 0 = best quality). */
export interface AdaptiveLevel {
  resolutionScale: number;
  particleDensity: number;
  shadows: boolean;
  drawDistance: number;
}

const FAR = 140;
const NEAR = 55;

/**
 * Ordered degradation: resolution first (1.0→0.85→0.7→0.6), then particles,
 * then shadows off, then draw distance. Monotonic non-increasing "cost".
 */
export const ADAPTIVE_LADDER: readonly AdaptiveLevel[] = [
  { resolutionScale: 1.0, particleDensity: 1.0, shadows: true, drawDistance: FAR },
  { resolutionScale: 0.85, particleDensity: 1.0, shadows: true, drawDistance: FAR },
  { resolutionScale: 0.7, particleDensity: 1.0, shadows: true, drawDistance: FAR },
  { resolutionScale: 0.6, particleDensity: 1.0, shadows: true, drawDistance: FAR },
  { resolutionScale: 0.6, particleDensity: 0.6, shadows: true, drawDistance: FAR },
  { resolutionScale: 0.6, particleDensity: 0.3, shadows: true, drawDistance: FAR },
  { resolutionScale: 0.6, particleDensity: 0.3, shadows: false, drawDistance: FAR },
  { resolutionScale: 0.6, particleDensity: 0.3, shadows: false, drawDistance: NEAR },
];

export const MAX_ADAPTIVE_LEVEL = ADAPTIVE_LADDER.length - 1;

/**
 * How far the ladder may pull resolution below a FIXED (non-"auto") preset.
 *
 * The ladder bottoms out at 0.6, which on a DPR-2 display becomes a hardware
 * scaling level of 1/(2·0.6) = 0.833 — a backbuffer only 1.2x the CSS size,
 * upscaled, and genuinely soft. Choosing a fixed preset is a deliberate
 * statement about image quality, so the ladder gets one rung of headroom
 * (1.0 → 0.85, a still-crisp 1.7x-CSS backbuffer on DPR 2) and no more.
 *
 * "auto" is unaffected: there the user has handed quality to the ladder, so it
 * keeps the full range down to 0.6 and can still protect fps on weak hardware.
 *
 * Task #43: latent-risk hardening, NOT the walking-judder fix — the judder was
 * measured with resolutionScale pinned at 1.0 and antialiasing on.
 */
export const FIXED_PRESET_RES_FLOOR = 0.85;

/**
 * Resolution for a fixed preset with dynamic resolution enabled: the ladder may
 * pull `base` DOWN, but never below the floor — and never ABOVE `base` either,
 * so a user who deliberately picked a low scale keeps it.
 */
export function fixedPresetResolution(base: number, rungScale: number): number {
  const floor = Math.min(base, FIXED_PRESET_RES_FLOOR);
  const pulled = Math.min(base, rungScale);
  return pulled < floor ? floor : pulled;
}

export interface FrameStats {
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  avgFps: number;
  p95Fps: number;
  minFps: number;
}

/** Pure fps-meter math: frame-time samples (ms) → avg / p95 / min fps. */
export function frameStats(times: readonly number[]): FrameStats {
  const n = times.length;
  if (n === 0) return { avgMs: 0, p95Ms: 0, maxMs: 0, avgFps: 0, p95Fps: 0, minFps: 0 };
  let sum = 0;
  for (const t of times) sum += t;
  const avgMs = sum / n;
  const sorted = [...times].sort((a, b) => a - b);
  const p95Ms = sorted[Math.min(n - 1, Math.floor(n * 0.95))]!;
  const maxMs = sorted[n - 1]!;
  const fps = (ms: number): number => (ms > 0 ? 1000 / ms : 0);
  return {
    avgMs,
    p95Ms,
    maxMs,
    avgFps: fps(avgMs),
    p95Fps: fps(p95Ms),
    minFps: fps(maxMs),
  };
}

export interface AdaptiveState {
  level: number;
  /** wall-clock ms at which capability first dropped below the band (or null). */
  belowSinceMs: number | null;
  /** wall-clock ms at which capability first rose above the band (or null). */
  aboveSinceMs: number | null;
  /** wall-clock ms of the last accepted level change. */
  lastChangeMs: number;
}

export interface AdaptiveConfig {
  targetFps: number;
  minLevel: number;
  maxLevel: number;
  /** fps below target that counts as "struggling". */
  downMargin: number;
  /** fps above target that counts as "headroom". */
  upMargin: number;
  /** sustain below the band this long before stepping down. */
  downSustainMs: number;
  /** sustain above the band this long before stepping up. */
  upSustainMs: number;
  /** minimum time between any two changes (anti-thrash). */
  dwellMs: number;
}

export const DEFAULT_ADAPTIVE_CONFIG: Omit<AdaptiveConfig, "targetFps"> = {
  minLevel: 0,
  maxLevel: MAX_ADAPTIVE_LEVEL,
  downMargin: 6,
  upMargin: 12,
  downSustainMs: 1500,
  upSustainMs: 4000,
  dwellMs: 1200,
};

export interface AdaptiveDecision {
  state: AdaptiveState;
  /** -1 stepped down (lower quality), +1 stepped up, 0 unchanged. */
  change: -1 | 0 | 1;
}

export function initAdaptiveState(level = 0): AdaptiveState {
  return { level, belowSinceMs: null, aboveSinceMs: null, lastChangeMs: -Infinity };
}

/**
 * Pure decision: (state, measured capability fps, now, cfg) → next state.
 * Deterministic — the manager just feeds it a rolling avg and the clock.
 */
export function stepAdaptive(
  state: AdaptiveState,
  costFps: number,
  nowMs: number,
  cfg: AdaptiveConfig,
): AdaptiveDecision {
  const belowThresh = cfg.targetFps - cfg.downMargin;
  const aboveThresh = cfg.targetFps + cfg.upMargin;
  let { level, belowSinceMs, aboveSinceMs, lastChangeMs } = state;
  let change: -1 | 0 | 1 = 0;

  if (costFps < belowThresh) {
    aboveSinceMs = null;
    belowSinceMs = belowSinceMs ?? nowMs;
    if (
      level < cfg.maxLevel &&
      nowMs - belowSinceMs >= cfg.downSustainMs &&
      nowMs - lastChangeMs >= cfg.dwellMs
    ) {
      level += 1;
      change = -1;
      lastChangeMs = nowMs;
      belowSinceMs = null;
    }
  } else if (costFps > aboveThresh) {
    belowSinceMs = null;
    aboveSinceMs = aboveSinceMs ?? nowMs;
    if (
      level > cfg.minLevel &&
      nowMs - aboveSinceMs >= cfg.upSustainMs &&
      nowMs - lastChangeMs >= cfg.dwellMs
    ) {
      level -= 1;
      change = 1;
      lastChangeMs = nowMs;
      aboveSinceMs = null;
    }
  } else {
    // inside the neutral band → reset both timers (hysteresis: no drift).
    belowSinceMs = null;
    aboveSinceMs = null;
  }

  return { state: { level, belowSinceMs, aboveSinceMs, lastChangeMs }, change };
}

const WINDOW = 90; // rolling frames (~1.5s at 60fps)
const MIN_SAMPLES = 20;

/** Stateful wrapper: rolling frame-cost window → adaptive level. */
export class AdaptiveManager {
  private times: number[] = [];
  private state: AdaptiveState;
  private cfg: AdaptiveConfig;

  constructor(targetFps = 60, level = 0) {
    this.cfg = { targetFps, ...DEFAULT_ADAPTIVE_CONFIG };
    this.state = initAdaptiveState(level);
  }

  get level(): number {
    return this.state.level;
  }

  get target(): number {
    return this.cfg.targetFps;
  }

  setTargetFps(fps: number): void {
    this.cfg.targetFps = fps > 0 ? fps : 60;
  }

  /** Reset to a level and forget history (e.g. on preset change). */
  reset(level = 0): void {
    this.state = initAdaptiveState(Math.min(Math.max(level, 0), this.cfg.maxLevel));
    this.times.length = 0;
  }

  /** Latest frame-cost stats over the rolling window. */
  stats(): FrameStats {
    return frameStats(this.times);
  }

  /**
   * Feed one frame's work cost (ms, pre-cap). Returns true when the adaptive
   * level changed this frame (caller then re-applies concrete params).
   */
  sample(workMs: number, nowMs: number): boolean {
    this.times.push(workMs);
    if (this.times.length > WINDOW) this.times.shift();
    if (this.times.length < MIN_SAMPLES) return false;
    const avgMs = this.stats().avgMs;
    const costFps = avgMs > 0 ? 1000 / avgMs : this.cfg.targetFps;
    const decision = stepAdaptive(this.state, costFps, nowMs, this.cfg);
    this.state = decision.state;
    return decision.change !== 0;
  }
}

/* ========================================================================== *
 * ⭐ 整幀成本（見檔頭）—— 純函式 + 一格可以一鍵回頭的開關
 * ========================================================================== */

/**
 * 階梯讀哪一個數字。
 *
 * | | |
 * |---|---|
 * | `"frame"` ⭐ **出貨預設** | 整幀（遲到的幀回報 `wallMs`）—— 合成／GC／reflow 進得了決策 |
 * | `"work"` | ⛔ **止血閥**：逐位元回到 2026-08-23 之前（只讀 `workMs`） |
 */
export type AdaptiveCostMode = "frame" | "work";

/**
 * ⛔ **出貨預設只有一個住處** —— `config.model-lod@1` 的 Zod schema
 *（`packages/shared/.../config/modelLod.ts`）。第〇·四守則：
 * 在這裡再寫一次 `"frame"` 就是第二個住處，而它會在 owner 改後台之後靜靜漂開。
 */
export { DEFAULT_ADAPTIVE_COST_MODE };

/**
 * 「遲到」的容忍倍率。rAF 的間隔本來就會抖（`FRAME_CAP_SLACK_MS` 存在的同一個
 * 理由），15% 在 60 fps 上是 2.5 ms —— 足以吸收抖動，⛔ 又遠小於「掉一張」的
 * 16.7 ms，所以真的漏掉一張 vsync 一定會被判成遲到。
 */
export const FRAME_MISS_TOLERANCE = 1.15;

/** 沒有 fps 上限時階梯瞄準的幀率（＝ `QualityController.targetFor` 的另一半）。 */
export const ADAPTIVE_UNCAPPED_TARGET_FPS = 60;

/** 階梯的目標 fps：上限本身，或無上限時 60。 */
export function adaptiveTargetFps(fpsCap: number): number {
  return fpsCap > 0 ? fpsCap : ADAPTIVE_UNCAPPED_TARGET_FPS;
}

export interface FrameCostInput {
  /** rAF 回呼自己頭尾相減的成本（ms）。 */
  workMs: number;
  /** 這一幀與上一幀之間**真的**過了多久（`FrameDelta.take()`，夾在 1..100）。 */
  wallMs: number;
  /** 目前生效的 fps 上限；0 = 無上限。 */
  fpsCap: number;
  mode?: AdaptiveCostMode;
}

/**
 * ⭐ **這一幀要餵給階梯的成本**（純函式，見檔頭那張表）。
 *
 * ⛔ 刻意**不**用 `wallMs − 上限閒置`：那個「閒置」是一個**模型**
 * （`1000/cap − workMs`），而遲到的那一幀根本沒有閒置過 —— 減掉它會把
 * 一幀 24.7 ms（真實 40 fps）算成 12 ms（83 fps），於是階梯反而往上爬。
 */
export function adaptiveFrameCostMs(i: FrameCostInput): number {
  const workMs = Number.isFinite(i.workMs) && i.workMs > 0 ? i.workMs : 0;
  if ((i.mode ?? DEFAULT_ADAPTIVE_COST_MODE) === "work") return workMs;
  const wallMs = i.wallMs;
  if (!Number.isFinite(wallMs) || wallMs <= 0) return workMs;
  const deadlineMs = 1000 / adaptiveTargetFps(i.fpsCap);
  // 準時 ⇒ 回報餘裕；遲到 ⇒ 回報整幀（⛔ 不可以比 workMs 還小）。
  return wallMs > deadlineMs * FRAME_MISS_TOLERANCE ? Math.max(wallMs, workMs) : workMs;
}

/**
 * 一個只會算平均的滾動視窗。⭐ 它存在的**唯一**理由是把「階梯吃的東西」與
 * 「儀表上那個能力值」分開 —— 兩者以前共用 `AdaptiveManager.stats()`，
 * 而階梯改吃整幀成本之後，共用會讓 `perfBus.workMs` 悄悄變成別的意思
 * （⇒ `perf/diag.ts` 的 `unaccountedMs` 會塌成 0，整份 LAG 診斷跟著失效）。
 */
export class RollingMs {
  private readonly times: number[] = [];

  constructor(private readonly window = WINDOW) {}

  push(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.times.push(ms);
    if (this.times.length > this.window) this.times.shift();
  }

  stats(): FrameStats {
    return frameStats(this.times);
  }

  reset(): void {
    this.times.length = 0;
  }
}

/** ⭐ 誠實的 `workMs` 視窗 —— `perfBus.workMs` / `capabilityFps` 的來源。 */
export const frameWorkWindow = new RollingMs();

/* ------------------------------- 開關本體 ------------------------------- */

const COST_MODE_KEY = "ggd.adaptiveCostMode";

function readStoredCostMode(): AdaptiveCostMode | null {
  try {
    const v = globalThis.localStorage?.getItem(COST_MODE_KEY);
    return v === "work" || v === "frame" ? v : null;
  } catch {
    return null; // Safari 私密模式 / 沙箱 iframe：讀不到就是預設，⛔ 不擲例外
  }
}

let costMode: AdaptiveCostMode = readStoredCostMode() ?? DEFAULT_ADAPTIVE_COST_MODE;

export function adaptiveCostMode(): AdaptiveCostMode {
  return costMode;
}

/**
 * ⭐ **一鍵 rollback**（owner 2026-08-23：「留後台開關可以簡易 rollback」）。
 * 主控台輸入 `__ggdAdaptiveCost("work")` 就回到只讀 `workMs` 的舊行為，
 * 而且**跨重整**（localStorage）—— ⛔ 不需要重新部署。
 * 掛在 `globalThis` 的理由與 `__ggdDiag()` / `__ggdLifecycle()` 同一個：
 * 回報卡頓的當下手上有的是 F12。
 */
export function setAdaptiveCostMode(mode: AdaptiveCostMode): AdaptiveCostMode {
  costMode = mode === "work" ? "work" : "frame";
  try {
    globalThis.localStorage?.setItem(COST_MODE_KEY, costMode);
  } catch {
    /* 存不進去就只影響這一場，⛔ 不影響這一次切換本身 */
  }
  return costMode;
}

/**
 * ⭐ **後台那一格**（`config.model-lod@1.adaptiveCostMode`）—— 由 `applyModelLodPolicy()` 呼叫。
 *
 * ⚠️ ⛔ **主控台的選擇贏過它**：`__ggdAdaptiveCost()` 寫進 localStorage，而那是
 * **回報卡頓的當下**手上唯一的工具（F12）；後台那一格要重新整理才拿得到。
 * ⇒ 有 localStorage 就不動（⛔ 不是「後台永遠贏」，那會讓止血閥在下一次重整時失效）。
 */
export function setAdaptiveCostModeFromPolicy(mode: AdaptiveCostMode | undefined): AdaptiveCostMode {
  if (readStoredCostMode() !== null) return costMode;
  costMode = mode === "work" ? "work" : "frame";
  return costMode;
}

(globalThis as { __ggdAdaptiveCost?: (m?: AdaptiveCostMode) => string }).__ggdAdaptiveCost = (
  m?: AdaptiveCostMode,
) => {
  if (m) setAdaptiveCostMode(m);
  return `[ggd] AdaptiveQuality 讀「${adaptiveCostMode() === "work" ? "只有 rAF workMs（舊行為）" : "整幀 wallMs（預設）"}」 —— 切換：__ggdAdaptiveCost("work") / ("frame")`;
};

export interface AdaptiveFeed {
  /** 餵給 `AdaptiveManager.sample()` 的成本。 */
  costMs: number;
  /** ⭐ 誠實的 `workMs` 視窗統計 —— `perfBus.workMs` / `capabilityFps` 用這個。 */
  work: FrameStats;
}

/**
 * 出貨迴圈的**單一入口**（`GameApp.samplePerf`）：推一筆 workMs 進誠實視窗，
 * 並算出這一幀要餵給階梯的成本。⭐ 兩件事綁在一起，所以⛔ 不可能只做一半。
 */
export function feedAdaptiveFrame(
  workMs: number,
  wallMs: number,
  fpsCap: number,
  mode: AdaptiveCostMode = adaptiveCostMode(),
): AdaptiveFeed {
  frameWorkWindow.push(workMs);
  return {
    costMs: adaptiveFrameCostMs({ workMs, wallMs, fpsCap, mode }),
    work: frameWorkWindow.stats(),
  };
}
