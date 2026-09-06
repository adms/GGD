// @vitest-environment jsdom
/**
 * 🎡 **@visual-proof** —— GH#1052：按下 V ⇒ 通訊輪盤**真的出現在玩家的畫面上**。
 *
 * ⭐ 這一支走的是**出貨的整條路**，⛔ 不是戳狀態機（那有 `commsWheel.test.ts`）：
 *   出貨 `content/config/ui-cues.json` → `Configs` → `uiCues()`/`resolveUiCues()`
 *   → `commsWheelRunner` → 出貨的 `InputCapture`（真的 `keydown`/`pointermove` 事件）
 *   → `recordCommsWheel` → `hudStore` → 出貨的 `<CommsWheelOverlay/>`（HudRoot 掛的那一個）
 *   → **DOM**。DOM 就是 React HUD 的終端（它不是 WebGL，jsdom 收得到那一層）。
 *
 * ⚠️ **誠實的界線**：jsdom ⛔ 不會 raster ⇒ 這裡證明的是「**墨水存在且沒有被關掉**」：
 *   節點在 body 上 · 釘在指標那一點 · 五格文字逐字是出貨的 · 字級>0 · 顏色/底色不透明 ·
 *   alpha>0 且沒有任何祖先 display:none · 五格落在**五個不同的座標**（⛔ 不是全疊在圓心 ——
 *   天譴那次的「UV 全退化成 (0,0)」正是這個形狀）。字體／遮擋／品質階梯下的觀感要真 raster。
 * ⭐ 量尺驗**兩個方向**：後台 `commsWheel.enabled=false` ⇒ 同一下 V **量不到**；翻回來 ⇒ 又量得到。
 *
 * MUTATION LOG（2026-09-06）：`commsWheelRunner.ts` 的 `uiCues().commsWheel ?? FALLBACK` 改成只回
 * `FALLBACK` ⇒ ①紅（「按下 V 之後畫面上沒有輪盤」）。用 Edit 改回。
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Configs, UI_CUES_DOC_ID, zConfigUiCuesDoc, type ConfigUiCuesDoc } from "@ggd/shared/content";
import { InputCapture } from "../input/InputCapture";
import { recordCommsWheel } from "../net/RoomStore";
import { CommsWheelOverlay } from "../ui/hud/CommsWheelOverlay";
import { resetUiCuesCache } from "../ui/uiCuesConfig";
import { commsWheelRunner } from "./commsWheelRunner";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const shipped: ConfigUiCuesDoc = zConfigUiCuesDoc.parse(
  JSON.parse(readFileSync(join(ROOT, "content/config/ui-cues.json"), "utf8")),
);
const WHEEL = '[data-hud-surface="comms-wheel"]';
const wheel = (): HTMLElement | null => document.body.querySelector<HTMLElement>(WHEEL);

let root: Root | null = null;
let capture: InputCapture | null = null;
const keyV = (type: "keydown" | "keyup"): void => {
  act(() => void window.dispatchEvent(new KeyboardEvent(type, { code: "KeyV", bubbles: true })));
};

/** 出貨那條路的台子：⛔ 沒有一段是台子造的 —— 只有 `screenToGround` 那一族與輪盤無關的 deps 是 stub。 */
function mountShippedChain(): { scene: HTMLElement; runner: ReturnType<typeof commsWheelRunner> } {
  const host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
  act(() => root!.render(createElement(CommsWheelOverlay)));
  const scene = document.body.appendChild(document.createElement("div"));
  const runner = commsWheelRunner(() => null); // ⛔ 沒有英雄 ⇒ 放開時不播語音（這一支只量畫面）
  capture = new InputCapture(scene, {
    screenToGround: () => null, getSelfPos: () => null, getAbility: () => null,
    pickEnemy: () => null, pickSelf: () => false,
    onOrder: () => {}, onCommand: () => {}, onSelectSelf: () => {}, onZoom: () => {}, onToggleFollow: () => {},
    ...runner.inputDeps,
  });
  capture.attach();
  return { scene, runner };
}
const pointer = (scene: HTMLElement, x: number, y: number): void => {
  act(() => void scene.dispatchEvent(new MouseEvent("pointermove", { clientX: x, clientY: y, bubbles: true })));
};
/** 從節點往上走到 body：任何一層把它藏起來都算「看不見」。 */
function hiddenAncestor(el: HTMLElement): string | null {
  for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
    const cs = getComputedStyle(n);
    const alpha = cs.opacity === "" ? 1 : Number(cs.opacity);
    if (cs.display === "none" || cs.visibility === "hidden" || !(alpha > 0)) return n.outerHTML.slice(0, 80);
  }
  return null;
}

beforeAll(() => {
  Configs.register(shipped);
  resetUiCuesCache();
});
afterEach(() => {
  capture?.dispose();
  act(() => root?.unmount());
  recordCommsWheel(null);
  document.body.innerHTML = "";
});
afterAll(() => Configs.clear());

describe("🎡 通訊輪盤：按下 V 之後畫面上真的有輪盤 (@visual-proof · GH#1052)", () => {
  it("① 出貨 config 下：指標在 (300,300) 按住 V ⇒ 輪盤釘在那一點、五格出貨文字看得見、指向會亮、放開就收", () => {
    const { scene, runner } = mountShippedChain();
    expect(shipped.commsWheel?.enabled, "夾具前提：出貨輪盤是開的").toBe(true);
    expect(wheel(), "按 V 之前畫面上不該有輪盤").toBeNull();

    pointer(scene, 300, 300);
    keyV("keydown");
    const w = wheel();
    expect(w, "⛔ 按下 V 之後畫面上沒有輪盤 —— 鏈路某一段是斷的").not.toBeNull();
    expect(hiddenAncestor(w!), "⛔ 輪盤在 DOM 上但被藏起來了").toBeNull();
    expect([w!.style.position, w!.style.left, w!.style.top]).toEqual(["fixed", "300px", "300px"]);
    expect(Number(w!.style.zIndex)).toBeGreaterThan(0);

    const entries = [...w!.querySelectorAll<HTMLElement>("[data-comms-entry]")];
    const want = shipped.commsWheel!.entries;
    expect(entries.map((e) => e.textContent), "格子的字不是出貨 config 的字").toEqual(want.map((e) => e.zh));
    const spots = new Set<string>();
    for (const e of entries) {
      expect(hiddenAncestor(e)).toBeNull();
      expect(parseFloat(e.style.fontSize), "字級 0 ＝ 看不見").toBeGreaterThan(0);
      expect(e.style.color, "字色透明 ＝ 看不見").toMatch(/^rgb\(/);
      expect(e.style.background, "底色透明 ＝ 讀不出格子").toMatch(/^rgba?\(/);
      const dx = parseFloat(e.style.left), dy = parseFloat(e.style.top);
      expect(Math.hypot(dx, dy), "格子飛出圓盤").toBeLessThan(200);
      spots.add(`${Math.round(dx)},${Math.round(dy)}`);
    }
    expect(spots.size, "⛔ 五格疊在同一個座標（退化成一點）").toBe(want.length);

    pointer(scene, 300, 200); // 正上方 ⇒ 第 0 格
    expect(runner.state.hoveredIndex).toBe(0);
    const first = w!.querySelector<HTMLElement>("[data-comms-entry]")!;
    expect(first.style.outline, "指到的那一格沒有亮框 —— 玩家不知道自己指著誰").toContain("solid");
    expect(first.style.fontWeight).toBe("700");

    keyV("keyup");
    expect(wheel(), "放開 V 之後輪盤還掛在畫面上").toBeNull();
  });

  it("② 量尺的另一個方向：後台 commsWheel.enabled=false ⇒ 同一下 V 畫面上什麼都沒有；翻回來 ⇒ 又有", () => {
    const { scene } = mountShippedChain();
    Configs.register({ ...shipped, commsWheel: { ...shipped.commsWheel!, enabled: false } });
    pointer(scene, 300, 300);
    keyV("keydown");
    expect(wheel(), "⛔ 後台關了輪盤，畫面上還是出現了 —— 開關是裝飾").toBeNull();
    keyV("keyup");

    Configs.register(shipped); // ⭐ 同一份出貨文件（新物件 ⇒ uiCues() 的快取自動失效）
    keyV("keydown");
    expect(wheel(), "翻回 enabled=true 之後輪盤沒有回來").not.toBeNull();
    keyV("keyup");
  });
});
