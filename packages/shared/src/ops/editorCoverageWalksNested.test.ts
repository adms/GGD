/**
 * ⭐⭐ **契約的 walker 下鑽得進巢狀容器**（GH#888 / GH#889）。
 *
 * ⛔⛔ 實測缺口（票文逐字）：Editor 的雙向閘擴到全部 group 之後立刻得到
 * 「編輯器有但契約沒有：`attachPoints.*.x/y/z`」——
 * ⭐ 三格都不是 Editor 自創（`zModelDoc.attachPoints` 是 `record<Vec3>`），
 * 根因是 coverage generator 的 `flatten()` **只深入 object / array /
 * discriminatedUnion**，⛔ 沒有深入 record。
 *
 * ⚠️ ⭐ 而這種漏是**零報錯**的：契約說得出「有一格 `attachPoints`」，
 * ⛔ 說不出它底下有什麼 ⇒ 外部編輯器畫得出那一格、卻不知道要填什麼，
 * 而兩邊的雙向閘各自都是綠的（CLAUDE.md 綠燈假來源⑪）。
 *
 * ⭐ 這一支釘住**下鑽真的發生了** —— ⛔ 不是掃 `gen_editor_coverage.ts`
 * 的原始碼字串（那是失敗形態⑥），而是讀**產出的契約**。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const C = JSON.parse(
  readFileSync(join(ROOT, "docs/editor-contract/ggd-editor-coverage.json"), "utf8"),
) as { required: { group: string; name: string }[]; counts: Record<string, number> };

/** ⚠️ `required` 的每一列是 `{group, name}` —— ⛔ 不是裸字串。 */
const has = (needle: string): boolean => C.required.some((r) => r.name.includes(needle));

describe("契約 walker 的巢狀下鑽（GH#888）", () => {
  it("⭐ 量尺先自證：契約真的載得到而且不是空的", () => {
    expect(C.required.length, "⛔ 一格都沒有 ⇒ 這條在量空氣").toBeGreaterThan(1000);
  });

  it("★★ ⭐ **record 的值型別**下鑽得到（票文那三格）", () => {
    for (const leaf of ["attachPoints.*.x", "attachPoints.*.y", "attachPoints.*.z"])
      expect(has(leaf), `⛔ 契約說不出 ${leaf} —— walker 沒有深入 record`).toBe(true);
  });

  it("⭐ 另一個 record 實例：`config.vfx-families@1.families.*` 的子欄位", () => {
    // ⚠️ GH#889 量到的：那一格是 `z.record(家族名, zVfxFamilyTuning)`
    //   ⇒ 少了下鑽，12 格全部看不到。
    for (const leaf of ["families.*.primitive", "families.*.models"])
      expect(has(leaf), `⛔ 契約說不出 ${leaf}`).toBe(true);
  });

  it("⭐⭐ 萬用鍵**只有一層**（⛔ `families.*.*.alpha` 是路徑組錯的樣子）", () => {
    // ⚠️ 那一版「有東西而且看起來合理」—— 而照著它寫的編輯器
    //   會產出一份引擎讀不懂的 JSON。
    const doubled = C.required.filter((r) => r.name.includes(".*.*.")).map((r) => `${r.group}/${r.name}`);
    expect(doubled, "⛔ 路徑多接了一段萬用鍵").toEqual([]);
  });
});
