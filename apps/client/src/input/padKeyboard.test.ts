/**
 * @vitest-environment jsdom
 *
 * GH#502 —— 螢幕小鍵盤（#503 出貨）在此之前**一條守衛都沒有**。承重那一行是
 * `setNativeInputValue` 走**原型的** setter：換回 `el.value = v`，受控的 React
 * 欄位會把這次輸入丟掉，而畫面上長得跟「手把打不出字」一模一樣 —— #503 修的
 * 那個缺陷原封不動地回來。
 */
import { describe, expect, it } from "vitest";
import { applyPadKey, keyRows, setNativeInputValue, shouldOpenPadKeyboard } from "./padKeyboard";

describe("pad keyboard", () => {
  it("按鍵真的寫進 <input> 的 value,而且派得出 input 事件", () => {
    const el = document.createElement("input");
    el.type = "password";
    document.body.appendChild(el);
    let heard = 0;
    el.addEventListener("input", () => void heard++);

    const keys = keyRows("lower").flat();
    const g = keys.find((k) => k.char === "g");
    expect(g).toBeDefined();
    setNativeInputValue(el, applyPadKey(el.value, g!));
    setNativeInputValue(el, applyPadKey(el.value, g!));
    expect(el.value).toBe("gg");
    expect(heard).toBe(2);

    const back = keys.find((k) => k.kind === "backspace");
    setNativeInputValue(el, applyPadKey(el.value, back!));
    expect(el.value).toBe("g");
    // …而且這顆欄位一開始就該叫得出鍵盤（⛔ 滑桿/唯讀不該,它們另有做法）
    expect(shouldOpenPadKeyboard({ tag: el.tagName, type: el.type })).toBe(true);
    expect(shouldOpenPadKeyboard({ tag: "INPUT", type: "range" })).toBe(false);
    el.remove();
  });
});
