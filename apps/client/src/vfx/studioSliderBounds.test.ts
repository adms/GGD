/**
 * 工坊滑桿的區間必須**等於** schema 的區間（GH#838）。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 為什麼這是一條閘，⛔ 不是一句「記得抄」
 * ---------------------------------------------------------------------------
 * owner 2026-08-28：「用 **silder** 調大小、透明度、顏色、轉向、高度、動畫速度」。
 * 而滑桿的兩端如果比 Zod 寬，作者拉得到的值**存不進去** —— 畫面上只是「存檔失敗」，
 * ⛔ 沒有任何東西指得出是哪一格；比 Zod 窄則是**拉不到合法值**，更看不出來。
 *
 * ⚠️ 這條測試是被踩出來的：2026-08-28 我憑印象寫那六格，**六格有五格**與 schema
 * 不同（w3xScale 0.1↔0.05 · alpha 0↔0.05 · facingDeg ±180↔±360 ·
 * pitchDeg ±90↔±180 · flyHeight 0..400↔±2000 · timeScale 0.05..5↔0.2..4）。
 *
 * ⭐ 判準是**從 Zod 自己讀出來**（`_def.checks` 的 min/max），⛔ 不是第二份抄好的表
 * —— 那樣只會把同一個問題往下推一層（第〇·四守則）。
 *
 * 突變紀錄：把任一格滑桿的 min/max 改一個數字 → 紅並指名那一格與兩個值。
 */
import { describe, it, expect } from "vitest";
import { zAbilityVfxLayerOverride } from "@ggd/shared/content/schema/abilityVfx";
import { FIELDS as STUDIO_FIELDS } from "./vfxScriptFields";

/** 從一個 Zod number（可能包在 optional 裡）讀出 min/max。 */
function boundsOf(schema: unknown): { min?: number; max?: number } | null {
  let s: unknown = schema;
  // 剝掉 optional / default / nullable 的外殼
  for (let i = 0; i < 5; i++) {
    const inner = (s as { _def?: { innerType?: unknown } })._def?.innerType;
    if (!inner) break;
    s = inner;
  }
  const def = (s as { _def?: { typeName?: string; checks?: { kind: string; value: number }[] } })._def;
  if (def?.typeName !== "ZodNumber") return null;
  const out: { min?: number; max?: number } = {};
  for (const c of def.checks ?? []) {
    if (c.kind === "min") out.min = c.value;
    if (c.kind === "max") out.max = c.value;
  }
  return out;
}

describe("工坊粒子段的滑桿區間 = schema 的區間（GH#838）", () => {
  it("⭐ 每一格 range 滑桿的 min/max 逐字等於 Zod", () => {
    const shape = zAbilityVfxLayerOverride.shape as unknown as Record<string, unknown>;
    const fields = STUDIO_FIELDS.vfx.filter((f) => f.kind === "range" && f.key in shape);
    // GUARD THE GUARD：欄位名改掉就會變成 0 格，而 0 格的迴圈永遠是綠的。
    expect(fields.length, "⛔ 一格都對不上 —— 欄位名改了，這條測試在空轉").toBeGreaterThanOrEqual(5);
    const drift: string[] = [];
    for (const f of fields) {
      const b = boundsOf(shape[f.key]!);
      if (!b) continue;
      if (b.min !== undefined && f.min !== b.min) drift.push(`${f.key}.min 滑桿=${f.min} schema=${b.min}`);
      if (b.max !== undefined && f.max !== b.max) drift.push(`${f.key}.max 滑桿=${f.max} schema=${b.max}`);
    }
    expect(
      drift,
      "⛔ 滑桿區間與 schema 漂開了 —— 作者會拉到一個**存不進去**的值（或拉不到合法值），" +
        "而畫面上只會說「存檔失敗」：\n  " + drift.join("\n  "),
    ).toEqual([]);
  });
});
