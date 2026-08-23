/**
 * 🖤 商店黑閃爍 —— 中場 canvas 的兩道防線（owner 2026-08-23:
 * 「剛進商店 介面有些部分會黑閃爍 選完隨機三選一又回復正常」）。
 *
 * ⚠️ 這一條**不驗「為什麼那一幀沒畫」**（那有五種原因,而且需要真的 GPU）——
 * 它驗的是「**沒畫的時候玩家看到什麼**」與「**我們知不知道它發生過**」:
 *
 *   ① `<canvas>` 的 CSS 背景 = 場景自己的 `ATMOSPHERE.clearColor`
 *      ⇒ 沒呈現的那一幀透出去是市集的靛色天空,⛔ 不是黑。
 *   ② `webglcontextlost` 記進 `perfBus.renderLoopErrors`
 *      ⇒ fail-open 但**不靜默**（第二守則）：健康度徽章會亮。
 *
 * 突變驗過：拿掉建構子裡的 `this.paintCanvasBackfill()` → ① 紅。
 */
import { describe, it, expect } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { IntermissionScene } from "./IntermissionScene";
import { ATMOSPHERE } from "./layout";
import { perfBus } from "../../perfBus";

/** 只有這支測試在乎的那兩個能力：一個 style bag 與一組 listener。 */
function stubCanvas(): HTMLCanvasElement & { fire: (type: string) => void } {
  const listeners = new Map<string, Set<EventListener>>();
  return {
    style: {} as CSSStyleDeclaration,
    addEventListener(type: string, fn: EventListener) {
      (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn);
    },
    removeEventListener(type: string, fn: EventListener) {
      listeners.get(type)?.delete(fn);
    },
    fire(type: string) {
      for (const fn of listeners.get(type) ?? []) fn({ type } as Event);
    },
  } as unknown as HTMLCanvasElement & { fire: (type: string) => void };
}

function makeScene(canvas: HTMLCanvasElement): IntermissionScene {
  return new IntermissionScene(canvas, {
    engineFactory: () => new NullEngine() as unknown as Engine,
    autoStart: false,
    now: () => 0,
  });
}

/** `ATMOSPHERE.clearColor` 算出來的 CSS —— ⛔ 不抄字面值（第〇·四守則）。 */
const expectedCss = `#${[ATMOSPHERE.clearColor.r, ATMOSPHERE.clearColor.g, ATMOSPHERE.clearColor.b]
  .map((v) => Math.round(v * 255).toString(16).padStart(2, "0"))
  .join("")}`;

describe("中場 canvas 不會透出黑", () => {
  it("① canvas 的 CSS 背景就是場景的 clearColor", () => {
    const canvas = stubCanvas();
    const s = makeScene(canvas);
    // ⛔ 沒有背景 = 沒呈現的那一幀透到頁面底色 = owner 看到的黑閃
    expect(canvas.style.backgroundColor).toBe(expectedCss);
    s.dispose();
  });

  it("② context 掉了會記帳（⛔ 不是靜默 fail-open），dispose 之後不再記", () => {
    const canvas = stubCanvas();
    const s = makeScene(canvas);
    const before = perfBus.renderLoopErrors;
    canvas.fire("webglcontextlost");
    expect(perfBus.renderLoopErrors).toBe(before + 1);
    s.dispose();
    canvas.fire("webglcontextlost");
    expect(perfBus.renderLoopErrors).toBe(before + 1); // listener 已收回
  });
});
