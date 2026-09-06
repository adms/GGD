/**
 * `schemaToForm()` / `derivedFields()` 的承重守衛（GH#992 Scope 1）。
 *
 * ⭐ 四條，各回答一個**不同**的問題：
 *  ① **結構**：推導出來的欄位與 `speed-growth-tiers` 那份 spec 手寫的**逐格相等**
 *     （路徑 + 順序，23/23）。⛔ 它綠了才代表「推導」取代得了「手寫」的骨架。
 *  ② **兩個方向的校準**（CLAUDE.md「一把只驗過單邊的尺不算自證過」）：拿一份
 *     **有** `.describe()` 的與一顆**刻意沒有**的葉子各跑一次，欠帳清單要**不一樣**。
 *     ⚠️ 「沒有」那一邊是**合成的**（`shape.enabled.describe("")`）—— 2026-09-06 第二批
 *     把 feel-fx 的 38 格搬進 Zod 之後，出貨裡已經沒有一份「一個 describe 都沒有」的
 *     文件可以當對照組，⛔ 而一個會隨遷移進度消失的對照組不是對照組。
 *  ③ **標籤真的做得到**：把 `@zh` / `@note` / `@opt` 貼到一顆**出貨的** Zod 節點上，
 *     推導結果逐鍵 deep-equal。⛔ 這一條不是虛構夾具 —— schema 取自出貨文件本身。
 *  ④ ⭐ **拿掉一個 Zod 欄位 ⇒ 表單少一格**（票文的驗收條件）：`derivedFields()` 是
 *     今天 40+ 份 spec 的 `fields[]` 的**唯一**來源，它若把欄位數與 schema 脫鉤
 *     （例如快取、或退回一份手寫表），後台會多畫／少畫一格而沒有任何東西紅。
 *     同一條也驗覆寫**合併進同一格**而不是變成第二筆（`configForms.test.ts` 的
 *     「恰好一筆」靠它）。
 *
 * MUTATION（2026-09-06 驗過，接線類一次）：`derivedFields()` 的 `{ ...f, ...o }` 改成
 * `f`（覆寫不合併）⇒ ④ 紅（pattern 沒有進到那一格）。
 */
import { describe, it, expect } from "vitest";
import { zConfigGamepadDoc, zConfigSpeedGrowthTiersDoc } from "@ggd/shared/content/schema/config";
import { SPEED_GROWTH_TIERS_SPEC } from "./specs/tiers";
import { GAMEPAD_SPEC } from "./specs/ops";
import { derivedFields, handWrittenResidue, schemaToForm } from "./schemaToForm";
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
    // 已知「有」：speed-growth-tiers 的 23 格全部有 `.describe()`。
    // ⚠️⚠️ 這一行在 2026-09-07 之前寫的是 `["optionLabels", "zh"]` —— 那時 `enabled`
    //   與 `ladder` 兩格還欠著 `@zh`／`@opt`。GH#992 把它們搬進 Zod 之後這裡**歸零**，
    //   ⭐ 而那正是這一條該有的樣子：一份**整份都推導得出來**的 spec 欠帳是空的。
    //   ⛔ 不要把它改回「還有幾格」來讓它綠 —— 那是一條靠缺陷才綠的守衛。
    expect(reasonsOf(SPEED_GROWTH_TIERS_SPEC)).toEqual([]);
    // 已知「沒有」：同一份 schema 多長一顆**刻意沒有描述**的葉子 ⇒ `note` 必須出現。
    const probe = zConfigSpeedGrowthTiersDoc.extend({
      probe: zConfigSpeedGrowthTiersDoc.shape.enabled.describe(""),
    });
    const bare: ConfigDocSpec = {
      ...SPEED_GROWTH_TIERS_SPEC,
      zod: probe,
      fields: [{ path: "probe", zh: "探針", note: "一顆刻意沒有描述的葉子，用來校準量尺的另一邊。" }],
    };
    expect(handWrittenResidue(bare)).toEqual([{ path: "probe", reasons: ["zh", "note"] }]);
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

  it("⭐ 拿掉一個 Zod 欄位 ⇒ 表單少一格；覆寫合併進同一格而不是第二筆", () => {
    // 出貨那一份：gamepad 的 `fields[]` 今天就是 derivedFields() 的輸出。
    const full = derivedFields(zConfigGamepadDoc);
    expect(full.length).toBe(GAMEPAD_SPEC.fields.length);
    expect(full.some((f) => f.path === "deadzone")).toBe(true);
    // 拿掉一格 ⇒ 正好少一格，而且少的就是那一格（⛔ 不是總數碰巧相等）。
    const fewer = derivedFields(zConfigGamepadDoc.omit({ deadzone: true }));
    expect(fewer.length).toBe(full.length - 1);
    expect(fewer.map((f) => f.path)).toEqual(full.map((f) => f.path).filter((p) => p !== "deadzone"));
    // 覆寫：同一路徑的 pattern 併進同一格，zh/note 仍然來自 Zod，格數不變。
    const merged = derivedFields(zConfigGamepadDoc, [{ path: "deadzone", pattern: /^0\.\d+$/, patternError: "零點幾" }]);
    expect(merged.length).toBe(full.length);
    const row = merged.find((f) => f.path === "deadzone")!;
    expect(row.pattern).toEqual(/^0\.\d+$/);
    expect(row.zh).toBe(full.find((f) => f.path === "deadzone")!.zh);
  });
});
