import { z } from "zod";
import type { EffectDef } from "../../../sim/effects/effect";
import {
  FLOATING_TEXT_MAX_LEN,
  FLOATING_TEXT_MAX_RISE,
  FLOATING_TEXT_MAX_SEC,
  FLOATING_TEXT_MAX_SIZE_SCALE,
  PULL_MAX_RADIUS,
} from "../../../sim/effects/kindLimits";
import { EFFECT_COMMON_SHAPE, refineDispelShape, refineCueGeometry, zRgb } from "./_shared";

/**
 * ⭐【特效文字】`floatingText`（#549）—— 原作 `CreateTextTagUnitBJ`
 * （例：克勞德每一刀冒 `1Hit`…`7Hit`，`war3map.j:33856`）。
 *
 * ⭐ `text` 支援佔位符 `{{i}}` = **這一次執行是序列裡的第幾段**，所以
 * 「1Hit…7Hit」是 `comboStrikes.perStrike` 裡的**一個**節點寫 `"{{i}}Hit"`，
 * ⛔ 不是七個各寫死一個數字的節點（第〇·四守則）。
 */
export const zFloatingText = z
  .object({
    kind: z.literal("floatingText"),
    ...EFFECT_COMMON_SHAPE,
    /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。`applyTo:"victim"` 時它決定名單。 */
    shape: z.enum(["single", "circle"]),
    radius: z.number().positive().max(PULL_MAX_RADIUS).optional(),
    side: z.enum(["enemies", "allies"]).optional(),
    maxTargets: z.number().int().positive().max(24).optional(),
    text: z
      .string()
      .min(1)
      .max(FLOATING_TEXT_MAX_LEN)
      .describe("要冒的字。⭐ 支援 {{i}}（第幾段）—— 連段的「1Hit…7Hit」寫成一個節點。"),
    colorRgb: zRgb.optional(),
    sizeScale: z.number().positive().max(FLOATING_TEXT_MAX_SIZE_SCALE).optional(),
    riseSpeed: z.number().min(0).max(FLOATING_TEXT_MAX_RISE).optional(),
    durationSec: z.number().positive().max(FLOATING_TEXT_MAX_SEC).optional(),
    applyTo: z
      .enum(["self", "victim"])
      .optional()
      .describe("字冒在誰頭上。⛔ 沒有 all —— 字要有一個身體當錨。"),
  })
  .strict();

export const refine = (
  e: Extract<EffectDef, { kind: "floatingText" }>,
  ctx: z.RefinementCtx,
): void => {
  refineDispelShape(e, ctx);
  refineCueGeometry(e, ctx);
};
