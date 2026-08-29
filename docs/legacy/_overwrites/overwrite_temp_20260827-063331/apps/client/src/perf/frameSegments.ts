/**
 * frameSegments —— 📏 **一幀裡的哪一段吃掉了預算**（GH#614）。
 *
 * > owner 2026-08-23：「[緊急] ⋯ 又變得 lag 了，這次更糟**第一回合就開始 lag**」
 *
 * ---------------------------------------------------------------------------
 * ⭐ 為什麼要新開這一支：既有的四份儀表**沒有一份指得出兇手**
 * ---------------------------------------------------------------------------
 * | 既有的 | 它回答 | ⛔ 它答不出 |
 * |---|---|---|
 * | `perfBus.workMs` | rAF 迴圈**整段**幾 ms | 那 12 ms 是誰花的 |
 * | `perf/diag.frameBudget` | 迴圈**外面**還有幾 ms（`unaccountedMs`） | 外面那一段是誰 |
 * | `perf/longTasks` | 有一個 180 ms 的 task | 它在 rAF 裡還是外面 |
 * | `render/lifecycleLedger` | 場上有幾個物件 | 物件多**是不是**成本 |
 *
 * ⇒ 在此之前「客戶端很卡」唯一能得到的答案是**一個總數**，而修一個總數的方法
 * 只有「猜一個嫌疑犯關掉它」——⛔ 那正是 #614 票上做過的事（castArcs／mobSpawn
 * 兩格被推理出來後關掉，而票自己寫著「⛔ 還沒證實」）。
 * ⭐ owner 的常設指令是「**猜第二次之前就做工具**」。這支就是那把工具。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 它同時把 `unaccountedMs` 的一塊變成有名字的
 * ---------------------------------------------------------------------------
 * 客戶端有**兩條** rAF 迴圈：`GameApp.renderFrame`（被 `workMs` 量到）與
 * `ui/WorldAnchorLayer` 的 DOM 迴圈（⛔ **沒有任何儀表量過**，它整段掉進
 * `unaccountedMs`）。⇒ `external()` 讓迴圈外的打點也進同一張表。
 *
 * ---------------------------------------------------------------------------
 * ⛔ 量尺自己要先自證 —— `calibrate()`
 * ---------------------------------------------------------------------------
 * ⚠️ 已經踩過的形狀（CLAUDE.md「量尺自己會說謊」）：canvas 背後緩衝 300×150、
 * readPixels 讀到上一幀 —— 同一輪兩次量測給出**相反**的結論。
 * ⇒ 這支在報告裡印**自證結果**：燒一段**已知長度**的時間進一個指定的段，
 * 量不回來（或量到別的段上）⇒ ⭐ **這把尺的一切結論作廢**，報告直接說 FAILED，
 * ⛔ 不是安靜地印一組好看的數字。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 報的是**區間**，⛔ 不是一個數字
 * ---------------------------------------------------------------------------
 * 「第一回合 lag」取決於場上有誰、幾隻小怪、哪一張圖（CLAUDE.md：行為相依的量
 * 是區間）。⇒ 每一段報 **p50 / p95 / max**，並且把**分母**（量了幾幀）印出來。
 * ⛔ 一個沒有分母的百分比是不可信的。
 *
 * ---------------------------------------------------------------------------
 * 💸 關掉的時候必須是**零成本**
 * ---------------------------------------------------------------------------
 * 一把會讓遊戲變慢的效能量尺是笑話。⇒ `armed === false` 時 `mark()` 是
 * 「一個布林判斷 + return」，⛔ 沒有 `performance.now()`、⛔ 沒有配置、
 * ⛔ 沒有閉包。出貨預設**關**，`__ggdProfile()` 打開（或卡頓時自動武裝）。
 */

/**
 * 一幀的八段 —— ⭐ 逐字對到 `GameApp.renderFrame` 的註解編號（0…8），
 * ⛔ 不是我自己分的類。對不上就是接線接錯了，守衛盯著這件事。
 */
export const FRAME_SEGMENTS = [
  "round", // 0) 回合邊界清場 + 螢幕演出推進
  "drain", // 1) 網路事件派送（vfx / views / casts / sfx / voice 全在這裡分岔）
  "predict", // 2–3) 插值時鐘 + 本地預測
  "views", // 4) 實體 view 同步 + 腳步 + 狀態光環
  "camera", // 5) 鏡頭 + 音場 flush + 語音 + 場景淡出 + 打光
  "vfx", // 6) 特效系統（含 ambient / 火圈 / postFx / 煙火）
  "anchors", // 7a) updateFrameBus —— 世界錨點的 DOM 資料
  "draw", // 7b) renderer.render()
] as const;
export type FrameSegment = (typeof FRAME_SEGMENTS)[number];

/**
 * 迴圈**外面**的打點通道。⛔ 這些段不在 `workMs` 裡，它們住在 `unaccountedMs`。
 * ⭐ 加一段就是加一列字串，⛔ 不必動這支（第〇·四守則：一份知識一個住處）。
 */
export type ExternalSegment = string;

/** 滾動視窗（幀）—— 3 秒 @60fps。⭐ 我們問的是「**現在**卡不卡」，⛔ 不是整場平均。 */
export const WINDOW_FRAMES = 180;

/**
 * 自證要燒掉的毫秒數。⚠️ 刻意小：它在**真的客戶端上**也會跑一次，
 * ⛔ 不可以為了自證而卡一下畫面。
 */
export const CALIBRATE_BURN_MS = 4;

export interface SegmentStat {
  seg: string;
  /** 中位數（ms）—— 「典型的一幀」。 */
  p50Ms: number;
  /** 95 百分位（ms）—— ⭐ 「偶爾的那一下」，卡頓感來自這一格，⛔ 不是 p50。 */
  p95Ms: number;
  maxMs: number;
  /** 佔 p50 總和的比例（%）。⛔ 分母印在報告上，見 `frames`。 */
  sharePct: number;
}

export type CalibrationVerdict = "ok" | "failed" | "untested";

export interface SegmentReport {
  armed: boolean;
  /** ⭐ **分母** —— 這份報告是幾幀量出來的。0 ⇒ ⛔ 底下每一格都不可信。 */
  frames: number;
  windowFrames: number;
  /** 每一段 p50 加起來（ms）—— 應該與 `perfBus.workMs` 同量級，差很多本身是訊號。 */
  totalP50Ms: number;
  segments: SegmentStat[];
  /** 迴圈外的打點（`external()`）—— 這些**不在** `workMs` 裡。 */
  externals: SegmentStat[];
  /** ⛔ `failed` ⇒ 上面每一格作廢。 */
  calibration: CalibrationVerdict;
  calibrationNote: string;
}

type Clock = () => number;

const defaultClock: Clock = () =>
  globalThis.performance?.now?.() ?? Date.now();

/** 排序副本取百分位（⛔ 不動原陣列 —— 那是還在寫的環形緩衝）。 */
function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return sorted[i] ?? 0;
}

/** 一段的環形緩衝。⛔ 固定容量 —— 一個沒有上限的登記表就是下一個洩漏。 */
class Ring {
  private readonly buf: number[] = [];
  private at = 0;
  push(v: number): void {
    if (this.buf.length < WINDOW_FRAMES) this.buf.push(v);
    else {
      this.buf[this.at] = v;
      this.at = (this.at + 1) % WINDOW_FRAMES;
    }
  }
  clear(): void {
    this.buf.length = 0;
    this.at = 0;
  }
  get size(): number {
    return this.buf.length;
  }
  stat(seg: string, totalP50: number): SegmentStat {
    const sorted = [...this.buf].sort((a, b) => a - b);
    const p50 = percentile(sorted, 0.5);
    return {
      seg,
      p50Ms: p50,
      p95Ms: percentile(sorted, 0.95),
      maxMs: sorted.length > 0 ? (sorted[sorted.length - 1] ?? 0) : 0,
      sharePct: totalP50 > 0 ? (p50 / totalP50) * 100 : 0,
    };
  }
}

/**
 * 📏 **量尺本體**。
 *
 * ⚠️ 它刻意**不是** React state、⛔ 不是 zustand、⛔ 沒有自己的計時器 ——
 * 同 `perfBus` / `frameBus` 的規矩：逐幀資料不經過 React。
 */
export class FrameSegments {
  private readonly rings = new Map<string, Ring>();
  private armedFlag = false;
  private frameStartMs = 0;
  private lastMarkMs = 0;
  private current: string | null = null;
  private frameCount = 0;
  private verdict: CalibrationVerdict = "untested";
  private verdictNote = "⛔ 還沒自證 —— 這把尺的結論**尚未**可信";

  constructor(private readonly clock: Clock = defaultClock) {}

  get armed(): boolean {
    return this.armedFlag;
  }

  /**
   * 打開／關掉。⭐ 打開的**當下**就自證一次 —— ⛔ 不是等到有人來讀報告才驗，
   * 那時候現場已經過去了。
   */
  arm(on: boolean): void {
    if (on && !this.armedFlag) {
      this.reset();
      this.selfTest();
    }
    this.armedFlag = on;
    this.current = null;
  }

  reset(): void {
    for (const r of this.rings.values()) r.clear();
    this.frameCount = 0;
    this.current = null;
  }

  /** 一幀開始。`nowMs` 用 rAF 的時戳（與 `workMs` 同一個時基）。 */
  begin(nowMs: number): void {
    if (!this.armedFlag) return;
    this.frameStartMs = nowMs;
    this.lastMarkMs = nowMs;
    this.current = FRAME_SEGMENTS[0];
  }

  /**
   * 上一段結束、`seg` 開始。
   * ⚠️ ⛔ 這裡**不做**任何驗證（例如「seg 是不是合法的名字」）—— 它跑在每一幀
   * 的熱路徑上，而名字打錯會在報告上長出一列陌生的段，那比一次 throw 更容易看到。
   */
  mark(seg: FrameSegment): void {
    if (!this.armedFlag) return;
    const t = this.clock();
    if (this.current !== null) this.ringOf(this.current).push(t - this.lastMarkMs);
    this.lastMarkMs = t;
    this.current = seg;
  }

  /** 一幀結束（收掉最後一段）。 */
  end(): void {
    if (!this.armedFlag) return;
    const t = this.clock();
    if (this.current !== null) this.ringOf(this.current).push(t - this.lastMarkMs);
    this.current = null;
    this.frameCount++;
  }

  /**
   * 迴圈**外面**的一段（`ui/WorldAnchorLayer` 的第二條 rAF、React reconcile…）。
   * ⭐ 它們整段住在 `diag.frameBudget.unaccountedMs` 裡，⛔ 在此之前沒有名字。
   */
  external(seg: ExternalSegment, ms: number): void {
    if (!this.armedFlag) return;
    this.ringOf(`~${seg}`).push(ms);
  }

  private ringOf(seg: string): Ring {
    let r = this.rings.get(seg);
    if (!r) {
      r = new Ring();
      this.rings.set(seg, r);
    }
    return r;
  }

  /**
   * ⛔⛔ **自證**：燒一段已知長度的時間進 `draw`，看量尺有沒有把它記在 `draw` 上。
   *
   * 兩個方向都要對，⛔ 只驗一個方向抓不到「所有時間都記到同一段」這種壞掉的尺：
   *   ① `draw` 至少要量到燒掉的六成（⚠️ 忙等在有節流的分頁上會偏短）
   *   ② **別的段**不可以吃到超過燒掉的四成（否則是歸屬錯位，不是量測誤差）
   *
   * ⚠️ 它在一個**私有的**實例上跑，⛔ 不污染正在服役的那把尺的視窗。
   */
  private selfTest(): void {
    const probe = new FrameSegments(this.clock);
    probe.armedFlag = true;
    const burn = (ms: number): void => {
      const until = this.clock() + ms;
      // ⛔ 忙等是刻意的：我們要的是「主執行緒真的被佔住 N ms」，
      //    ⛔ 不是 setTimeout（那會把時間交出去，量尺就量不到它）。
      while (this.clock() < until) {
        /* burn */
      }
    };
    for (let i = 0; i < 3; i++) {
      probe.begin(this.clock());
      probe.mark("drain");
      probe.mark("draw");
      burn(CALIBRATE_BURN_MS);
      probe.end();
    }
    const rep = probe.report();
    const draw = rep.segments.find((s) => s.seg === "draw")?.p50Ms ?? 0;
    const others = rep.segments.filter((s) => s.seg !== "draw").reduce((m, s) => Math.max(m, s.p50Ms), 0);
    if (draw >= CALIBRATE_BURN_MS * 0.6 && others <= CALIBRATE_BURN_MS * 0.4) {
      this.verdict = "ok";
      this.verdictNote = `⭐ 自證通過：燒 ${CALIBRATE_BURN_MS}ms → draw 量到 ${draw.toFixed(2)}ms（其餘段最大 ${others.toFixed(2)}ms）`;
    } else {
      this.verdict = "failed";
      this.verdictNote = `⛔ **自證失敗** —— 燒 ${CALIBRATE_BURN_MS}ms 但 draw 只量到 ${draw.toFixed(2)}ms、其餘段最大 ${others.toFixed(2)}ms ⇒ ⛔ 這把尺的一切結論作廢`;
    }
  }

  /** ⭐ 給守衛用的自證入口（⛔ 出貨路徑走 `arm(true)`，它自己會叫）。 */
  calibrate(): CalibrationVerdict {
    this.selfTest();
    return this.verdict;
  }

  report(): SegmentReport {
    const named: string[] = [];
    const external: string[] = [];
    for (const seg of this.rings.keys()) (seg.startsWith("~") ? external : named).push(seg);
    // p50 的總和當分母。⚠️ ⛔ 不用 `workMs`：兩個視窗不同步時份額會超過 100%，
    //    而一個「加起來 137%」的表沒有人看得懂它在說什麼。
    const p50Of = (seg: string): number => this.ringOf(seg).stat(seg, 0).p50Ms;
    const totalP50 = named.reduce((a, s) => a + p50Of(s), 0);
    const order = (a: SegmentStat, b: SegmentStat): number => b.p50Ms - a.p50Ms;
    return {
      armed: this.armedFlag,
      frames: this.frameCount,
      windowFrames: WINDOW_FRAMES,
      totalP50Ms: totalP50,
      segments: named.map((s) => this.ringOf(s).stat(s, totalP50)).sort(order),
      externals: external.map((s) => this.ringOf(s).stat(s.slice(1), totalP50)).sort(order),
      calibration: this.verdict,
      calibrationNote: this.verdictNote,
    };
  }
}

/** 出貨的那一把（⛔ 預設關著 —— 見檔頭「關掉必須零成本」）。 */
export const frameSegments = new FrameSegments();

const ms = (v: number): string => `${v.toFixed(2)}ms`;

/**
 * 📏 一段可以直接貼進票裡的文字。⭐ 逐段 **p50 / p95 / max ＋ 分母**，
 * ⛔ 不是一個平均數（行為相依的量是區間）。
 */
export function segmentReportText(rep: SegmentReport): string {
  const L: string[] = [];
  if (!rep.armed) {
    return "   ⛔ 量尺**沒有武裝** —— 主控台打 `__ggdProfile()` 打開，玩幾秒再 `__ggdDiag()`";
  }
  L.push(`   ${rep.calibrationNote}`);
  if (rep.calibration === "failed") return L.join("\n");
  if (rep.frames === 0) {
    L.push("   ⛔ **分母是 0**（一幀都還沒量到）⇒ 底下沒有東西可以信");
    return L.join("\n");
  }
  L.push(
    `   分母 ${rep.frames} 幀（視窗 ${rep.windowFrames}）· 逐段 p50 合計 ${ms(rep.totalP50Ms)}`,
  );
  for (const s of rep.segments) {
    L.push(
      `   ${s.seg.padEnd(8)} p50 ${ms(s.p50Ms).padStart(8)} · p95 ${ms(s.p95Ms).padStart(8)} · max ${ms(s.maxMs).padStart(8)} · ${s.sharePct.toFixed(0)}%`,
    );
  }
  if (rep.externals.length > 0) {
    L.push("   —— ⭐ 迴圈**外面**（⛔ 這些不在 workMs 裡，它們住在 unaccounted）——");
    for (const s of rep.externals) {
      L.push(
        `   ${s.seg.padEnd(8)} p50 ${ms(s.p50Ms).padStart(8)} · p95 ${ms(s.p95Ms).padStart(8)} · max ${ms(s.maxMs).padStart(8)}`,
      );
    }
  }
  return L.join("\n");
}

/**
 * 🔌 主控台入口（同 `__ggdDiag` 的理由：回報 lag 的當下手上有的是 F12）。
 * `__ggdProfile()` 開／`__ggdProfile(false)` 關。⭐ 開的當下就自證。
 */
(globalThis as { __ggdProfile?: (on?: boolean) => string }).__ggdProfile = (on = true) => {
  frameSegments.arm(on);
  if (!on) return "[ggd-profile] 量尺關閉（逐幀成本回到零）";
  return `[ggd-profile] 量尺武裝。${frameSegments.report().calibrationNote}\n玩幾秒之後打 __ggdDiag() 看第 ⑥ 節`;
};
