import { z } from "zod";
import { zScaling } from "../common";
import {
  EFFECT_COMMON_SHAPE,
  zApplyToSelfOrTarget,
} from "./_shared";

export const zHeal =
z
  .object({
    kind: z.literal("heal"),
    ...EFFECT_COMMON_SHAPE,
    amount: zScaling,
    /** ⭐ G11（GH#299）—— 回自己。省略 = target = 今天的行為。 */
    applyTo: zApplyToSelfOrTarget,
  })
  .strict();
