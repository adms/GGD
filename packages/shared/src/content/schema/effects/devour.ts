import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import {
  EFFECT_COMMON_SHAPE,
  refineDispelShape,
  zAoeTier,
  zEffectDef,
} from "./_shared";

/**
 * ⭐ `devour.onDevourPer` 需要 `onDevour`（Lane 3）—— 沒有後續就沒有「跑幾次」
 * 可言。同 `refineApplyBuff` ② 的形狀。
 */
function refineDevour(
  e: Extract<EffectDef, { kind: "devour" }>,
  ctx: z.RefinementCtx,
): void {
  refineDispelShape(e, ctx);
  if (e.onDevourPer !== undefined && e.onDevour === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["onDevourPer"],
      message: "onDevourPer 需要 onDevour —— 沒有後續效果就沒有「跑幾次」可言。",
    });
  }
}

export const zDevour =

/**
 * 【吞噬】—— 處決 + 等值回復（owner 2026-08-05，初號機 EX）。
 * 行為在 `sim/effects/devour.ts`；`shape` 與 dispel/shieldBreak 共用 `shapeTargets`。
 */
z
  .object({
    kind: z.literal("devour"),
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
    /**
     * 逐階處決線（`hp <= maxHp ×` 這一格）。owner 的 3/5/7/9% 就是
     * `[0.03, 0.05, 0.07, 0.09]`。
     * ⛔ 上界 0.5：一條「剩一半就吞得掉」的處決線已經不是處決而是一發必殺技，
     * 而那應該用 `damage` 寫（看得到數字、吃得到護甲）。
     */
    thresholdPctOfMax: z.array(z.number().positive().max(0.5)).min(1).max(5),
    /** 回復「吞下去的生命」的幾成。省略 = 1。上界 2 = 最多回兩倍。 */
    healPct: z.number().min(0).max(2).optional(),
    /** 吞得掉誰。省略 = `"champion"`。 */
    victim: z.enum(["champion", "any"]).optional(),
    /** 致死量含不含護盾。省略 = true（否則「即死」會被護盾靜默擋掉）。 */
    throughShields: z.boolean().optional(),
    /**
     * ⭐ S9a —— **真的吞掉之後**才跑的那一段（92-03「每吞噬一名 +1 AP，永久」）。
     * 省略 = 沒有後續 = 今天（`content/` 裡 devour 文件數 = 0）。
     *
     * ⛔ 「用 onKill 代替」不成立：`onKill` 的三個發射點都沒有 abilitySlot、沒有
     * incoming，所以「吞噬殺掉的」與「普攻殺掉的」在觸發器端分不出來。
     * `.min(1)` 同 `all`/`any` 的反空陣列規則；`.max(6)` 與 `leap.onLand` 對齊。
     *
     * ⚠️ 觸發時刻是「處決線通過、致死量已排出去」那一刻，**不是**「屍體確認了」。
     * 一個帶【免死】的目標會被吞噬打到卻活下來，而這一段已經跑過。
     */
    onDevour: z
      .array(z.lazy(() => zEffectDef))
      .min(1)
      .max(6)
      .optional()
      .describe(
        "真的吞掉之後才跑的效果（「每吞噬一名敵人永久 +1 AP」）。⚠️ 它在「致死傷害送出去」" +
          "那一刻就跑，所以帶免死的目標可能活下來而這一段已經發生。",
      ),
    /**
     * ⭐ S9a —— 一次吞掉多人時 {@link onDevour} 跑幾次。
     * 省略 = `"victim"`。⚠️ 對 `shape:"single"`（出貨唯一形狀）兩者完全等價，
     * 也就是預設值不替任何人做決定。
     */
    onDevourPer: z
      .enum(["victim", "cast"])
      .optional()
      .describe(
        "後續效果跑幾次：victim（預設，每吞掉一個人各跑一次）或 cast（只要有人被吞掉就跑一次）。",
      ),
  })
  .strict();

export const refine = refineDevour;
