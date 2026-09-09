/** 暫存量測（GH#992 後台側分母）—— 量完就刪。 */
import { describe, it } from "vitest";
import acceptance from "../../../docs/_reports/editor-skill-acceptance-42x46.json";
import bricksJson from "../../../docs/editor-contract/ggd-bricks.json";
import { EFFECT_BRICKS, brickForm, brickSchema } from "./abilityNodes";

interface Row {
  id: string;
  effectKinds?: string[];
  hookEvents?: string[];
  noCodeEventAuthoring?: string;
}

describe("量測", () => {
  it("後台這一側：46 份驗收包渲染得出幾份", () => {
    const rows = (acceptance as { rows: Row[] }).rows;
    const bricks = (bricksJson as { bricks: { id: string; layer: string }[] }).bricks;
    const palette = new Set(EFFECT_BRICKS.map((b) => b.id));
    const hookBricks = bricks.filter((b) => b.layer === "hook").map((b) => b.id);

    // 探針①：effect 積木 —— 在後台調色盤上，且 Zod 推導得出一張表單
    const effectOk = (k: string): boolean => palette.has(k) && brickSchema(k) !== null;
    // 探針②：hook 積木 —— 後台調色盤上有沒有任何 layer=hook 的項目
    const adminHasHookPalette = EFFECT_BRICKS.some(
      (b) => (b as { layer?: string }).layer === "hook",
    );

    const allEffects = new Set<string>();
    const allHooks = new Set<string>();
    for (const r of rows) {
      for (const k of r.effectKinds ?? []) allEffects.add(k);
      for (const h of r.hookEvents ?? []) allHooks.add(h);
    }

    const badEffect = [...allEffects].filter((k) => !effectOk(k));
    const rowsOk = rows.filter(
      (r) =>
        (r.effectKinds ?? []).every(effectOk) &&
        ((r.hookEvents ?? []).length === 0 || adminHasHookPalette),
    );
    const rowsBlockedByHooks = rows.filter(
      (r) => (r.hookEvents ?? []).length > 0 && !adminHasHookPalette,
    );

    console.log(
      JSON.stringify(
        {
          分母_驗收包列數: rows.length,
          探針: {
            effect: "EFFECT_BRICKS(調色盤).has(kind) && brickSchema(kind)!==null（跑出貨 abilityNodes.ts）",
            hook: "EFFECT_BRICKS 裡有沒有任何 layer=hook 的項目",
          },
          後台渲染得出的列: rowsOk.length,
          後台渲染不出的列: rows.length - rowsOk.length,
          清冊上的_hook_積木數: hookBricks.length,
          後台有_hook_調色盤: adminHasHookPalette,
          驗收包用到的_effect_kinds: allEffects.size,
          後台缺表單的_effect_kinds: badEffect,
          驗收包用到的_hook_events: [...allHooks].sort(),
          被_hook_擋住的列: rowsBlockedByHooks.map((r) => r.id),
          damage表單格數: brickForm("damage").length,
        },
        null,
        1,
      ),
    );
  });
});
