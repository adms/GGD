import { z } from "zod";
import { SPREAD_MAX_FALLOFF, SPREAD_MAX_RADIUS, SPREAD_MAX_TARGETS, SPREAD_MIN_FALLOFF } from "../../../sim/effects/spreadLimits";
import { zScaling } from "../common";
import {
  EFFECT_COMMON_SHAPE,
  zAoeTier,
  zDamageType,
  zMaxTargetsCounts,
  zOnHitTargets,
  zOnHitTargetsMode,
  zResourcePctTerm,
  zRunOnEmptyHit,
  zVictimCondition,
} from "./_shared";

export const zDamageArea =
/**
 * damageArea (#210 近戰擴散) — mirrors the `damageArea` member of `EffectDef`.
 *
 * 三個旋鈕都有**上界**, 不是只有下界: CLAUDE.md 明說「欄位要有上界」, 而這裡
 * 的失敗形態很具體 —— w3x 的長度單位大約是 GGD 的 54.5 倍, 所以任何一個從
 * 原始資料直接貼過來的 `Area` 欄位 (200/300/450) 都會變成一個蓋滿整個決鬥區
 * 的圓。上界把那種貼上變成「檔案進不來」而不是「上線後某件武器一發清場」。
 * 數字與理由見 sim/effects/spreadLimits.ts —— 那裡是唯一的一份, 這裡只是
 * 把它接到 Zod 上, 兩邊不可能漂移。
 */
z
  .object({
    kind: z.literal("damageArea"),
    ...EFFECT_COMMON_SHAPE,
    damageType: zDamageType.optional().describe(
      "傷害型別：吃護甲(physical)、吃魔抗(magic)、什麼都不吃(true)。" +
        "**省略 = 後台「傷害規則」頁的預設**（出貨 magic —— owner 2026-08-05" +
        "「技能傷害預設都改成 AP 傷害」）。⚠️ 它與**係數來源**是兩件事：" +
        "型別決定吃什麼減免，`amount` 的 Scaling(ap/ad/str/agi/int) 決定數字多大。",
    ),
    amount: zScaling,
    /** GGD 單位。不經過 combatEnv.abilityRange — 見 sim/effects/effect.ts。 */
    radius: z.number().positive().max(SPREAD_MAX_RADIUS),
    radiusTier: zAoeTier.optional(),
    /** 邊緣倍率: 1 = 不衰減 (預設), 0 = 邊緣歸零 */
    falloff: z
      .number()
      .min(SPREAD_MIN_FALLOFF)
      .max(SPREAD_MAX_FALLOFF)
      .optional(),
    /** 一次最多濺到幾個人 (不含震央) */
    maxTargets: z.number().int().min(1).max(SPREAD_MAX_TARGETS).optional(),
    canCrit: z.boolean().optional(),
    /** 震央本人要不要再吃一次 (預設 false — 他已經吃過觸發這一擊了) */
    includeOrigin: z.boolean().optional(),
    /** ⭐ G1 —— 圈內逐一過濾 + 「最多幾人」數誰。見 {@link zVictimCondition}。 */
    victimCondition: zVictimCondition,
    maxTargetsCounts: zMaxTargetsCounts,
    /** ⭐ G1 ② —— effect.target-set-chain@1。見 {@link zOnHitTargets}。 */
    onHitTargets: zOnHitTargets,
    runOnEmptyHit: zRunOnEmptyHit,
    onHitTargetsMode: zOnHitTargetsMode,
    /**
     * ⭐ S2（GH#299）—— 與 `damage.resourcePct` **完全同一份 schema、同一個
     * 讀取器**（`sim/effects/dynamicTerms.ts::resourcePctAmount`）。
     * 在此之前只有 `damage` / `dot` 有這一格，於是「對範圍內敵人造成
     * （現存魔力 + AP）×7」的**魔力那一項**被 `.strict()` 拒收，只剩 AP×7 ——
     * 而那份文件看起來完全正常（失敗形態②）。
     */
    resourcePct: zResourcePctTerm.optional(),
  })
  .strict();
