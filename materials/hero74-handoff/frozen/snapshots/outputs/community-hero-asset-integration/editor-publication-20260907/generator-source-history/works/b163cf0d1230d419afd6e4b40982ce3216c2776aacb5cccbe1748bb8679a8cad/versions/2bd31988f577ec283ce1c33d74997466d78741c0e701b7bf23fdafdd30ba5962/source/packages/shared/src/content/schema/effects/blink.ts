import { z } from "zod";
import type { StatusId } from "../../../ids";
import type { EffectDef } from "../../../sim/effects/effect";
import { zRef } from "../common";
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
      .enum(["point", "targetUnit", "caster", "markedUnit"])
      .describe(
        "目的地：指定的地點 / 目標身上 / 集結到施法者身邊 / " +
          "⭐ **被我標記的那個人**（`markedUnit`）。",
      ),
    /**
     * ⭐⭐ `to: "markedUnit"` 專用 —— **哪一個標記**（`status-effect@1` 的 id）。
     *
     * ── owner 2026-08-19（逐字，GH#448）─────────────────────────────────────
     * 「30-00 攝影機 => 因為**已經不是 dota 大地圖**，請你幫我這招改成
     *  **給予指定敵方英雄標記**，之後施展**若無指定敵方英雄單位代表順移至敵方身邊**」
     *
     * ⇒ ⭐ 同一個按鍵**兩段行為**：有指定目標 ⇒ 標記它；沒有 ⇒ 瞬移到被標記的人。
     *
     * ── ⭐ 「被我標記的」怎麼認得出來 ────────────────────────────────────────
     * `StatusEffect.sourceId` 存的是 `ctx.origin`（＝**這支技能的 id**，
     * `sim/effects/applyStatus.ts:204`）⇒ ⭐ 一個施法者只有一支這技能
     * ⇒ 「這個 statusId ＋ 這支技能」就唯一決定了「我標的那個人」。
     * ⛔ 不必新增一份「誰標了誰」的表（那會是第〇·四守則的第二個住處）。
     *
     * ⚠️ ⭐ 找不到被標記的人 ⇒ **什麼都不做**（⛔ 不是瞬移到隨便一個敵人、
     * ⛔ 也不是原地不動地假裝成功）—— 玩家按下去沒有反應時，
     * 卡面要說得出「你還沒標記任何人」。
     */
    markStatusId: zRef<StatusId>("status-effects", { soft: true }).optional(),
    applyTo: z.enum(["self", "target"]).optional(),
    /**
     * 落在目的地前面多少單位（27-04 飛燕閃在 JASS 裡落在目標前 150 wc3 ≈
     * 2.75 GGD）。省略 = 0 = 正好落在目的地。
     * 上界 20 與 `KB_MAX_DISTANCE` 同一個理由：大於任何真實值、小於決鬥區半徑
     * 的兩倍，所以「150」直接貼進來（沒換算）會被擋在門外。
     */
    stopShortUnits: z.number().min(0).max(20).optional(),
    /**
     * ⭐【固定距離】GH#838 N-新 —— 落點是「從施法者**朝目的地的方向**走這麼遠」，
     * ⛔ 不是目的地本身。JASS 的 `PolarProjectionBJ(origin, d, angleTo(aim))`
     * ＋ `SetUnitPositionLoc`（war3map.j 全域 **38 處**用這個形狀；08-04 阿邦
     * 快速劍X j:28898 是 `550.00` ＝ 10.08 GGD-u，而它的 ubertip 逐字寫著
     * 「**距離550**」）。
     *
     * ⚠️ ⛔ **不可以用 `to:"point"` 近似**：那個是「落在你點的地方」，點近就落近；
     * 原作是**點哪個方向、一律飛滿 550** —— 兩者在貼身施放時差最多（一個原地、
     * 一個穿到背後）。這正是守則禁止的「用現有參數湊一個看起來像的」。
     *
     * ⚠️ 與 `stopShortUnits` **互斥**（兩格都在改同一段長度，同時填無法定義誰贏）。
     * 上界 24 ＝ 決鬥區半徑：大於任何真實落點、而 wc3 的 `550` 直接貼進來會被擋。
     * 缺席 ⇒ 沿用「走到目的地」的舊行為（逐位元同以前）。
     */
    distanceUnits: z
      .number()
      .positive()
      .max(24)
      .describe(
        "落點＝從施法者**朝目的地的方向**走這麼遠（⛔ 不是目的地本身）。" +
          "點得近也照樣飛滿 —— JASS `PolarProjectionBJ(origin, d, angleTo(aim))`。" +
          "⚠️ 與 `stopShortUnits` 互斥（兩格都在改同一段長度）。缺席＝走到目的地。",
      )
      .optional(),
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
  // ⭐ 互斥：兩格都在改「從施法者到落點」那一段長度。⛔ 不要挑一個贏 ——
  //    一個「我填了兩格而其中一格被無聲忽略」的內容，跟填錯一樣糟。
  if (e.distanceUnits !== undefined && e.stopShortUnits !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["distanceUnits"],
      message:
        "⛔ `distanceUnits` 與 `stopShortUnits` 互斥 —— 兩格都在改同一段長度。" +
        "要「飛滿 d」用 distanceUnits；要「停在目的地前面 g」用 stopShortUnits。",
    });
  }
};
