/**
 * 守衛：**AdaptiveQuality 看得見迴圈外面的成本**（2026-08-23）。
 *
 * A5 lane 量到的缺陷是一句話：階梯只讀 `workMs`，所以「rAF 很便宜但整幀很慢」
 * ——瀏覽器合成／reflow／GC／shader 編譯／React reconcile——**再大也不會降畫質**。
 * 所以這一條就造那個場景：`workMs = 4`（250 fps 的餘裕）而 `wallMs = 30`
 * （真實 33 fps），然後問階梯有沒有降。
 *
 * ⭐ 突變：把 `adaptiveFrameCostMs` 改回 `return workMs` ⇒ 第一條紅。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  AdaptiveManager,
  adaptiveFrameCostMs,
  feedAdaptiveFrame,
  frameWorkWindow,
  type AdaptiveCostMode,
} from "./AdaptiveQuality";

const CHEAP_WORK_MS = 4; // rAF 迴圈只花 4 ms ⇒ 「250 fps 的餘裕」
const CAP = 60;

/** 跑 `frames` 幀，每幀牆上間隔 `wallMs`。回傳最後停在第幾級。 */
function runFrames(wallMs: number, frames: number, mode: AdaptiveCostMode, level = 0): number {
  const mgr = new AdaptiveManager(CAP, level);
  frameWorkWindow.reset();
  for (let i = 0; i < frames; i++) {
    const feed = feedAdaptiveFrame(CHEAP_WORK_MS, wallMs, CAP, mode);
    mgr.sample(feed.costMs, 1000 + i * wallMs);
  }
  return mgr.level;
}

describe("階梯讀的是整幀成本（GH：fps 好看卻很卡）", () => {
  beforeEach(() => frameWorkWindow.reset());

  it("⭐ workMs 很小但 wallMs 很大 ⇒ 階梯**要降級**", () => {
    // 30 ms/幀 = 33 fps，而 rAF 只用掉 4 ms：整段差額在迴圈外面。
    expect(runFrames(30, 400, "frame")).toBeGreaterThan(0);
  });

  it("⛔ 止血閥 mode=\"work\" ⇒ 逐位元回到舊行為（同一個場景一級都不降）", () => {
    expect(runFrames(30, 400, "work")).toBe(0);
  });

  it("⭐ 準時的幀回報**餘裕** ⇒ 已經降下去的階梯爬得回來", () => {
    // 60 Hz 面板 + 上限 60：牆上間隔的下界結構性地就是 16.7 ms。天真地
    // 直接讀 wallMs 會讓 costFps 永遠 = 60 < target+upMargin(72) ⇒ 永遠回不來。
    expect(runFrames(1000 / CAP, 600, "frame", 3)).toBeLessThan(3);
  });

  it("遲到的幀⛔ 不可以扣掉一段沒發生過的「上限閒置」", () => {
    // wallMs 24.7 的那一幀真實是 40 fps；扣掉模型上的閒置會算成 12 ms(83 fps)。
    expect(adaptiveFrameCostMs({ workMs: 4, wallMs: 24.7, fpsCap: 60 })).toBeCloseTo(24.7, 5);
    // 準時的那一幀照舊只回報 workMs（健康機器行為逐位元不變）。
    expect(adaptiveFrameCostMs({ workMs: 4, wallMs: 16.7, fpsCap: 60 })).toBe(4);
    // 手機上限 30：33.3 ms 是**準時**，⛔ 不可以被判成遲到而把畫質降到底。
    expect(adaptiveFrameCostMs({ workMs: 4, wallMs: 33.3, fpsCap: 30 })).toBe(4);
  });

  it("⭐ `perfBus.workMs` 的來源與階梯的視窗**分開**（否則 diag 的 unaccountedMs 會塌成 0）", () => {
    frameWorkWindow.reset();
    const feed = feedAdaptiveFrame(CHEAP_WORK_MS, 30, CAP, "frame");
    expect(feed.costMs).toBe(30); // 階梯看到的是整幀
    expect(feed.work.avgMs).toBe(CHEAP_WORK_MS); // 儀表看到的仍然是 workMs
  });
});

describe("接線：出貨的 samplePerf 真的餵整幀成本", () => {
  // GameApp 抓 Babylon engine / canvas / socket,headless 建構不出來 ——
  // 這個檔案的既有做法就是掃描(見 fpsMeter.test.ts 同名 describe 的檔頭)。
  const BODY = (() => {
    const src = readFileSync(fileURLToPath(new URL("../GameApp.ts", import.meta.url)), "utf8");
    const at = src.indexOf("private samplePerf(");
    const open = src.indexOf("{", at);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) return src.slice(open + 1, i);
    }
    throw new Error("samplePerf: unbalanced braces");
  })();

  it("qualityController.sample 拿到的是 feed.costMs,⛔ 不是裸的 workMs", () => {
    expect(BODY).toMatch(/feedAdaptiveFrame\(\s*workMs\s*,\s*dtMs\s*,/);
    expect(BODY).toMatch(/qualityController\.sample\(\s*feed\.costMs\s*,\s*nowMs\s*\)/);
    expect(BODY, "階梯又回去只讀 rAF 的成本了").not.toMatch(
      /qualityController\.sample\(\s*workMs\s*,/,
    );
  });
});
