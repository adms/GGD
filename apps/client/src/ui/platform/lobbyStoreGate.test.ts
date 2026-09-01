/**
 * ⭐ GH#896 —— 大廳的「模組商店」入口。
 *
 * owner 2026-09-01（逐字）：
 * > 「關閉模組商店(大廳上面可選到的 store)，**這個根本還沒做好不開放**」
 *
 * ⚠️ ⭐ 票文自己點出的陷阱，也是這條守衛存在的唯一理由：
 * > 「『關掉入口』與『關掉功能』是兩件事 —— 只藏按鈕而路由還在，
 * >   知道網址的人照樣進得去」
 *
 * ⇒ ⭐ 所以這裡驗的是**兩個讀端都存在**，⛔ 不是「有沒有那格 config」。
 * ⚠️ 它刻意讀**出貨原始碼**（⛔ 不 render React）—— 這是體驗層，一條薄的就夠
 * （第零守則⑦：體驗層 ≤80 行、⛔ 不開對抗輪）。
 *
 * MUTATION LOG：
 *   · body 那一半的 `storeOpen &&` 拿掉 → ② 紅（藏了按鈕而路由還通）
 *   · `DEFAULT_UI_CUES.lobbyStore.enabled` 改成 true → ③ 紅
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_UI_CUES } from "@ggd/shared/content";
import { lobbyStoreOpen } from "@ggd/shared/content/schema/config/uiCues";

const SRC = readFileSync(resolve(__dirname, "LobbyScreen.tsx"), "utf8");

describe("GH#896 模組商店入口關閉", () => {
  it("★ ① 按鈕被開關擋著", () => {
    expect(
      /\{storeOpen && \(\s*<Btn/.test(SRC),
      "⛔ 那顆 Store 按鈕沒有被 `storeOpen` 擋著 ⇒ owner 說「還沒做好不開放」而它照樣在畫面上",
    ).toBe(true);
  });

  it("★ ② ⭐ **路由那一半也被擋著**（⛔ 只藏按鈕 = 知道網址的人照樣進得去）", () => {
    expect(
      SRC.includes('{storeOpen && lobbyView === "store" ? ('),
      "⛔⛔ body 那一支只看 `lobbyView`，⛔ 沒看開關 ⇒\n" +
        "⭐ 一份存著 `lobbyView:\"store\"` 的舊瀏覽器狀態就**繞過**那顆藏起來的按鈕。\n" +
        "⚠️ 而畫面上完全看不出來 —— 對沒有舊狀態的人它是關的。",
    ).toBe(true);
  });

  /**
   * ⭐⭐ GH#911 —— owner 2026-09-01：「商店買角色的部分好像被關掉了
   * **我只要關掉買模組特效的部分**」。
   *
   * ⚠️ #896 的實作**沒有做錯** —— 是那張票的 Scope 寫太寬：
   * 它逐字說「一格後台開關把入口關掉」，⛔ 從頭到尾沒有問
   * 「**那一頁裡有幾種東西**」。⇒ 兩種商品、兩種貨幣，被一格開關一起關掉。
   *
   * ⭐ 所以這一條現在驗的是**兩半各自的預設**，⛔ 不是一格布林。
   */
  it("⭐ ③ 出貨預設：英雄**開**（藍水晶靠遊玩賺）· 造型**關**（還沒做好）", () => {
    expect(
      DEFAULT_UI_CUES.lobbyStore?.champions,
      "⛔⛔ 英雄那一半是關的 —— 玩家**賺了藍水晶卻買不到英雄**（owner 09-01 回報的正是這個）",
    ).toBe(true);
    expect(
      DEFAULT_UI_CUES.lobbyStore?.skins,
      "⛔ 造型那一半應該是關的（owner：「這個根本還沒做好不開放」）",
    ).toBe(false);
  });

  /**
   * ⭐ 兩個讀端問**同一支函式** —— ⛔ 不是各自寫一次條件。
   * ⚠️ #896 刻意做了兩個讀端（按鈕 ＋ 路由），而拆成兩格之後
   * 「只拆一邊」會留下「按鈕在但點進去是空的」。
   */
  it("★ ④ ⭐ legacy `enabled:false` 仍然**兩半都關**（⛔ 舊 override 不可以被忽略）", () => {
    expect(lobbyStoreOpen({ lobbyStore: { enabled: false } })).toEqual({
      champions: false,
      skins: false,
      page: false,
    });
    // ⛔ 而 `enabled:true` **不會**偷偷把造型打開 —— 它只表示「整頁沒被關」。
    expect(lobbyStoreOpen({ lobbyStore: { enabled: true } }).skins).toBe(false);
    // ⭐ 缺席 ⇒ 出貨預設（英雄開、造型關）⇒ 那一頁進得去。
    expect(lobbyStoreOpen({}).page).toBe(true);
  });
});
