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

  it("⭐ ③ 出貨預設是**關**（owner：「還沒做好不開放」）", () => {
    expect(DEFAULT_UI_CUES.lobbyStore?.enabled).toBe(false);
  });
});
