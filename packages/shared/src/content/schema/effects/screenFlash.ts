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
