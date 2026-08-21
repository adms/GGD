// @vitest-environment jsdom
/**
 * GH#503/K1 —— **手把真的把字打進了一個受控的輸入框**。
 *
 * 掛出貨的 `<PadFocusNav/>` + 出貨的 `<TextInput>`（⛔ 不是裸 `<input>`——那會漏掉
 * React `_valueTracker` 這整個機制,失敗形態⑤）,讀真的 DOM 與真的 React state。
 * jsdom 沒有排版,所以矩形由測試餵（同 `padFocusNavCapabilities.test.ts`）。
 * 突變（2026-08-22,M1）：拿掉 activate 分支裡的 `openPadKeyboard(...)` → 紅在
 * 「鍵盤沒有開」那一行。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PadInfo } from "../input/gamepadDetect";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const h = vi.hoisted(() => ({ pad: null as PadInfo | null }));
vi.mock("../input/GamepadInput", () => ({ listPadSources: () => [h.pad] }));
vi.mock("./platform/store", () => ({ appStore: { getState: () => ({ screen: "lobby" }) } }));
vi.mock("../net/RoomStore", () => ({ hudStore: { getState: () => ({ phase: "idle" }) } }));
const { PadFocusNav } = await import("./PadFocusNav");
const { TextInput } = await import("./platform/widgets");
const rects = new Map<Element, [number, number, number, number]>();
Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
  const [x, y, w, ht] = rects.get(this) ?? [0, 0, 0, 0];
  return { x, y, width: w, height: ht, top: y, left: x, right: x + w, bottom: y + ht } as DOMRect;
};
let seen = "";
function Field(): React.JSX.Element {
  const [v, setV] = useState("");
  seen = v;
  return createElement(TextInput, { value: v, onChange: setV, placeholder: "username" });
}
let frames: FrameRequestCallback[] = [];
let root: Root;
/** 一幀：餵一份手把快照（`pressed` 是按下的按鈕 index），跑掉排到的 rAF。 */
const tick = async (pressed: number[] = []): Promise<void> => {
  h.pad = { connected: true, id: "pad", mapping: "standard", index: 0, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })) };
  const due = frames;
  frames = [];
  await act(async () => { for (const cb of due) cb(performance.now()); });
};
/** 餵矩形 + 明寫 opacity：`isVisible()` 讀 computed 值,jsdom 兩者都是空的。 */
const measure = (el: Element, box: [number, number, number, number]): void => {
  rects.set(el, box);
  (el as HTMLElement).style.opacity = "1";
};
beforeEach(async () => {
  frames = [];
  seen = "";
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => frames.push(cb)) as never;
  globalThis.cancelAnimationFrame = (() => {}) as never;
  document.body.innerHTML = "";
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => { root.render(createElement("div", null, createElement(PadFocusNav), createElement(Field))); });
  measure(document.querySelector("input")!, [0, 0, 200, 24]);
});
afterEach(async () => { await act(async () => root.unmount()); });

describe("PadKeyboard — 手把在文字欄位上按 A 打得出字", () => {
  it("A 開鍵盤 → 走到一顆鍵 → 再按 A 真的寫進受控的 value", async () => {
    await tick();
    expect(document.querySelector("[data-pad-focused]")!.tagName).toBe("INPUT");
    await tick([0]); // A —— ⛔ 在此之前這裡只是 cur.click(),一個字都打不出來
    const kb = document.querySelector('[data-pad-scope="pad-keyboard"]');
    expect(kb).not.toBeNull();
    measure(kb!, [0, 90, 480, 260]);
    kb!.querySelectorAll("[data-pad-key-row]").forEach((row, r) =>
      row.querySelectorAll("button").forEach((b, c) => measure(b, [c * 40, 100 + r * 40, 36, 36])),
    );
    await tick(); // 放開 A → 新 scope 自動落焦到第一顆鍵
    const key = document.querySelector("[data-pad-focused]") as HTMLElement;
    expect(key.tagName).toBe("BUTTON");
    await tick([0]); // A —— 打字
    expect(seen).toBe(key.textContent);
    expect((document.querySelector("input") as HTMLInputElement).value).toBe(key.textContent);
  });
});
