/**
 * userIdle — 「這台機器前面**現在有沒有人**」的唯一答案（GH#492 的 opt-out 安全閥）。
 *
 * ---- 它為什麼存在 ------------------------------------------------------------
 * 集合令在 2026-08-21 被 owner 反轉成 **opt-out**（「預設是加入，五秒是讓人按否定的」）。
 * opt-in 之下「沒反應 = 不加入」是安全的；opt-out 之下「沒反應 = **被拉進一場比賽**」，
 * 而一個整場不動的隊友對其他九個人來說比少一個人**更糟**。
 *
 * ---- ⛔ 為什麼不是伺服器做這件事 ---------------------------------------------
 * 平台的 presence 是一把 TTL 鑰匙，續期的 heartbeat 由大廳 WS **用計時器**送出
 * （`apps/platform/internal/lobby/ws.go`：`case "heartbeat"`），⛔ 不是使用者做了什麼。
 * ⇒ 伺服器眼中「盯著大廳的人」和「開著分頁去睡覺的人」**逐位元相同**，
 * 沒有任何 presence 欄位分得出來。⛔ 所以不要為了這一格在平台上造第二套 presence
 * （那是一份新的、會腐爛的線上狀態），判斷放在收件人自己那一台 ——
 * 自動加入的那個 request 本來就是他的瀏覽器發的。
 *
 * ---- 它刻意**不**做的事 ------------------------------------------------------
 * ⛔ 不回報給任何人。這裡量到的東西不上網，只決定「我這一台要不要自動加入」。
 * 一份會上網的閒置紀錄是一個新的隱私面，而它換不到任何東西。
 */

/** 這些事件才算「人在」。⚠️ ⛔ `visibilitychange` 不在裡面 —— 它自己是一格狀態。 */
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

/** 兩次寫入之間至少隔這麼久。`pointermove` 一秒鐘幾十次，⛔ 不必每一次都寫。 */
const WRITE_THROTTLE_MS = 1000;

let lastInput = 0;
let installed = false;

function stamp(): void {
  const now = Date.now();
  if (now - lastInput >= WRITE_THROTTLE_MS) lastInput = now;
}

/**
 * 掛上監聽（重複呼叫是安全的）。
 *
 * ⚠️ 它在**模組載入時**就跑，⛔ 不是在確認視窗打開時 —— 視窗只活 5 秒，
 * 而要回答的問題是「他**這幾分鐘**有沒有動過」。掛在視窗上等於永遠答「沒動過」。
 */
export function installUserActivityTracker(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  lastInput = Date.now(); // 載入這一頁本身就是一次互動（他剛登入 / 剛回到大廳）
  for (const ev of ACTIVITY_EVENTS) {
    document.addEventListener(ev, stamp, { passive: true });
  }
  // 分頁從背景回到前景 = 他回來了。⛔ 少了這一行，alt-tab 出去再回來的人要先動一下
  // 滑鼠才會被算成「在」，而他明明正在看著這個視窗。
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) lastInput = Date.now();
  });
}

/** 最後一次真的使用者輸入（ms epoch）。0 = 從來沒有（或這個環境沒有 DOM）。 */
export function lastUserInputAt(): number {
  return lastInput;
}

/** 分頁在背景嗎 —— 在背景的人**看不到**確認視窗。 */
export function tabHidden(): boolean {
  return typeof document !== "undefined" && document.hidden === true;
}

/** ⚠️ 測試用：把兩格狀態推回已知值。⛔ 出貨路徑上沒有人呼叫它。 */
export function __setLastUserInputAtForTest(at: number): void {
  installed = true;
  lastInput = at;
}

installUserActivityTracker();
