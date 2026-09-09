import { z } from "zod";
import type { StatusId } from "../../../ids";
import type { EffectDef } from "../../../sim/effects/effect";
import { MARK_MAX_COUNT } from "../../../sim/markLimits";
import { zRef } from "../common";
import { EFFECT_COMMON_SHAPE, refineDispelShape, zAoeTier, zEffectDef } from "./_shared";

export const zConsumeStatus = z.object({
  kind: z.literal("consumeStatus"),
  ...EFFECT_COMMON_SHAPE,
  shape: z.enum(["single", "circle"]),
  radius: z.number().positive().max(40).optional(),
  radiusTier: zAoeTier.optional(),
  side: z.enum(["allies", "enemies"]).optional(),
  maxTargets: z.number().int().positive().max(24).optional(),
  statusId: zRef<StatusId>("status-effects", { soft: true }),
  count: z.union([z.number().int().min(1).max(MARK_MAX_COUNT), z.literal("all")])
    .describe("足額才扣除；all 扣除全部符合的有效層數。資源不足時完全不扣。"),
  subject: z.enum(["self", "target"]).optional()
    .describe("self 只扣自己一次並保留分支目標；省略或 target 對每位目標各自判斷。"),
  appliedBy: z.enum(["self"]).optional()
    .describe("self 只消耗自己施加的狀態；省略包含其他施法者。具名資源計數器沒有施法者歸屬。"),
  onConsumed: z.array(zEffectDef).min(1).describe("扣除完成後執行；不再重判斷剛移除的狀態。"),
  onMissing: z.array(zEffectDef).min(1).optional().describe("層數不足時執行；省略則不產生後續效果。"),
}).strict();

export const refine = (e: Extract<EffectDef, { kind: "consumeStatus" }>, ctx: z.RefinementCtx): void => {
  refineDispelShape(e, ctx);
};
