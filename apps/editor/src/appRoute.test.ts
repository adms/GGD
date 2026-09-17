import { describe, expect, it, vi } from "vitest";
import { appModeFromPathname, pathnameForAppMode } from "./appRoute";

describe("top-level editor routes", () => {
  it.each([
    ["/editor/vfx-forge", { kind: "vfx-forge" }],
    ["/editor/vfx-forge/", { kind: "vfx-forge" }],
    ["/editor/forge", { kind: "forge" }],
    ["/editor/export", { kind: "export" }],
  ] as const)("opens %s on the matching authoring screen", (pathname, expected) => {
    expect(appModeFromPathname(pathname)).toEqual(expected);
  });

  it("falls back to the collection browser for unknown or root paths", () => {
    expect(appModeFromPathname("/editor/")).toEqual({ kind: "collection", collection: "champions" });
    expect(appModeFromPathname("/editor/not-a-screen")).toEqual({ kind: "collection", collection: "champions" });
  });

  it("builds shareable paths from Vite's base path", () => {
    expect(pathnameForAppMode({ kind: "vfx-forge" }, "/editor/")).toBe("/editor/vfx-forge");
    expect(pathnameForAppMode({ kind: "forge" }, "/editor/")).toBe("/editor/forge");
    expect(pathnameForAppMode({ kind: "export" }, "/editor/")).toBe("/editor/export");
    expect(pathnameForAppMode({ kind: "collection", collection: "abilities" }, "/editor/")).toBe("/editor/");
  });
});

/**
 * ⭐⭐ GH#1270 —— 玩家版的路由**只認得兩個畫面**。
 *
 * ⚠️ 這一條驗的是「規則」，⛔ 不是「按鈕藏起來了」：玩家版 bundle 直接打
 * `/editor/forge`（內部流程）必須回到英雄工坊，⭐ 而那幾頁的程式碼本來就不在那份 build 裡
 * （`App.tsx` 的 `PLAYER_ONLY ? null : lazy(...)`，rollup 因此不產那些 chunk）。
 * 突變：把 `appRoute.ts` 的 `if (PLAYER_ONLY)` 那一段拿掉 ⇒ 這一條當場紅。
 */
describe("玩家版（GH#1270）", () => {
  it("只認得 /hero-forge 與 /works，其餘一律回英雄工坊", async () => {
    vi.stubEnv("VITE_GGD_PLAYER_EDITOR", "1");
    vi.resetModules();
    const player = await import("./appRoute");
    expect(player.PLAYER_ONLY).toBe(true);
    expect(player.appModeFromPathname("/editor/hero-forge")).toEqual({ kind: "hero" });
    expect(player.appModeFromPathname("/editor/works")).toEqual({ kind: "works" });
    for (const internal of ["/editor/forge", "/editor/vfx-forge", "/editor/export", "/editor/"]) {
      expect(player.appModeFromPathname(internal), internal).toEqual({ kind: "hero" });
    }
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
