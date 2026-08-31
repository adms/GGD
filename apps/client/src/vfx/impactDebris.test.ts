/**
 * ⭐⭐ GH#725 AC⑤ —— 命中／死亡的**體素碎塊**層。
 *
 * ⚠️ ⭐ 這條守衛驗的是**碎塊與火花是兩件事**，⛔ 不是「有沒有第四層」：
 * 一個 additive、無重力、會縮小的「碎塊」就只是第二層火花 —— 那是這一層存在的反面。
 *
 * MUTATION LOG：
 *   · `recipe.debris` 那一段拿掉 → ①紅
 *   · `blend` 改成 "additive" → ②紅
 *   · 壽命的 `Math.min(…, cap)` 拿掉 → ③紅（輕擊尾巴破 AC③ 的 0.35s）
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  IMPACT_TAIL_BUDGET_MS,
  SHIPPED_IMPACT_DEBRIS,
  impactDebris,
  impactRecipe,
  setImpactDebris,
} from "./vfxPresets";

afterEach(() => setImpactDebris(undefined)); // 回出貨值

describe("GH#725 AC⑤ 體素碎塊", () => {
  it("★ ⭐ 出貨是**開的**（⛔ 一個預設關著的效果等於沒做）", () => {
    expect(SHIPPED_IMPACT_DEBRIS.enabled).toBe(true);
    expect(impactRecipe("heavy", [1, 1, 1]).debris, "⛔ 碎塊層沒生出來").toBeDefined();
  });

  it("★ ⭐ 它是**物質**不是光：standard blend ＋ 往下掉", () => {
    const d = impactRecipe("heavy", [1, 1, 1]).debris!;
    expect(d.blend, "⛔ additive 的碎塊就只是第二層火花").toBe("alpha");
    expect(d.gravityY, "⛔ 不會落地的碎塊看起來就是火花").toBeLessThan(0);
  });

  it("★ ⭐ 壽命**被該級的收尾預算夾住** —— 輕擊尾巴不可以破 AC③ 的 0.35s", () => {
    // ⚠️ 這一條是踩出來的：第一版寫死 0.9s ⇒ 輕擊尾巴 0.9s，⭐ 當場破了同一張票的 AC③。
    for (const tier of ["light", "heavy", "ex"] as const) {
      const d = impactRecipe(tier, [1, 1, 1]).debris!;
      expect(
        d.lifetimeSec.max * 1000,
        `${tier}: 碎塊比該級的收尾預算還久`,
      ).toBeLessThanOrEqual(IMPACT_TAIL_BUDGET_MS[tier]);
    }
  });

  it("★ ⭐ 顆數**跟著打擊重量走**（⛔ 輕擊不該噴得跟重擊一樣多）", () => {
    const light = impactRecipe("light", [1, 1, 1]).debris!.count;
    const heavy = impactRecipe("heavy", [1, 1, 1]).debris!.count;
    expect(light, "⛔ 每一擊噴一樣多 ⇒「這下重不重」的訊息消失了").toBeLessThan(heavy);
  });

  it("⭐ 後台關掉 ⇒ 整層不生（一鍵 rollback）", () => {
    setImpactDebris({ ...SHIPPED_IMPACT_DEBRIS, enabled: false });
    expect(impactRecipe("heavy", [1, 1, 1]).debris).toBeUndefined();
  });

  it("⭐ 認不得的值退回**出貨值**，⛔ 不是 0（0 顆＝這層靜靜消失＝看起來像壞了）", () => {
    setImpactDebris({ count: -5, lifeSec: 0 } as never);
    expect(impactDebris().count).toBe(SHIPPED_IMPACT_DEBRIS.count);
    expect(impactDebris().lifeSec).toBe(SHIPPED_IMPACT_DEBRIS.lifeSec);
  });
});
