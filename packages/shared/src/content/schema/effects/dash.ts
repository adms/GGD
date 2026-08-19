import { z } from "zod";
import { DASH_ON_END_MAX_EFFECTS } from "../../../sim/effects/kindLimits";
import { DISPLACEMENT_AUTHORED_SPEED_MAX, DISPLACEMENT_SPEED_MIN, DISPLACEMENT_TRAVEL_DISTANCE_MAX } from "../../displacementTiers";
import { zDisplacementTier } from "../displacementDoc";
import {
  EFFECT_COMMON_SHAPE,
  zEffectDef,
} from "./_shared";

export const zDash =
z
  .object({
    kind: z.literal("dash"),
    ...EFFECT_COMMON_SHAPE,
    mode: z.enum(["forward", "toPoint"]),
    /**
     * u/s。⚠️ 這個上界是 **MIS-PARSE 護欄**（w3x 的 1000 貼進來），⛔ 不是安全上限 ——
     * 真正的天花板是註冊期推導的 `maxSpeed`（`content/displacementTiers.ts`），
     * 因為穿牆門檻吃的是 config 裡的身體半徑，不可能是一個靜態的 Zod 數字。
     * 填高於天花板的值不會壞，只是會被夾掉（GH#318）。
     */
    speed: z
      .number()
      .min(DISPLACEMENT_SPEED_MIN)
      .max(DISPLACEMENT_AUTHORED_SPEED_MAX)
      .describe("衝刺速度（GGD 單位/秒）。⚠️ 上線時會被安全上限夾住；收招時間 = 距離 ÷ 速度。"),
    /**
     * ⚠️ **固定發射長度，不是施法距離。** `mode:"toPoint"` 只用點算**方向**，
     * `remaining` 一律是這一格（`sim/systems/MovementSystem.ts` 的 `startDash`）——
     * 點在腳邊也照樣衝滿。上界 24 = 決鬥區半徑，理由見 `displacementTiers.ts`。
     */
    maxDistance: z
      .number()
      .positive()
      .max(DISPLACEMENT_TRAVEL_DISTANCE_MAX)
      .describe(
        "衝刺的**固定發射長度**（GGD 單位）——⚠️ 不是施法距離：指定地點只決定方向，距離永遠是這一格。",
      ),
    /**
     * ⭐ 位移級別（GH#318）。填了它就不要填 `speed` / `maxDistance` ——
     * 註冊時由 `config.displacement-tiers@1` 的 **travel** 梯翻成兩個數字，
     * 兩者都填則**級別贏**（同 `radiusTier`：讓手寫值蓋過級別 = 這個機制對那支
     * 技能靜默不存在）。唯一的查表處：`content/displacementTiers.ts`。
     */
    distanceTier: zDisplacementTier
      .optional()
      .describe(
        "位移級別（小/中/大/極大）。填了就不用填速度與距離 —— 兩個數字由後台「位移級距」頁統一給。",
      ),
    /**
     * ⭐ S7 —— **衝刺結束那一刻**才跑的一段（52-04「向前衝刺 400 距離後揮出」）。
     * 省略 = 沒有回呼 = 今天，一個 tick 都不差（出貨 29 份帶 dash 的文件全部缺席）。
     *
     * ⚠️ 沒有它的話那一刀是從**起點**揮的：實測 `[dash, damageArea]` 寫在同一個
     * `effects[]` 裡，受害者掉血與「完全不放那個 AoE」**逐字相同**（43.47），
     * 而同一個 AoE 從終點放是 199.83。原因是順序：effect 在 slot 2b/3 跑完，
     * 位移在 slot 5 才發生。
     *
     * `z.lazy` 的理由與 `leap.onLand` 逐字相同（遞迴結）。
     */
    onEnd: z
      .array(z.lazy(() => zEffectDef))
      .min(1)
      .max(DASH_ON_END_MAX_EFFECTS)
      .optional()
      .describe(
        "衝刺**結束之後**才跑的效果（「衝刺後揮出」）。留空＝只有位移。" +
          "⚠️ 寫在這裡的範圍傷害圓心是**終點**；寫在外面的效果圓心是起點。",
      ),
    /**
     * ⭐ S7 —— 被牆擋下來的衝刺算不算「衝完」。省略 = `"always"`。
     * ⚠️ 這是一個真的岔路：位移系統今天把「撞牆停下」與「跑完距離」合成**同一個**
     * 結束條件。預設選 always，因為卡面說「衝刺後揮出」，而一刀被場景取消是玩家
     * 看不見的失敗。
     */
    onEndOn: z
      .enum(["always", "completed"])
      .optional()
      .describe(
        "被地形擋下來的衝刺算不算衝完：always（預設，照樣揮出）或 completed（只有跑完距離才揮）。",
      ),
    /** ⭐ S7 —— 衝刺途中死掉還要不要揮。省略 = false（同 randomArea 的同名欄位）。 */
    onEndWhenDead: z
      .boolean()
      .optional()
      .describe("衝刺途中陣亡還要不要跑結束效果。留空＝不跑。"),
  })
  .strict();
