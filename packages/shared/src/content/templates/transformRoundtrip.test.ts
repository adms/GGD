/**
 * ⭐⭐ **變身這塊積木真的表達得出出貨的那幾支**（GH#1067）。
 *
 * ⛔⛔ 在 2026-09-07 之前 `expand.ts` 的 **35 個家族沒有任何一個發 `championForm`**
 * ⇒ 24 支帶變身的手寫技能對編輯器來說**沒有積木可拼**，而它們是 GH#993 需求側普查的第 3／4 名形狀。
 *
 * ⚠️ 三條，⛔ 沒有一條靠讀散文：
 *  ① diff=0 roundtrip —— 出貨 `godie-ofar.r`（58-04，最單純的一支）的 params 展開 ≡ 它**轉換前**的手寫
 *    `effects`（帳本 `templatize-ledger.json` 那一筆的 `before`）。
 *    ⚠️ ⛔ **不是**「預設值展開 ≡ 出貨那一支」：`durationSec`／`castTimeSec` 是 optional 槽，
 *    而 `has()` 對 optional 槽**不吃 default**（那是編輯器的預填建議，⛔ 不是 fallback）——
 *    ⇒ 空 params 展開出來是「永不逾時的變身」，那是**對的**（4 支 toggle 就是這個形狀）。
 *  ② ⭐ **兩格 optional 槽真的可以清空**：沒有 `modifiers` ⇒ 真的不發 `applyBuff`
 *    （出貨 9 支純變身就是這樣）；填了 ⇒ 才發，而且 `buffDurationSec` 與變身長度**各走各的**
 *    （出貨 90-002 變身 18 秒／加成 6 秒）。⛔ 這一條是**承重**的：把 optional 改成無條件發，
 *    純變身那幾支的等價閘會紅。
 *  ③ 家族真的被引擎認得（`isExpandable`）＋ 模板不是 draft 空殼。
 *
 * ⛔ 逐位元等價由 `templatizeEquivalence.test.ts` 逐支證明（12 支），⛔ 這裡不重複那一件事。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { expandStackOrThrow, isExpandable } from "./expand";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), "utf8")) as Record<string, unknown>;

const TPL = read("content/ability-templates/tpl-transform.json");
type Expanded = { effects: { kind: string; [k: string]: unknown }[]; castType: string };
const expand = (params: Record<string, unknown>): Expanded =>
  expandStackOrThrow([{ template: TPL, params }] as never) as unknown as Expanded;

/** ⭐ 出貨那一支的 params（它已經接上模板了）＋ 帳本裡「轉換前」的手寫 effects。 */
const SHIPPED = read("content/abilities/godie-ofar.r.json");
const SHIPPED_BINDING = SHIPPED["template"] as { ref: string; params: Record<string, unknown> };
const LEDGER = read("tools/skill-remake/templatize-ledger.json")["entries"] as Record<
  string,
  { ref: string; before: { effects: unknown } }
>;

describe("變身積木（GH#1067）", () => {
  it("⭐ 引擎認得這個家族（⛔ 在此之前 `isExpandable(\"transform\")` 回 false）", () => {
    expect(isExpandable("transform"), "⛔ FAMILIES 裡沒有它 ⇒ 編輯器看不到這塊積木").toBe(true);
    expect(TPL["status"], "⛔ 還是 draft ⇒ 對面不會拿它來拼").toBe("enabled");
  });

  it("★★ ⭐ **diff=0 roundtrip**：出貨 `godie-ofar.r`（58-04）的 params 展開 ≡ 它轉換前的手寫 effects", () => {
    expect(SHIPPED_BINDING.ref, "出貨那一支要真的接在這個家族上").toBe("tpl-transform");
    const before = LEDGER["godie-ofar.r"]!.before.effects;
    const out = expand(SHIPPED_BINDING.params);
    expect(
      JSON.stringify(out.effects),
      "⛔ 展開出來的不是轉換前那一支 —— 模板在編輯器裡看起來正常，而它產出的技能不是同一個",
    ).toBe(JSON.stringify(before));
    expect(out.castType).toBe("self");
    // 空 params ＝ 永不逾時的變身（toggle 那一族的形狀），⛔ 不是「壞掉的預設」。
    expect(expand({}).effects).toEqual([{ kind: "championForm", to: "alternate" }]);
  });

  it("★ ⭐ 承重：`增益` 清空 ⇒ 真的不發 applyBuff；填了 ⇒ 兩個長度各走各的", () => {
    // 純變身（出貨 9 支）—— ⛔ 不可以冒出一個什麼都不做的 applyBuff（第一·五守則）。
    expect(expand({ to: "alternate", durationSec: 8 }).effects.map((e) => e.kind)).toEqual([
      "championForm",
    ]);
    // 變身＋增益（出貨 11 支）—— 90-002 妙蛙花：身體 18 秒、AD 加成只有 6 秒。
    const both = expand({
      to: "alternate",
      durationSec: 18,
      modifiers: [{ stat: "ad", op: "pctAdd", value: 0.35 }],
      buffDurationSec: 6,
    });
    expect(both.effects.map((e) => e.kind)).toEqual(["championForm", "applyBuff"]);
    expect(both.effects[0]!["durationSec"], "變身的長度").toBe(18);
    expect(both.effects[1]!["duration"], "⛔ 增益不可以跟著變身的長度走").toBe(6);
    // `toggle` 那四支：沒有 durationSec ⇒ 永不逾時。
    const toggle = expand({ to: "toggle", durationSec: null });
    expect(toggle.effects[0]!["to"]).toBe("toggle");
    expect(toggle.effects[0]!["durationSec"], "⛔ 清空了還發一個長度 = 變身會自己結束").toBeUndefined();
  });
});
