/**
 * 後台每一頁的頁尾版權（owner 2026-08-28「後台右側頁面 每一頁都要加上 footer
 * copyright」）。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 承重的斷言是「**每一頁**都有，包含沒登入的那一頁」
 * ---------------------------------------------------------------------------
 * ⛔ **不是**「ConsoleFooter 這個元件會渲染出版權字串」—— 那條對「掛了但只掛在
 * 一頁上」的實作**也是綠的**（失敗形態④）。所以下面 `renderToString` **出貨在用
 * 的那一棵**渲染樹（`Console`），逐頁換 `page` 再數，⛔ 不是掃原始碼字串（形態⑥）。
 *
 * ⚠️ `gated`（需要連線）那一頁刻意也在名單上：頁尾放進 `gated ? … : …` 的任一邊
 * 都會漏掉另一邊，而漏掉的那一邊在畫面上看起來完全正常。
 *
 * ---------------------------------------------------------------------------
 * 突變紀錄（都真的做過）
 * ---------------------------------------------------------------------------
 *   · `App.tsx` 的 `<ConsoleFooter />` 刪掉                → 紅（每一頁都 0 個）
 *   · 把它移進 `gated ? … : (<>…</>)` 的非 gated 那一邊    → 紅（指名 players 那一頁）
 *   · `brand.ts` 的字串改成空字串                          → 紅（字串那一條）
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import { COPYRIGHT_LINE } from "@ggd/shared/brand";
import { Console } from "./ui/App";
import { appStore, pageRequiresSession, type Page } from "./store";

/** 一個最小的假帳號 —— 只是為了讓 `gated` 是 false。 */
const FAKE_ACCOUNT = { username: "probe", role: "admin" } as never;

const TAG = "adminui-console-footer";

/** 抽樣涵蓋四種來源：本機工具頁 · 平台頁（要連線）· 內容套件頁 · 導覽地圖。 */
const PAGES: readonly Page[] = ["hub", "players", "combatEnv", "navMap", "audit"];

const footersIn = (html: string): number =>
  (html.match(/data-testid="console-footer"/g) ?? []).length;

describe("後台頁尾版權（owner 2026-08-28）", () => {
  it("⭐ 每一頁都恰好一個頁尾（已登入）", () => {
    cover(TAG);
    appStore.setState({ account: FAKE_ACCOUNT });
    for (const page of PAGES) {
      appStore.setState({ page });
      const html = renderToString(createElement(Console));
      // ⛔ `toBeGreaterThan(0)` 不夠：兩個頁尾也是「有」，而那是版面缺陷。
      expect(footersIn(html), `page=${page}`).toBe(1);
      expect(html, `page=${page}`).toContain(COPYRIGHT_LINE);
    }
  });

  /**
   * ⭐⭐ 這一條是**承重的那一條**，而它在 2026-08-28 第一版是**假綠**的：
   * 夾具沒有把狀態推進 `gated`（`account === null && pageRequiresSession(page)`），
   * 於是「把頁尾移進 `gated ? … : …` 的非 gated 那一邊」這個突變**沒有紅**
   * —— 形態⑩：守衛靠一個與它的宣稱無關的理由綠著。
   */
  it("⭐ 沒登入的「需要連線」畫面也有頁尾（gated 那一邊）", () => {
    cover(TAG);
    appStore.setState({ account: null, page: "players" });
    // 前提自檢：這一頁真的要連線，否則下面量到的不是 gated 那條路。
    expect(pageRequiresSession("players")).toBe(true);
    const html = renderToString(createElement(Console));
    // 前提自檢②：畫面上真的是「需要連線」那一塊，⛔ 不是 PlayersPage。
    expect(html).toContain("Operator sign-in required");
    expect(footersIn(html)).toBe(1);
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
