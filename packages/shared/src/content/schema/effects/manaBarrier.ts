import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import { MANA_BARRIER_MAX_DURATION_SEC, MANA_BARRIER_MAX_PER_MANA } from "../../../sim/effects/kindLimits";
import {
  EFFECT_COMMON_SHAPE,
  refineDispelShape,
  zAoeTier,
  zDamageType,
} from "./_shared";

export const zManaBarrier =

/** 【魔力屏障】(44-00 機警)。⛔ 不是受傷後補護盾。 */
z
  .object({
    kind: z.literal("manaBarrier"),
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
    who: z.enum(["self", "target"]).optional(),
    perMana: z.number().positive().max(MANA_BARRIER_MAX_PER_MANA),
    /**
     * **必填、明列**（同 `zItemBlockGrant.damageTypes`）：「可抵擋**全部**傷害」
     * 是這個陣列的內容，不是程式裡的一行 `if`。`.min(1)` —— 空陣列 = 沒有屏障，
     * 而那是一份「掛得上、不會擋」的文件。
     */
    damageTypes: z.array(zDamageType).min(1).max(3),
    minManaReserve: z.number().min(0).max(10000).optional(),
    /**
     * **選填**（GH#307，owner 2026-08-09：「這個技能是常駐沒錯，這個也是參數之一，
     * 也可以設定秒數，但**共同的強制停止都是魔力耗盡**」）：
     * 省略 = **常駐**到魔力耗盡；填數字 = 到期或魔力耗盡，先到先停。
     * ⛔ 在此之前它是必填，所以「常駐」寫不出來 —— 作者只能填一個猜的秒數。
     */
    durationSec: z.number().positive().max(MANA_BARRIER_MAX_DURATION_SEC).optional(),
  })
  .strict();

/**
 * ⭐ 這一支的跨欄位檢查 —— 分片前它是 `refineEffectDef` 裡的一條 `if`。
 * ⛔ 掛在 `index.ts` 的派發表上，⛔ 不是掛在下面那個 `z.object` 上：
 *    `.superRefine` 會把 `ZodObject` 變成 `ZodEffects`，而
 *    `z.discriminatedUnion` 只收 `ZodObject`（zod 的型別約束，⛔ 不是風格）。
 */
export const refine = (
  e: Extract<EffectDef, { kind: "manaBarrier" }>,
  ctx: z.RefinementCtx,
): void => {
  refineDispelShape(e, ctx);
};
