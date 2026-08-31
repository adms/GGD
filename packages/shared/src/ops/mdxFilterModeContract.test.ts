import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ⭐⭐ GH#841 —— **MDX 的七種 filter mode 都要有明確分支，⛔ 而且不可以靜默退回**。
 *
 * ── 為什麼這條閘存在 ────────────────────────────────────────────────────────
 * 票文量到的原始缺陷：對照表**只有 4/7 條分支** ⇒ 56 個 MASK 切不掉、
 * 70 個材質疊加層**靜默消失**、Modulate 語意反向。
 * ⭐ 2026-08-31 複驗：`gltf.py` 今天 **0–6 全 7 條都在**，且表外的值退回 BLEND **並列名**。
 * ⇒ ⛔ 實質已經修好，⭐ **而沒有任何東西守它** —— 下一次重構刪掉一條分支，
 *   症狀會是「某一族材質靜靜地變成不透明」，而**沒有任何測試會紅**。
 *
 * ── ⛔ 為什麼這一條是**靜態**的，⛔ 不是逐 texel 掃描 ──────────────────────
 * 票文的 ③ 要「對材質斷言 UV 覆蓋的不透明黑 ≤2%」—— ⭐ 那是**產線的驗收**，
 * 要解 glb 貼圖、要跑影像。⚠️ 而第零守則⑦逐字：測試行數 ≤ 實作行數。
 * ⇒ ⭐ 這一條守的是**會靜默腐爛的那一半**（分支數 ＋ 不靜默），
 *   ⛔ 逐 texel 的驗收留給產線重跑那一批（票文的 ④）。
 */
describe("GH#841 MDX filter mode 對照表", () => {
  const src = readFileSync(
    resolve(__dirname, "../../../../tools/w3x-import/w3xlib/gltf.py"),
    "utf8",
  );

  /** 表裡真的宣告了哪幾個 fm（讀原始碼的 `<n>: FilterMode(` 那一行）。 */
  const declared = [...src.matchAll(/^\s{4}(\d):\s*FilterMode\(/gm)].map((m) => Number(m[1]));

  it("量尺先自證：切得到那張表（⛔ 解析壞了下面兩條會空過）", () => {
    expect(src).toContain("MDX_FILTER_MODES");
    expect(declared.length).toBeGreaterThan(0);
  });

  it("⭐ 七種 fm（0–6）**每一種都有明確分支**", () => {
    const missing = [0, 1, 2, 3, 4, 5, 6].filter((n) => !declared.includes(n));
    expect(
      missing,
      `⛔ 這幾個 MDX filter mode 沒有分支：${missing.join(", ")}\n` +
        `⚠️ 症狀不會是錯誤 —— 是某一族材質**靜靜地**翻錯（票文量到 56 個 MASK 切不掉、70 個疊加層消失）。`,
    ).toEqual([]);
  });

  it("★ ⭐ 表以外的值**不靜默** —— 退回最保守的 BLEND 並**列名**", () => {
    expect(src, "⛔ 少了 UNKNOWN_FILTER_MODE ⇒ 一個沒見過的 fm 會拿到 undefined").toContain(
      "UNKNOWN_FILTER_MODE",
    );
    // ⭐ 承重：`.get(fm, UNKNOWN_FILTER_MODE)` 的第二個參數 —— 少了它就是 KeyError 或 None。
    expect(src).toMatch(/MDX_FILTER_MODES\.get\(fm,\s*UNKNOWN_FILTER_MODE\)/);
    // ⭐ 「列名」是這條規矩的一半（fail-open 沒錯，靜默才是缺陷）。
    expect(src).toMatch(/不要假裝翻譯過了|列名/);
  });
});
