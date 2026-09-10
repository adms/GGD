import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import {
  PULL_MAX_RADIUS,
  SCREEN_FLASH_MAX_ALPHA,
  SCREEN_FLASH_MAX_SEC,
} from "../../../sim/effects/kindLimits";
import { EFFECT_COMMON_SHAPE, refineDispelShape, refineCueGeometry, zRgb } from "./_shared";

/**
 * ⭐【螢幕閃爍】`screenFlash`（#543）—— owner 2026-08-22：
 * 「**畫面閃爍及震動 不然都不知道發生什麼事情**」。
 *
 * ⚠️ 上界是**打錯數字的柵欄**，⛔ 不是出貨強度：「這一台機器最多准閃多亮」
 * 是玩家可及性的問題（`prefers-reduced-motion`），它屬於 `config.screen-cues@1`
 * 的後台一格（第一守則），⛔ 不屬於任何一支技能的 JSON。
 */
export const zScreenFlash = z
  .object({
    kind: z.literal("screenFlash"),
    ...EFFECT_COMMON_SHAPE,
    /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。`applyTo:"victim"` 時它決定名單。 */
    shape: z.enum(["single", "circle"]),
    radius: z.number().positive().max(PULL_MAX_RADIUS).optional(),
    side: z.enum(["enemies", "allies"]).optional(),
    maxTargets: z.number().int().positive().max(24).optional(),
    colorRgb: zRgb,
    peakAlpha: z
      .number()
      .positive()
      .max(SCREEN_FLASH_MAX_ALPHA)
      .describe("最亮的那一刻有多不透明（0..1）。出貨強度由 config.screen-cues@1 再乘一次。"),
    durationSec: z.number().positive().max(SCREEN_FLASH_MAX_SEC),
    /**
     * ⭐ GH#602（owner 2026-08-23 裁決 (a)）—— **劇本指定的演出**豁免全域上限。
     *
     * > 「讓『**劇本指定的演出**』可以**豁免全域上限**（全域上限的本意是**防濫用**，
     * >  ⛔ 不是防你自己寫的演出）」
     *
     * ⚠️ 觸發它的是殭屍王的「**全畫面變黑一秒漸變回復**」：出貨全域上限是
     * `flashMaxAlpha 0.55 / flashMaxSec 0.6` ⇒ 那一秒的黑會被夾成**淡灰半秒**。
     *
     * ⛔ **它不是「無上限」** —— 仍然吃 `zScreenFlash` 自己的 `SCREEN_FLASH_MAX_*`
     * （防 mis-parse 的柵欄）與**無障礙**那一格（`reducedFlashMult` 照樣乘）。
     * ⭐ 它豁免的只有**營運端的全域上限**，而那一格的本意逐字是「一支寫了
     * `peakAlpha: 1` 的技能不可以把畫面打成全白」—— ⛔ 那是防**內容作者濫用**，
     * 而這一格正是內容作者**刻意**要的演出。
     *
     * ⚠️ 出貨預設 `false`：⭐ 豁免要是**顯式的一格**，⛔ 不是預設行為。
     */
    scripted: z
      .boolean()
      .optional()
      .describe("劇本指定的演出：豁免 config.screen-fx@1 的全域上限（仍吃無障礙與 schema 硬上限）。"),
    applyTo: z
      .enum(["self", "victim", "all"])
      .optional()
      .describe("誰的畫面會閃：self（預設，只有施法者）／victim（這一段解出來的目標）／all（全場）。"),
  })
  .strict();

export const refine = (
  e: Extract<EffectDef, { kind: "screenFlash" }>,
  ctx: z.RefinementCtx,
): void => {
  refineDispelShape(e, ctx);
  refineCueGeometry(e, ctx);
};
