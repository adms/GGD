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

    const nodes = [
      ...host.querySelectorAll<HTMLDivElement>('[data-role="floating-text"]'),
    ].filter((n) => n.textContent === "脫困");
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

  /**
   * ⭐ **最後一跳**（GH#853）：drift 有沒有真的動到 **DOM 的 x**。
   *
   * ⚠️ 這條是對抗性複驗點名補的：#853 的守衛「跑到池子為止」——
   * 它證明了 `driftX` 被算出來，⛔ 沒有證明 `WorldAnchorLayer` 把它投影進 transform。
   * ⭐ 而那正是「算出來了但玩家看不到」（失敗形態①/⑧）最常見的落點。
   *
   * 突變紀錄：把 `WorldAnchorLayer.tsx` 的 `project(e.x + e.driftX, …)` 改回
   * `project(e.x, …)` ⇒ 這一條紅（兩顆字的 x 變成一樣）。
   */
  it("⭐ 有 drift 的字，DOM 的 x 真的跟著偏（⛔ 不是只有池子裡的數字動）", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    frameBus.project = (x, y, z) => ({ sx: 640 + x * 8, sy: 360 - y * 8 - z, visible: true });
    root = createRoot(host);
    act(() => root!.render(createElement(WorldAnchorLayer)));

    /** 放**一顆**字，回傳它的螢幕 x 在 400ms 之間移動了多少。 */
    const shiftOf = (drift?: { speed: number; deg: number; basisX: number; basisZ: number }): number => {
      const f = new FloatingTextFx();
      try {
        // ⚠️ ⭐ **一次只放一顆** —— 同幀多顆會走「分道與錯開」（`FloatingTextFx` 的
        //   onAnchor 分道 ＋ delayMs），那會讓量尺量到的不是 drift。
        f.spawn({ text: "字", x: 0, y: 2, z: 0, colorRgb: [255, 255, 255], ...(drift ? { drift } : {}) });
        f.tick(120);
        step();
        const read = (): number => {
          const n = [...host.querySelectorAll<HTMLDivElement>('[data-role="floating-text"]')].find(
            (e) => e.style.display === "block" && e.style.transform !== "",
          );
          expect(n, "⛔ 畫面上沒有任何一顆可見的浮字").toBeTruthy();
          const m = /translate\((-?[\d.]+)px/.exec(n!.style.transform);
          expect(m, `⛔ transform 讀不到 x：${n!.style.transform}`).toBeTruthy();
          return Number(m![1]);
        };
        const a = read();
        f.tick(400);
        step();
        return Math.abs(read() - a);
      } finally {
        f.dispose();
        step();
      }
    };

    // ⭐ **兩個方向一起讀**（⛔ 一把只驗過單邊的尺不算自證過）
    expect(
      shiftOf(),
      "⛔ 沒有 drift 的字**自己動了** ⇒ 這把量尺量到的不是 drift（可能是 rise 或相機）",
    ).toBeLessThan(0.5);
    expect(
      shiftOf({ speed: 6, deg: 0, basisX: 1, basisZ: 0 }),
      "⛔ 有 drift 的字螢幕 x **沒有動** ⇒ drift 沒有走到 DOM —— " +
        "池子裡的 driftX 算對了，⭐ 而玩家看到的仍然是直升的字（失敗形態①）。",
    ).toBeGreaterThan(1);
  });
});
