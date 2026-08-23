/**
 * longTasks —— ⏱ **主執行緒被誰佔住了**（owner 2026-08-23）。
 *
 * > 「想一個機制系統專門找、監控 LAG 縮小找 root cause 的試錯時間，
 * >  **之前應該有做類似功能請整合起來**」
 *
 * ---------------------------------------------------------------------------
 * ⭐ 這是**唯一**一支新檔，因為它量的東西**沒有任何既有儀表拿得到**
 * ---------------------------------------------------------------------------
 * 出貨的四份儀表全部只看得到 rAF 迴圈**裡面**：
 *   · `perfBus.workMs` —— `GameApp.renderFrame` 自己頭尾相減
 *   · `AdaptiveQuality` 的降級階梯 —— ⚠️ 它**只看得到那一條 rAF 的 workMs**
 *   · `fpsMeter` —— 兩次繪製之間的牆上間隔
 *   · `lifecycleLedger` —— 場上有幾個物件
 *
 * 而讓 owner 卡住的東西**住在迴圈外面**：React reconcile、forced reflow、GC、
 * shader 編譯、一次 `JSON.parse` 大快照。它們發生在**別的 task 裡**，
 * 所以 `workMs` 對它們**結構上失明** —— 它們只會讓下一幀「晚到」，
 * 而「晚到」被 `FrameDelta` 夾在 100 ms（見下面那條謊）。
 *
 * `PerformanceObserver('longtask')` 是瀏覽器**唯一**會主動說出這件事的介面，
 * 而且它是 **passive** 的：⛔ 不輪詢、⛔ 不掛 rAF、⛔ 零幀成本。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 第二支量表：**凍結長度**（⛔ 沒有夾）
 * ---------------------------------------------------------------------------
 * ⚠️ 已量到的儀表謊言：`perfBus.minFps` **永遠 ≥ 10**。
 * 因為它是 `1000 / max(deltas)`，而 delta 來自 `FrameDelta.take()`，
 * 那一支把間隔夾在 `[FRAME_DELTA_MIN_MS=1, FRAME_DELTA_MAX_MS=100]`
 * （⭐ 夾是**對的** —— 那個 dt 同時餵給預測與動畫，不夾會讓分頁切回來時整場跳掉）。
 * ⇒ 一次 300 ms 卡頓與一次 2 秒凍結在 `minFps` 上**寫的是同一個 10 fps**。
 *
 * ⇒ 這裡用 4 Hz 取樣計時器**自己的延遲**當誠實的替代品：`setInterval(250ms)`
 * 的回呼晚了多久，主執行緒就被佔住多久。⛔ 沒有夾、⛔ 不必碰 rAF、成本是一次減法。
 * ⭐ 它與 longtask 互補：longtask 說「有一個 180 ms 的 task」，
 * 凍結長度說「這 2.1 秒之內畫面根本沒動」（例：一連串各 40 ms、全部低於 longtask 門檻）。
 *
 * ---------------------------------------------------------------------------
 * ⛔ 不支援要說「不支援」，⛔ 不是 0（第二守則：fail-open 沒錯，**靜默**才是缺陷）
 * ---------------------------------------------------------------------------
 * Safari 與 Firefox 至今沒有 `longtask`。回一個 0 會被讀成「這台機器很順」——
 * 那正是這一族缺陷難查的原因。⇒ `supported: false` 是一個**要被印出來**的狀態。
 */

/** ⛔ 一個沒有上限的登記表就是下一個洩漏（同 `lifecycleLedger` 檔頭③）。 */
const MAX_HITS = 64;
/** 統計視窗（秒）：只留最近這段，⛔ 不是整場累積 —— 我們問的是「現在卡不卡」。 */
export const LONGTASK_WINDOW_SEC = 10;
/** 取樣計時器晚到多久才算一次卡頓（ms）—— 一次 GC / 一次 shader 編譯的量級。 */
export const STALL_MIN_MS = 50;

/** longtask 條目的最小面（⛔ 不 import lib.dom 的型別，jsdom 也餵得進來）。 */
interface EntryLike {
  readonly name: string;
  readonly duration: number;
  readonly startTime: number;
  readonly attribution?: readonly {
    readonly name?: string;
    readonly containerType?: string;
    readonly containerName?: string;
    readonly containerId?: string;
  }[];
}
interface ObserverLike {
  observe(opts: { type: string; buffered?: boolean }): void;
  disconnect(): void;
}
interface ObserverCtor {
  new (cb: (list: { getEntries(): readonly EntryLike[] }) => void): ObserverLike;
  readonly supportedEntryTypes?: readonly string[];
}

export interface LongTaskReport {
  /** ⛔ false 要印「不支援」，⛔ 不是 0（Safari / Firefox 沒有這個介面）。 */
  supported: boolean;
  /** 視窗內幾個 >50 ms 的 task。 */
  count: number;
  /** 視窗內這些 task 加起來幾 ms。 */
  totalMs: number;
  /** 最長的那一個幾 ms。 */
  maxMs: number;
  /** 最長的那一個的來源（`self` / iframe 名稱 / attribution 容器）。 */
  worst: string;
  /** ⭐ 佔用率：每一秒裡有幾 ms 被 >50 ms 的 task 吃掉。 */
  msPerSec: number;
}

export interface StallReport {
  /** ⭐ 取樣計時器實測的**最長**延遲（ms）—— ⛔ 沒有夾，這是 `minFps` 說不出的那個數字。 */
  worstMs: number;
  /** 超過 `STALL_MIN_MS` 的次數。 */
  count: number;
  /** 打過幾次點。0 ⇒ ⛔ 沒有人在打點，這兩格不可信。 */
  samples: number;
}

/**
 * 兩支被動量表住同一個物件（owner：「**整合起來**」，⛔ 不是再開兩個模組）。
 * ⭐ 兩者都由 `PerfOverlay` 那一班**既有的** 4 Hz 計時器打點，⛔ 不新增任何計時器。
 */
export class PerfWatch {
  private readonly hits: { atMs: number; durMs: number; name: string }[] = [];
  private obs: ObserverLike | null = null;
  private state: "idle" | "on" | "unsupported" = "idle";
  private lastNoteMs = -1;
  private stallWorstMs = 0;
  private stallCount = 0;
  private stallSamples = 0;

  /**
   * 掛上觀察者（冪等）。⚠️ `buffered: true` ⇒ **掛上去之前**發生的 longtask 也拿得到，
   * 所以「開場那一波 shader 編譯」不會因為我們晚了 200 ms 掛而消失。
   */
  start(): void {
    if (this.state !== "idle") return;
    const Ctor = (globalThis as { PerformanceObserver?: ObserverCtor }).PerformanceObserver;
    const types = Ctor?.supportedEntryTypes;
    if (!Ctor || !types || !types.includes("longtask")) {
      this.state = "unsupported"; // ⛔ 不是 0，見檔頭
      return;
    }
    try {
      const obs = new Ctor((list) => {
        for (const e of list.getEntries()) this.push(e);
      });
      obs.observe({ type: "longtask", buffered: true });
      this.obs = obs;
      this.state = "on";
    } catch {
      this.state = "unsupported";
    }
  }

  /**
   * 由 4 Hz 取樣計時器打點。回傳這一次的延遲（ms）——
   * `expectedMs` 是計時器的名目間隔，⭐ 差額就是主執行緒被佔住的時間。
   */
  note(nowMs: number, expectedMs: number): number {
    this.start();
    if (!Number.isFinite(nowMs)) return 0;
    const prev = this.lastNoteMs;
    this.lastNoteMs = nowMs;
    if (prev < 0) return 0; // 第一次沒有「上一次」
    const lag = nowMs - prev - expectedMs;
    this.stallSamples++;
    if (lag >= STALL_MIN_MS) {
      this.stallCount++;
      if (lag > this.stallWorstMs) this.stallWorstMs = lag;
    }
    return lag > 0 ? lag : 0;
  }

  longTasks(nowMs: number): LongTaskReport {
    // ⚠️ 2026-08-23 突變驗證當場抓到的：`idle`（還沒有人打過點）以前會回
    // `supported: true` + 全 0 —— ⭐ 那正是這一支存在要防的那種謊
    //（「量不到」與「很順」在 0 上長得一模一樣）。⇒ 讀的時候自己掛上去。
    this.start();
    if (this.state === "unsupported") {
      return { supported: false, count: 0, totalMs: 0, maxMs: 0, worst: "", msPerSec: 0 };
    }
    const cutoff = nowMs - LONGTASK_WINDOW_SEC * 1000;
    let count = 0;
    let totalMs = 0;
    let maxMs = 0;
    let worst = "";
    for (const h of this.hits) {
      if (h.atMs < cutoff) continue;
      count++;
      totalMs += h.durMs;
      if (h.durMs > maxMs) {
        maxMs = h.durMs;
        worst = h.name;
      }
    }
    return {
      supported: true,
      count,
      totalMs,
      maxMs,
      worst,
      msPerSec: totalMs / LONGTASK_WINDOW_SEC,
    };
  }

  stalls(): StallReport {
    return { worstMs: this.stallWorstMs, count: this.stallCount, samples: this.stallSamples };
  }

  /** 換一場／回報過一次之後歸零（⛔ 不解掛觀察者）。 */
  reset(): void {
    this.hits.length = 0;
    this.lastNoteMs = -1;
    this.stallWorstMs = 0;
    this.stallCount = 0;
    this.stallSamples = 0;
  }

  /** 測試用：拆掉觀察者並回到 idle。 */
  stop(): void {
    this.obs?.disconnect();
    this.obs = null;
    this.state = "idle";
  }

  /** ⛔ 環狀緩衝：溢位丟**最舊**的，所以「現在卡不卡」永遠留得住。 */
  private push(e: EntryLike): void {
    const dur = typeof e.duration === "number" && Number.isFinite(e.duration) ? e.duration : 0;
    if (dur <= 0) return;
    const a = e.attribution?.[0];
    const name = a?.containerName || a?.containerId || a?.containerType || a?.name || e.name || "self";
    this.hits.push({ atMs: e.startTime, durMs: dur, name: String(name).slice(0, 32) });
    while (this.hits.length > MAX_HITS) this.hits.shift();
  }
}

/** 出貨的那一個（`PerfOverlay` 的 4 Hz 計時器打點，`perf/diag.ts` 讀）。 */
export const perfWatch = new PerfWatch();
