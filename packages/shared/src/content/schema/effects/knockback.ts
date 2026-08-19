import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import { KB_MAX_DISTANCE, KB_MAX_GETUP_TICKS, KB_MAX_IMPACT_POWER, KB_MAX_LAUNCH_HEIGHT } from "../../../sim/effects/knockbackLimits";
import { DISPLACEMENT_AUTHORED_SPEED_MAX, DISPLACEMENT_SPEED_MIN } from "../../displacementTiers";
import { zDisplacementTier } from "../displacementDoc";
import {
  EFFECT_COMMON_SHAPE,
} from "./_shared";

/**
 * 位移級距（GH#318）與**既有的**擊飛四檔 `launchDistance` 互斥。
 *
 * 兩者都在回答「這一下把人推多遠」，但走的是兩套互相看不見的路：
 *   · `distanceTier` —— **註冊期**查表，寫進 `distance`，照常跑 gap 減法與 `impactPower`；
 *   · `launchDistance` —— **執行期**解析（`toEdge` 要讀當下的火圈半徑），而且
 *     `sim/effects/knockback.ts` 在那條路上**整段跳過** gap 減法與 `impactPower`。
 * 兩格同時填，編輯器會顯示級距那個數字，場上跑的是另一個 —— 那正是
 * `aoeTiers.ts` 自己警告過的「兩份查表」，而且沒有任何東西會紅。
 */
function refineKnockbackTier(e: EffectDef, ctx: z.RefinementCtx): void {
  const kb = e as { distanceTier?: unknown; launchDistance?: unknown };
  if (kb.distanceTier !== undefined && kb.launchDistance !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["distanceTier"],
      message:
        "distanceTier 與 launchDistance 只能填一個 —— 兩者都在決定推多遠，" +
        "但擊飛四檔是執行期解析而且跳過 gap 減法與 impactPower，" +
        "同時填會讓編輯器顯示的距離與場上跑的距離永遠對不起來",
    });
  }
}

export const zKnockback =
z
  .object({
    kind: z.literal("knockback"),
    ...EFFECT_COMMON_SHAPE,
    /**
     * GGD units **AT GAP 0** — the FLOOR, not a fixed length: the GH#193 gap
     * subtraction still runs on top (see sim/effects/knockback.ts). Bounds
     * live in `sim/effects/knockbackLimits.ts`, the same one-table-two-
     * consumers shape `spreadLimits` uses, so schema and sim cannot drift.
     */
    distance: z.number().positive().max(KB_MAX_DISTANCE),
    /**
     * u/s。上界從 `KB_MAX_SPEED (200)` 降到位移護欄 —— 200 u/s 是一個 tick 走
     * 6.7 單位 = 身體半徑的 11 倍，一發保證穿牆的擊退（GH#318）。
     * ⚠️ 這仍然只是護欄；真正的天花板是註冊期推導的 `maxSpeed`。
     */
    speed: z.number().min(DISPLACEMENT_SPEED_MIN).max(DISPLACEMENT_AUTHORED_SPEED_MAX),
    /**
     * ⭐ 位移級別（GH#318）—— **push** 那條梯。與 `launchDistance` **互斥**
     * （`refineEffectDef` 擋）：那四檔走的是完全不同的一套（執行期解析、跳過 gap
     * 減法與 `impactPower`），兩份查表就是「編輯器顯示 4.5、場上打 6.0」。
     */
    distanceTier: zDisplacementTier
      .optional()
      .describe(
        "擊退級別（小/中/大/極大）。填了就不用填距離與速度。⛔ 不可以和「擊飛落點」同時填。",
      ),
    /** away from the caster (default), along the caster's facing, or a PULL */
    from: z.enum(["caster", "facing", "pull"]).optional(),
    /** each resolved target (default) or the caster (a recoil) */
    applyTo: z.enum(["target", "self"]).optional(),
    /**
     * 「這一擊的重量」in DAMAGE units, run through GH#193's own law against
     * the victim's health. Deals no damage. ABSENT = the flat floor only.
     */
    impactPower: z.number().positive().max(KB_MAX_IMPACT_POWER).optional(),
    /** percentage of MAX health (default, the shipped rule) or CURRENT health */
    hpBasis: z.enum(["max", "current"]).optional(),
    /** subtract the caster↔victim gap (GH#193). ABSENT = true. */
    subtractGap: z.boolean().optional(),
    /** 擊飛: apex height in GGD units; > 0 turns the shove into a parabola */
    launchHeight: z.number().min(0).max(KB_MAX_LAUNCH_HEIGHT).optional(),
    /**
     * ⭐ 擊飛的**落點**，四檔（owner 2026-08-09 / GH#301-1）。
     * 省略 = 今天的行為（＝ `"default"`，由 `distance` / `impactPower` / 距離
     * 減法推算）。⛔ 不是自由數字 —— 那是 owner 明講的簡化。
     * 完整推導與「四檔的實際距離必須住在 `config.combat-feel@1`、不可以是
     * 引擎裡的常數」寫在 `sim/effects/effect.ts` 的 `knockback.launchDistance`。
     */
    launchDistance: z
      .enum(["short", "default", "long", "toEdge"])
      .optional()
      .describe(
        "擊飛落點：一小段 / 預設（系統推算，＝省略時的行為）/ 一大段 / 到底部（推到決鬥區邊緣）。" +
          "四檔的實際距離在後台「戰鬥手感」頁調，這裡只選檔位。",
      ),
    /** 期間不可控制 (world.knockdown). ABSENT = true. */
    uncontrollable: z.boolean().optional(),
    /** extra 不可控制 ticks after landing (the 爬起來 window) */
    getupTicks: z.number().int().min(0).max(KB_MAX_GETUP_TICKS).optional(),
  })
  .strict();

export const refine = refineKnockbackTier;
