/**
 * ⭐ `common.ts` ↔ `condition.ts` 的 import 迴圈閘（GH#936）。
 *
 * `zScaling.ratios[].when` 讓 `common.ts` 去 import `condition.ts`，而
 * `condition.ts` 在**自己的模組本體裡**就呼叫 `zRef(...)`。⇒ 兩個檔互相依賴，
 * 而 ESM 依相依宣告的**原始碼順序**求值 ⇒ 誰先被 import 決定會不會炸。
 *
 * ⚠️ **量到的，⛔ 不是推測**（2026-09-02 探針）：`zRef` 還是 `common.ts` 的
 * local const 時，先 import `common` ⇒ `TypeError: zRef is not a function`，
 * 整個 content schema 層在 import 時就死。修法是 `zRef` 一族搬到 `./ref`
 * 並由 `common.ts` **re-export**（re-export 在連結期解析，沒有 TDZ）。
 *
 * ⛔ 為什麼不是「掃 common.ts 有沒有那一行」（失敗形態⑥）：那條 grep 對
 * 「順序對調」是綠的，而順序正是這裡唯一會壞的東西。⇒ 這裡**兩個方向各真的
 * 先 import 一次**（`vi.resetModules()` 清掉快取），問的是行為。
 *
 * ── 突變紀錄（實跑）──────────────────────────────────────────────────────
 * M2 把 `common.ts` 的 `export * from "./ref";` 移到 `import … "./condition"`
 *    **下面** → ①「先 import common」FAIL（TypeError: zRef is not a function）；
 *    ② 仍綠 —— ⭐ 那正是「只驗一個方向會漏掉什麼」的證據。
 */
import { describe, it, expect, vi } from "vitest";

describe("schema import 迴圈：兩個方向都要活著", () => {
  it("★ ① 先 import ./common（⭐ 這是會炸的那個方向）", async () => {
    vi.resetModules();
    const common = await import("./common");
    expect(typeof common.zRef, "zRef 必須在 condition.ts 求值前就備好").toBe("function");
    expect(common.zScaling.safeParse({
      ratios: [{ stat: "ap", coeff: 1, when: { kind: "status", subject: "self", statusId: "sunder" } }],
    }).success, "when 要吃得下真的 condition union").toBe(true);
  });

  it("★ ② 先 import ./condition", async () => {
    vi.resetModules();
    const cond = await import("./condition");
    expect(cond.zEffectCondition.safeParse({ kind: "status", subject: "self", statusId: "sunder" }).success).toBe(true);
  });
});
