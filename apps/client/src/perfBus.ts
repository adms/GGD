/**
 * perfBus — a PLAIN shared mutable store bridging the imperative rAF loop and
 * the React perf overlay. The loop writes fps / frame-time / quality / counts
 * / connection stats here EVERY frame; ui/PerfOverlay samples it on its OWN
 * ~4 Hz interval and patches the DOM. Nothing here is React state or Zustand —
 * per-frame data never passes through React (same rule as frameBus / client-08).
 */

export type ConnectionQuality = "good" | "fair" | "poor" | "offline";

export interface PerfBus {
  /** smoothed instantaneous fps (1000 / frame delta). */
  fps: number;
  /** avg fps over the rolling frame-cost window. */
  avgFps: number;
  /** min fps over the window (worst frame). */
  minFps: number;
  /** avg wall frame delta (ms, post-cap). */
  frameMs: number;
  /** avg frame WORK cost (ms, pre-cap) — the adaptive signal. */
  workMs: number;

  /** round-trip time estimate (ms) from input-ack deltas. */
  pingMs: number;
  /** snapshot-arrival jitter (mean abs deviation, ms). */
  jitterMs: number;
  /** ms since the last authoritative snapshot patch. */
  snapshotGapMs: number;
  connection: ConnectionQuality;

  /** current adaptive ladder level + resolved resolution scale. */
  qualityLevel: number;
  resolutionScale: number;
  particleDensity: number;
  shadows: boolean;
  /** true while the adaptive manager is steering quality. */
  adaptiveActive: boolean;

  entityCount: number;
  drawCount: number;
  particleCount: number;
}

export const perfBus: PerfBus = {
  fps: 0,
  avgFps: 0,
  minFps: 0,
  frameMs: 0,
  workMs: 0,
  pingMs: 0,
  jitterMs: 0,
  snapshotGapMs: 0,
  connection: "offline",
  qualityLevel: 0,
  resolutionScale: 1,
  particleDensity: 1,
  shadows: true,
  adaptiveActive: false,
  entityCount: 0,
  drawCount: 0,
  particleCount: 0,
};
