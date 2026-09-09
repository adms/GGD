import { z } from "zod";
import { zEffectDef } from "./effect";

export const zAbilityRecast = z.object({
      windowSec: z.number().min(0.1).max(10),
      minIntervalSec: z.number().min(0.05).max(5),
      cost: z.enum(["first", "each"]),
      stages: z.array(z.object({ effects: z.array(zEffectDef).min(1).max(32) }).strict()).min(1).max(5),
    }).strict().refine(r => r.minIntervalSec < r.windowSec, {
      message: "重施放最短間隔必須小於接續窗口。",
    });
