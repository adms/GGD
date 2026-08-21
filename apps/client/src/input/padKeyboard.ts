/**
 * padKeyboard —— 螢幕小鍵盤的**純核心**（GH#503 / K1）。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 為什麼需要它
 * ─────────────────────────────────────────────────────────────────────────────
 * `ui/PadFocusNav.tsx` 的 activate 分支在此之前只做一件事：`cur.click()`。
 * 對一顆 `<button>` 那是對的，對一個 `<input>` 它**一個字也打不出來** ——
 * 焦點進得去（`input` 在 `FOCUSABLE_SELECTOR` 裡）、游標閃著、然後就沒有了。
 * #503 量到 **16 個缺口**全部是這同一個根因：登入、註冊、改密碼、房名、邀請碼、
 * 房內聊天、好友搜尋、排行榜搜尋、選角搜尋 —— 純手把玩家一個都走不完。
 *
 * ⛔ 所以修法不是「替每一個表單各寫一次」（第零守則⑨：N 個同型 = K 個模板），
 * 是一個共用的鍵盤 + activate 分支裡的**一個判斷**。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 這個檔 vs `./PadKeyboard.tsx`
 * ─────────────────────────────────────────────────────────────────────────────
 * 這裡是**沒有 DOM 也能跑**的那一半（版面表、按一顆鍵的結果、要不要開鍵盤），
 * `PadKeyboard.tsx` 是瀏覽器那一半（畫出格子、掛進 body、寫回輸入框）。
 * 分法與 `input/padFocusNav.ts` ↔ `ui/PadFocusNav.tsx` 完全一致。
 *
 * ⭐ 鍵盤**自己不讀手把**。它只是一堆 `<button>` 加一個 `data-pad-scope`，
 * 於是既有的 `PadFocusNav` 迴圈（`pickSpatial` 走格子、A 按下、B 找
 * `data-pad-back`）原封不動地驅動它 —— ⛔ 不要再寫第二套 pad loop。
 */

/** 這個 overlay 的 scope 名字。⛔ 不要在別處寫這個字面值。 */
export const PAD_KEYBOARD_SCOPE = "pad-keyboard";
/**
 * 它在 `ui/padModalScope.ts` 那條梯子上的位置。
 *
 * 90 —— **贏過梯子上每一格**（目前最高的是 `device-link` / `leave-confirm`
 * / `rally-confirm` 的 60）。理由不是「它比較重要」，是**它一定開在某個東西
 * 上面**：玩家會在改密碼對話框、建房對話框、房內聊天裡叫出它，而那三個都已經
 * 是 scope。⛔ 它與那些 modal 不是同一個層級的競爭者，它是它們的子層。
 */
export const PAD_KEYBOARD_SCOPE_PRIORITY = 90;

export type PadKeyLayer = "lower" | "upper" | "symbols";
export type PadKeyKind = "char" | "space" | "backspace" | "clear" | "shift" | "symbols" | "done";

export interface PadKey {
  kind: PadKeyKind;
  /** 畫在鍵面上的字。 */
  label: string;
  /** `kind === "char"` 時真正送出去的字元。 */
  char?: string;
}

/**
 * 版面 —— **一張表，三層**。⛔ 不要散在元件裡。
 *
 * ⚠️ 為什麼不住 `content/config/*.json`：這是**輸入手感**的資料，跟
 * `input/padFocusNav.ts` 的 `NAV_REPEAT_MS` / `scrollStepPx` 同一種
 * （沒有任何一張卡片會提到它、設計師不會調它、調錯只有拿著手把才看得出來）。
 * 那個檔頭已經替這一族做過同一個判斷。⭐ 真正會被 owner 調的東西才進 config。
 */
const CHAR_ROWS: Record<PadKeyLayer, readonly string[]> = {
  lower: ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm@.-_"],
  upper: ["1234567890", "QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM@.-_"],
  symbols: ["1234567890", "!@#$%^&*()", "-_=+[]{}", ";:'\",.<>/?"],
};

/** 每一層都帶著的功能列。`done` 就是 B 會按的那一顆（見 `PAD_BACK`）。 */
function controlRow(layer: PadKeyLayer): PadKey[] {
  return [
    { kind: "shift", label: layer === "upper" ? "⇧ 小寫" : "⇧ 大寫" },
    { kind: "symbols", label: layer === "symbols" ? "abc" : "#+=" },
    { kind: "space", label: "␣ 空白" },
    { kind: "backspace", label: "⌫ 退格" },
    { kind: "clear", label: "清除" },
    { kind: "done", label: "完成" },
  ];
}

/** 這一層要畫出來的每一列。最後一列永遠是功能列。 */
export function keyRows(layer: PadKeyLayer): PadKey[][] {
  const rows = CHAR_ROWS[layer].map((line) =>
    Array.from(line, (ch): PadKey => ({ kind: "char", label: ch, char: ch })),
  );
  rows.push(controlRow(layer));
  return rows;
}

/** 按下一顆鍵之後，欄位的新值。⛔ 純函式：不碰 DOM、不知道 React。 */
export function applyPadKey(value: string, key: PadKey): string {
  switch (key.kind) {
    case "char":
      return value + (key.char ?? "");
    case "space":
      return value + " ";
    case "backspace":
      return value.slice(0, -1);
    case "clear":
      return "";
    default:
      return value; // shift / symbols / done 不改值
  }
}

/**
 * 按下一顆鍵之後在哪一層。
 *
 * ⭐ `shift` 是**黏著的切換**，⛔ 不是打一個字就自己彈回小寫 —— 手把打字一個字
 * 要走好幾格，自動彈回會讓「打一組全大寫的邀請碼」變成每一個字母都要繞去按
 * ⇧ 一次（邀請碼正是 `GGD-XXXX-XXXX` 全大寫的那一種）。
 */
export function nextLayer(layer: PadKeyLayer, kind: PadKeyKind): PadKeyLayer {
  if (kind === "shift") return layer === "upper" ? "lower" : "upper";
  if (kind === "symbols") return layer === "symbols" ? "lower" : "symbols";
  return layer;
}

/**
 * 這些 `type` 是「打字」用的欄位 —— 焦點停在上面按 A 應該叫鍵盤出來。
 * ⛔ `range` / `checkbox` / `radio` / `submit` / `file` / `color` 不在裡面：
 * 它們各自已經有 pad 的做法（`padValueKind` 改值、或就是 `click()`）。
 */
const TEXTUAL_INPUT_TYPES: ReadonlySet<string> = new Set([
  "",
  "text",
  "password",
  "email",
  "search",
  "tel",
  "url",
  "number",
]);

/** 焦點停在這個元素上時，A 應該開鍵盤（而不是 `click()`）嗎？ */
export function shouldOpenPadKeyboard(el: {
  tag: string;
  type?: string | null;
  readOnly?: boolean;
}): boolean {
  if (el.readOnly === true) return false;
  const tag = el.tag.toLowerCase();
  if (tag === "textarea") return true;
  if (tag !== "input") return false;
  return TEXTUAL_INPUT_TYPES.has((el.type ?? "").toLowerCase());
}

/** 預覽列要顯示的字：密碼欄只留最後一個字元，其餘打點。 */
export function previewText(value: string, masked: boolean): string {
  if (!masked || value.length === 0) return value;
  return "•".repeat(value.length - 1) + value.slice(-1);
}

/**
 * 像**真的使用者手勢**那樣寫值，React 才收得到。
 *
 * 受控的 `<input>` 身上帶著 React 的 `_valueTracker`，而 React 在實例上換掉了
 * `value` 的 setter；直接 `el.value = x` 會同時更新 DOM 與 tracker，於是 React
 * 比對之後認為「沒變」，把事件丟掉 —— 畫面上字出現一瞬間，下一次 render 就被
 * 洗回去。走**原型的** setter 會跳過實例 setter，tracker 留在舊值，派出去的事件
 * 才會被接受。
 *
 * ⚠️ 這與 `ui/PadFocusNav.tsx` 的 `setNativeValue`（#505 為 `<select>`/`range`
 * 寫的）是**同一個機制的兩個呼叫點**；那一支是私有的，兩邊都只有六行，
 * 合併它需要動到不屬於這條 lane 的檔案，所以留成交叉引用而不是第三套寫法。
 */
export function setNativeInputValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  // 兩個都派：React 的 onChange 走 `input`，而這個 repo 裡也有直接聽 `change` 的。
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
