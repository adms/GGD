/**
 * apDamageCurve.test.ts —— GH#1029 三段式法強乘數（owner 2026-09-06「#1029 改成「M=40 · K=400 · p=0.8」開票」）。
 * 驗收條件逐條：② 曲線值逐點對得上（票文那張表）· ③ 法強 ≤ K 逐位元等於今天 · ④ 斜率在 K 連續 ·
 * ⑤ 邊際收益永遠 > 0 · ⑥ p=1 逐位元回到今天 · ⑦ 決定性；外加：有理根與 Math.pow 的誤差 < 1e-9（測試檔不受純度閘管）。
 * 突變（靈魂層，一條承重）：`apCurveMult` 的 `ap > K` 條件改成 `ap >= 0` ⇒ ③ 紅。
 */
import { describe, it, expect } from "vitest";
import { DEFAULT_AP_DAMAGE_SCALING, apCurveMult, rationalPow, snapCurveP } from "./apDamageScaling";

const R = DEFAULT_AP_DAMAGE_SCALING;
const linear = (ap: number) => 1 + ap * R.rate;

describe("GH#1029 三段式法強乘數", () => {
  it("② 票文那張表逐點對得上（⛔ 不是近似）", () => {
    for (const [ap, want] of [[127, 1.64], [260, 2.3], [441, 3.2], [611, 4.01], [1931, 9.31], [3503, 14.69], [7123, 25.53], [9136, 31.04], [31874, 41.0], [37000, 41.0]] as const)
      expect(apCurveMult(ap, R), `法強 ${ap}`).toBeCloseTo(want, 2);
  });

  it("③ 法強 ≤ K 逐位元等於今天的直線；④ 斜率在 K 連續（差 < 1%）", () => {
    for (const ap of [1, 50, 127, 260, 399, 400]) expect(apCurveMult(ap, R)).toBe(linear(ap));
    const dBefore = apCurveMult(400, R) - apCurveMult(399, R);
    const dAfter = apCurveMult(401, R) - apCurveMult(400, R);
    expect(Math.abs(dAfter - dBefore) / dBefore, "⛔ 在 K 爆衝／斷崖").toBeLessThan(0.01);
  });

  it("⑤ 邊際收益永遠 > 0（拿掉上界看）；⑥ p = 1 逐位元回到直線；⑦ 決定性", () => {
    const noCap = { ...R, apCurveMaxMult: 0 };
    expect(apCurveMult(100100, noCap)).toBeGreaterThan(apCurveMult(100000, noCap));
    const flat = { ...R, apCurveP: 1, apCurveMaxMult: 0 }; // ⭐ rollback ＝ p=1（直線）＋ M=0（拿掉上界）
    for (const ap of [127, 611, 3503, 31874]) expect(apCurveMult(ap, flat)).toBe(linear(ap));
    expect(apCurveMult(3503, R)).toBe(apCurveMult(3503, R));
  });

  it("有理根 vs Math.pow 誤差 < 1e-9；p 收成 1/20", () => {
    for (const p of [0.05, 0.25, 0.5, 0.8, 0.95])
      for (const x of [1.0001, 1.5, 2, 8.76, 79.685, 250])
        expect(Math.abs(rationalPow(x, p) - Math.pow(x, p)) / Math.pow(x, p), `${x}^${p}`).toBeLessThan(1e-9);
    expect(snapCurveP(0.83)).toBe(0.85);
    expect(snapCurveP(0.8)).toBe(0.8);
  });
});
