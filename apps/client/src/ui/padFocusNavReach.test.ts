// @vitest-environment jsdom
/**
 * GH#634 端到端守衛 —— owner:「手把根本無法從到大廳一路到遊戲回合操作阿」。
 * 2026-08-23 實機量到的斷點不是「沒掛上」（PadFocusNav 每一頁都活著），而是
 * pickSpatial 的中心點十字距離：auth 登入欄整欄（帳號/密碼/Sign in/手機登入）
 * 從任何方向都走不進去，⇒ 有帳號的純手把玩家**永遠進不了大廳**。
 * 這裡掛**出貨的** `<PadFocusNav/>`、餵假手把、用**實機量到的 rect** 重演那一頁：
 * ① 從分頁列往下要走得進登入欄一路到 Sign in、A 按得到 ② 全螢幕 canvas（帶
 * tabindex）永遠不接焦點環。突變：pickSpatial 十字距離改回中心點 → ① 紅。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PadInfo } from "../input/gamepadDetect";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const h = vi.hoisted(() => ({ pad: null as PadInfo | null }));
vi.mock("../input/GamepadInput", () => ({ listPadSources: () => [h.pad] }));
vi.mock("./platform/store", () => ({ appStore: { getState: () => ({ screen: "auth" }) } }));
vi.mock("../net/RoomStore", () => ({ hudStore: { getState: () => ({ phase: "idle" }) } }));
const { PadFocusNav } = await import("./PadFocusNav");

const rects = new Map<Element, [number, number, number, number]>();
Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
  const [x, y, w, ht] = rects.get(this) ?? [0, 0, 0, 0];
  return { x, y, width: w, height: ht, top: y, left: x, right: x + w, bottom: y + ht } as DOMRect;
};
function add<T extends HTMLElement>(tag: string, box: [number, number, number, number]): T {
  const n = document.body.appendChild(document.createElement(tag)) as T;
  n.style.opacity = "1";
  rects.set(n, box);
  return n;
}
let frames: FrameRequestCallback[] = [];
let root: Root;
const tick = async (axes: number[], pressed: number[] = []): Promise<void> => {
  h.pad = { connected: true, axes, id: "p", mapping: "standard", index: 0,
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })) };
  const due = frames;
  frames = [];
  await act(async () => { for (const cb of due) cb(performance.now()); });
};
const focused = (): Element | null => document.querySelector("[data-pad-focused]");

// 實機 auth 頁的佈局（登入欄置中 x≈640,夾在分頁列與更寬的下排中間）
let canvas: HTMLElement, user: HTMLElement, pass: HTMLElement, signBtn: HTMLElement;
beforeEach(async () => {
  frames = [];
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => frames.push(cb)) as never;
  globalThis.cancelAnimationFrame = (() => {}) as never;
  document.body.innerHTML = "";
  Object.defineProperty(window, "innerWidth", { value: 1280, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: 720, configurable: true });
  canvas = add("canvas", [0, 0, 1280, 720]);
  canvas.setAttribute("tabindex", "0"); // 鍵盤要的,⛔ 不是手把的
  add("button", [470, 241, 170, 38]).textContent = "Sign in tab";
  add("button", [640, 241, 170, 38]).textContent = "Create account";
  user = add("input", [488, 298, 304, 34]);
  pass = add("input", [488, 343, 304, 34]);
  signBtn = add("button", [488, 391, 304, 34]);
  add("button", [461, 514, 178, 35]).textContent = "map";
  add("button", [646, 515, 173, 34]).textContent = "Play offline vs bots";
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => { root.render(createElement(PadFocusNav)); });
});
afterEach(async () => { await act(async () => root.unmount()); });

describe("GH#634 — 登入欄走得進去,canvas 不接焦點", () => {
  it("分頁列往下 → 帳號 → 密碼 → Sign in,A 按得到;canvas 從頭到尾沒有焦點環", async () => {
    await tick([0, 0]); // 落初始焦點(最上最左,⛔ 不是 canvas)
    expect(focused()?.textContent).toBe("Sign in tab");
    await tick([0, 0]); await tick([0, 1]); // 下 → 帳號欄(舊算法會跳去 map,⇒ 紅)
    expect(focused()).toBe(user);
    await tick([0, 0]); await tick([0, 1]);
    expect(focused()).toBe(pass);
    await tick([0, 0]); await tick([0, 1]);
    expect(focused()).toBe(signBtn);
    const hits = vi.fn();
    signBtn.addEventListener("click", hits);
    await tick([0, 0], [0]); // A
    expect(hits).toHaveBeenCalledOnce();
    expect(canvas.hasAttribute("data-pad-focused")).toBe(false);
  });
});
