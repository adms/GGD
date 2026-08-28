/**
 * 後台每一頁的頁尾版權（owner 2026-08-28「後台右側頁面 每一頁都要加上 footer
 * copyright」）。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 承重的斷言是「**每一頁**都有，包含沒登入的『需要連線』那一頁」
 * ---------------------------------------------------------------------------
 * ⛔ **不是**「`ConsoleFooter` 這個元件渲染得出版權字串」—— 那條對「掛了，但只掛
 * 在其中一條分支上」的實作**也是綠的**（失敗形態④）。所以下面 `renderToString`
 * **出貨在用的那一棵**渲染樹（`Console`），逐頁換 `page` 再數，⛔ 不是掃原始碼
 * 字串（形態⑥）。
 *
 * ---------------------------------------------------------------------------
 * ⚠️⚠️ 為什麼要 mock `useApp`（第一版沒有，而那一版是**假綠**的）
 * ---------------------------------------------------------------------------
 * `renderToString` 走的是 `useSyncExternalStore` 的 **server snapshot**，而 zustand
 * 的 server snapshot 是 **`getInitialState()`** ⇒ 測試裡 `appStore.setState({page})`
 * **對渲染完全無效**：五次迴圈渲染的是**同一頁**（控制台首頁）。
 * ⭐ 量到才發現：把 `<ConsoleFooter />` 移進 `gated ? … : …` 的非 gated 那一邊，
 * 第一版突變**沒有紅** —— 形態⑩，守衛靠一個與它的宣稱無關的理由綠著。
 * ⇒ 這裡改成控制 `useApp` 本身（元件樹是被測物，store 是它的相依）。
 *
 * ---------------------------------------------------------------------------
 * 突變紀錄（都真的做過）
 * ---------------------------------------------------------------------------
 *   · `App.tsx` 的 `<ConsoleFooter />` 刪掉                  → 紅（每一頁 0 個）
 *   · 移進 `gated ? … : (<>…</>)` 的非 gated 那一邊          → 紅，訊息指名 gated 那一條
 *   · `brand.ts` 的字串換成別的                              → 紅（單一住處那一條）
 */
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import { COPYRIGHT_LINE } from "@ggd/shared/brand";
import type { AppState, Page } from "./store";

const TAG = "adminui-console-footer";

/** 這一輪要餵給 `useApp` 的畫面狀態。 */
let VIEW: { page: Page; account: unknown } = { page: "hub", account: {} };

vi.mock("./store", async () => {
  const real = await vi.importActual<typeof import("./store")>("./store");
  return {
    ...real,
    // ⚠️ 只換讀取端：`pageRequiresSession` 等純函式仍然是**出貨的那一份**，
    //    所以 `gated` 的算式一個字都沒有被換掉。
    useApp: <T,>(sel: (s: AppState) => T): T =>
      sel({ ...real.appStore.getState(), ...VIEW } as AppState),
  };
});

const { Console } = await import("./ui/App");
const { pageRequiresSession } = await import("./store");

const render = (page: Page, account: unknown): string => {
  VIEW = { page, account };
  return renderToString(createElement(Console));
};
const footersIn = (html: string): number =>
  (html.match(/data-testid="console-footer"/g) ?? []).length;

/** 抽樣涵蓋四種來源：本機工具頁 · 平台頁 · 設定頁 · 導覽地圖。 */
const PAGES: readonly Page[] = ["hub", "players", "combatEnv", "navMap", "audit"];

describe("後台頁尾版權（owner 2026-08-28）", () => {
  it("⭐ 每一頁都恰好一個頁尾（已登入）", () => {
    cover(TAG);
    for (const page of PAGES) {
      const html = render(page, { username: "probe" });
      // ⛔ `toBeGreaterThan(0)` 不夠：兩個頁尾也是「有」，而那是版面缺陷。
      expect(footersIn(html), `page=${page}`).toBe(1);
      expect(html, `page=${page}`).toContain(COPYRIGHT_LINE);
    }
  });

  it("⭐ 沒登入的「需要連線」畫面也有頁尾（gated 那一邊）", () => {
    cover(TAG);
    // 前提自檢：這一頁真的要連線，否則下面量到的不是 gated 那條路。
    expect(pageRequiresSession("players")).toBe(true);
    const html = render("players", null);
    // 前提自檢②：畫面上真的是「需要連線」那一塊，⛔ 不是 PlayersPage。
    expect(html, "⛔ 沒有進到 gated 分支 —— 這條測試量的不是它宣稱的東西").toContain(
      "Operator sign-in required",
    );
    expect(footersIn(html), "⛔ gated 那一邊沒有頁尾").toBe(1);
    expect(html).toContain(COPYRIGHT_LINE);
  });

  it("版權字串只有一個住處 —— 後台與客戶端讀同一個常數", async () => {
    cover(TAG);
    const client = (await import("../../client/src/ui/platform/creditsData")) as {
      COPYRIGHT_LINE: string;
    };
    expect(client.COPYRIGHT_LINE).toBe(COPYRIGHT_LINE);
    expect(COPYRIGHT_LINE).toContain("©");
  });
});
