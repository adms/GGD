/**
 * 通用引擎第四種形狀（物件陣列）的守衛 —— GH#355。
 *
 * ⭐ 這一條只問**一件事**：後台這張表，和出貨 Zod 是不是同一份知識？
 * 三個方向一起關（缺一個就會出現「後台放行、平台 PUT 退回、理由是一句英文」）：
 *   ① Zod 的每一欄都畫得出來，而且都有人話（加欄位沒寫中文 → 紅）
 *   ② 人話裡沒有孤兒（欄位改名 → 紅）
 *   ③ 界從 Zod 來，⛔ 不是手抄（把 basePct 填 101 一定要被擋）
 *
 * 突變紀錄（承重的那一條 = `rowColumns` 的 `walkZod`）：
 * 把 `rowColumns` 改成 `return []` → ①②③ 全紅（沒有欄位＝沒有驗證，
 * 而 `validateRows` 會把每一列都當成空物件送出去）；改回來 → 綠。
 */
import { describe, it, expect } from "vitest";
import { rowColumns, rowsFrom, validateRows } from "./configRows";
import { AUGMENT_TIERS_SPEC, SHIPPED_WEAPON_TIERS, WEAPON_TIERS_SPEC } from "./tierRows";

const SPECS = [WEAPON_TIERS_SPEC, AUGMENT_TIERS_SPEC];

describe("階級升級表的後台欄位 === 出貨 Zod（GH#355）", () => {
  it("★ Zod 的每一欄都有人話，人話裡也沒有孤兒", () => {
    for (const spec of SPECS) {
      const cols = rowColumns(spec);
      expect(cols.length, `${spec.title} 一欄都走不出來 —— 這張表等於一個空表單`).toBeGreaterThan(5);
      const missing = cols.filter((c) => spec.columns[c.key] === undefined).map((c) => c.key);
      expect(missing, `${spec.title}：schema 有這幾欄但沒有人寫中文說明`).toEqual([]);
      const orphan = Object.keys(spec.columns).filter((k) => !cols.some((c) => c.key === k));
      expect(orphan, `${spec.title}：這幾筆人話對不上任何一個真的欄位（欄位改名了？）`).toEqual([]);
      // enum 的選項中文也要齊 —— 少一個就是下拉選單裡一格英文字面值。
      for (const c of cols.filter((c) => c.kind === "enum")) {
        const zh = spec.columns[c.key]?.optionZh ?? {};
        expect(
          c.options.filter((o) => zh[o] === undefined),
          `${spec.title} 的「${c.zh}」少了這幾個選項的中文`,
        ).toEqual([]);
      }
    }
  });

  it("★ 界是從 Zod 推的，不是手抄 —— 越界的值存不進去", () => {
    const rows = rowsFrom({ weaponTiers: SHIPPED_WEAPON_TIERS }, WEAPON_TIERS_SPEC);
    expect(validateRows(rows, WEAPON_TIERS_SPEC).value, "出貨值自己就存不回去").not.toBeNull();

    // basePct 的上界 100 只寫在 schema 裡；後台沒有第二份，所以這一格會紅
    // 是因為它**讀得到**那份 schema。
    const over = rows.map((r, i) => (i === 0 ? { ...r, basePct: "101" } : r));
    const v = validateRows(over, WEAPON_TIERS_SPEC);
    expect(v.value).toBeNull();
    expect(v.rows[0]?.basePct ?? "", "沒有指名是 basePct 越界").toContain("100");

    // 必填欄留白、以及 zId 的 regex（走訪器看不到，靠整列 safeParse 擋）。
    expect(validateRows(rows.map((r) => ({ ...r, id: "" })), WEAPON_TIERS_SPEC).value).toBeNull();
    expect(
      validateRows(rows.map((r) => ({ ...r, table: "NOT A VALID ID" })), WEAPON_TIERS_SPEC).value,
    ).toBeNull();
  });

  it("★ 可留白的欄位存出去是「這個鍵不存在」，⛔ 不是 0", () => {
    // `guaranteeAtD` 留白 ≠ 保底門檻 0（那是「D≥0 就必得」＝ 整階變成 100%）。
    const rows = rowsFrom({ weaponTiers: SHIPPED_WEAPON_TIERS }, WEAPON_TIERS_SPEC).map((r) => ({
      ...r,
      guaranteeAtD: "",
      maxRound: "",
    }));
    const v = validateRows(rows, WEAPON_TIERS_SPEC);
    expect(v.value).not.toBeNull();
    expect(v.value?.[0]).not.toHaveProperty("guaranteeAtD");
    expect(v.value?.[0]).not.toHaveProperty("maxRound");
  });
});
