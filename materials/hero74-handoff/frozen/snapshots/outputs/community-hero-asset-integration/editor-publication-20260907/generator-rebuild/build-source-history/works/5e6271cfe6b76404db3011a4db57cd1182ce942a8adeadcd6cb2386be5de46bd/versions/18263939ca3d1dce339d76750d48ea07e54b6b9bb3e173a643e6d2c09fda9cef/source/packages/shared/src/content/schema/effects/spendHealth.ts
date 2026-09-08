import { z } from "zod";
import { zScaling } from "../common";
import { EFFECT_COMMON_SHAPE, zRankScalar } from "./_shared";

export const zSpendHealth = z.object({
  kind: z.literal("spendHealth"),
  ...EFFECT_COMMON_SHAPE,
  amount: zScaling.describe("施法者支付的生命固定值／係數，與百分比項相加；不是傷害。"),
  pctMaxHealth: zRankScalar(z.number().min(0).max(1)).optional()
    .describe("額外支付自己最大生命的比例（0.03＝3%），於效果執行時讀取。"),
  pctCurrentHealth: zRankScalar(z.number().min(0).max(1)).optional()
    .describe("額外支付自己當前生命的比例，可逐階設定。"),
  minimumHp: z.number().min(1).max(1_000_000).optional()
    .describe("支付後保留的生命底線，省略＝1 HP；已低於底線不會回血。"),
}).strict();
