/**
 * ⭐⭐ **積木普查的棘輪** —— owner 2026-09-01 的分工定義，這是它的量尺：
 *
 * > 「[後台編輯器及codex編輯器] 是**堆積木**的角色 **要充分了解有哪些積木**,
 * >  而 main 遊戲主程式 是**做出積木**供使用的角色」
 *
 * ⇒ ⭐ 「有哪些積木」在 2026-09-01 之前**沒有清單** —— 編輯器只能去翻 46 份模板檔，
 * ⛔ 而其中一大半是空盒子，⚠️ 從檔案上分不出來。
 *
 * ── ⭐ 這條棘輪釘住三個數字，⛔ 而它們往**相反**方向走 ────────────────────
 * · `usable`（編輯器拼得動的積木）—— ⭐ 只准**變多**
 * · `engineMissing`（有模板檔而引擎不認得）—— ⭐ 只准**變少**
 * · `shells`（空盒子）—— ⭐ 只准**變少**
 *
 * ⚠️ ⭐ 兩個方向是刻意的：只釘「空盒子變少」的話，**把模板檔刪掉**也算進步；
 * 只釘「積木變多」的話，⛔ 新增一份空殼模板也算進步。⇒ 兩邊一起釘才擋得住。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `expand.ts` 的 `FAMILIES` 拿掉一個 key → 🔴（`usable` 從 19 掉到 18）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");
const CENSUS = JSON.parse(
  readFileSync(resolve(ROOT, "docs/editor-contract/ggd-brick-census.json"), "utf8"),
) as { counts: Record<string, number>; templates: { id: string; abilities: number }[] };

/** ⭐ 2026-09-02 量到的真值。⛔ 改它之前先問「這是進步還是退步」。 */
const USABLE_FLOOR = 19;
const ENGINE_MISSING_CEIL = 26;
const SHELLS_CEIL = 18;

describe("⭐ 積木普查（編輯器要知道有哪些積木）", () => {
  it("★ ⭐ **拼得動的積木只准變多**", () => {
    expect(
      CENSUS.counts["usable"],
      `⛔ 從 ${USABLE_FLOOR} 掉下來了 —— ⭐ 少一塊積木＝編輯器少一種拼得出來的東西。\n` +
        `⚠️ 若這是**刻意**把某個 family 下架，把 FLOOR 改小並在 commit 訊息裡寫**為什麼**。`,
    ).toBeGreaterThanOrEqual(USABLE_FLOOR);
  });

  it("★ ⭐ **引擎不認得的模板檔只准變少**（⛔ 一份展不開的模板是一句謊）", () => {
    expect(
      CENSUS.counts["engineMissing"],
      `⛔ 從 ${ENGINE_MISSING_CEIL} 變多了 —— ⭐ 一份寫得出來、⛔ 引擎展不開的模板，\n` +
        `對編輯器來說**看起來就是一塊積木**，而它拼上去是死的（第一·五守則的形狀）。`,
    ).toBeLessThanOrEqual(ENGINE_MISSING_CEIL);
  });

  it("⭐ 空盒子只准變少（⚠️ ⛔ 而「刪掉模板檔」不算進步 —— 見上一條）", () => {
    expect(CENSUS.counts["shells"]).toBeLessThanOrEqual(SHELLS_CEIL);
  });

  it("⭐ 量尺自證：**被用到的家族**真的出現在普查裡（⛔ 不是一張空表）", () => {
    const used = CENSUS.templates.filter((t) => t.abilities > 0);
    expect(
      used.length,
      "⛔⛔ 普查說**零個**模板被用到 —— ⭐ 那不是「沒有人用模板」，是這支普查沒讀到 `template.ref`。",
    ).toBeGreaterThan(0);
    // ⭐ 已知在用的那一個（GH#898 的召喚代理）必須在裡面。
    expect(used.map((t) => t.id)).toContain("tpl-summon-agent");
  });
});
