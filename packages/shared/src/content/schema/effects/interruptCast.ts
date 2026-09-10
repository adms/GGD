import { z } from "zod";
import { EFFECT_COMMON_SHAPE } from "./_shared";
export const zInterruptCast = z.object({ kind: z.literal("interruptCast"), shape: z.literal("single"), ...EFFECT_COMMON_SHAPE }).strict();
