/**
 * perfBus — a PLAIN shared mutable store bridging the imperative rAF loop and
 * the React perf overlay. The loop writes fps / frame-time / quality / counts
 * / connection stats here EVERY frame; ui/PerfOverlay samples it on its OWN
 * ~4 Hz interval and patches the DOM. Nothing here is React state or Zustand —
 * per-frame data never passes through React (same rule as frameBus / client-08).
 */

export type ConnectionQuality = "good" | "fair" | "poor" | "offline";

/**
 * Which kind of stream the renderer is bound to (task #272). A REPLAY receives
 * authoritative snapshots exactly like a live match, but nobody is sending
 * input into it, so no ack ever comes back and the RTT estimator can never
 * produce a sample. Without this flag the ping chip on the replay page would
 * sit at 「量測中」 forever — technically true, permanently useless.
 */
export type NetMode = "live" | "replay";

export interface PerfBus {
  /** smoothed instantaneous fps (1000 / frame delta). */
  fps: number;
  /**
   * avg fps over the rolling window of DELIVERED frames — the number the pill
   * prints. GH#271: this used to be `1000 / avg(workMs)`, i.e. the machine's
   * CAPABILITY, so a 60-capped session with 4.4 ms frames printed 「228 fps」.
   * Capability now lives in `capabilityFps` under its own name.
   */
  avgFps: number;
  /** min fps over the window (the longest gap between two delivered frames). */
  minFps: number;
  /** avg wall frame delta (ms, post-cap). */
  frameMs: number;
  /** avg frame WORK cost (ms, pre-cap) — the adaptive signal. */
  workMs: number;
  /**
   * 「這台機器畫得動幾張」= 1000 / avg(workMs). NOT the frame rate — it ignores
   * the fps cap entirely, which is exactly why it must never be labelled "fps".
   * Kept because it is the real headroom read-out (and what the adaptive ladder
   * decides on); shown next to `fpsCap` so the two can be compared on screen.
   */
  capabilityFps: number;
  /** fps cap currently in force (0 = uncapped) — `renderParams.fpsCap`. */
  fpsCap: number;

  /** round-trip time estimate (ms) from input-ack deltas. */
  pingMs: number;
  /** snapshot-arrival jitter (mean abs deviation, ms). */
  jitterMs: number;
  /** ms since the last authoritative snapshot patch. */
  snapshotGapMs: number;
  connection: ConnectionQuality;

  /* --- ping PROVENANCE (task #272) — see net/ConnectionStats.ConnectionReport.
   * `pingMs` alone cannot be displayed honestly: it is 0 before the first ack
   * and frozen whenever the player stops issuing input. These three say whether
   * the number is a measurement, how fresh it is, and whether there is a match
   * stream at all. The always-on ping chip refuses to print a number without
   * them. */
  /** RTT samples measured this session. 0 ⇒ `pingMs` was never measured. */
  pingSamples: number;
  /** ms since the last RTT sample; Infinity when none. */
  pingAgeMs: number;
  /** authoritative snapshots received this session. 0 ⇒ not in a match. */
  netSnapshots: number;
  /** "live" = a real match; "replay" = a recording (no player RTT exists). */
  netMode: NetMode;

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

  /**
   * ⭐ GH#570 —— **拆不乾淨的計數器**。⛔ 不是「效能」，是「有沒有東西沒收乾淨」。
   *
   * `orphanRooms`：一間在我離開**之後**才抵達、被當場退掉的房。
   * `foreignSnapshots`：一張**不屬於現在這一場**的快照試圖寫進全域 `hudStore`。
   *
   * ⚠️ 兩格都是**縱深防禦的耳朵**：fail-open 沒錯，**靜默**才是缺陷（第二守則）。
   * 在此之前這條路徑上唯一的訊號是「沒有訊號」—— owner 玩了幾分鐘才發現
   * 血條被一個看不見的東西打到 0。⇒ 非零就要**畫在畫面上**，
   * ⛔ 不是一行沒有人讀的 console。
   */
  orphanRooms: number;
  foreignSnapshots: number;
  /** 非預期斷線（`RoomConnection.onDisconnect`，在此之前全 repo 零指派點）。 */
  unexpectedDisconnects: number;
}

export const perfBus: PerfBus = {
  fps: 0,
  avgFps: 0,
  minFps: 0,
  frameMs: 0,
  workMs: 0,
  capabilityFps: 0,
  fpsCap: 0,
  pingMs: 0,
  jitterMs: 0,
  snapshotGapMs: 0,
  connection: "offline",
  pingSamples: 0,
  pingAgeMs: Number.POSITIVE_INFINITY,
  netSnapshots: 0,
  netMode: "live",
  orphanRooms: 0,
  foreignSnapshots: 0,
  unexpectedDisconnects: 0,
  qualityLevel: 0,
  resolutionScale: 1,
  particleDensity: 1,
  shadows: true,
  adaptiveActive: false,
  entityCount: 0,
  drawCount: 0,
  particleCount: 0,
};
