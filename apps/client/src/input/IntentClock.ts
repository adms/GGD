/**
 * IntentClock —「玩家的操作多久送出一次」的時鐘 (task #282, 第二段).
 *
 * ── 為什麼 driveFrame 修完之後還是不夠 ──────────────────────────────────────
 * #282 的第一段(`render/frameCap.driveFrame`)把**取樣 + 送出**搬到 fps gate
 * 之前,所以 120Hz 面板 + 30fps 上限不再只送 15 筆。但送出的節拍還是**綁在
 * rAF 上**,而 rAF 本身在手機上就是 30Hz(低電量模式、發熱降頻、或面板本來
 * 就 60Hz 而瀏覽器對半掉)。這一支重新量過(`IntentClock.test.ts` 的
 * BASELINE 區塊,數字是跑出來的不是抄的):
 *
 *     rAF 120Hz + cap 30  →  26.2–26.8 筆/秒
 *     rAF  60Hz + cap 30  →  20.8–23.2 筆/秒
 *     rAF  30Hz + cap 30  →  19.6–19.8 筆/秒   ← 回報的 15.6–21.8 就是這一格
 *
 * **沒有一格達到 30**,連桌機 60Hz/60cap 都只有 20.8–23.2。原因不是「幀不夠」,
 * 是**拍子對不上**:`IntentSender` 用 `now - lastSend < 1000/30` 節流,而每一次
 * 送出都把 `lastSend` 釘在「幀到達的那一刻」。下一幀只要早 0.03 ms 到,就整幀
 * 被丟掉,要再等一整個幀期 —— 60 fps 直接變 30、30 fps 變 20。這正是
 * `render/frameCap.ts` 檔頭寫的那個「天真寫法會自我毀滅」,`FRAME_CAP_SLACK_MS`
 * 就是為了它存在的;`IntentSender` 的節流從來沒有拿到同一份修正。
 *
 * ── 這一支怎麼解 ────────────────────────────────────────────────────────────
 * 送出的節拍改成**絕對拍點**,而不是「幀到了就問一次」:
 *
 *   拍 b 的時刻 = origin + b × period      (period = 1000 / intentHz)
 *
 * `tick(wallNowMs)` 把「從 origin 到現在應該已經過了幾拍」算出來,**補齊**沒
 * 發過的拍,每一拍帶著它自己的**拍點時刻**(不是牆上時刻)交給下游。於是:
 *
 *   · rAF 30Hz 抖動 ±3ms → 有的幀 0 拍、有的幀 2 拍,一秒仍然剛好 30 拍;
 *   · 拍點之間的間隔永遠是 period,下游的節流不會再被 0.03 ms 打敗;
 *   · 拍點時刻**永遠 ≤ 牆上時刻**(取 floor),所以它不可能讓送出率超過設定值。
 *
 * ⚠️ 這是**兩個零件**,缺一個就回到 20/s:這裡的絕對拍點,加上
 * `net/IntentSender` 節流的 slack(浮點誤差 —— `origin + 2p - (origin + p)`
 * 未必等於 `p`)。兩邊各有一條會紅的守衛。
 *
 * ── 為什麼不會加重發燙 (#266 是 owner 明確的顧慮) ───────────────────────────
 * 這個修正**減少**每秒的工作量,不是增加:
 *
 *   1. 送出/取樣的次數從「面板刷新率」變成「設定值」。120Hz 手機以前每秒跑
 *      120 次 pump 只換到 26 筆封包;現在跑 30 次換到 30 筆。**少 75% 的喚醒**。
 *   2. 繪製完全沒有被動到 —— fps 上限、解析度、粒子預算全部原樣,GPU 的工作
 *      量是零變化。發燙來自持續滿載的 GPU,不是來自一秒 30 個幾百 bytes 的封包。
 *   3. watchdog 是 `setInterval(period)`,而且**在 rAF 健康時是純 no-op**
 *      (一次減法一次比較就回傳);分頁隱藏時直接不跑。
 *   4. 上限就是設定值本身:想更省電就把 `intentHz` 調低(10–30),那是真的
 *      少送、少取樣,而不是像以前那樣「多跑很多次、剛好少送很多筆」。
 */
import { TICK_HZ } from "@ggd/shared/constants";

/**
 * 預設送出率 = **sim 的 tick 率**。不是巧合也不是猜的:伺服器的信箱一個 tick
 * 只吃一筆 intent(最新的 seq 覆蓋舊的),所以每秒送超過 TICK_HZ 筆,多出來的
 * 那些是保證會被丟掉的頻寬。
 */
export const INTENT_HZ_DEFAULT = TICK_HZ;

/**
 * 下界。低於這個值,一次移動指令要等 100 ms 才出得去 —— 那已經不是省電是延遲。
 */
export const INTENT_HZ_MIN = 10;

/**
 * 上界 —— **這是有理由的上界,不是隨手填的**(CLAUDE.md:「欄位要有上界,不是
 * 只有下界」)。超過 TICK_HZ 的封包伺服器保證吃不下(見 INTENT_HZ_DEFAULT),
 * 所以把它開到 60 只會讓手機白白多送一倍的封包、多耗一倍的電,換到 0 個 tick
 * 的操作解析度。
 */
export const INTENT_HZ_MAX = TICK_HZ;

/**
 * 一次 `tick` 最多補幾拍。切到別的 app / 背景分頁回來時,積欠的可能是好幾百拍;
 * 把它們一次噴出去既沒有意義(intent 是 coalesce 的,只有最新那筆算數)又會被
 * 伺服器當成洪水。超過就**重新對拍**,只送最新的一拍。
 */
export const INTENT_MAX_CATCHUP_BEATS = 3;

/** 夾進合法範圍;非數字一律回預設值(不是 0 —— 靜默關掉輸入會被讀成 bug)。 */
export function clampIntentHz(hz: number): number {
  if (!Number.isFinite(hz)) return INTENT_HZ_DEFAULT;
  return Math.min(INTENT_HZ_MAX, Math.max(INTENT_HZ_MIN, Math.round(hz)));
}

/** 一拍多少毫秒。 */
export function intentPeriodMs(hz: number): number {
  return 1000 / clampIntentHz(hz);
}

export interface IntentClockSinks {
  /**
   * 取樣類比輸入(手把搖桿 / 虛擬搖桿)→ 變成 pending 的 order/aim。
   *
   * 時鐘只在**這一拍還沒有人取樣過**的時候呼叫它。rAF 健康時每一幀都取樣,
   * 所以這裡是 no-op;rAF 停擺、或者一次 tick 補了兩拍時,第二拍手上沒有新的
   * 搖桿讀數 —— 而 `IntentSender` 對空的 pending 是直接 return 的,那一拍就會
   * **完全消失**。補拍不補取樣 = 補了個寂寞。
   */
  sample(): void;
  /**
   * 把 coalesce 好的 intent 送出去。`beatMs` 是**拍點時刻**,不是牆上時刻:
   * 下游的節流必須拿它來比,否則拍子又會被幀的抖動打散。
   */
  beat(beatMs: number): void;
}

/** 可注入的環境 —— 讓整支在 node 底下可測,不需要 jsdom。 */
export interface IntentClockEnv {
  now(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  /** 分頁隱藏時 watchdog 不跑(隱藏的分頁不該還在送操作)。 */
  hidden(): boolean;
}

function browserEnv(): IntentClockEnv {
  return {
    now: () =>
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now(),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
    hidden: () => typeof document !== "undefined" && document.visibilityState === "hidden",
  };
}

export class IntentClock {
  private hz: number;
  private periodMs: number;
  /** 拍 0 的時刻;NaN = 還沒對過拍(下一次 tick 就地對拍並立刻發拍 0)。 */
  private originMs = Number.NaN;
  /** 已經發過幾拍(從 origin 起算)。 */
  private firedBeats = 0;
  /** 上一次有人餵時鐘的牆上時刻 —— watchdog 用它判斷 rAF 是不是停了。 */
  private lastTickMs = Number.NEGATIVE_INFINITY;
  /**
   * 從上一拍到現在,有沒有人取樣過。`tick`(rAF 來源)會把它設為 true,每一拍
   * 消費掉一次。false 就代表這一拍手上是舊資料 —— 由 `fire` 自己補一次取樣。
   */
  private sampledSinceBeat = false;
  private timer: unknown = null;

  constructor(
    private readonly sinks: IntentClockSinks,
    hz: number = INTENT_HZ_DEFAULT,
    private readonly env: IntentClockEnv = browserEnv(),
  ) {
    this.hz = clampIntentHz(hz);
    this.periodMs = 1000 / this.hz;
  }

  /** 目前生效的送出率(已夾過)。 */
  get rateHz(): number {
    return this.hz;
  }

  get beatMs(): number {
    return this.periodMs;
  }

  /**
   * 換一個送出率。會**重新對拍**(下一次 tick 立刻發一拍),所以玩家在設定裡
   * 改完之後這一場就生效,不用等下一場。watchdog 的間隔也跟著換。
   */
  setHz(hz: number): void {
    const next = clampIntentHz(hz);
    if (next === this.hz) return;
    this.hz = next;
    this.periodMs = 1000 / next;
    this.reset();
    if (this.timer !== null) {
      this.stop();
      this.start();
    }
  }

  /** 忘掉相位。暫停 / 重連 / 換率之後呼叫,避免拿一個很舊的 origin 去補幾百拍。 */
  reset(): void {
    this.originMs = Number.NaN;
    this.firedBeats = 0;
    this.lastTickMs = Number.NEGATIVE_INFINITY;
    this.sampledSinceBeat = false;
  }

  /**
   * rAF 來源:餵一個牆上時刻。回傳這一次發了幾拍(0 也是正常的 —— 兩拍之間
   * 的幀就是 0)。
   *
   * ⚠️ **呼叫之前必須剛剛取樣過**(`GameApp.pumpInput` 就是 `sampleInput()`
   * 接這一行)。那個取樣就是這一拍要送出去的東西,所以 `fire` 不會再補一次。
   *
   * 呼叫幾次是**無關的**:拍是從時間算出來的,不是從呼叫次數算出來的,所以
   * rAF 與 watchdog 同時餵也不會重複發拍。
   */
  tick(nowMs: number): number {
    if (!Number.isFinite(nowMs)) return 0;
    this.sampledSinceBeat = true;
    return this.advance(nowMs);
  }

  /** 拍點推進的本體。`tick` / `wake` 只差在「這一刻有沒有人取樣過」。 */
  private advance(nowMs: number): number {
    this.lastTickMs = nowMs;

    if (!Number.isFinite(this.originMs)) return this.rephase(nowMs);

    // 已經「到期」的拍數:拍 0 .. dueBeats-1
    const dueBeats = Math.floor((nowMs - this.originMs) / this.periodMs) + 1;
    if (dueBeats <= this.firedBeats) return 0;
    if (dueBeats - this.firedBeats > INTENT_MAX_CATCHUP_BEATS) return this.rephase(nowMs);

    let fired = 0;
    while (this.firedBeats < dueBeats) {
      // 拍點時刻,不是 nowMs —— 這一行就是「與畫面更新率脫鉤」的那一行。
      // 用 nowMs 的話,兩拍擠在同一幀就會被下游的節流吃掉一拍。
      const beatMs = this.originMs + this.firedBeats * this.periodMs;
      this.firedBeats += 1;
      fired += 1;
      this.fire(beatMs);
    }
    return fired;
  }

  /**
   * watchdog 的一拍。**rAF 健康時是 no-op** —— 只有在 rAF 已經超過一個拍期
   * 沒有餵過時鐘(切到背景手勢、發熱降頻到 10 fps、Babylon 卡在一次大載入)
   * 才會接手。取樣由 `fire` 統一負責,不在這裡特判。
   */
  wake(nowMs: number): number {
    if (this.env.hidden()) return 0;
    if (nowMs - this.lastTickMs < this.periodMs) return 0;
    this.sampledSinceBeat = false; // watchdog 這一路沒有人取樣過
    return this.advance(nowMs);
  }

  /** 裝上 watchdog 計時器(與 rAF 完全無關的第二個時鐘來源)。 */
  start(): void {
    if (this.timer !== null) return;
    this.timer = this.env.setInterval(() => this.wake(this.env.now()), this.periodMs);
  }

  stop(): void {
    if (this.timer === null) return;
    this.env.clearInterval(this.timer);
    this.timer = null;
  }

  private rephase(nowMs: number): number {
    this.originMs = nowMs;
    this.firedBeats = 1;
    this.fire(nowMs);
    return 1;
  }

  /**
   * 發一拍 —— **先確保手上是新的取樣,再送出**。
   *
   * ⚠️ 這個 `if` 是「補拍」真正有效的那一半。`IntentSender.update` 對空的
   * pending 是直接 return 的,所以一次 tick 補兩拍時,第二拍如果沒有新的搖桿
   * 讀數就會**送不出去** —— 補拍補了個寂寞,15 fps 的手機照樣只有 15 筆/秒。
   * (量到的:沒有這一行,rAF 15Hz 下送出率就是 15/s。)
   */
  private fire(beatMs: number): void {
    if (!this.sampledSinceBeat) this.sinks.sample();
    this.sampledSinceBeat = false;
    this.sinks.beat(beatMs);
  }
}
