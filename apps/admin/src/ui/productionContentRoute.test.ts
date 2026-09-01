/**
 * ⭐⭐ GH#730 —— 「9 個內容編輯頁搬上正式 build 後台」的**驗收**那一半。
 *
 * ── ⚠️ 這張票的狀態長期是「鏈路已接上**未驗收**」，⭐ 而缺的就是這一條 ──────
 * 票的裁決逐字是「**`putOverlayDoc` 覆蓋層遷移**（⛔ 不是拔 DEV 閘）」——
 * ⭐ 因為那兩條路的語意**不一樣**：
 *
 * | | dev 中介層（`contentApi`） | ⭐ durable overlay |
 * |---|---|---|
 * | 寫到哪 | `content/` 的**檔案** | 平台的 `data/`（`:ro` 內容掛載抹不掉它） |
 * | 撐得過 `git pull` 嗎 | ⛔ 不 | ⭐ 撐得過 |
 * | production 有嗎 | ⛔ **沒有** | ⭐ 有 |
 *
 * ⚠️ ⭐ 而 dev 那條**部署不了**（⛔ 這不是懶，是一道刻意的邊界）：
 * `apps/content-api/src/guard.ts` 的檔頭逐字 ——
 *   · `NODE_ENV=production` ⇒ **直接 throw**
 *   · 寫入要 **loopback peer**（`req.raw.socket.remoteAddress`），
 *     ⛔ 而它**明說不信** `X-Forwarded-For`／`X-Real-IP`
 *   · 「There is deliberately **NO trusted-proxy CIDR escape hatch**:
 *      that is a hole with a comment on it.」
 * ⇒ ⭐ 所以「把 content-api 部署上去」**不是翻一個旗標**，是拆掉那道邊界。⛔ 不做。
 *
 * ── ⭐ 這條驗什麼 ────────────────────────────────────────────────────────
 * **正式 build 的後台裡，那條寫得動內容的路真的在導覽列上。**
 * ⚠️ 它讀的是 `App.tsx` 匯出的**真的那份 `NAV`**（⛔ 不是掃原始碼字串 —— 失敗形態⑥），
 * 而且**兩個方向都驗**：該在的在、⭐ 而**只能靠 dev 中介層**的那幾頁確實**不在**
 * production 的那一份裡。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `NAV` 裡的 `contentOverlay` 那一列刪掉 → ① 紅
 */
import { describe, it, expect } from "vitest";
import { NAV } from "./App";

describe("GH#730 正式 build 的後台真的編得動內容", () => {
  it("★ ① 「內容覆蓋層」在**真的那份 `NAV`** 上（⛔ 不是掃字串）", () => {
    const row = NAV.find((n) => n.page === "contentOverlay");
    expect(
      row,
      "⛔⛔ 正式 build 的後台導覽列上**沒有任何**寫得動內容的路。\n" +
        "⭐ 而 dev 那條（`contentApi`）部署不了 —— `content-api` 的寫入閘在\n" +
        "   `NODE_ENV=production` 直接 throw，且寫入要 loopback peer。\n" +
        "⇒ ⛔ 少了這一列，owner 在正式站上一個字都改不了。",
    ).toBeDefined();
    expect(row!.label).toBe("內容覆蓋層");
  });

  it("★ ② ⭐ **反方向**：只有 dev 走得到的那幾頁，⛔ 不可以混進這份表", () => {
    // ⚠️ 它們是**刻意**只在 dev chunk 裡的（`ContentPage` / `NewHeroPage` 走
    //   `contentApi`，而那條路在 production 一個位元組都不在）。
    // ⇒ ⭐ 混進 `NAV` = 正式站上一顆**按了會說「連不上」**的按鈕。
    for (const dead of ["content", "newHero"]) {
      expect(
        NAV.some((n) => n.page === dead),
        `⛔ \`${dead}\` 出現在 production 的 NAV 上 —— ⭐ 它只走得到 dev 中介層`,
      ).toBe(false);
    }
  });

  it("⭐ ③ 那一列**沒有**任何 dev 條件（⛔ 一個 `import.meta.env.DEV` 都不可以）", () => {
    const row = NAV.find((n) => n.page === "contentOverlay")!;
    // ⭐ `NAV` 是一個純資料陣列 ⇒ 「沒有條件」＝它在任何環境下都長一樣。
    //   ⚠️ 這一條擋的是「有人把它改成 `...(DEV ? [row] : [])`」那種寫法。
    expect(Object.keys(row).sort()).toEqual(["emoji", "label", "page", "section"].sort());
  });
});
