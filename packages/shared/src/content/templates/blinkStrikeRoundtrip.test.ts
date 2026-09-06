/**
 * ⭐⭐ **瞬移突斬這塊積木真的表達得出出貨的那一支**（GH#916）。
 *
 * ⛔⛔ 在 2026-09-02 之前 `tpl-blink-strike` 是一份 **`params: {}` 的空殼**
 * （`status: "draft"`，`isExpandable("blink-strike")` 回 **false**）
 * ⇒ ⭐ 對外部編輯器來說這塊積木**不存在**，
 * 而樹上有 **5 支**技能各自手刻同一個形狀。
 *
 * ⚠️ ⭐ 這一支驗的是 **diff=0 roundtrip**（`instant-blast` 註解裡那個說法）：
 * 模板用**預設值**展開出來的 `effects`，與出貨的 `godie-n01c.w` 逐位元相同。
 * ⛔ 那比「模板有 params」強得多 —— 一份參數填滿卻展開出別的東西的模板，
 * 在編輯器裡看起來完全正常，而它產出的技能與作者手上那一支不是同一個。
 *
 * ⭐ 而每一格預設都**引用得到出處**（第一守則規矩 5）：
 * `stopShortUnits: 1.8` 是出貨 4/5 支的逐位元值 · `damage` 三支全是
 * `damageTier:"小"` ＋ `coeff 0.5` · `range` 取中位數 6。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { expandStackOrThrow, isExpandable } from "./expand";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8")) as Record<string, unknown>;

const TPL = read("content/ability-templates/tpl-blink-strike.json");
/** ⭐ 出貨那一支 —— 量到「最接近預設」的那一份（⛔ 不是我造的夾具）。 */
const SHIPPED = read("content/abilities/godie-n01c.w.json");
// ⭐ GH#993（2026-09-06）：出貨那一支已經改成 `template` 引用（templatize.py）⇒ 「出貨的 effects」
//   是它的 params 展開出來的；⛔ 不是 `effects: []` 那個空陣列。
const SHIPPED_TPL = SHIPPED["template"] as { ref: string; params: Record<string, unknown> } | undefined;
const SHIPPED_EXPANDED = SHIPPED_TPL
  ? (expandStackOrThrow([{ template: TPL, params: SHIPPED_TPL.params }] as never) as { effects: unknown; range?: number; castType: string })
  : undefined;
const SHIPPED_EFFECTS = SHIPPED_EXPANDED ? SHIPPED_EXPANDED.effects : SHIPPED["effects"];
const SHIPPED_RANGE = SHIPPED_EXPANDED?.range ?? SHIPPED["range"];
const SHIPPED_CAST_TYPE = SHIPPED_EXPANDED?.castType ?? SHIPPED["castType"];

describe("瞬移突斬積木（GH#916）", () => {
  it("⭐ 引擎認得這個家族（⛔ 在此之前 `isExpandable` 回 false ⇒ 積木不存在）", () => {
    expect(isExpandable("blink-strike"), "⛔ FAMILIES 裡沒有它 ⇒ 編輯器看不到這塊積木").toBe(true);
    expect(TPL.status, "⛔ 還是 draft ⇒ 對面不會拿它來拼").toBe("enabled");
    expect(
      Object.keys(TPL.params as object).length,
      "⛔ 空殼（params: {}）—— 一格參數都沒有的模板什麼都表達不了",
    ).toBeGreaterThan(3);
  });

  it("★★ ⭐ **diff=0 roundtrip**：預設展開 ≡ 出貨的 `godie-n01c.w`", () => {
    const out = expandStackOrThrow([{ template: TPL, params: {} }] as never) as {
      effects: unknown;
      range?: number;
      castType: string;
    };
    expect(
      JSON.stringify(out.effects),
      "⛔ 展開出來的不是出貨那一支 —— ⭐ 模板在編輯器裡看起來正常，" +
        "而它產出的技能與作者手上那一支不是同一個",
    ).toBe(JSON.stringify(SHIPPED_EFFECTS));
    // ⭐ `range` 是 2026-09-02 才加進 `ExpandResult` 的：在此之前模板**表達不了**
    //   施法距離，而「瞬移到目標身邊」這一族的距離就是它的定義。
    expect(out.range, "⛔ 施法距離沒有跟著展開出來 ⇒ 那一格 param 是空宣稱").toBe(SHIPPED_RANGE);
    expect(out.castType).toBe(SHIPPED_CAST_TYPE);
  });

  it("⭐ 參數真的轉得動（⛔ 一個寫死的展開器也會通過上面那條）", () => {
    const out = expandStackOrThrow([
      { template: TPL, params: { range: 9, stopShortUnits: 0.5, damageType: "magic" } },
    ] as never) as { effects: { onArrive?: unknown[]; stopShortUnits?: number }[]; range?: number };
    expect(out.range).toBe(9);
    expect(out.effects[0]!.stopShortUnits).toBe(0.5);
    const dmg = (out.effects[0]!.onArrive as { kind: string; damageType?: string }[]).find(
      (e) => e.kind === "damage",
    );
    expect(dmg?.damageType).toBe("magic");
  });
});
