import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import { CONVERT_BUFF_MAX_SEC, CONVERT_MAX_RATIO } from "../../../sim/effects/kindLimits";
import { zStat } from "../common";
import {
  EFFECT_COMMON_SHAPE,
  refineDispelShape,
  zAoeTier,
} from "./_shared";

export const zEventValueConversion =

/** 【事件數值轉換】(15-002 太陰道 · 59-01 吞噬)。⚠️ `basis` 待 freeze。 */
z
  .object({
    kind: z.literal("eventValueConversion"),
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
    source: z.enum(["incomingDamage", "targetCurrentHealth"]).optional(),
    /**
     * ⚠️ **計畫 §16.12 未 freeze**，所以三個讀數是一格欄位、不是我挑一個。
     * 省略 = `"mitigated"`，與 `damage.incomingPct.basis` 的預設同一句話。
     */
    basis: z.enum(["raw", "mitigated", "hpLost"]).optional(),
    ratio: z.number().min(-CONVERT_MAX_RATIO).max(CONVERT_MAX_RATIO),
    to: z.enum(["mana", "health"]).optional(),
    who: z.enum(["self", "target"]).optional(),
    /** 「以及**短暫**加成至 AP」。`ratio` 省略時沿用外層的。 */
    buff: z
      .object({
        stat: zStat,
        durationSec: z.number().positive().max(CONVERT_BUFF_MAX_SEC),
        ratio: z.number().min(-CONVERT_MAX_RATIO).max(CONVERT_MAX_RATIO).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * ⭐ 這一支的跨欄位檢查 —— 分片前它是 `refineEffectDef` 裡的一條 `if`。
 * ⛔ 掛在 `index.ts` 的派發表上，⛔ 不是掛在下面那個 `z.object` 上：
 *    `.superRefine` 會把 `ZodObject` 變成 `ZodEffects`，而
 *    `z.discriminatedUnion` 只收 `ZodObject`（zod 的型別約束，⛔ 不是風格）。
 */
export const refine = (
  e: Extract<EffectDef, { kind: "eventValueConversion" }>,
  ctx: z.RefinementCtx,
): void => {
  refineDispelShape(e, ctx);
};
