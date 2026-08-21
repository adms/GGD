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

/**
 * ⭐ GH#510 —— **手把也算「人在」**。
 *
 * 上面那五個事件全部是鍵鼠／觸控，而 Gamepad API **不發任何輸入事件**：瀏覽器
 * 只在插拔時給 `gamepadconnected` / `gamepaddisconnected`，按鍵與搖桿要自己
 * `navigator.getGamepads()` 去輪詢。⇒ 一個從頭到尾只用手把的玩家，在這支模組
 * 眼中**逐位元等於一個開著分頁去睡覺的人**：兩分鐘後 `rallyAutoJoin` 判他掛機，
 * 集合令不會把他拉進房，而他正坐在電視前面看著大廳。
 *
 * ⚠️ 這裡刻意**自己輪詢**，⛔ 不去呼叫 `input/GamepadInput` 的那套 ——
 * 那一套只在**比賽中**跑（`GameApp`），而這一格要回答的問題發生在**大廳**。
 * ⛔ 也不是「多一套手把狀態」：這裡不讀按鍵是哪一顆、不回報給任何人，只寫一格
 * 時間戳。
 *
 * 成本：輪詢只在**真的有手把連著**的時候開（`gamepadconnected` 起、最後一支
 * 拔掉就停），所以鍵鼠玩家身上是 0。
 */
const PAD_POLL_MS = 1000;

/**
 * 搖桿要推超過這個量才算「他動了」。⚠️ 這是**防漂移**的機械常數，⛔ 不是一個
 * 平衡決策 —— 廉價手把的類比搖桿靜止時常常停在 0.05~0.15，門檻取太低會讓
 * 「掛機」這格永遠是 false，那比沒有這一段更糟（它會讓掛機判定整個失效）。
 */
const PAD_AXIS_DEADZONE = 0.5;

/** 一支手把的最小樣貌（`navigator.getGamepads()` 回傳物的子集）。 */
export interface IdlePadSample {
  buttons?: readonly { pressed?: boolean }[];
  axes?: readonly number[];
}

/**
 * 這一批取樣裡**有沒有人在動手把**。純函式，⛔ 不讀 navigator ——
 * 守衛可以直接餵假手把。
 */
export function padSamplesActive(
  pads: readonly (IdlePadSample | null | undefined)[],
  deadzone: number = PAD_AXIS_DEADZONE,
): boolean {
  for (const p of pads) {
    if (!p) continue;
    for (const b of p.buttons ?? []) if (b?.pressed === true) return true;
    for (const a of p.axes ?? []) if (Math.abs(a) > deadzone) return true;
  }
  return false;
}

let lastInput = 0;
let installed = false;
let padTimer: ReturnType<typeof setInterval> | null = null;

function stamp(): void {
  const now = Date.now();
  if (now - lastInput >= WRITE_THROTTLE_MS) lastInput = now;
}

function readPads(): readonly (IdlePadSample | null)[] {
  const nav = typeof navigator === "undefined" ? null : (navigator as Navigator | null);
  const get = nav?.getGamepads;
  if (typeof get !== "function") return [];
  try {
    return get.call(nav) as readonly (IdlePadSample | null)[];
  } catch {
    return [];
  }
}

/** 一次輪詢：有人動手把就蓋時間戳；一支都沒連著就把計時器收掉。 */
function pollPads(): void {
  const pads = readPads();
  if (padSamplesActive(pads)) stamp();
  if (!pads.some((p) => p)) stopPadPolling();
}

function startPadPolling(): void {
  if (padTimer !== null || typeof setInterval !== "function") return;
  padTimer = setInterval(pollPads, PAD_POLL_MS);
  // Node/瀏覽器都不該因為這支計時器而活著（vitest 的 jsdom 會卡住不結束）。
  (padTimer as { unref?: () => void }).unref?.();
}

function stopPadPolling(): void {
  if (padTimer === null) return;
  clearInterval(padTimer);
  padTimer = null;
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
  // GH#510 —— 手把。插上去本身就是一次互動（他剛把控制器拿起來），之後由輪詢
  // 接手；最後一支拔掉時 `pollPads` 自己把計時器收掉。
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("gamepadconnected", () => {
      lastInput = Date.now();
      startPadPolling();
    });
  }
  // 這一頁載入時可能**已經**有手把連著（重新整理／從比賽回到大廳）——
  // `gamepadconnected` 那時候不會再發一次。
  if (readPads().some((p) => p)) startPadPolling();
}

/** 最後一次真的使用者輸入（ms epoch）。0 = 從來沒有（或這個環境沒有 DOM）。 */
export function lastUserInputAt(): number {
  return lastInput;
}

/** 分頁在背景嗎 —— 在背景的人**看不到**確認視窗。 */
export function tabHidden(): boolean {
  return typeof document !== "undefined" && document.hidden === true;
}

/**
 * ⚠️ 測試用：跑**出貨的**那一次輪詢（讀 `navigator.getGamepads`）。
 * ⛔ 不是測試自己的副本 —— 那會是失敗形態⑤（被測的不是出貨的那個）。
 */
export function __pollPadsForTest(): void {
  pollPads();
}

/** ⚠️ 測試用：把兩格狀態推回已知值。⛔ 出貨路徑上沒有人呼叫它。 */
export function __setLastUserInputAtForTest(at: number): void {
  installed = true;
  lastInput = at;
}

installUserActivityTracker();
