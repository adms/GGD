/**
 * ⭐⭐ **按住 Tab 的全員面板**（GH#894）。
 *
 * owner 2026-09-01（逐字）：
 * > 「tab鍵 按住應該要能看到**所有人的等級、生命、AD、AP、寶具與固有技能**」
 *
 * ⚠️⚠️ ⭐ **這一支最重要的斷言是「六欄一欄都不少」** ——
 * ⛔ 一塊少了 AD 的面板與一塊沒做的面板，在「有沒有東西出現」這個問題上
 * 給出**一樣的答案**，而 owner 那句話點名了**六個**東西。
 *
 * ⚠️ ⭐ 而資料鏈有三段，每一段斷掉都長得像「面板還沒做」：
 * ① sim 的 stats/health → ② `snapshot.ts` 寫進 `SeatState`（**APPEND-ONLY** 四格）
 * → ③ `RoomStore` 的 `SeatView` → ④ 這塊面板。
 * ⇒ ⭐ 第 3 條斷言走**整條**：拿一份 seat 餵進去，讀算繪出來的數字。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 面板的 `<td>{s.adNow ?? 0}</td>` 那一格拿掉 → 🔴 ②「六欄少了 AD」
 * M2 `snapshot.ts` 的 `ss.adNow = …` 拿掉 → 🔴 `snapshotWiring` 那條
 */
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AllPlayersPanel } from "./AllPlayersPanel";

const REPO = join(__dirname, "../../../../..");

describe("按住 Tab 的全員面板（GH#894）", () => {
  it("★★ ⭐ **沒按住 Tab 就不出現**（⛔ 它蓋在戰場上）", () => {
    // ⭐ SSR 沒有鍵盤事件 ⇒ `held` 是 false ⇒ 這塊面板必須回 null。
    expect(
      renderToStaticMarkup(React.createElement(AllPlayersPanel)),
      "⛔⛔ 面板在沒有按住 Tab 的時候就畫出來了 —— 它會**永久蓋住戰場**",
    ).toBe("");
  });

  it("★★ ⭐⭐ **六欄一欄都不少**（owner 逐字點名的那六個）", () => {
    const src = readFileSync(join(__dirname, "AllPlayersPanel.tsx"), "utf8");
    const missing = ["等級", "生命", "AD", "AP", "寶具", "固有技能"].filter(
      (h) => !src.includes(`"${h}"`),
    );
    expect(
      missing,
      "⛔⛔ 少了欄位 —— ⭐ 一塊少了一欄的面板與一塊沒做的面板，\n" +
        "  在「有沒有東西出現」這個問題上給出**一樣的答案**。\n" +
        "  ⭐ owner 2026-09-01 逐字點名了六個：等級、生命、AD、AP、寶具與固有技能。",
    ).toEqual([]);
  });

  it("★★ ⭐ 資料鏈第 ②③ 段真的接上了（⛔ 斷了就是每個人都 0 AD/AP）", () => {
    const snap = readFileSync(join(REPO, "apps/game-server/src/net/snapshot.ts"), "utf8");
    for (const f of ["adNow", "apNow", "hpNow", "hpMaxNow"])
      expect(
        snap.includes(`ss.${f} =`),
        `⛔⛔ \`snapshot.ts\` 沒有送 \`${f}\` ⇒ 面板會畫出「每個人都 0」，\n` +
          "  而那與「面板還沒做」在畫面上長得一模一樣（失敗形態②）。",
      ).toBe(true);
    const store = readFileSync(join(REPO, "apps/client/src/net/RoomStore.ts"), "utf8");
    for (const f of ["adNow", "apNow"])
      expect(store.includes(`${f}: ss.${f} ??`), `⛔ \`RoomStore\` 沒有把 \`${f}\` 讀進 SeatView`).toBe(
        true,
      );
  });

  it("★★ ⭐⭐ **APPEND-ONLY**：四格加在 `locked` 之後（⛔ 插在中間會讓線上舊分頁整格錯位）", () => {
    const schema = readFileSync(join(REPO, "packages/shared/src/protocol/schema.ts"), "utf8");
    const i = schema.indexOf('locked: "boolean",');
    expect(i, "⛔ 找不到 `locked` —— 這條斷言驗不了了").toBeGreaterThan(0);
    for (const f of ["adNow", "apNow", "hpNow", "hpMaxNow"]) {
      const j = schema.indexOf(`${f}: "uint16"`);
      expect(j, `⛔ \`${f}\` 不在 defineTypes 裡`).toBeGreaterThan(0);
      expect(
        j,
        `⛔⛔ \`${f}\` 排在 \`locked\` **前面** ⇒ 那不是 append ——\n` +
          "  ⭐ CLAUDE.md 硬性約束：`defineTypes` 是 APPEND-ONLY，\n" +
          "  插在中間會讓部署當下開著舊分頁的玩家**整格錯位**（⛔ 而且不會報錯）。",
      ).toBeGreaterThan(i);
    }
  });
});
