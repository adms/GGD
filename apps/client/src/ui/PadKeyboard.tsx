/**
 * PadKeyboard —— 螢幕小鍵盤的**瀏覽器那一半**（GH#503 / K1）。
 *
 * 純核心（版面、按一顆鍵的結果、要不要開）住在 `input/padKeyboard`；這裡只做三件
 * 需要真的 DOM 的事：把格子畫出來、掛到 `document.body` 上、把值寫回那個輸入框。
 *
 * ⭐ **它不讀手把。** 它畫出來的每一顆鍵都是普通的 `<button>`，外層宣告
 * `data-pad-scope` + priority，關閉鍵宣告 `data-pad-back` —— 於是既有的
 * `ui/PadFocusNav` 迴圈直接接管：`pickSpatial` 走格子、A 按下那顆鍵、
 * B 找到 `data-pad-back` 關掉它。⛔ 這裡沒有第二套 pad loop，一行都沒有。
 *
 * ⚠️ **為什麼是自己 `createRoot` 掛進 body**，而不是交給某個共用 chrome 元件
 * 渲染：那樣要動 `ui/GlobalChrome.tsx`（別條 lane 的檔），而且鍵盤必須蓋在
 * **每一個** modal 上面（改密碼、建房、聊天都已經是 scope）。掛在 body 尾端
 * 是唯一與「誰渲染了誰」無關的位置。
 */
import { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PAD_BACK } from "./padModalScope";
import { PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";
import {
  PAD_KEYBOARD_SCOPE,
  PAD_KEYBOARD_SCOPE_PRIORITY,
  applyPadKey,
  keyRows,
  nextLayer,
  previewText,
  setNativeInputValue,
  type PadKey,
  type PadKeyLayer,
} from "../input/padKeyboard";

export type PadKeyboardTarget = HTMLInputElement | HTMLTextAreaElement;

const KEY_STYLE: React.CSSProperties = {
  minWidth: 34,
  padding: "9px 10px",
  borderRadius: 7,
  border: "1px solid #35405c",
  background: "#161c2b",
  color: TEXT_MAIN,
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  // ⚠️ 明寫 opacity：`PadFocusNav.isVisible()` 讀 computed opacity，`0` 一律
  // 視為不存在。留白會讓整張鍵盤在焦點集合裡憑空消失。
  opacity: 1,
};

/**
 * 一個欄位的小鍵盤。`target` 是那個**真的** `<input>`/`<textarea>`；每一顆鍵
 * 都當場寫回它（原型 setter + input/change 事件），所以受控的 React 欄位
 * 一邊打一邊更新，⛔ 不是關掉才一次灌進去。
 */
export function PadKeyboard(props: { target: PadKeyboardTarget; onClose: () => void }): React.JSX.Element {
  const { target, onClose } = props;
  const [layer, setLayer] = useState<PadKeyLayer>("lower");
  const [value, setValue] = useState(target.value);
  const masked = (target.getAttribute("type") ?? "").toLowerCase() === "password";
  const label = target.getAttribute("placeholder") ?? target.getAttribute("name") ?? "輸入";

  // 目標被卸載了（換頁、modal 關掉）就跟著收 —— 一個寫不到任何地方的鍵盤
  // 會把手把整個關在裡面（它的 priority 贏過所有東西）。
  useEffect(() => {
    if (!target.isConnected) onClose();
  }, [target, onClose]);

  const press = (key: PadKey): void => {
    if (key.kind === "done") {
      onClose();
      return;
    }
    setLayer((l) => nextLayer(l, key.kind));
    const next = applyPadKey(target.value, key);
    if (next === target.value) return;
    setNativeInputValue(target, next);
    setValue(next);
  };

  return (
    <div
      {...{
        "data-pad-scope": PAD_KEYBOARD_SCOPE,
        "data-pad-scope-priority": String(PAD_KEYBOARD_SCOPE_PRIORITY),
      }}
      style={{
        position: "fixed",
        left: "50%",
        bottom: 24,
        transform: "translateX(-50%)",
        zIndex: 200,
        padding: 12,
        borderRadius: 12,
        border: PANEL_BORDER,
        background: "rgba(8, 11, 19, 0.96)",
        boxShadow: "0 18px 60px rgba(0,0,0,0.7)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        opacity: 1,
      }}
    >
      <div style={{ fontSize: 11, color: TEXT_DIM }}>{label}</div>
      <div
        style={{
          minWidth: 320,
          minHeight: 20,
          padding: "6px 8px",
          borderRadius: 6,
          background: "#10141f",
          color: TEXT_MAIN,
          fontSize: 14,
          wordBreak: "break-all",
        }}
      >
        {previewText(value, masked)}
      </div>
      {keyRows(layer).map((row, r) => (
        <div key={r} data-pad-key-row="" style={{ display: "flex", gap: 6, opacity: 1 }}>
          {row.map((key, c) => (
            <button
              key={`${r}-${c}`}
              type="button"
              // ⭐ `done` 就是 B 要按的那一顆 —— 一個**契約**，⛔ 不是讓
              // `backControlIndex` 用「完成」兩個字去碰運氣。
              {...(key.kind === "done" ? PAD_BACK : {})}
              onClick={() => press(key)}
              style={KEY_STYLE}
            >
              {key.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ----------------------------------------------------------- 掛載 / 卸載 --

let host: HTMLDivElement | null = null;
let root: Root | null = null;

/** 目前有沒有一張鍵盤開著。 */
export function isPadKeyboardOpen(): boolean {
  return root !== null;
}

/** 收掉鍵盤，並把 DOM 焦點還給那個輸入框。 */
export function closePadKeyboard(): void {
  const r = root;
  const h = host;
  root = null;
  host = null;
  if (!r) return;
  // ⚠️ 不可以同步 unmount —— 這一定是從某顆鍵的 click handler 裡被叫到的，
  // React 會對「正在 render 時卸載自己的 root」發警告並可能吃掉這一次更新。
  queueMicrotask(() => {
    r.unmount();
    h?.remove();
  });
}

/**
 * 替 `target` 開一張鍵盤（已經開著就換目標）。
 * `ui/PadFocusNav` 的 activate 分支是**唯一**的呼叫點。
 */
export function openPadKeyboard(target: PadKeyboardTarget): void {
  if (typeof document === "undefined") return;
  if (root) closePadKeyboard();
  const h = document.createElement("div");
  h.dataset.padKeyboardHost = "";
  document.body.appendChild(h);
  host = h;
  root = createRoot(h);
  root.render(
    <PadKeyboard
      target={target}
      onClose={() => {
        closePadKeyboard();
        try {
          target.focus({ preventScroll: true });
        } catch {
          target.focus();
        }
      }}
    />,
  );
}
