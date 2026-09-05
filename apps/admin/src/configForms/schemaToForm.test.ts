/**
 * `schemaToForm()` 的承重守衛（GH#992 Scope 1 第一批）。
 *
 * ⭐ 三條，各回答一個**不同**的問題：
 *  ① **結構**：推導出來的欄位與 `speed-growth-tiers` 那份 spec 手寫的**逐格相等**
 *     （路徑 + 順序，23/23）。⛔ 它綠了才代表「推導」取代得了「手寫」的骨架。
 *  ② **兩個方向的校準**（CLAUDE.md「一把只驗過單邊的尺不算自證過」）：拿一份
 *     **有** `.describe()` 的與一份**沒有**的各跑一次，欠帳清單要**不一樣**。
 *  ③ **標籤真的做得到**：把 `@zh` / `@note` / `@opt` 貼到一顆**出貨的** Zod 節點上，
 *     推導結果逐鍵 deep-equal。⛔ 這一條不是虛構夾具 —— schema 取自出貨文件本身。
 *
 * ⚠️ ①的差異（`zh` 23 格 · `optionLabels` 1 格）**沒有被放寬**，它們逐條列在
 * ②裡，理由與缺的標籤寫在 `schemaToForm.ts` 的檔頭。
 */
import { describe, it, expect } from "vitest";
import { zConfigSpeedGrowthTiersDoc } from "@ggd/shared/content/schema/config";
import { SPEED_GROWTH_TIERS_SPEC } from "./specs/tiers";
import { FEEL_FX_SPEC } from "./specs/combat";
import { handWrittenResidue, schemaToForm } from "./schemaToForm";
import type { ConfigDocSpec } from "./engine";

const reasonsOf = (spec: ConfigDocSpec): string[] =>
  [...new Set(handWrittenResidue(spec).flatMap((r) => r.reasons))].sort();

describe("schemaToForm", () => {
  it("⭐ 結構逐格相等：speed-growth-tiers 的 23 格路徑與順序由 Zod 推導得出", () => {
    const derived = schemaToForm(SPEED_GROWTH_TIERS_SPEC.zod);
    // ⚠️ 母體不可以是 0（失敗形態⑥：壞掉的走訪對任何 spec 都是綠的）。
    expect(SPEED_GROWTH_TIERS_SPEC.fields.length).toBeGreaterThan(20);
    expect(derived.fields.map((f) => f.path)).toEqual(
      SPEED_GROWTH_TIERS_SPEC.fields.map((f) => f.path),
    );
    // 分組也是推導的：頂層三格 + 兩把梯子 × 兩條軸。
    expect(derived.groups.map((g) => g.key)).toEqual([
      "",
      "growth.A.ms",
      "growth.A.as",
      "growth.B.ms",
      "growth.B.as",
    ]);
    // 說明從 `.describe()` 來 —— 23/23 都拿得到，⛔ 不是「大部分」。
    expect(derived.fields.filter((f) => f.note).length).toBe(derived.fields.length);
  });

  it("⭐ 量尺兩個方向都驗過：有 describe 與沒有 describe 的欠帳不一樣", () => {
    // 已知「有」：23 格全部有 `.describe()` ⇒ `note` 不在欠帳裡，只欠短名與選項中文。
    expect(reasonsOf(SPEED_GROWTH_TIERS_SPEC)).toEqual(["optionLabels", "zh"]);
    // 已知「沒有」：feel-fx 的 38 格一個 `.describe()` 都沒有 ⇒ `note` 必須出現。
    expect(reasonsOf(FEEL_FX_SPEC)).toEqual(["note", "zh"]);
    expect(handWrittenResidue(FEEL_FX_SPEC).length).toBe(FEEL_FX_SPEC.fields.length);
  });

  it("⭐ 缺的標籤實作得出來：@zh / @note / @opt 貼上去就推導得到整格", () => {
    const adopted = zConfigSpeedGrowthTiersDoc.extend({
      ladder: zConfigSpeedGrowthTiersDoc.shape.ladder.describe(
        "@zh 用哪一把梯子\n" +
          "@note owner 2026-08-21 給的兩個候選，出貨 {{出貨值}}。\n" +
          "@opt A A（預設・保守）\n" +
          "@opt B B（激進）",
      ),
    });
    const row = schemaToForm(adopted).fields.find((f) => f.path === "ladder");
    expect(row).toEqual({
      path: "ladder",
      zh: "用哪一把梯子",
      note: "owner 2026-08-21 給的兩個候選，出貨 {{出貨值}}。",
      optionLabels: { A: "A（預設・保守）", B: "B（激進）" },
      group: "",
      order: 1,
    });
  });
});
