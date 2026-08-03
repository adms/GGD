/**
 * fpsMeter —「畫面上那個 fps 數字」的唯一來源 (GH#271).
 *
 * ── 為什麼這個檔案存在 ────────────────────────────────────────────────────
 * owner 2026-08-04 的兩張實戰截圖：左下角 pill 寫 **228 fps** 與 **197 fps**,
 * 而 #266 / #274 說桌機鎖 60。第一個合理的結論是「上限沒生效」。
 *
 * **量出來不是。** 出貨路徑解析出的 `renderParams.fpsCap` 執行期就是 `60`,
 * 而 `driveFrame(cap=60)` 在 240 Hz 的假時鐘上跑一秒,`work.render` 正好被
 * 呼叫 **60** 次。上限一直是好的。
 *
 * 假的是**儀表**。pill 顯示的是 `perfBus.avgFps`,而它以前是這樣寫的：
 *
 *     perfBus.avgFps = qualityController.frameStats().avgFps || this.fpsEma;
 *
 * `qualityController.frameStats()` 是 `AdaptiveManager.stats()`,而 adaptive 的
 * 滾動視窗裝的是 **`workMs`（這一幀真的花掉多少 ms 做事,還沒被上限擋之前）**,
 * 不是幀與幀之間的間隔。所以那個「avgFps」其實是 **`1000 / 平均工作成本`** ——
 * 一個「這台機器最多畫得動幾張」的**能力值**,不是「這一秒真的畫了幾張」。
 *
 * 量到的對照（同一支探針）：工作成本 4.40 ms → 顯示 227.3；5.08 ms → 顯示 196.9。
 * 那正是 owner 螢幕上的 228 與 197。畫面其實一直是 60。
 *
 * ⚠️ 而真正的那個數字**一直算得好好的、也一直沒有人看** ——
 * `perfBus.fps`（`1000/dtMs` 的 EMA）是對的,但 pill 讀的是 `avgFps`,
 * 展開面板的「min / avg」那一列也是。這是本 repo 的失敗形態 ②
 * 「算出來了但從沒送到端點」的一種：送到了 bus,但送到的是**沒有人讀的欄位**。
 *
 * ── 這個模組做什麼 ────────────────────────────────────────────────────────
 * 一個**送出去的幀**的滾動視窗（間隔 ms,不是成本 ms）→ avg / min fps,
 * 外加把 HUD 會讀的那幾格一次寫齊。能力值沒有被丟掉 —— 它換到誠實的名字
 * `perfBus.capabilityFps`,並且和 `perfBus.fpsCap` 一起出現在展開面板上,
 * 讓「60 fps ／ 上限 60 ／ 餘裕 227」三個數字**同時**看得到。
 * 下一次上限真的壞掉時,pill 會直接寫 228 而 cap 寫 60,一眼就對不上。
 */
import type { PerfBus } from "../perfBus";
import { frameStats, type FrameStats } from "./AdaptiveQuality";

/**
 * 滾動視窗長度（送出去的幀數）。90 張在 60 fps 上是 1.5 秒 —— 與 AdaptiveQuality
 * 的視窗同長,兩個數字才會描述同一段時間。太短會讓 pill 抖,太長會讓一次真的
 * 掉幀在 min 上留太久。
 */
export const FRAME_RATE_WINDOW = 90;

/** EMA 平滑係數（與舊的 `GameApp.fpsEma` 相同,行為不變）。 */
const EMA_ALPHA = 0.1;

/**
 * 送出去的幀率計。餵它的是**兩次真的繪製之間的牆上間隔**,不是工作成本 ——
 * 這個區別就是 GH#271 的全部。
 */
export class FrameRateMeter {
  private readonly deltas: number[] = [];
  private ema = 0;

  /** 一張真的畫出去的幀：距離上一張的間隔（ms）。 */
  sample(dtMs: number): void {
    if (!Number.isFinite(dtMs) || dtMs <= 0) return;
    this.deltas.push(dtMs);
    if (this.deltas.length > FRAME_RATE_WINDOW) this.deltas.shift();
    const inst = 1000 / dtMs;
    this.ema = this.ema === 0 ? inst : this.ema + (inst - this.ema) * EMA_ALPHA;
  }

  /** 平滑後的瞬時幀率。 */
  get fps(): number {
    return this.ema;
  }

  /** 視窗內真的送出去的幀率：avg / min（min 來自最長的那個間隔）。 */
  stats(): FrameStats {
    return frameStats(this.deltas);
  }

  /** 測試用：換一場、或暫停回來時忘掉舊視窗。 */
  reset(): void {
    this.deltas.length = 0;
    this.ema = 0;
  }

  /**
   * 把 HUD 讀的那五格一次寫齊 —— **這是出貨路徑**。
   *
   * 這個函式存在的理由是可測性：`GameApp.samplePerf` 是一個 private method,
   * 而 GameApp 在測試裡建構不出來（Babylon engine 要真的 WebGL）。缺陷原本就
   * 藏在那個測不到的地方。把「哪個數字進哪一格」搬到這裡之後,守衛
   * (`fpsMeter.test.ts`) 打的是玩家螢幕上那個數字真正的來源,而不是一個
   * 測試自己重寫的副本（失敗形態 ⑤）。
   *
   * @param capability adaptive 視窗（workMs）算出來的「畫得動幾張」。
   * @param capFps     目前生效的上限；0 = 無上限。
   */
  publish(bus: PerfBus, capability: FrameStats, capFps: number): void {
    const delivered = this.stats();
    bus.fps = this.ema;
    // ⚠️ `|| this.ema` 的退路留著,但退的是**同一種意思**的值（也是送出去的幀率）,
    // 不像以前退到一個能力值。視窗還沒滿的第一幀才會走到。
    bus.avgFps = delivered.avgFps || this.ema;
    bus.minFps = delivered.minFps || this.ema;
    bus.capabilityFps = capability.avgFps;
    bus.fpsCap = capFps;
  }
}
