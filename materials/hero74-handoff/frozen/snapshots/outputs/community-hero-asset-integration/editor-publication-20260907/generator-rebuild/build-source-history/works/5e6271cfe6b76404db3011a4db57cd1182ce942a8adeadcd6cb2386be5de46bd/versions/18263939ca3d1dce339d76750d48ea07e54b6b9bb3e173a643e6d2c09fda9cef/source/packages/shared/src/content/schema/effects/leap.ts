import { z } from "zod";
import {
  EFFECT_COMMON_SHAPE,
  zEffectDef,
} from "./_shared";

export const zLeap =
/**
 * leap (task #247) — mirrors the `leap` member of `EffectDef`. Ported from
 * the map's own parabola (see sim/movement/leap.ts); `apexHeight`/`landRadius`
 * arrive here in GGD units, converted from the JASS wc3 values by `toLen`
 * inside the template expander, so there is no second conversion constant.
 */
z
  .object({
    kind: z.literal("leap"),
    ...EFFECT_COMMON_SHAPE,
    applyTo: z.enum(["self", "target"]).optional(),
    mode: z.enum(["toPoint", "inPlace"]),
    apexHeight: z.number().min(0),
    durationSec: z.number().positive(),
    throwDistance: z.number().min(0).optional(),
    /** yank the flyer to the caster before the throw (j:51755-51767) */
    dragToCaster: z.boolean().optional(),
    landRadius: z.number().min(0).optional(),
    onLand: z.array(z.lazy(() => zEffectDef)).optional(),
  })
  .strict();
