/**
 * frameCap —「一秒鐘到底畫幾張」的**唯一**一份實作 (task #23 / #266)。
 *
 * 為什麼要有這個檔案：這個 client 有四條各自獨立的 render loop
 * (arena `GameApp.frame`、`LoginScene`、`IntermissionScene`、`StorePreview`)，
 * 每一條都是 requestAnimationFrame 驅動的，也就是「螢幕更新幾次就畫幾次」。
 * 手機的 ProMotion / 高刷面板是 120 Hz，所以不設限的 loop 會用掉整整兩倍的
 * GPU 時間去畫玩家根本分辨不出來的張數 —— 這就是 owner 說的「手機玩一場就很燙」。
 *
 * 之前這條規則被抄了三份：GameApp 用「`1000/cap` 再減 slack」，兩個選單場景
 * 各自寫死 `1000 / 62`。抄三份的問題不是重複，是**它們會各自漂走**：
 * StorePreview（大廳英靈殿 / 選角側邊立繪 / 回合勝者卡，三個畫面共用）根本
 * 忘了抄，於是它是唯一一條真的以 120 fps 在跑的 loop。統一成一份之後，
 * 「有沒有上限」變成一個可以被單一測試釘住的問題。
 *
 * ── 為什麼要有 slack ──────────────────────────────────────────────
 * 天真的寫法 `now - last >= 1000/60` 在 60 Hz 面板上會**自我毀滅**：rAF 的
 * 間隔本來就會抖動，只要有一張在 16.6 ms 之前 0.1 ms 到達就被丟掉，下一張
 * 要等到 33 ms —— 60 fps 直接掉成 30 fps。所以門檻要比理論間隔早一點點
 * (`FRAME_CAP_SLACK_MS`)：60 Hz 面板每張都畫得到，120 Hz 面板剛好每兩張畫
 * 一張。這個常數是從 GameApp 既有的實作搬過來的，不是新調的值。
 */

/**
 * 門檻要比 `1000/cap` 早多少毫秒。3 ms 對 60 fps 來說是 18% 的餘裕 ——
 * 足以吸收 rAF 抖動，又遠小於 120 Hz 的 8.3 ms 間隔，所以不會讓高刷面板
 * 偷渡到 120 fps。
 */
export const FRAME_CAP_SLACK_MS = 3;

/**
 * 選單 / 預覽類場景（登入、商店中場、英靈殿立繪）的固定上限。
 * 這些畫面不是競技操作，60 就是上限，沒有理由開放給玩家調高。
 */
export const MENU_FPS_CAP = 60;

/**
 * 平台預設 fps 上限 (owner 2026-07-28:「FPS強制都是60，除非額外調整，
 * 手機則是預設30」)。
 *
 * ⚠️ 這是**預設值**,不是硬上限。玩家在設定裡選過什麼就是什麼 —— 「除非額外調整」
 * 那半句和前半句一樣重要,壓成硬鎖等於拿走玩家的選擇權。
 *
 * 為什麼手機是 30 而不是「跟桌機一樣 60 再靠自適應降級」:`AdaptiveQuality` 是
 * **事後補救** —— 幀掉了才降解析度/粒子,而發燙是持續滿載造成的,不是掉幀造成的。
 * 手機以 60 跑滿一整場,自適應會忠實地維持 60 並且把裝置烤熱。30 是先驗的省電,
 * 兩者互補而不重疊。
 */
export const DESKTOP_FPS_CAP = 60;
export const MOBILE_FPS_CAP = 30;

export function defaultFpsCap(touch: boolean): number {
  return touch ? MOBILE_FPS_CAP : DESKTOP_FPS_CAP;
}

/**
 * 選單場景的上限也跟著平台走 —— 手機在大廳、選角、商店待的時間比在戰鬥裡還長,
 * 只鎖戰鬥那條 loop 會讓「手機一場就發燙」只解決一半。
 */
export function menuFpsCap(touch: boolean): number {
  return touch ? MOBILE_FPS_CAP : MENU_FPS_CAP;
}

/**
 * 距離上一次「真的畫了」至少要過多久，才允許再畫一張。
 * `capFps <= 0` 代表不設限（玩家在設定裡選了「無上限」）→ 回傳 0。
 */
export function minFrameMs(capFps: number): number {
  if (!Number.isFinite(capFps) || capFps <= 0) return 0;
  return 1000 / capFps - FRAME_CAP_SLACK_MS;
}

/**
 * 這一張要不要畫？
 *
 * @param nowMs        現在的時鐘（呼叫端自己的 now，可注入）
 * @param lastRenderMs 上一次**真的畫了**的時刻（不是上一次進 loop 的時刻 ——
 *                     被跳過的張數不能推進它，否則上限會失效）
 * @param capFps       上限；<= 0 表示不設限
 */
export function shouldRenderFrame(nowMs: number, lastRenderMs: number, capFps: number): boolean {
  const budget = minFrameMs(capFps);
  if (budget <= 0) return true;
  return nowMs - lastRenderMs >= budget;
}

/**
 * 一個 animation frame 到底要做哪些事 (task #282)。
 *
 * ⚠️ 這個函式存在的理由,是「fps 上限」與「輸入送出率」被綁在一起這個 bug。
 * `GameApp.frame` 原本長這樣:
 *
 *     if (!shouldRenderFrame(...)) return;      // ← 手機 30fps 在這裡擋掉
 *     ...
 *     this.gamepads.poll(); this.touch.poll();  // ← 搖桿/虛擬搖桿只在這裡取樣
 *     this.sessions.update(nowMs);              // ← intent 只在這裡送出
 *
 * `IntentSender` 自己是 30Hz 節流的,但它只有在**被呼叫**時才可能送。把整個
 * frame body 擋掉,等於連取樣與送出一起擋掉:桌機 60fps 量到 ~25 筆/秒,
 * 手機 30fps 掉到 15.6–21.8 筆/秒 —— #274 的省電改動順手把手機的操作解析度
 * 砍了一半,而且沒有任何測試看得到,因為兩件事在同一個 `if` 的同一側。
 *
 * 所以「一幀要做哪些事」變成一個**有名字、可測**的決定:`pump` 每一幀都跑
 * (取樣輸入 + 送出 intent —— 這與畫面無關),`render` 才受 fps 上限節流。
 *
 * @returns 新的 `lastRenderMs`(沒畫就原樣回傳 —— 被跳過的幀不可以推進它,
 *          否則上限會失效,見 `shouldRenderFrame`)。
 */
export interface FrameWork {
  /** 每一個 animation frame 都跑:輸入取樣 + intent 送出。與渲染無關。 */
  pump: (nowMs: number) => void;
  /** 只有真的要畫的那幾幀才跑。 */
  render: (nowMs: number) => void;
}

export function driveFrame(
  nowMs: number,
  lastRenderMs: number,
  capFps: number,
  work: FrameWork,
): number {
  // INPUT FIRST, UNCONDITIONALLY. 這一行在 gate **之前**就是這個修正的全部。
  work.pump(nowMs);
  if (!shouldRenderFrame(nowMs, lastRenderMs, capFps)) return lastRenderMs;
  work.render(nowMs);

  // ⏱ 進位,不是歸零 —— owner 2026-07-30「桌面版 fps 竟然又超過 60」。
  //
  // 舊的 `return nowMs` 把每一次繪製當成新的起點,於是節流變成「整張整張丟」,
  // 而整數比例只在少數刷新率上剛好命中 60:
  //     60/120/240 Hz → 60.0 ✅   144 Hz → **72.0** ⛔   360 Hz → **72.0** ⛔
  //     75 Hz → 37.5 ⛔   90 Hz → 45.0 ⛔   165 Hz → 55.0 ⛔
  // 144 Hz 上 144/2 = 72、144/3 = 48,**丟整張永遠命不中 60**,兩個方向都會錯。
  //
  // 改成把上一格推進「一個預算」而不是推到 `nowMs`,餘數就留給下一次 ——
  // 144 Hz 會自己走出 2-2-3 的節奏,平均正好落在 60。這是固定步長累加器,
  // 不需要多存任何狀態,仍然只有一個數字。
  // ⚠️ 進位用的是**真正的間隔** `1000/cap`,不是 gate 用的 `minFrameMs`(已扣掉 slack)。
  // 我第一版寫成用 `minFrameMs` 進位,於是節奏變成 1000/13.67 = **73 fps**,
  // 每一種刷新率都錯。slack 只是「允許早到多少」的容差,不是步長。
  if (capFps <= 0) return nowMs;
  const step = 1000 / capFps;
  const advanced = lastRenderMs + step;
  // 落後太多就重新對時:分頁切到背景、裝置睡眠回來時,`nowMs` 會跳掉好幾秒,
  // 這時追進度只會連噴幾十張沒有意義的畫面。一個步長是「抖動」與「斷線」的界線。
  return nowMs - advanced > step ? nowMs : advanced;
}

/**
 * 有狀態的版本：自己記住上一次畫的時刻。給那些「loop 就是一個 method」的
 * 場景用，讓它們只要寫一行 `if (!this.pacer.take(t)) return;`。
 */
export class FramePacer {
  private lastRenderMs = -Infinity;

  constructor(private capFps: number = MENU_FPS_CAP) {}

  setCap(capFps: number): void {
    this.capFps = capFps;
  }

  /**
   * 消費一張 frame：可以畫就記下時間並回傳 true，否則回傳 false。
   * 命名成 take() 是因為它**有副作用** —— 呼叫端不可以先問再問。
   */
  take(nowMs: number): boolean {
    if (!shouldRenderFrame(nowMs, this.lastRenderMs, this.capFps)) return false;
    this.lastRenderMs = nowMs;
    return true;
  }

  /** 暫停後重新開始時呼叫，避免用一個很舊的 lastRenderMs 去比。 */
  reset(): void {
    this.lastRenderMs = -Infinity;
  }
}
