/**
 * ⭐ GH#741（舊 #44）—— **命中特效的收尾預算，逐級距。**
 *
 * `HitSpark.doneAfterMs` 由 `smoke.lifetimeSec.max` 驅動，而在 2026-08-27 之前
 * 三個級距**共用** `{min:0.4, max:0.6}` ⇒ 最輕的普攻也被綁到 ~600ms
 * （`flashLife` / `sparkLife` 早就分級了，⭐ 只有面積最大的煙沒有）。
 *
 * ── ⛔ 這個檔不斷言任何出貨數字 ─────────────────────────────────────────────
 * 「light 是 0.3 秒」是**出貨值**（三個住處＋一格後台倍率），寫進斷言就是第四個住處。
 * 這裡驗的全部是**關係**：
 *   ① 每一級距的實際尾巴 ≤ 它自己的預算（兩個都是 module 匯出的東西）
 *   ② 分級真的存在（輕 < 重 < EX，⛔ 不是三個一樣）
 *   ③ 純函式 `impactTailMs` 與 `HitSpark.doneAfterMs` 的**公式**一致
 *      （⛔ 兩個住處 = 下一次改動時它們會分岔，而畫面上看不出來）
 *   ④ 後台倍率**兩個方向**都量得到（⭐ 一把只驗過單邊的尺不算自證過）
 */
import { describe, expect, it, afterEach } from "vitest";
import {
  IMPACT_TAIL_BUDGET_MS,
  IMPACT_TINTS,
  impactRecipe,
  impactSmokeLifeScale,
  impactTailMs,
  setImpactSmokeLifeScale,
  type ImpactIntensity,
} from "./vfxPresets";

const TIERS: readonly ImpactIntensity[] = ["light", "heavy", "ex"];

afterEach(() => setImpactSmokeLifeScale(undefined)); // 每一條都從出貨值開始

describe("GH#741 命中特效的收尾預算", () => {
  it("⭐ 每一級距的**實際**尾巴都在它自己的預算內", () => {
    const over = TIERS.filter((t) => impactTailMs(t) > IMPACT_TAIL_BUDGET_MS[t]);
    expect(over, "這幾級的命中特效超出收尾預算").toEqual([]);
  });

  it("⭐ 分級真的存在：輕 < 重 < EX（⛔ 不是三個共用一個常數）", () => {
    expect(impactTailMs("light")).toBeLessThan(impactTailMs("heavy"));
    expect(impactTailMs("heavy")).toBeLessThan(impactTailMs("ex"));
  });

  it("⭐ 純函式與 `HitSpark.doneAfterMs` 的公式**同一個** —— ⛔ 不是第二個住處", () => {
    for (const t of TIERS) {
      const r = impactRecipe(t, IMPACT_TINTS.physical);
      // `HitSpark` 逐字：Math.max(recipe.smoke.lifetimeSec.max * 1000, recipe.ring?.lifeMs ?? 0)
      const doneAfterMs = Math.max(r.smoke.lifetimeSec.max * 1000, r.ring?.lifeMs ?? 0);
      expect(impactTailMs(t), `${t} 的兩個公式對不起來`).toBeCloseTo(doneAfterMs, 6);
      // 煙的 min 不可以超過 max（一個倒過來的區間在 Babylon 上是未定義行為）
      expect(r.smoke.lifetimeSec.min).toBeLessThanOrEqual(r.smoke.lifetimeSec.max);
      // ⛔ 靜態不可見的四種之一：壽命 0 的粒子等於沒有粒子
      expect(r.smoke.lifetimeSec.max).toBeGreaterThan(0);
    }
  });

  it("⭐ 後台倍率**兩個方向**都量得到（⛔ 只驗一邊 = 這把尺沒有自證過）", () => {
    const base = impactTailMs("light");
    setImpactSmokeLifeScale(2);
    expect(impactSmokeLifeScale()).toBe(2);
    expect(impactTailMs("light"), "調大之後尾巴沒有變長 —— 這一格接錯了").toBeGreaterThan(base);
    setImpactSmokeLifeScale(0.5);
    expect(impactTailMs("light"), "調小之後尾巴沒有變短 —— 同一個洞的另一邊").toBeLessThan(base);
    // 認不得的值 = 1（出貨），⛔ 不是 0（煙整層消失看起來像「壞了」）
    setImpactSmokeLifeScale(Number.NaN);
    expect(impactSmokeLifeScale()).toBe(1);
    expect(impactTailMs("light")).toBeCloseTo(base, 6);
  });
});
