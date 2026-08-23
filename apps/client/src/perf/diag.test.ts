// @vitest-environment jsdom
/**
 * 🩺 LAG 診斷整合的守衛（owner 2026-08-23「監控 LAG 縮小找 root cause⋯整合起來」）。
 *
 * ⭐ 承重的是**接線**，⛔ 不是算術：兩支被動量表搭的是 `PerfOverlay` 那一班既有的
 * 4 Hz 計時器，而「零件做好了、沒有人打點」在畫面上長得跟「這台機器很順」一模一樣
 * （失敗形態⑧：消費端存在，但它消費不到）。
 *
 * 突變（實跑，本批唯一）：`PerfOverlay` 的計時器拿掉 `perfWatch.note(nowMs, SAMPLE_MS)`
 * → 🔴 第一條 `undefined` 不符合 /凍結 2\d{3}ms/ —— 藥丸上什麼都沒有。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act, createElement } from "react";
import { FpsPill } from "../ui/PerfOverlay";
import { perfWatch } from "./longTasks";
import { frameBudget, MIN_FPS_FLOOR } from "./diag";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  perfWatch.reset();
});

describe("🩺 LAG 診斷", () => {
  it("⭐ 一次 2 秒凍結會出現在**永遠可用**的 fps 藥丸上（minFps 說不出這個數字）", () => {
    vi.useFakeTimers();
    let t = 0;
    vi.spyOn(performance, "now").mockImplementation(() => t);
    const host = document.createElement("div");
    document.body.appendChild(host);
    act(() => {
      root = createRoot(host);
      root.render(createElement(FpsPill));
    });
    // 三次 4 Hz 打點，第二段之間主執行緒被佔住 2 秒（一次 GC／一次大 parse 的形狀）
    for (const step of [250, 2250, 250]) {
      act(() => {
        t += step;
        vi.advanceTimersByTime(250);
      });
    }
    const warn = host.querySelector('[data-testid="perf-health-warn"]');
    expect(warn?.getAttribute("title")).toMatch(/凍結 2\d{3}ms/);
  });

  it("⭐ unaccountedMs 是差額本身：⛔ 不夾成 0、⛔ 上限閒置不算進去", () => {
    const base = { avgFps: 60, minFps: 58, frameMs: 16.7 };
    // 沒有上限、rAF 只花 4 ms ⇒ 剩下的 12.7 ms **沒有任何既有儀表量過**
    expect(frameBudget({ ...base, workMs: 4, fpsCap: 0 }).unaccountedMs).toBeCloseTo(1000 / 60 - 4, 5);
    // 上限 60 ⇒ 那 12.7 ms 是**刻意**閒置的，⛔ 不可以被誣賴成幀外開銷
    expect(frameBudget({ ...base, workMs: 4, fpsCap: 60 }).unaccountedMs).toBeCloseTo(0, 5);
    // 兩個滾動視窗不同步 ⇒ 負值要照樣露出來（⛔ Math.max(0,…) 等於把矛盾藏起來）
    expect(frameBudget({ ...base, workMs: 30, fpsCap: 0 }).unaccountedMs).toBeLessThan(0);
  });

  it("⚠️ 兩條量到的儀表謊言要被指名，⛔ 不是靜靜回 0", () => {
    // ① dt 被夾在 100 ms ⇒ minFps 永遠 ≥ 10：撞到地板就要說「這個數字是假的」
    const b = { avgFps: 60, frameMs: 16.7, workMs: 4, fpsCap: 0 };
    expect(frameBudget({ ...b, minFps: MIN_FPS_FLOOR }).minFpsIsFloored).toBe(true);
    expect(frameBudget({ ...b, minFps: 58 }).minFpsIsFloored).toBe(false);
    // ② jsdom 沒有 PerformanceObserver —— 正是 Safari／Firefox 的形狀
    expect(perfWatch.longTasks(0).supported).toBe(false);
  });
});
