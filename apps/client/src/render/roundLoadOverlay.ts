/**
 * roundLoadOverlay —— 🧹 GH#819 就緒閘的**畫面**：full 清理後盤點還沒載完而
 * 戰鬥已經開始的那幾百毫秒，蓋一層「回合準備中＋進度」。
 *
 * owner 的驗收條之一（逐字）：「⛔ 等待期間畫面**說出來**（進度／「載入中」），
 * ⛔ 不是黑畫面或凍結」—— 所以這一層是半透明的（背後的場景照畫），字寫的是
 * **數字**（載入到第幾件），⛔ 不是一顆轉圈圈。
 *
 * 刻意是命令式 DOM 而不是 React HUD 槽：閘在 GameApp 的 rAF 迴圈裡逐幀判斷，
 * 走 React state 就是把逐幀資料推進 re-render（architecture 閘禁止的形狀）；
 * 而且它必須在 HUD 整棵樹掛壞時仍然出得來 —— 它報的正是「畫面還沒好」。
 */
const OVERLAY_ID = "ggd-round-load-overlay";

function overlayEl(): HTMLElement | null {
  if (typeof document === "undefined") return null; // headless 測試：無 DOM 就不畫
  let el = document.getElementById(OVERLAY_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = OVERLAY_ID;
    el.style.cssText =
      "position:fixed;inset:0;z-index:9000;display:none;align-items:center;justify-content:center;" +
      "background:rgba(6,10,18,0.55);color:#e8eefc;font:600 15px/1.6 system-ui,sans-serif;" +
      "pointer-events:none;text-align:center;text-shadow:0 1px 4px rgba(0,0,0,0.8)";
    document.body.appendChild(el);
  }
  return el;
}

/** 顯示（冪等，逐幀呼叫沒關係 —— 只在文字變了才寫 DOM）。 */
export function showRoundLoadOverlay(loaded: number, total: number): void {
  const el = overlayEl();
  if (!el) return;
  const text = `🧹 回合準備中…\n資產盤點載入 ${loaded} / ${total} 件`;
  if (el.dataset["text"] !== text) {
    el.dataset["text"] = text;
    el.textContent = text;
    el.style.whiteSpace = "pre-line";
  }
  if (el.style.display !== "flex") el.style.display = "flex";
}

/** 隱藏（冪等）。 */
export function hideRoundLoadOverlay(): void {
  if (typeof document === "undefined") return;
  const el = document.getElementById(OVERLAY_ID);
  if (el && el.style.display !== "none") el.style.display = "none";
}
