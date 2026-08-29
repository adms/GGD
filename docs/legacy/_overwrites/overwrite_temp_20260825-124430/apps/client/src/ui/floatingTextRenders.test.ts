// @vitest-environment jsdom
/**
 * 💬 **@visual-proof** —— GH#701：技能浮字**真的變成畫面上的字**。
 *
 * ⛔⛔ 這個缺陷的形狀（失敗形態⑧的極端版）：sim 發了、`VfxSystem` 收了、
 * `FloatingTextFx` 池裡是 **active** 的 —— 而 `floatingTextEntries` 的消費端
 * 全 repo **只有一個測試**，出貨路徑 **0 個** ⇒ 畫面上零像素。
 * ⭐ 所以這一支**只認 DOM**：掛的是出貨的 `<WorldAnchorLayer/>` 本人，餵的是出貨的
 * `FloatingTextFx`（⛔ 不自己造 entry —— 那是形態⑤「被測的不是出貨的那個」），
 * 量的是**節點上真的有那兩個字、而且它看得見**。
 *
 * ⚠️ **誠實的界線**：jsdom ⛔ 不會 raster ⇒ 這一條證明的是「**墨水存在且沒有被關掉**」
 * （字在節點上 · display 不是 none · opacity>0 · 字級>0 · 顏色不是透明 · 座標在畫面內）
 * —— 那正是這次零像素的**每一個**靜態可判成因。⛔ 它不證明字級/遮擋/品質階梯下的觀感，
 * 那要 audition 的真 raster。
 *
 * 突變紀錄（2026-08-25）：把 `WorldAnchorLayer` 的「技能浮字」整段拿掉 ⇒ 紅
 * （找不到帶「脫困」的節點）。
 */
import { describe, it, expect, afterEach } from "vitest";
import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { frameBus } from "../frameBus";
import { FloatingTextFx } from "../vfx/FloatingTextFx";
import { WorldAnchorLayer } from "./WorldAnchorLayer";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** rAF 換成手動步進 —— ⛔ 不睡覺等瀏覽器的 16ms（那是 flake 的來源）。 */
let pending: FrameRequestCallback | null = null;
globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => ((pending = cb), 1)) as never;
globalThis.cancelAnimationFrame = (() => (pending = null)) as never;
const step = (): void => {
  const cb = pending;
  pending = null;
  act(() => cb?.(performance.now()));
};

let root: Root | null = null;
let fx: FloatingTextFx | null = null;
afterEach(() => {
  act(() => root?.unmount());
  fx?.dispose();
  frameBus.project = null;
});

describe("💬 技能浮字：畫面上真的有那兩個字 (@visual-proof)", () => {
  it("sim 發一則「脫困」⇒ HUD 上出現一顆看得見的、寫著「脫困」的節點", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    // 出貨的投影：世界→螢幕。⛔ 不是 stub 掉浮字那一段，只是給它一台相機。
    frameBus.project = (x, y, z) => ({ sx: 640 + x * 8, sy: 360 - y * 8 - z, visible: true });
    root = createRoot(host);
    act(() => root!.render(createElement(WorldAnchorLayer)));

    // 出貨的模型層（`VfxSystem` 建的就是這個類別）—— 建構即報到
    fx = new FloatingTextFx();
    expect(fx.spawn({ text: "脫困", x: 2, y: 2.2, z: -1, colorRgb: [150, 230, 255] })).toBe(true);
    fx.tick(16); // 讓它離開錯開的等待、alpha 起來

    step();

    const nodes = [...host.querySelectorAll<HTMLDivElement>("div")].filter(
      (n) => n.textContent === "脫困",
    );
    expect(nodes).toHaveLength(1);
    const n = nodes[0]!;
    expect(n.style.display).toBe("block"); // ⛔ 不是被藏起來的節點
    expect(Number(n.style.opacity)).toBeGreaterThan(0); // ⛔ 不是全透明
    expect(parseFloat(n.style.fontSize)).toBeGreaterThan(0); // ⛔ 不是 0 級字
    expect(n.style.color.replace(/\s/g, "")).toBe("rgb(150,230,255)"); // 技能寫的顏色
    expect(n.style.transform).toContain("translate("); // 真的被擺到某個座標上
    expect(n.style.textShadow.length).toBeGreaterThan(0); // 有描邊 ⇒ 亮底上也讀得到

    // 到期回收 ⇒ 那顆節點被收起來（⛔ 不會留一段永遠掛在畫面上的字）
    fx.tick(9999);
    step();
    expect(n.style.display).toBe("none");
  });
});
