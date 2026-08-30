import { describe, expect, it } from "vitest";
import { z } from "zod";
import { findNonFiniteNumbers } from "./finiteNumbers";
import { validateDoc } from "./loader";

/**
 * ⛔⛔ **`Infinity` 過得了 Zod 的每一道界，⛔ 只有 `.max()` 例外。**
 *
 * ⭐ 2026-08-30 對抗式稽核量到：出貨 schema 有 **861 個 `z.number()`**，
 * 其中 **245 個（28%）沒有 `.max()`** ⇒ 那 245 格今天收得下 `Infinity`。
 *
 * ⚠️ ⭐ 而 JSON 送得進來：`JSON.parse("1e400")` **就是 `Infinity`**
 * （⛔ 不需要特殊語法，一個很大的數字字面值就夠了）。
 *
 * ⇒ ⭐ 修法是**門口一道檢查**，⛔ 不是 245 次 `.max()`：
 * · 逐格加 245 個上界 ＝ ⭐ **245 個要挑的數字**，而每一個都得引用得到出處（第一守則）
 * · ⭐ 而「這個數字要多大」（**平衡**，owner 的）與「它不可以是無限大」（**正確性**，
 *   永遠成立）是兩個不同的問題 —— 這裡只回答後者
 */

describe("內容裡的數字必須是有限的", () => {
  it("⭐ 量尺先自證：Zod 的其他界真的擋不住 Infinity", () => {
    // ⭐ 這一條釘住的是**這條檢查存在的理由** —— ⛔ 哪天 Zod 改了行為，它要紅
    expect(z.number().safeParse(Infinity).success, "z.number() 已經擋得住 Infinity 了？").toBe(true);
    expect(z.number().positive().safeParse(Infinity).success, ".positive() 已經擋得住了？").toBe(true);
    expect(z.number().min(0).safeParse(Infinity).success, ".min(0) 已經擋得住了？").toBe(true);
    // ⭐ 只有 .max() 擋得住
    expect(z.number().max(1e6).safeParse(Infinity).success).toBe(false);
    // ⭐ NaN 本來就被擋（⇒ 這條檢查主要是為了 Infinity）
    expect(z.number().safeParse(NaN).success).toBe(false);
    // ⚠️ ⭐ 而 JSON 真的送得進來
    expect(JSON.parse("1e400") as number).toBe(Infinity);
  });

  it("⭐ 掃描器兩個方向都準", () => {
    // 正方向：藏在三層底下的也要抓到，⭐ 而且路徑指得出來
    const hits = findNonFiniteNumbers({ a: [{ b: { c: Infinity } }] });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.path).toBe("a.0.b.c");
    expect(hits[0]?.value).toBe("Infinity");
    // 反方向：正常的文件⛔不可以被抓到
    expect(findNonFiniteNumbers({ a: [1, 2, 3], b: { c: 0, d: -5.5 } })).toEqual([]);
    // ⭐ NaN 與 -Infinity 也要抓
    expect(findNonFiniteNumbers({ x: NaN })[0]?.value).toBe("NaN");
    expect(findNonFiniteNumbers({ x: -Infinity })[0]?.value).toBe("-Infinity");
    // ⚠️ ⭐ 它自己不可以被一份深度巢狀的文件弄爆（⛔ 那正是我們剛修掉的那個病）
    let deep: unknown = 1;
    for (let i = 0; i < 5000; i++) deep = { n: deep };
    expect(() => findNonFiniteNumbers(deep)).not.toThrow();
  });

  it("★ 帶 Infinity 的文件被 `validateDoc` 拒絕，⭐ 而且說得出是哪一格", () => {
    // ⭐ 走**出貨的**那條路（`validateDoc` 是 content-api 用的那一道門）
    const doc = {
      id: "probe-non-finite",
      schema: "config.gore@1",
      // ⭐ 一個真的會被 JSON 帶進來的值
      bloodScale: JSON.parse("1e400") as number,
    };
    const r = validateDoc("config", doc);
    expect(r.ok, "帶 Infinity 的文件通過了驗證 ⇒ ⛔ 門口那道檢查沒生效").toBe(false);
    if (!r.ok) {
      const msg = r.issues.map((i) => `${i.path}: ${i.message}`).join("\n");
      expect(msg, "訊息裡沒有指名那一格").toContain("bloodScale");
      expect(msg).toContain("非有限");
    }
  });
});
