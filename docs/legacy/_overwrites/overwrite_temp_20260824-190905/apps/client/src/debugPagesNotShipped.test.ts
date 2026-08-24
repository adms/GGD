/**
 * F-16 / GH#83 —— 出貨產物裡不可以有 audition/debug 頁。
 *
 * 這條守衛要同時關掉兩個方向，因為只關一個就是失敗形態 ③（「可以從渲染樹刪掉
 * 但測試還是全綠」）：
 *
 *   ① 規則對不對 —— `debugPagesToStrip` 留下 index.html、拿掉其餘每一個 .html。
 *      刻意驗的是**規則**而不是那 14 個檔名：稽核當時是 5 個、今天是 14 個，
 *      一張名單擋不住第 15 個。
 *   ② 規則有沒有被接上 —— 出貨的那份 vite 設定的 `plugins` 裡真的有它。
 *      把 `stripDebugPages()` 從陣列裡刪掉，功能整個消失而 ① 仍然全綠。
 */
import { describe, it, expect } from "vitest";
import config, { debugPagesToStrip, includeDebugPages } from "../vite.config";

/** One plausible build output: vite's entry + the copied publicDir. */
const OUTPUT = [
  "index.html",
  "assets",
  "cursors",
  "icons",
  "manifest.webmanifest",
  "bgm-audition.html",
  "model-budget.html",
  "frame-data.html",
  "w3x-emitter-audition.html",
  // GH#664 asset-review page: dev-only HITL tool, must be stripped like the rest
  "asset-review.html",
];

describe("the build output ships index.html and nothing else that is html", () => {
  it("strips every audition/debug page, keeps the entry and the non-html assets", () => {
    const stripped = debugPagesToStrip(OUTPUT);
    expect(stripped).not.toContain("index.html");
    expect(stripped).toEqual([
      "bgm-audition.html",
      "frame-data.html",
      "model-budget.html",
      "w3x-emitter-audition.html",
    ]);
    // The rule is "every html but the entry", so a page nobody has written yet
    // is already covered — this is the half a 14-name list cannot do.
    expect(debugPagesToStrip(["index.html", "page-15-audition.html"])).toEqual([
      "page-15-audition.html",
    ]);
  });

  it("is actually wired into the shipped vite config, and only on build", () => {
    // flat() to depth 1 is enough (react() is the only nested entry) and keeps
    // tsc out of vite's recursive PluginOption type.
    const plugins = ((config.plugins ?? []) as unknown[]).flat(1) as {
      name?: string;
      apply?: unknown;
    }[];
    const strip = plugins.find((p) => p?.name === "ggd-strip-debug-pages");
    expect(strip, "stripDebugPages() must stay in vite.config's plugins array").toBeDefined();
    expect(strip?.apply, "dev must keep serving the pages from public/").toBe("build");
  });

  it("ships them only when an operator opts in by env var", () => {
    expect(includeDebugPages({})).toBe(false);
    expect(includeDebugPages({ GGD_INCLUDE_DEBUG_PAGES: "" })).toBe(false);
    expect(includeDebugPages({ GGD_INCLUDE_DEBUG_PAGES: "0" })).toBe(false);
    expect(includeDebugPages({ GGD_INCLUDE_DEBUG_PAGES: "1" })).toBe(true);
  });
});
