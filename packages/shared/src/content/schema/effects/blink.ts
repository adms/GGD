import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import {
  EFFECT_COMMON_SHAPE,
  refineDispelShape,
  zAoeTier,
  zEffectDef,
} from "./_shared";

export const zBlink =
/**
 * ⭐ blink — **真瞬移**（owner 2026-08-09 / GH#301-2），mirrors the `blink`
 * member of `EffectDef`。為什麼它不是 `leap` 的一個選項、`templates/expand.ts`
 * 那句「deliberately was not added」為什麼被推翻、三個 `to` 值各對應哪幾支
 * JASS 技能 —— 全部寫在 `sim/effects/effect.ts`，⛔ 不在這裡重複一份。
 */
z
  .object({
    kind: z.literal("blink"),
    ...EFFECT_COMMON_SHAPE,
    /** ⭐ E1 硬約束：新 kind 一律帶 `shape`（守衛 `newKindShape.test.ts`）。 */
    shape: z.enum(["single", "circle"]).describe(
      "誰被瞬移：single＝一個身體（施法者或這次的目標）；circle＝半徑內的一群（集結隊友）。",
    ),
    /**
     * `shape:"circle"` 的半徑，GGD 單位。上界 40 與 `extendBuff` 的圓一致
     *（決鬥區半徑 24，40 蓋得住任何合理的集結範圍而擋得住漏換算的 wc3 數字）。
     */
    radius: z.number().positive().max(40).optional(),
    /** ⭐ AoE 級別（owner 2026-08-11「原則上不寫範圍數字」）。填了它就不要填
     *  `radius` —— 註冊時由 `config.aoe-tiers@1` 翻成半徑，兩者都填則**級別贏**。
     *  唯一的查表處：`content/aoeTiers.ts` 的 `resolveRadiusTier`。 */
    radiusTier: zAoeTier.optional(),
    side: z.enum(["allies", "enemies"]).optional(),
    maxTargets: z.number().int().positive().max(24).optional(),
    to: z
      .enum(["point", "targetUnit", "caster"])
      .describe("目的地：指定的地點 / 目標身上 / 集結到施法者身邊。"),
    applyTo: z.enum(["self", "target"]).optional(),
    /**
     * 落在目的地前面多少單位（27-04 飛燕閃在 JASS 裡落在目標前 150 wc3 ≈
     * 2.75 GGD）。省略 = 0 = 正好落在目的地。
     * 上界 20 與 `KB_MAX_DISTANCE` 同一個理由：大於任何真實值、小於決鬥區半徑
     * 的兩倍，所以「150」直接貼進來（沒換算）會被擋在門外。
     */
    stopShortUnits: z.number().min(0).max(20).optional(),
    /** 抵達之後**同一個 tick**執行的效果。⛔ 這裡沒有 `arriveRadius`，理由見 sim 端。 */
    onArrive: z.array(z.lazy(() => zEffectDef)).optional(),
  })
  .strict();

/**
 * ⭐ 這一支的跨欄位檢查 —— 分片前它是 `refineEffectDef` 裡的一條 `if`。
 * ⛔ 掛在 `index.ts` 的派發表上，⛔ 不是掛在下面那個 `z.object` 上：
 *    `.superRefine` 會把 `ZodObject` 變成 `ZodEffects`，而
 *    `z.discriminatedUnion` 只收 `ZodObject`（zod 的型別約束，⛔ 不是風格）。
 */
export const refine = (
  e: Extract<EffectDef, { kind: "blink" }>,
  ctx: z.RefinementCtx,
): void => {
  refineDispelShape(e, ctx);
};
