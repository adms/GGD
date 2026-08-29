/**
 * diag —— 🩺 **一個入口，一份可以直接貼進票裡的 LAG 診斷**（owner 2026-08-23）。
 *
 * > 「想一個機制系統專門找、監控 LAG 縮小找 root cause 的試錯時間，
 * >  **之前應該有做類似功能請整合起來**」
 *
 * ---------------------------------------------------------------------------
 * ⭐ 他說對了：東西**已經有四份**，只是互不相通
 * ---------------------------------------------------------------------------
 * | 既有的 | 它看得到什麼 | ⛔ 它看不到什麼 |
 * |---|---|---|
 * | `render/lifecycleLedger` | 逐回合 × 逐類別的資源普查、最老活幾秒 | 每一幀的成本 |
 * | `perfBus` | fps / workMs / ping / jitter / 六格健康計數器 | 迴圈**外面**發生的事 |
 * | `ui/PerfOverlay.healthWarnings()` | 六格計數器非零時畫在藥丸旁 | 數字**為什麼**變壞 |
 * | `render/AdaptiveQuality` | 降級階梯 | ⚠️ **只**看得到那一條 rAF 的 workMs |
 *
 * ⇒ 這一支**不量任何新的東西**（除了 `perf/longTasks` 那兩支被動量表），
 * 它做的是把四份**拉到同一張紙上**，並且把三個已經量到的**儀表謊言**當場註記。
 * ⛔ 它不是第五個模組：它沒有自己的狀態、沒有自己的計時器、沒有自己的緩衝區。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 這份診斷的中心是 `unaccountedMs` —— **⛔ 不可以藏的那個差額**
 * ---------------------------------------------------------------------------
 * 一幀的牆上時間可以拆成三段，而出貨的儀表只認得第一段：
 *
 *     wallMs  =  workMs        (rAF 迴圈自己頭尾相減 —— `perfBus.workMs`)
 *             +  capSleepMs    (fps 上限**刻意**的閒置 —— 這一段是好的)
 *             +  unaccountedMs (⭐ **沒有任何人量過的那一段**)
 *
 * 第三段裝的正是 owner 在追的東西：瀏覽器合成、forced reflow、GC、
 * shader 編譯、React reconcile、其他分頁的 task。
 * ⚠️ 在此之前它**從來沒有出現在任何一個畫面上** —— 而 `AdaptiveQuality` 的降級
 * 階梯只讀 `workMs`，所以**這一段再大，畫質階梯也不會降**（它以為機器很閒）。
 * ⇒ 「明明 fps 儀表很好看卻很卡」有了一個可以指名的解釋。
 *
 * ⛔ **它可以是負的，而且負的時候要照樣印出來。** 負值代表兩個滾動視窗
 * （`workMs` 走 adaptive 的窗、`avgFps` 走送出去的幀的窗）不同步 ——
 * 那本身就是一個要看到的訊號，把它 `Math.max(0, …)` 掉等於把矛盾藏起來。
 *
 * ---------------------------------------------------------------------------
 * 🔌 一個入口：主控台輸入 `__ggdDiag()`
 * ---------------------------------------------------------------------------
 * 與 `__ggdLifecycle()` 同一個理由：owner 回報 lag 的時候手上有的是 F12，
 * ⛔ 不是一個要先找到的面板；回傳字串所以複製得走。
 * ⭐ `__ggdLifecycle()` 留著（它是這份報告的第 5 節），⛔ 不打斷任何既有的肌肉記憶。
 */
import { perfBus, type PerfBus } from "../perfBus";
import { lifecycleLedger, ledgerPolicy } from "../render/lifecycleLedger";
import { FRAME_DELTA_MAX_MS } from "../render/frameCap";
import { perfWatch, LONGTASK_WINDOW_SEC, type LongTaskReport, type StallReport } from "./longTasks";
import { frameSegments, segmentReportText } from "./frameSegments";

/** `minFps` 結構上的地板：`1000 / FRAME_DELTA_MAX_MS`（見 `frameBudget.minFpsIsFloored`）。 */
export const MIN_FPS_FLOOR = 1000 / FRAME_DELTA_MAX_MS;

export interface FrameBudget {
  /** 送出去的幀的平均牆上週期（ms）。 */
  wallMs: number;
  /** rAF 迴圈自己量到的成本（`perfBus.workMs`）。 */
  workMs: number;
  /** fps 上限**刻意**的閒置（`fpsCap` 為 0 時是 0）。 */
  capSleepMs: number;
  /** ⭐ 差額 —— 沒有任何人量過的那一段。⛔ 可以是負的，見檔頭。 */
  unaccountedMs: number;
  /**
   * ⚠️ `perfBus.minFps` 是不是撞到了那個夾子（`FrameDelta` 把間隔夾在 100 ms）。
   * true ⇒ ⛔ **畫面上那個 minFps 是假的**，真正的凍結長度看 `stalls.worstMs`。
   */
  minFpsIsFloored: boolean;
}

/**
 * 把 `perfBus` 的一份快照拆成上面那三段 + 差額。
 * ⭐ 純函式（⛔ 不讀 `perfBus`），所以守衛打得到它而不必造一個假的迴圈。
 */
export function frameBudget(
  snap: Pick<PerfBus, "avgFps" | "minFps" | "frameMs" | "workMs" | "fpsCap">,
): FrameBudget {
  // ⚠️ 刻意用 `1000/avgFps` 而**不是** `perfBus.frameMs`：後者是**最後一幀**的
  //    瞬時間隔，而 `workMs` 是一個滾動平均 —— 兩個混算會讓差額每 250 ms 跳一次。
  const wallMs = snap.avgFps > 0 ? 1000 / snap.avgFps : snap.frameMs;
  const capSleepMs = snap.fpsCap > 0 ? Math.max(0, 1000 / snap.fpsCap - snap.workMs) : 0;
  return {
    wallMs,
    workMs: snap.workMs,
    capSleepMs,
    unaccountedMs: wallMs - snap.workMs - capSleepMs,
    // 一個沒有被夾的視窗，min 一定嚴格大於地板；等於地板 ⇒ 至少有一幀撞到 100 ms。
    minFpsIsFloored: snap.minFps > 0 && snap.minFps <= MIN_FPS_FLOOR + 0.05,
  };
}

export interface Diag {
  budget: FrameBudget;
  longTasks: LongTaskReport;
  stalls: StallReport;
}

/** 現在這一刻的三段（⭐ 全部從既有儀表拉，⛔ 沒有新的狀態）。 */
export function diagSnapshot(nowMs = 0): Diag {
  return {
    budget: frameBudget(perfBus),
    longTasks: perfWatch.longTasks(nowMs),
    stalls: perfWatch.stalls(),
  };
}

/**
 * ⭐ **擋不掉的那一半**（第二守則：fail-open 沒錯，**靜默**才是缺陷）。
 * `PerfOverlay` 把它接在既有的 `healthWarnings()` 後面，畫在**永遠可用**的
 * fps 藥丸旁邊 —— ⛔ 不受 `showPerfOverlay` 管（那一格出貨預設是 false）。
 *
 * ⚠️ 門檻刻意訂得比「有點慢」高很多：⭐ 一個一直亮著的警報等於沒有警報
 *（同 `lifecycleLedger.suspects()` 的第三個條件）。
 */
export function diagWarnings(d: Diag): string[] {
  const out: string[] = [];
  // 一次超過 400 ms 的凍結 = 玩家一定感覺得到，而 `minFps` 只會寫 10。
  if (d.stalls.worstMs >= 400) out.push(`凍結 ${Math.round(d.stalls.worstMs)}ms`);
  // 每秒有 1/4 以上的時間被 >50ms 的 task 吃掉 ⇒ 主執行緒被別人佔住。
  if (d.longTasks.supported && d.longTasks.msPerSec >= 250) {
    out.push(`長任務 ${Math.round(d.longTasks.msPerSec)}ms/s${d.longTasks.worst ? `（${d.longTasks.worst}）` : ""}`);
  }
  // 迴圈外面吃掉的比迴圈裡面還多，而 AdaptiveQuality 對它完全失明。
  const b = d.budget;
  if (b.unaccountedMs >= 8 && b.unaccountedMs > b.workMs) {
    out.push(`幀外開銷 ${b.unaccountedMs.toFixed(1)}ms`);
  }
  return out;
}

const ms = (v: number): string => `${v.toFixed(1)}ms`;

/**
 * 🩺 **一鍵匯出**。輸出刻意是**純文字**：貼進 GH issue 就是完整的現場，
 * ⛔ 不需要對方去 F12 裡一格一格複製。
 */
export function diagReport(nowMs = 0): string {
  const d = diagSnapshot(nowMs);
  const b = d.budget;
  const t = lifecycleLedger.sceneTruth();
  const p = ledgerPolicy();
  const n = (v: number): string => (v < 0 ? "讀不到" : String(v));
  const L: string[] = [];

  L.push("🩺 [ggd-diag] LAG 現場（貼進 issue 就是完整的一份）");
  L.push(`   ${new Date().toISOString()} · ua=${(globalThis.navigator?.userAgent ?? "?").slice(0, 72)}`);
  if (!p.enabled) L.push("   ⚠️ lifecycleLedgerEnabled=false ⇒ 第 4/5 節是關掉的（後台 vfx-cleanup 那一格）");

  L.push("");
  L.push("① 每幀預算（⭐ 差額就是沒有人量過的那一段）");
  L.push(`   wall ${ms(b.wallMs)}  =  rAF 工作 ${ms(b.workMs)}  +  上限閒置 ${ms(b.capSleepMs)}  +  ⭐ unaccounted ${ms(b.unaccountedMs)}`);
  L.push(`   fps ${Math.round(perfBus.avgFps)} (min ${Math.round(perfBus.minFps)}) · 上限 ${perfBus.fpsCap || "max"} · 餘裕 ${Math.round(perfBus.capabilityFps)} · 畫質 L${perfBus.qualityLevel}${perfBus.adaptiveActive ? " auto" : ""}`);
  if (b.unaccountedMs > b.workMs && b.unaccountedMs >= 4) {
    L.push("   ⛔ 幀外開銷 > 迴圈成本 ⇒ AdaptiveQuality 只讀 workMs，**它對這一段失明，不會降畫質**");
  }
  if (b.minFpsIsFloored) {
    L.push(`   ⚠️ 上面那個 min fps **是假的**：FrameDelta 把間隔夾在 ${FRAME_DELTA_MAX_MS}ms ⇒ minFps 永遠 ≥ ${MIN_FPS_FLOOR}。真正的凍結長度看 ②`);
  }

  L.push("");
  L.push("② 主執行緒被誰佔住（⭐ 唯一抓得到 React reconcile / reflow / GC / shader 編譯的東西）");
  if (!d.longTasks.supported) {
    L.push("   longtask：⛔ **這個瀏覽器不支援**（Safari / Firefox）—— ⛔ 不是 0，是量不到");
  } else {
    L.push(`   longtask（近 ${LONGTASK_WINDOW_SEC}s）：${d.longTasks.count} 個 · 共 ${ms(d.longTasks.totalMs)} · 最長 ${ms(d.longTasks.maxMs)}${d.longTasks.worst ? ` (${d.longTasks.worst})` : ""} · 佔用 ${Math.round(d.longTasks.msPerSec)}ms/s`);
    L.push("   ⚠️ 它與 rAF 工作**會重疊**（rAF 回呼本身也住在一個 task 裡）⇒ ⛔ 不要把它加進①的和");
  }
  L.push(`   凍結（4Hz 取樣計時器的實測延遲，⭐ **沒有夾**）：最長 ${ms(d.stalls.worstMs)} · ${d.stalls.count} 次 / ${d.stalls.samples} 次取樣`);

  L.push("");
  L.push("③ 網路（卡的可能不是畫面）");
  L.push(`   ping ${Math.round(perfBus.pingMs)}ms · jitter ${Math.round(perfBus.jitterMs)}ms · 距上一張快照 ${Math.round(perfBus.snapshotGapMs)}ms · ${perfBus.connection} · 取樣 ${perfBus.pingSamples} · 快照 ${perfBus.netSnapshots}`);

  L.push("");
  L.push("④ 場上有多少東西（⭐ 左邊是儀表上的數字，右邊是真的）");
  if (!t.bound) {
    L.push("   ⛔ **沒有綁場景** ⇒ 這一節每一格都不可信（⛔ 不是「場上很乾淨」）");
  } else {
    L.push(`   drawCount ${t.meshesTotal} ← ⚠️ 是 scene.meshes.length（含 disabled／池子裡的），⛔ 不是 draw call`);
    L.push(`     其中 enabled ${t.meshesEnabled} · 上一幀真的畫 ${n(t.meshesActive)}`);
    L.push(`   particleCount ${t.particleSystems} ← ⚠️ 是**系統數**，⛔ 不是活粒子數`);
    L.push(`     真的活著的粒子 ${n(t.particlesLive)} 顆`);
    L.push(`   mat ${t.materials} · tex ${t.textures} · node ${t.transformNodes} · geo ${t.geometries} · 實體 ${perfBus.entityCount}`);
  }

  L.push("");
  L.push("⑤ 累積（逐回合 × 逐類別 —— 「到第七回合就很難動作」的那條線）");
  L.push(lifecycleLedger.report());

  const warn = [...diagWarnings(d)];
  if (perfBus.renderLoopErrors > 0) warn.push(`繪製例外 ${perfBus.renderLoopErrors}`);
  if (perfBus.orphanRooms > 0) warn.push(`孤兒房 ${perfBus.orphanRooms}`);
  if (perfBus.foreignSnapshots > 0) warn.push(`外來快照 ${perfBus.foreignSnapshots}`);
  if (perfBus.unexpectedDisconnects > 0) warn.push(`非預期斷線 ${perfBus.unexpectedDisconnects}`);
  L.push("");
  L.push(warn.length === 0 ? "⭐ 沒有任何一格亮紅" : `⛔ 亮著的：${warn.join(" · ")}`);
  return L.join("\n");
}

/**
 * ⭐ 一鍵匯出：主控台輸入 `__ggdDiag()`。
 * ⛔ 掛在 `globalThis` 而不是做一個按鈕（同 `__ggdLifecycle`）：回報 lag 的當下
 * 手上有的是 F12。`__ggdDiagReset()` 把兩支被動量表歸零，用來「重現一次再量」。
 */
(globalThis as { __ggdDiag?: () => string }).__ggdDiag = () =>
  diagReport(globalThis.performance?.now() ?? 0);
(globalThis as { __ggdDiagReset?: () => string }).__ggdDiagReset = () => {
  perfWatch.reset();
  return "[ggd-diag] longtask 與凍結量表已歸零 —— 現在重現一次，然後 __ggdDiag()";
};
