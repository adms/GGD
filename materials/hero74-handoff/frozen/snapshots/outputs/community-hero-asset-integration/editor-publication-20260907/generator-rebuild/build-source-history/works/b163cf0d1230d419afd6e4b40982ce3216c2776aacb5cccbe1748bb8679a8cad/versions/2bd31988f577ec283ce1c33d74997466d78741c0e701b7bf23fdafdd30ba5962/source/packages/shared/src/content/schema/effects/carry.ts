import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import { CARRY_MAX_PASSENGERS, CARRY_MAX_SEC } from "../../../sim/effects/kindLimits";
import {
  EFFECT_COMMON_SHAPE,
  refineDispelShape,
  zAoeTier,
  zEffectDef,
  zVictimCondition,
} from "./_shared";

export const zCarry =
/**
 * carry — 【背負】(禰豆子的木箱)。把一名隊友收進箱子:身體跟著載具走、
 * 期間**不可被選取**,到期放下。mirrors the `carry` member of `EffectDef`。
 *
 * ⛔ 「不可選取」**不是**無敵:四根軸逐字沿用 `sim/stealth.ts::StealthRules`
 * 已經命名的那四根,⛔ 不發明第二套詞彙。`abilityAoe` 預設 **false** ——
 * 一發打在腳下的 AoE 照樣打得到箱子裡的人。
 */
z
  .object({
    kind: z.literal("carry"),
    ...EFFECT_COMMON_SHAPE,
    /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
    shape: z.enum(["single", "circle"]),
    radius: z.number().positive().max(40).optional(),
    radiusTier: zAoeTier.optional(),
    /** 誰躲得進箱子。省略 = `allies`。 */
    side: z.enum(["allies", "enemies"]).optional(),
    /** 一次背幾個。省略 = 1。 */
    maxTargets: z.number().int().min(1).max(CARRY_MAX_PASSENGERS).optional(),
    /**
     * 背多久（秒）。**必填**：一個沒有期限的背負 = 一名英雄整回合退出戰鬥
     * 而且不可選取，而那在畫面上跟「這個人卡住了」一模一樣。
     */
    durationSec: z.number().min(0.1).max(CARRY_MAX_SEC),
    /**
     * 「不可選取」的四根軸。省略整格 = `{autoAcquire:true, mobAggro:true,
     * manualTarget:true, abilityAoe:false}`。
     */
    untargetable: z
      .object({
        autoAcquire: z.boolean().optional(),
        mobAggro: z.boolean().optional(),
        manualTarget: z.boolean().optional(),
        abilityAoe: z.boolean().optional(),
      })
      .strict()
      .optional(),
    /**
     * 「只有生命低於 15% 的隊友躲得進來」這一類的**逐一過濾**。
     *
     * ⛔ 只能寫在這裡：`onInterval` 的 hook 不帶 target，hook 層的
     * `subject:"target"` 葉子一律讀 FALSE。
     */
    victimCondition: zVictimCondition,
    /** 交給**真的上車的那群人**的效果（回血、冷卻鎖）。⛔ 不是新機制。 */
    onHitTargets: z.array(zEffectDef).optional(),
    /** 載具死了乘客怎麼辦。省略 = `release`（放下、恢復可選取）。 */
    onCarrierDeath: z.enum(["release", "drop"]).optional(),
  })
  .strict();

/**
 * ⭐ 這一支的跨欄位檢查 —— 分片前它是 `refineEffectDef` 裡的一條 `if`。
 * ⛔ 掛在 `index.ts` 的派發表上，⛔ 不是掛在下面那個 `z.object` 上：
 *    `.superRefine` 會把 `ZodObject` 變成 `ZodEffects`，而
 *    `z.discriminatedUnion` 只收 `ZodObject`（zod 的型別約束，⛔ 不是風格）。
 */
export const refine = (
  e: Extract<EffectDef, { kind: "carry" }>,
  ctx: z.RefinementCtx,
): void => {
  refineDispelShape(e, ctx);
};
