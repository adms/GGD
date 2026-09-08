import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import {
  EFFECT_COMMON_SHAPE,
  refineDispelShape,
  zAoeTier,
} from "./_shared";

export const zShieldBreak =

/**
 * 【破盾】`shieldBreak`（D1，#278）。只打掉 `HealthComp.shields`。
 *
 * ⚠️ 它與 `dispel` 分開的理由是**止血閥**：`dispelRules.enabled = false`
 * 不該順手廢掉一件破盾道具。完整理由見 `sim/effects/shieldBreak.ts` 檔頭。
 * 行為在那一支；`shape` 的解析與 dispel 共用 `sim/effects/shapeTargets.ts`。
 */
z
  .object({
    kind: z.literal("shieldBreak"),
    ...EFFECT_COMMON_SHAPE,
    /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
    shape: z.enum(["single", "circle"]),
    /** `shape:"circle"` **必填**（載入時擋）。吃 `combatEnv.abilityRange`。 */
    radius: z.number().positive().max(40).optional(),
    /** ⭐ AoE 級別（owner 2026-08-11「原則上不寫範圍數字」）。填了它就不要填
     *  `radius` —— 註冊時由 `config.aoe-tiers@1` 翻成半徑，兩者都填則**級別贏**。
     *  唯一的查表處：`content/aoeTiers.ts` 的 `resolveRadiusTier`。 */
    radiusTier: zAoeTier.optional(),
    /** 破盾的預設是**打敵人**（與淨化相反）。 */
    side: z.enum(["allies", "enemies"]).optional(),
    /** 圓內人數上限。省略 = 全部。上界 24 = 一場的總人數。 */
    maxTargets: z.number().int().positive().max(24).optional(),
    /**
     * 最多打掉幾層盾。省略 = 整池。
     * ⚠️ 上界 20：一個人身上同時掛 20 片盾已經是異常，再大就是打錯字。
     */
    count: z.number().int().positive().max(20).optional(),
    /** 打不完時先打哪一邊。省略 = `"newest"`。 */
    order: z.enum(["newest", "oldest"]).optional(),
  })
  .strict();

/**
 * ⭐ 這一支的跨欄位檢查 —— 分片前它是 `refineEffectDef` 裡的一條 `if`。
 * ⛔ 掛在 `index.ts` 的派發表上，⛔ 不是掛在下面那個 `z.object` 上：
 *    `.superRefine` 會把 `ZodObject` 變成 `ZodEffects`，而
 *    `z.discriminatedUnion` 只收 `ZodObject`（zod 的型別約束，⛔ 不是風格）。
 */
export const refine = (
  e: Extract<EffectDef, { kind: "shieldBreak" }>,
  ctx: z.RefinementCtx,
): void => {
  refineDispelShape(e, ctx);
};
