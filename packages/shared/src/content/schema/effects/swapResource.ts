import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import { SWAP_CLAMP_MIN_MAX } from "../../../sim/effects/kindLimits";
import {
  EFFECT_COMMON_SHAPE,
  refineDispelShape,
  zAoeTier,
} from "./_shared";

export const zSwapResource =

/** 【交換資源】(44-002 交換筆記本)。三個決策點都是欄位。 */
z
  .object({
    kind: z.literal("swapResource"),
    ...EFFECT_COMMON_SHAPE,
    /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
    shape: z.enum(["single", "circle"]),
    radius: z.number().positive().max(40).optional(),
    /** ⭐ AoE 級別（owner 2026-08-11「原則上不寫範圍數字」）。填了它就不要填
     *  `radius` —— 註冊時由 `config.aoe-tiers@1` 翻成半徑，兩者都填則**級別贏**。
     *  唯一的查表處：`content/aoeTiers.ts` 的 `resolveRadiusTier`。 */
    radiusTier: zAoeTier.optional(),
    side: z.enum(["allies", "enemies"]).optional(),
    maxTargets: z.number().int().positive().max(24).optional(),
    /** 決策點①。省略 = `"health"`。 */
    resource: z.enum(["health", "mana"]).optional(),
    /** 決策點②。省略 = 1（§16.16：交換不殺人）。0 = 允許交換到 0。 */
    clampMin: z.number().min(0).max(SWAP_CLAMP_MIN_MAX).optional(),
    /** 決策點③。省略 = `"abort"`（§16.16 的「目標失效則全招失敗」）。 */
    onInvalidTarget: z.enum(["abort", "skip"]).optional(),
  })
  .strict();

/**
 * ⭐ 這一支的跨欄位檢查 —— 分片前它是 `refineEffectDef` 裡的一條 `if`。
 * ⛔ 掛在 `index.ts` 的派發表上，⛔ 不是掛在下面那個 `z.object` 上：
 *    `.superRefine` 會把 `ZodObject` 變成 `ZodEffects`，而
 *    `z.discriminatedUnion` 只收 `ZodObject`（zod 的型別約束，⛔ 不是風格）。
 */
export const refine = (
  e: Extract<EffectDef, { kind: "swapResource" }>,
  ctx: z.RefinementCtx,
): void => {
  refineDispelShape(e, ctx);
};
