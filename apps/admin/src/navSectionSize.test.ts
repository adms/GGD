import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ⭐⭐ GH#775 AC3 —— **左欄沒有一組超過 20 列**。
 *
 * ── ⛔ 為什麼要一條閘（⭐ 而不是「記得別加太多」）────────────────────────────
 * owner 2026-08-02：「該頁面左排選單請做成可以收納/展開的形式**避免過長**」
 * owner 2026-08-26：「目前後台左測**有些分類已經過長**」——⭐ **他講了兩次**。
 *
 * ⚠️ 而它被人工修過**三次**（2026-08-02 · 08-26 · 2026-08-31），
 * ⭐ 每一次都是「有人去數了一遍」——⛔ 而下一次加頁沒有任何東西會叫。
 * ⇒ ⭐ 這一條把那個判準換成數字（第零守則的元規則：判準 0/4 全破，只有閘有用）。
 *
 * ⛔ 它**不管分得對不對**（那是 `navSections.test.ts` 的 `APPROVED_MOVES` 在守）——
 * ⭐ 它只管**長度**。
 */
const APP = resolve(__dirname, "ui/App.tsx");
/** owner 兩次抱怨的那條線。⭐ 一組 20 列已經是一個螢幕高度。 */
const MAX_PER_SECTION = 20;

describe("GH#775 AC3 左欄分組長度", () => {
  const src = readFileSync(APP, "utf8");
  const counts = new Map<string, number>();
  for (const m of src.matchAll(/section: (SEC_\w+)/g)) {
    const k = m[1]!;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  it("量尺先自證：數得到分組（⛔ 解析壞了下面那條會空過）", () => {
    expect(counts.size).toBeGreaterThanOrEqual(5);
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(80);
  });

  it(`★ ⭐ 沒有一組超過 ${MAX_PER_SECTION} 列（owner 講過**兩次**「已經過長」）`, () => {
    const over = [...counts.entries()]
      .filter(([, n]) => n > MAX_PER_SECTION)
      .map(([k, n]) => `${k} = ${n}`);
    expect(
      over,
      `⛔ 這幾組超過 ${MAX_PER_SECTION} 列：${over.join(" · ")}\n` +
        `⭐ 修法是**按職責再拆一組**（⛔ 不是切成兩半）——` +
        `判準：那一族的使用者心裡有沒有一個名字。\n` +
        `⚠️ 拆完要同步 \`navSections.test.ts\` 的 APPROVED_MOVES，⛔ 不是改這條測試。`,
    ).toEqual([]);
  });
});
