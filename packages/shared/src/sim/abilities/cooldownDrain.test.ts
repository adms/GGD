/**
 * GH#354 / G17 —— **冷卻流逝速度**（`Stat.CooldownDrainRate`）。
 *
 * #66 魔導鎧・零式「滿層後基礎技能冷卻流逝 ×1.5」、#61 閃耀金玉「×1.20」。
 *
 * ⛔ 它不是冷卻縮減：CDR 在**施放的那一刻**決定這一輪要等幾 tick，之後就是一個
 * 固定的數字；流逝速度是**持續**的，所以一份在冷卻**進行中**才掛上的增益立刻生效。
 * 第③條就是驗這個差別 —— 那是這條機制存在的唯一理由。
 *
 * 突變紀錄：`tickCooldowns` 的 `step()` 換回 `--`（＝只扣一格）
 * → 第②③條當場紅；改回。
 */
import { describe, it, expect } from "vitest";
import { cooldownDrainTicks } from "./abilitySystem";

/** 從 tick 0 跑 n 次，總共扣掉幾格。 */
function drained(rate: number, n: number): number {
  let sum = 0;
  for (let t = 0; t < n; t++) sum += cooldownDrainTicks(t, rate);
  return sum;
}

describe("冷卻流逝速度（GH#354 / G17）", () => {
  it("① ×1 = 今天：每 tick 剛好一格（⛔ 這條保證既有錄影逐位元不變）", () => {
    for (let t = 0; t < 50; t++) expect(cooldownDrainTicks(t, 1)).toBe(1);
  });

  it("★ ② N tick 內剛好扣掉 round(N × rate) 格 —— ⛔ 不累積漂移", () => {
    for (const rate of [1.2, 1.5, 2, 2.5, 3]) {
      for (const n of [10, 37, 300]) {
        // Bresenham 的定義域性質：總和 = floor(n × rate)。
        expect(drained(rate, n), `rate ${rate} / ${n} ticks`).toBe(Math.floor(n * rate));
      }
    }
  });

  it("③ 每一 tick 扣的是**整數**格，⛔ 不是小數（那一格會進 snapshot 與冷卻圈）", () => {
    for (const rate of [1.2, 1.5, 2.7]) {
      for (let t = 0; t < 60; t++) {
        const d = cooldownDrainTicks(t, rate);
        expect(Number.isInteger(d), `rate ${rate} tick ${t} → ${d}`).toBe(true);
        expect(d).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("★ ④ 慢速也扣得動：<1 的速度不會卡在原地永遠不好", () => {
    // 0.5 倍速 = 每兩 tick 扣一格。⚠️ 如果實作寫成 `floor(rate)` 就會恆為 0，
    // 而症狀是「這支技能永遠在冷卻」—— 畫面上跟「冷卻很長」一模一樣。
    expect(drained(0.5, 100)).toBe(50);
    expect(drained(0.5, 2)).toBe(1);
  });

  it("⑤ 0 或負數 = 冷卻凍結（⛔ 不是往回長）", () => {
    expect(cooldownDrainTicks(7, 0)).toBe(0);
    expect(cooldownDrainTicks(7, -2)).toBe(0);
  });

  it("⑥ 決定性：同一個 (tick, rate) 永遠同一個答案", () => {
    for (let t = 0; t < 40; t++) {
      expect(cooldownDrainTicks(t, 1.5)).toBe(cooldownDrainTicks(t, 1.5));
    }
  });
});
