// @vitest-environment jsdom
/**
 * PadFocusNav 能力守衛 (#505/K3 · #506/K4) —— 三件事一起驗，因為它們是**同一個
 * 迴圈的三條分支**：① `<select>` 左右改得動值（⛔ 不是把焦點移走）② 捲動容器捲得動
 * ③ 新 scope 自動落焦（⛔ 第一次按 A 不是啞的）。
 *
 * 掛的是**出貨的** `<PadFocusNav/>` 本人、餵的是假手把快照、讀的是**真的 DOM**
 * —— ⛔ 不掃原始碼字串（失敗形態⑥），⛔ 不另外呼叫被抽出來的 helper（形態⑤）。
 * 只有三樣被換掉：手把來源、`appStore`、`hudStore`（後兩者只被讀 screen/phase）。
 * jsdom 沒有排版，所以 rect / scrollHeight / clientHeight 由測試餵。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PadInfo } from "../input/gamepadDetect";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ pad: null as PadInfo | null }));
vi.mock("../input/GamepadInput", () => ({ listPadSources: () => [h.pad] }));
vi.mock("./platform/store", () => ({ appStore: { getState: () => ({ screen: "lobby" }) } }));
vi.mock("../net/RoomStore", () => ({ hudStore: { getState: () => ({ phase: "idle" }) } }));

const { PadFocusNav } = await import("./PadFocusNav");

const rects = new Map<Element, [number, number, number, number]>();
Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
  const [x, y, w, ht] = rects.get(this) ?? [0, 0, 0, 0];
  return { x, y, width: w, height: ht, top: y, left: x, right: x + w, bottom: y + ht } as DOMRect;
};

function add<T extends HTMLElement>(tag: string, box: [number, number, number, number], parent: HTMLElement): T {
  const n = parent.appendChild(document.createElement(tag)) as T;
  n.style.opacity = "1";
  rects.set(n, box);
  return n;
}
const padAt = (axes: number[]): PadInfo => ({
  connected: true, axes, buttons: Array.from({ length: 17 }, () => ({ pressed: false })),
  id: "pad", mapping: "standard", index: 0,
});

let frames: FrameRequestCallback[] = [];
let root: Root;
let scope: HTMLElement, sel: HTMLSelectElement, pane: HTMLElement, inner: HTMLElement;
let scrolled: { top: number }[];
const tick = async (axes: number[], pressed: number[] = []): Promise<void> => {
  const p = padAt(axes);
  h.pad = { ...p, buttons: p.buttons.map((_, i) => ({ pressed: pressed.includes(i) })) };
  const due = frames;
  frames = [];
  await act(async () => { for (const cb of due) cb(performance.now()); });
};

beforeEach(async () => {
  frames = [];
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => frames.push(cb)) as never;
  globalThis.cancelAnimationFrame = (() => {}) as never;
  document.body.innerHTML = "";
  scope = add("div", [0, 0, 400, 300], document.body);
  scope.setAttribute("data-pad-scope", "");
  sel = add<HTMLSelectElement>("select", [0, 0, 120, 24], scope);
  for (const v of ["a", "b", "c"]) sel.add(new Option(v, v));
  pane = add("div", [0, 40, 400, 120], scope);
  pane.style.overflow = "auto";
  pane.style.overflowY = "auto";
  Object.defineProperty(pane, "scrollHeight", { value: 600, configurable: true });
  Object.defineProperty(pane, "clientHeight", { value: 120, configurable: true });
  Object.defineProperty(pane, "scrollTop", { value: 0, writable: true, configurable: true });
  scrolled = [];
  pane.scrollBy = ((o: { top: number }) => scrolled.push(o)) as never;
  inner = add("button", [0, 40, 100, 24], pane);
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => { root.render(createElement(PadFocusNav)); });
});
afterEach(async () => { await act(async () => root.unmount()); });

describe("PadFocusNav — 手把真的操作得到 select / 捲動容器 / 新畫面", () => {
  it("① 新 scope 自動落焦 ② 左右改得動 <select> ③ 右搖桿捲得動容器", async () => {
    await tick([0, 0, 0, 0]);
    expect(scope.querySelector("[data-pad-focused]")).toBe(sel); // ①

    const changes: string[] = [];
    sel.addEventListener("change", () => changes.push(sel.value));
    await tick([1, 0, 0, 0]); // 右 → 改值,⛔ 不是移動焦點
    expect(sel.selectedIndex).toBe(1);
    expect(changes).toEqual(["b"]); // ② 有派出 change,下游才收得到
    expect(scope.querySelector("[data-pad-focused]")).toBe(sel);

    await tick([0, 0, 0, 0]);
    await tick([0, 1, 0, 0]); // 下 → 焦點進到捲動容器裡
    expect(scope.querySelector("[data-pad-focused]")).toBe(inner);
    await tick([0, 0, 0, 1]); // 右搖桿下 → 捲動,⛔ 不是移動焦點
    expect(scrolled.length).toBe(1);
    expect(scrolled[0]!.top).toBeGreaterThan(0); // ③
  });

  it("停用的控制項進得了焦點集合(⛔ 不再整列隱形),但按 A 不會觸發它", async () => {
    sel.remove();
    const dead = add<HTMLButtonElement>("button", [200, 0, 100, 24], scope);
    dead.disabled = true;
    const hits = vi.fn();
    dead.addEventListener("click", hits);
    await tick([0, 0, 0, 0]); // 舊選擇器讓 disabled 整個不存在 ⇒ 這裡會落到 inner
    expect(scope.querySelector("[data-pad-focused]")).toBe(dead);
    await tick([0, 0, 0, 0], [0]); // A
    expect(hits).not.toHaveBeenCalled();
  });
});
