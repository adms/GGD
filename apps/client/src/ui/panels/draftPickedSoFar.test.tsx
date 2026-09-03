/**
 * ⭐⭐ **三選一面板看得到「本場已選」**（GH#893）。
 *
 * owner 2026-09-01（逐字）：
 * > 「固有能力三選一**看不到過去選了哪些**」
 *
 * ⭐ 量到的現況：資料**本來就在** —— `SeatState.augments`（協定）
 * → `SeatView.augments`（`RoomStore`）⇒ ⛔ 缺的只是把它畫出來。
 *
 * ⚠️⚠️ ⭐ **而它必須讀伺服器狀態，⛔ 不是客戶端自己記的**：
 * 客戶端記的那一份**重連之後就消失**（失敗形態②：算出來但從沒送到客戶端），
 * ⭐ 而重連正是最需要看到「我這場選過什麼」的時候。
 * ⇒ 第 3 條斷言掃出貨原始碼，確認它走的是 `useHud`，⛔ 不是 `useState`/`useRef`。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 `content/config/ui-cues.json` 的 `draftShowPicked` 改成 false
 *    → 🔴 ①「出貨預設是關的 —— owner 要的就是『看得到』」
 * M2 面板的 `<PickedSoFar />` 拿掉 → 🔴 ②「面板沒有掛上已選清單」
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(__dirname, "../../../../..");
const PANEL = readFileSync(join(__dirname, "AugmentDraftPanel.tsx"), "utf8");

describe("三選一的「本場已選」（GH#893）", () => {
  it("★★ ⭐ 出貨**預設開著**（owner 要的就是「看得到」）", () => {
    const cues = JSON.parse(
      readFileSync(join(REPO, "content/config/ui-cues.json"), "utf8"),
    ) as { draftShowPicked?: boolean };
    expect(
      cues.draftShowPicked,
      "⛔⛔ 出貨預設是關的 —— owner 2026-09-01 逐字抱怨的就是「看不到」",
    ).toBe(true);
  });

  it("★★ ⭐ 面板**真的掛上**了那一段（⛔ 寫了元件而沒有掛 = 它不存在）", () => {
    expect(
      PANEL.includes("<PickedSoFar />"),
      "⛔⛔ `PickedSoFar` 寫好了但**沒有掛進面板** ⇒ 玩家一樣看不到 ——\n" +
        "  ⭐ 而那與「還沒做」在畫面上長得一模一樣。",
    ).toBe(true);
  });

  it("★★ ⭐⭐ 它讀**伺服器狀態**（⛔ 客戶端自己記的重連就消失）", () => {
    const fn = PANEL.slice(PANEL.indexOf("function PickedSoFar"), PANEL.indexOf("export function AugmentDraftPanel"));
    expect(fn.length, "⛔ 找不到 `PickedSoFar` —— 這條驗不了了").toBeGreaterThan(50);
    expect(
      fn.includes("useHud("),
      "⛔⛔ 已選清單不是從 `useHud`（伺服器狀態）來的 ⇒\n" +
        "  ⭐ 客戶端自己記的那一份**重連之後就消失**，而重連正是最需要它的時候。",
    ).toBe(true);
    for (const bad of ["useState", "useRef", "localStorage"])
      expect(
        fn.includes(bad),
        `⛔ \`PickedSoFar\` 用了 \`${bad}\` —— 那是客戶端自己記的那條路`,
      ).toBe(false);
  });

  it("⭐ 那一格開關**真的被問了**（⛔ 否則它是死開關）", () => {
    const fn = PANEL.slice(PANEL.indexOf("function PickedSoFar"), PANEL.indexOf("export function AugmentDraftPanel"));
    expect(
      fn.includes("uiCues().draftShowPicked"),
      "⛔ 面板沒有問那格開關 ⇒ 後台關掉場上沒反應（失敗形態⑧）",
    ).toBe(true);
  });
});
