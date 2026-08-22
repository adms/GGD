/**
 * PadCursor —— 虛擬游標的**瀏覽器那一半**（GH#502 / K2）。
 *
 * 純核心（設定解析、一幀走多遠、模式開關的規則）住在 `input/padCursor`；
 * 這裡只做三件需要真的 DOM 的事：畫出那支箭頭、`elementFromPoint` 打到誰、
 * 把**帶座標的**滑鼠事件派給它。
 *
 * ⚠️ **為什麼不是 React 元件**（`ui/PadKeyboard.tsx` 是）：游標每一幀都動。
 * 一個每幀 `setState` 的元件會讓 React 在選單裡跑滿 60fps 的 reconcile，
 * 而它畫的東西是**一個 `transform`**。所以這裡是一顆直接掛在 `document.body`
 * 上的 div，⛔ 沒有 root、沒有 render。
 *
 * ⭐ **為什麼是 `dispatchEvent` 而不是 `el.click()`**：`click()` 送出的
 * `MouseEvent` 的 `clientX/clientY` 是 **0**，而這個 repo 裡有一整族讀座標的
 * 接收端（拖曳、右鍵選單、canvas 上的熱區、tooltip 的定位）。用 `click()`
 * 的話它們會全部以為玩家點在螢幕左上角 —— 而那是「點得到但點錯地方」，
 * ⛔ 比點不到更難查。
 */
const CURSOR_SIZE = 22;
/**
 * ⚠️ 要贏過畫面上每一層 —— 螢幕小鍵盤的 host 是 `zIndex: 200`，而游標
 * **一定**畫在它上面（玩家會用游標點鍵盤上的鍵）。
 */
const CURSOR_Z = 100000;

/**
 * ⭐ `pointer-events: none` 是這個檔的**承重那一行**：少了它，
 * `document.elementFromPoint()` 每一次都會打到游標自己，於是 A 永遠點在
 * 一張 22px 的貼紙上、⛔ 一個按鈕都按不到，而畫面上看起來完全正常
 *（箭頭在動、按下去沒反應）。
 */
const ARROW_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
  '<path d="M4 2 L4 20 L9 15.5 L12.2 22 L15.4 20.4 L12.2 14.2 L19 14 Z" ' +
  'fill="#e8ecf4" stroke="#0b0f18" stroke-width="1.4" stroke-linejoin="round"/></svg>';

let el: HTMLDivElement | null = null;
/** 上一幀游標底下是誰 —— 換人時才派 mouseout/mouseover（hover 提示才會亮）。 */
let hovered: Element | null = null;

/** 現在畫面上有沒有一支虛擬游標。 */
export function isPadCursorVisible(): boolean {
  return el !== null;
}

/** 把游標畫出來（已經在了就什麼都不做）。 */
export function showPadCursor(at: { x: number; y: number }): void {
  if (typeof document === "undefined" || el) return;
  const d = document.createElement("div");
  d.dataset.padCursor = "";
  d.setAttribute("aria-hidden", "true");
  d.innerHTML = ARROW_SVG;
  d.style.position = "fixed";
  d.style.left = "0px";
  d.style.top = "0px";
  d.style.width = `${CURSOR_SIZE}px`;
  d.style.height = `${CURSOR_SIZE}px`;
  d.style.zIndex = String(CURSOR_Z);
  // ⭐ 見 ARROW_SVG 上面那段：少了這一行一個按鈕都按不到
  d.style.pointerEvents = "none";
  d.style.filter = "drop-shadow(0 2px 4px rgba(0,0,0,0.8))";
  document.body.appendChild(d);
  el = d;
  syncPadCursor(at);
}

/** 收掉游標，並把 hover 狀態還原（⛔ 不然最後那顆按鈕會一直亮著）。 */
export function hidePadCursor(): void {
  if (hovered) {
    hovered.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, view: window }));
    hovered = null;
  }
  el?.remove();
  el = null;
}

/** 游標底下的元素（游標自己因為 `pointer-events:none` 不會被打到）。 */
export function padCursorHit(at: { x: number; y: number }): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const hit = document.elementFromPoint(at.x, at.y);
  return hit instanceof HTMLElement ? hit : null;
}

/**
 * 把游標移到 `at`，並讓底下的元素知道滑鼠在它身上。
 *
 * ⚠️ `mousemove` 每一幀都派（拖曳與 tooltip 的定位靠它），
 * `mouseover`/`mouseout` **只在換人時**派 —— 每幀都派 over 會讓任何一個
 * 「進來就播音效」的接收端在游標靜止時每秒響 60 次。
 */
export function syncPadCursor(at: { x: number; y: number }): void {
  if (!el) return;
  el.style.transform = `translate(${at.x}px, ${at.y}px)`;
  const hit = padCursorHit(at);
  const opts = { bubbles: true, clientX: at.x, clientY: at.y, view: window } as const;
  if (hit !== hovered) {
    hovered?.dispatchEvent(new MouseEvent("mouseout", opts));
    hovered = hit;
    hit?.dispatchEvent(new MouseEvent("mouseover", opts));
  }
  hit?.dispatchEvent(new MouseEvent("mousemove", opts));
}

/**
 * 在 `at` 對 `target` 做一次完整的「按下去」。
 *
 * ⭐ 派的是**整串**：pointerdown → mousedown → pointerup → mouseup → click。
 * React 的 `onPointerDown` / `onMouseDown` 接收端（拖曳、長按、按鈕的按下態）
 * 只聽得到前面那幾個；只派 `click` 的話它們在手把上是死的 ——
 * 而那是「說了但不會發生」的形狀（第一·五守則）。
 */
export function padCursorPress(target: HTMLElement, at: { x: number; y: number }): void {
  const init = {
    bubbles: true,
    cancelable: true,
    clientX: at.x,
    clientY: at.y,
    button: 0,
    view: window,
  } as const;
  // ⚠️ jsdom 與少數瀏覽器沒有 PointerEvent；沒有就只走滑鼠那一半，
  // ⛔ 不要因為缺一個建構子就整串不派。
  const PE = (globalThis as { PointerEvent?: typeof MouseEvent }).PointerEvent;
  if (PE) target.dispatchEvent(new PE("pointerdown", init));
  target.dispatchEvent(new MouseEvent("mousedown", init));
  // 焦點跟著走，否則鍵盤/手把的下一步會從一個看不見的地方繼續。
  try {
    target.focus({ preventScroll: true });
  } catch {
    /* 不可聚焦的元素（一個 <div> 熱區）—— 點得到就夠了 */
  }
  if (PE) target.dispatchEvent(new PE("pointerup", init));
  target.dispatchEvent(new MouseEvent("mouseup", init));
  target.dispatchEvent(new MouseEvent("click", init));
}
