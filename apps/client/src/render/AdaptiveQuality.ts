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
 */

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
