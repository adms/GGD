/**
 * ⭐ `cosDeg` 的守衛 —— 它替換掉的是 sim 裡**唯一**的三角函式呼叫，
 * 而那一格決定「敵人在不在我正面」⇒ 它錯了，兩台機器會打出不同的一場。
 *
 * ⚠️ 這一支只問一件事：**它算得對，而且在定義域外也算得對** ——
 * 第一版只規約到 π，`cosDeg(360)` 誤差 **1.35e-7**，而呼叫端今天不會傳 360
 * ⇒ ⭐ **那個錯永遠不會有人發現**。所以掃的範圍刻意是 −720…720，⛔ 不是 0…180。
 *
 * ⛔ 這裡**不再**加一條「原始碼裡沒有 Math.cos」——那是 `sim/purity.test.ts` 的工作，
 *   而同一件事寫兩個角度是第零守則點名的浪費。
 */
import { describe, it, expect } from "vitest";
import { cosDeg } from "./cosDeg";

describe("cosDeg：決定性的 cos(度數)", () => {
  it("−720…720 度逐點對 Math.cos，誤差 < 1e-11", () => {
    let worst = 0, at = 0;
    for (let d = -720; d <= 720; d += 0.125) {
      const e = Math.abs(cosDeg(d) - Math.cos((d * Math.PI) / 180));
      if (e > worst) { worst = e; at = d; }
    }
    expect(worst, `最大誤差在 ${at} 度`).toBeLessThan(1e-11);
  });

  it("非有限輸入回 NaN（⛔ 不是靜靜回 1）", () => {
    expect(cosDeg(Number.NaN)).toBeNaN();
    expect(cosDeg(Number.POSITIVE_INFINITY)).toBeNaN();
  });
});
