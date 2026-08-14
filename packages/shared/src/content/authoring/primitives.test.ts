/**
 * ⭐【編譯器指紋真的蓋住 primitive 登錄表】
 *
 * 指紋的**全部**用途是：對方拿它跟自己的比，一樣才代表「我們對這批技能的理解
 * 相同」。所以唯一要守的性質是 —— **表變了指紋要變**。
 *
 * ⚠️ 這條守的是那個性質，⛔ 不是「指紋等於 0a7d1344」：
 * 把出貨指紋抄進斷言 = 第二個住處，而且它**每加一個 primitive 就紅**，
 * 用一個完全誤導的訊息（「指紋壞了」，真相是「你加了東西，這是對的」）。
 *
 * 突變紀錄：把 `compilerFingerprint()` 的 `surface` 改成只 hash
 * `contractVersion`（也就是計畫 §3.1 點名的「只 hash 一小份 surface object」）
 * → 前兩條紅。改回來即綠。
 */
import { describe, it, expect } from "vitest";
import {
  COMPILER_BUDGETS,
  COMPILER_CONTRACT_VERSION,
  COMPILER_PRIMITIVES,
  compilerFingerprint,
  hasPrimitive,
  primitiveKeys,
} from "./primitives";

describe("編譯器 primitive 登錄表與指紋 (GH#327 B 群)", () => {
  it("⭐ 指紋是 primitive 表的函式 —— 加一個 op 而指紋不動 = 兩邊行為已經不同卻沒人叫", () => {
    const before = compilerFingerprint();
    // 模擬「有人加了一個 op」：直接在凍結陣列的副本上加一筆，重算同一個 surface。
    const surfaceWith = (extra: string[]): string =>
      JSON.stringify({
        contractVersion: COMPILER_CONTRACT_VERSION,
        primitives: [
          ...COMPILER_PRIMITIVES.map((d) => `${d.kind}:${d.key}:${d.since}`),
          ...extra,
        ].sort(),
        runtimeOutputs: ["ability@1", "champion@1", "item@1"],
        budgets: Object.entries(COMPILER_BUDGETS)
          .map(([k, v]) => `${k}=${String(v)}`)
          .sort(),
      });
    expect(
      surfaceWith([]),
      "指紋的輸入沒有包含 primitive 表 —— 那就只是在 hash 一個版本號",
    ).toContain("expr.formula@1");
    expect(surfaceWith(["expression:expr.evil@1:1.0.0"])).not.toBe(surfaceWith([]));
    expect(before).toHaveLength(8);
  });

  it("⭐ 預算也在指紋裡 —— 兩邊上限不同 = 同一份 Definition 一邊過一邊不過", () => {
    const s = JSON.stringify({
      budgets: Object.entries(COMPILER_BUDGETS).map(([k, v]) => `${k}=${String(v)}`),
    });
    expect(s).toContain("maxNodes");
    expect(s).toContain("maxExpandedBytes");
  });

  it("規格 §3.2 點名的 expression／control 一個不少（⛔ 也不多）", () => {
    // ⚠️ 斷言的是**規格點名的那幾個**，不是數量 —— 數量會隨版本長，名字不會。
    expect(primitiveKeys("expression")).toEqual([
      "expr.formula@1",
      "expr.ifPresent@1",
      "expr.list@1",
      "expr.literal@1",
      "expr.map@1",
      "expr.object@1",
      "expr.param@1",
      "expr.switch@1",
      "expr.unitConvert@1",
    ]);
    expect(primitiveKeys("control")).toEqual([
      "step.ifContext@1",
      "step.invokePort@1",
      "step.selectTargets@1",
      "step.sequence@1",
    ]);
  });

  it("⚠️ 沒登記的 key 一律查不到（fail-closed 的那一半）", () => {
    expect(hasPrimitive("expr.literal@1")).toBe(true);
    expect(hasPrimitive("expr.eval@1"), "沒登記的 op 竟然查得到 —— 求值器會放它過").toBe(false);
    expect(hasPrimitive("")).toBe(false);
  });

  it("⚠️ 每一筆都有非空的 note 與 since（相容性協商靠它們）", () => {
    for (const d of COMPILER_PRIMITIVES) {
      expect(d.note.length, `${d.key} 沒有說明`).toBeGreaterThan(4);
      expect(d.since, `${d.key} 沒有 since`).toMatch(/^\d+\.\d+\.\d+$/);
    }
    // key 不可以重複 —— 重複代表有人複製貼上忘了改，而後來的那筆會蓋掉前一筆。
    const keys = COMPILER_PRIMITIVES.map((d) => d.key);
    expect(new Set(keys).size, "primitive key 有重複").toBe(keys.length);
  });
});
