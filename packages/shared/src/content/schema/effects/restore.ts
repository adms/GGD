import { z } from "zod";
import {
  EFFECT_COMMON_SHAPE,
  zRankScalar,
} from "./_shared";

export const zRestore =
z
  .object({
    kind: z.literal("restore"),
    ...EFFECT_COMMON_SHAPE,
    /** 0..1 of the TARGET's max health (WC3 SetUnitLifePercentBJ). ⭐ 逐階可填陣列。 */
    healthPct: zRankScalar(z.number().min(0).max(1)).optional(),
    /** 0..1 of the TARGET's max mana (WC3 SetUnitManaPercentBJ). ⭐ 逐階可填陣列。 */
    manaPct: zRankScalar(z.number().min(0).max(1)).optional(),
    /**
     * ⭐ G11（GH#299）—— 回誰身上。省略 = `"target"` = 今天的行為。
     * 「回自己」在此之前只能靠 `randomArea{who:"self"}` 包一層繞過去。
     */
    applyTo: z.enum(["self", "target"]).optional(),
  })
  .strict();
