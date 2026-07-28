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
