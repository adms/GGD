/**
 * 🔵 **GH#617 —— 衝擊波環的三格倍率**，兩則裁決一條守衛。
 *
 * > owner 2026-08-23①：「地上常出現**一堆亮藍色往外擴散的圈圈特效**⋯
 * >  **我感覺是硬加的 太亮太搶眼不好看** 請改善」
 * > owner 2026-08-23②：「ImpactComposer 的 ShockwaveRing **散開速度感要夠快**，
 * >  這樣才會有**力量感**，目前**太慢存活時間也太長**」
 *
 * ⚠️ 這一條刻意**不驗數字**（第二守則：守衛驗機制，數字有三個住處 + drift 測試）。
 * 它驗的是**兩個方向**：亮度會降、而**速度會升** —— 而後者是唯一會被寫錯的那個，
 * 因為「把環縮小」看起來也像在治「太搶眼」，⛔ 但它讓速度**變慢**。
 */
import { describe, expect, it } from "vitest";

import {
  impactRecipe,
  impactRingScale,
  ringShape,
  setImpactRingScale,
  setImpactRingTiers,
} from "./vfxPresets";
import { DAMAGE_TIER_NAMES, DEFAULT_DAMAGE_TIERS } from "@ggd/shared/content/damageTiers";

const TINT: readonly [number, number, number] = [0.68, 0.5, 1];

/** 擴散速度 = 結束半徑 ÷ 壽命（世界單位／秒）—— owner 說的「散開速度感」。 */
function spreadSpeed(r: { endRadius: number; lifeMs: number }): number {
  return r.endRadius / (r.lifeMs / 1000);
}

function ringOf(amount?: number): {
  alpha: number;
  startRadius: number;
  endRadius: number;
  lifeMs: number;
  fadePow?: number;
} {
  const ring = impactRecipe("heavy", TINT as unknown as never, amount).ring;
  expect(ring).toBeDefined();
  return ring!;
}

/** 出貨的五格門檻 —— ⛔ 從共用表讀，不抄字面值（第〇·四守則）。 */
const TIERS = DEFAULT_DAMAGE_TIERS.damage;
const SMALLEST = Math.min(...DAMAGE_TIER_NAMES.map((n) => TIERS[n]));
const BIGGEST = Math.max(...DAMAGE_TIER_NAMES.map((n) => TIERS[n]));

describe("GH#617 衝擊波環的三格倍率", () => {
  it("轉到 1/1/1 = 逐位元回到 2026-08-23 之前（開關是為了回頭）", () => {
    setImpactRingScale(1, 1, 1);
    const base = ringOf();
    expect(impactRingScale()).toMatchObject({ alpha: 1, radius: 1, life: 1 });
    expect(base.alpha).toBeGreaterThan(0);
    expect(base.lifeMs).toBeGreaterThan(0);
  });

  it("出貨的三格：亮度↓ 而擴散速度↑（⭐ 兩個方向相反，這是承重的那一條）", () => {
    setImpactRingScale(1, 1, 1);
    const before = ringOf();

    // 出貨值（來源是 content/config/vfx-families.json，⛔ 這裡不抄字面值）。
    setImpactRingScale(0.35, 1, 0.45);
    const after = ringOf();

    expect(after.alpha).toBeLessThan(before.alpha); // ① 太亮 → 降
    expect(after.lifeMs).toBeLessThan(before.lifeMs); // ② 存活時間太長 → 縮
    expect(spreadSpeed(after)).toBeGreaterThan(spreadSpeed(before)); // ⭐ ③ 太慢 → 快

    setImpactRingScale(undefined, undefined, undefined);
  });

  it("⭐ 五級距越大越快（owner「根據傷害五級距越大速度越快」）", () => {
    setImpactRingTiers(TIERS);
    setImpactRingScale(1, 1, 1, undefined, undefined, 1.8);

    const small = ringOf(SMALLEST);
    const big = ringOf(BIGGEST);

    // 同一顆環、同樣的半徑,只有壽命變短 ⇒ 擴散速度變快。
    expect(big.endRadius).toBe(small.endRadius);
    expect(big.lifeMs).toBeLessThan(small.lifeMs);
    expect(spreadSpeed(big)).toBeGreaterThan(spreadSpeed(small));

    // 這一格轉回 1 = 五格一樣快（逐位元回到 2026-08-23 之前）。
    setImpactRingScale(1, 1, 1, undefined, undefined, 1);
    expect(ringOf(BIGGEST).lifeMs).toBe(ringOf(SMALLEST).lifeMs);

    setImpactRingScale(undefined, undefined, undefined);
    setImpactRingTiers(undefined);
  });

  it("⛔ 0.8 秒是硬天花板 —— 三格相乘之後才夾（後台拉滿也超不過）", () => {
    setImpactRingScale(1, 1, 2, undefined, 0.8, 1);
    expect(ringOf().lifeMs).toBeLessThanOrEqual(800);
    setImpactRingScale(undefined, undefined, undefined);
  });

  it("淡出指數越大衰減越快（owner「半透明淡出更快衰減」）", () => {
    const spec = { startRadius: 0.3, endRadius: 1.7, lifeMs: 200, alpha: 1 };
    const slow = ringShape(0.5, { ...spec, fadePow: 2 }).alpha;
    const fast = ringShape(0.5, { ...spec, fadePow: 3 }).alpha;
    expect(fast).toBeLessThan(slow);
    // 半徑不受影響 —— ⛔ 淡出那一格不可以順手改到擴散。
    expect(ringShape(0.5, { ...spec, fadePow: 3 }).radius).toBe(
      ringShape(0.5, { ...spec, fadePow: 2 }).radius,
    );
  });

  it("alpha 夾在 [0,1]：兩格相乘也不會爆掉（後台上界擋不住乘法）", () => {
    setImpactRingScale(999, 1, 1);
    expect(ringOf().alpha).toBeLessThanOrEqual(1);
    setImpactRingScale(undefined, undefined, undefined);
  });
});
