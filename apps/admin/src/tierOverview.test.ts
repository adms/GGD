/**
 * 🪜 五級距總覽的**唯一**守衛：後台印的那一格 = **引擎真的會發給技能**的值。
 *
 * ⚠️ 它刻意**不**跟 `DEFAULT_*` 對答案（總覽也是從那裡長出來的 ⇒ 恆等式）。
 * 它走**另一條路**：拿一支只填級距名的合成技能，餵給出貨的四支 resolver
 * （註冊時真的在跑的那四支），問「引擎給了什麼」。兩條路要對得上。
 * 突變（2026-08-21）：施法距離那一軸改成手抄的舊梯子 → 紅，訊息指名哪一格。
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { resolveCooldownTier, cooldownTiersFromDoc } from "@ggd/shared/content/cooldownTiers";
import { resolveDamageTier, damageTiersFromDoc } from "@ggd/shared/content/damageTiers";
import { resolveRangeTier, rangeTiersFromDoc } from "@ggd/shared/content/rangeTiers";
import { resolveRadiusTier, aoeTiersFromDoc } from "@ggd/shared/content/aoeTiers";
import { cooldownRulesFromDoc, applyCooldownFloor } from "@ggd/shared/sim/cooldownRules";
import { SKILL_TIER_NAMES, buildTierAxes, cellsOf, SHIPPED_TIER_INPUT } from "./tierOverview";

const TAG = "adminui-tier-overview";

/** 引擎在註冊一支只填了級距名的技能時，實際會發給它什麼。⛔ 這裡不查任何表。 */
function engineValue(axisKey: string, tier: string): number {
  if (axisKey.startsWith("cooldown.")) {
    const shape = axisKey.slice("cooldown.".length);
    const out = resolveCooldownTier(
      { cooldown: [0], cooldownTier: tier, cooldownShape: shape },
      cooldownTiersFromDoc(undefined),
    );
    return (out.cooldown as number[])[0]!;
  }
  if (axisKey === "damage") {
    const out = resolveDamageTier(
      { effects: [{ kind: "damage", amount: { damageTier: tier, flat: -1 } }] },
      damageTiersFromDoc(undefined),
    ) as { effects: { amount: { flat: number } }[] };
    return out.effects[0]!.amount.flat;
  }
  if (axisKey === "range") {
    return resolveRangeTier({ range: -1, rangeTier: tier }, rangeTiersFromDoc(undefined))
      .range as number;
  }
  return resolveRadiusTier({ radius: -1, radiusTier: tier }, aoeTiersFromDoc(undefined))
    .radius as number;
}

describe("五級距總覽印的是引擎真的會給的值", () => {
  it("★ 每一軸 × 每一格的卡面值，都等於出貨 resolver 解析出來的值", () => {
    cover(TAG);
    const axes = buildTierAxes(SHIPPED_TIER_INPUT);
    // 四軸（冷卻三張形狀表 + 傷害 + 距離 + 範圍）一軸都不可以掉。
    expect(axes.length, "總覽掉了一軸 —— 那一軸的級距從此沒有人看得到").toBe(6);
    for (const axis of axes) {
      for (const tier of SKILL_TIER_NAMES) {
        expect(
          axis.card[tier],
          `${axis.zh}・${tier} 後台印的和引擎給技能的不一樣 —— 後台在說謊`,
        ).toBe(engineValue(axis.key, tier));
      }
      // 上界一定要有，而且要在下界之上（#277：只有下界時「50 打成 500」會過表單）。
      expect(axis.max, `${axis.zh} 沒有上界`).toBeGreaterThan(axis.min);
      // 每一軸都要說「它影響什麼」，⛔ 不是複述欄位名。
      expect(axis.affects.length, `${axis.zh} 沒有說明`).toBeGreaterThan(20);
    }
  });

  it("★ 實際值＝卡面 × combat-env 係數，冷卻再走引擎自己的秒數地板", () => {
    cover(TAG);
    // 探針係數：⛔ 不是出貨值（出貨值住 content/config，抄進測試就是第四個住處）。
    const PROBE = 0.05;
    const env = { cooldown: PROBE, damageDealt: PROBE, abilityRange: PROBE };
    const rules = cooldownRulesFromDoc(undefined);
    for (const axis of buildTierAxes(SHIPPED_TIER_INPUT)) {
      for (const c of cellsOf(axis, env)) {
        const want = axis.clamp ? applyCooldownFloor(rules, c.card * PROBE) : c.card * PROBE;
        expect(c.live, `${axis.zh}・${c.tier} 的實際值算錯`).toBeCloseTo(want, 9);
      }
    }
    // 讀不到 combat-env 時「實際值」是空的 —— ⛔ 不是拿 1.0 假裝中性。
    expect(cellsOf(buildTierAxes(SHIPPED_TIER_INPUT)[0]!, null)[0]!.live).toBeNull();
  });
});
