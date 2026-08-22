/**
 * GH#609 —— **一個 throw 不可以停掉整個場景**，而且**不可以無聲**。
 *
 * ⚠️ 這一條驗的是兩件事，⛔ 少了第二件就只是把當機藏起來：
 *   ① 迴圈**活下來**（Babylon 的重排在 callback 之後 ⇒ 裸呼叫會永久停在
 *      `_frameHandler = 0`，探針實測 3 幀後死透）
 *   ② 每一次都被**數到**，而那一格**非零時會畫在畫面上**（第二守則:
 *      fail-open 沒錯，**靜默**才是缺陷）
 *
 * ⛔ 一個數字都沒有進斷言 —— ⛔ 不驗「掉了幾幀」（那取決於呼叫端），
 * 只驗「throw 之後還跑得下去」與「計數器動了」。
 *
 * 突變（一批一條，承重線）:把 `runRenderLoopSafely` 的 `try/catch` 拿掉
 *   → 紅:第一次 throw 直接從測試裡逃出去。
 */
import { describe, expect, it } from "vitest";
import { perfBus } from "../perfBus";
import { runRenderLoopSafely } from "./safeRenderLoop";
import { healthWarnings } from "../ui/PerfOverlay";

/** 一個**照 Babylon 真實順序**的假引擎:重排在 callback **之後**。 */
function babylonShapedEngine(): { runRenderLoop(fn: () => void): void; pump(n: number): number } {
  let cb: (() => void) | null = null;
  let alive = true;
  return {
    runRenderLoop(fn) {
      cb = fn;
    },
    pump(n) {
      let ran = 0;
      for (let i = 0; i < n && alive && cb; i++) {
        // ⭐ 逐字照 abstractEngine._renderLoop:先跑 callback,**再**決定要不要續排。
        try {
          cb();
        } catch {
          alive = false; // ← 例外逃出去 = 永遠不再排下一幀
          break;
        }
        ran++;
      }
      return ran;
    },
  };
}

describe("Babylon render loop 的 throw 防護（GH#609）", () => {
  it("每一幀都擲例外,迴圈照樣跑滿,而且每一次都被數到", () => {
    const before = perfBus.renderLoopErrors;
    const engine = babylonShapedEngine();
    let calls = 0;
    runRenderLoopSafely(engine, () => {
      calls++;
      throw new Error("boom");
    }, "unit");

    const ran = engine.pump(10);
    expect(ran, "⛔ 迴圈死在第一次 throw —— 那正是裸 runRenderLoop 的行為").toBe(10);
    expect(calls).toBe(10);
    expect(perfBus.renderLoopErrors - before, "⛔ 數不到 = 我們只是把當機藏起來了").toBe(10);
  });

  it("非零的時候畫面上有東西說出來（⛔ 不是一行沒有人讀的 console）", () => {
    const warns = healthWarnings({ ...perfBus, renderLoopErrors: 3 });
    expect(warns.some((w) => w.includes("繪製例外"))).toBe(true);
    // 全部歸零 ⇒ 一個像素都不多
    expect(
      healthWarnings({
        ...perfBus,
        renderLoopErrors: 0,
        orphanRooms: 0,
        foreignSnapshots: 0,
        unexpectedDisconnects: 0,
      }),
    ).toEqual([]);
  });
});
