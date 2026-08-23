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

  /* --- ⭐ 場上有多少東西：**誠實的名字**（2026-08-23） -----------------------
   * 這兩格的舊名字（`drawCount` / `particleCount`）說的是它們**沒有在量**的
   * 東西，而 `render/lifecycleLedger.sceneTruth()` 已經量到差額有多大：
   *
   * | 舊名字 | 它其實是 | 它**不是** |
   * |---|---|---|
   * | `drawCount` | `scene.meshes.length`（含 disabled、含池子裡待命的） | draw call 數 |
   * | `particleCount` | `scene.particleSystems.length`（**系統**數） | 活著的粒子**顆**數 |
   *
   * ⚠️ 這不是潔癖：一個被還回 free-list 的 mesh 在 `drawCount` 眼裡跟一個正在
   * 畫的 mesh **一模一樣**，所以它在「回收有沒有生效」這個問題上結構性失明 ——
   * 而那正是 owner「到第七回合就很難動作」時大家會去看的第一格。
   * 真正的兩個數字在 `__ggdDiag()` 第④節（`meshesActive` / `particlesLive`）。
   *
   * ⭐ 舊名字保留成**衍生的 getter**（⛔ 不是第二個欄位）—— 一份知識一個住處
   * （第〇·四守則），所以它們不可能漂走；消費端（`ui/PerfOverlay`）換名字之後
   * 直接刪掉那兩個 getter 即可。
   */
  /** `scene.meshes.length` —— ⛔ **不是** draw call 數。 */
  sceneMeshes: number;
  /** `scene.particleSystems.length` —— ⛔ **不是**活粒子顆數。 */
  particleSystems: number;
  /** @deprecated 名字說謊 —— 用 `sceneMeshes`（同一個數字，衍生的）。 */
  readonly drawCount: number;
  /** @deprecated 名字說謊 —— 用 `particleSystems`（同一個數字，衍生的）。 */
  readonly particleCount: number;

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
  /**
   * 非預期斷線（GH#596）—— **不是我叫的** `leave()` 而關掉的那些 socket。
   *
   * ⭐ 遞增點在 `net/RoomConnection.bind()` 的 `onLeave` 裡，⛔ **不是**在
   * `onDisconnect` 的指派點上：fail-loud 不可以取決於「有沒有人記得指派」
   *（那個回呼在 GH#596 之前全 repo **零指派點**，而這一格因此永遠是 0）。
   * ⚠️ 沙發連線一次斷線會記 N 筆 —— 這一格數的是**連線**，⛔ 不是斷線事件。
   */
  unexpectedDisconnects: number;
  /**
   * ⭐ GH#609 —— Babylon `runRenderLoop` 的某一幀擲了例外的次數。
   *
   * ⚠️ 沒有 `runRenderLoopSafely` 的話這一格不會存在，因為**根本不會有第二幀**：
   * Babylon 的重排在 callback **之後**，例外逃出去 ⇒ `_frameHandler` 永遠停在 0
   * ⇒ 整個場景凍住。⇒ 這一格是「我們把凍結換成掉幀」的**收據**。
   * ⛔ 非零而沒有人看到 = 我們只是把當機藏起來了。
   */
  renderLoopErrors: number;

  /**
   * 🔬 **生命週期登記表**（owner 2026-08-23「到第七回合就很難動作⋯累積，沒清理到
   * 殘留物」）—— 現在有**幾類**物件「還在長」（逐回合單調不減、增量達標、而且
   * 最後一段仍然在增）。⛔ 不是「幾個物件」：一個總數指不出兇手，⭐ 而 owner 要的
   * 逐字是「**精準縮小範圍**」。
   *
   * ⚠️ 非零就要**畫在畫面上**（`healthWarnings()`），⛔ 不是一行沒有人讀的
   * console —— 這一族計數器的存在理由就是「fail-open 沒錯，**靜默**才是缺陷」。
   * 產生端 `render/lifecycleLedger.ts`；完整的表用 `__ggdLifecycle()` 匯出。
   */
  lifecycleGrowth: number;
  /** 最嚴重的那一類的名字（例 `tex:ground`）。空字串 = 沒有。 */
  lifecycleWorst: string;
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
  renderLoopErrors: 0,
  lifecycleGrowth: 0,
  lifecycleWorst: "",
  qualityLevel: 0,
  resolutionScale: 1,
  particleDensity: 1,
  shadows: true,
  adaptiveActive: false,
  entityCount: 0,
  sceneMeshes: 0,
  particleSystems: 0,
  // ⭐ 衍生，⛔ 不是欄位 —— 見上面那段：一份知識一個住處，舊名字不可能漂走。
  get drawCount(): number {
    return this.sceneMeshes;
  },
  get particleCount(): number {
    return this.particleSystems;
  },
};
