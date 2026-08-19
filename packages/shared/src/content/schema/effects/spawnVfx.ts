import { z } from "zod";
import { zRef } from "../common";
import {
  EFFECT_COMMON_SHAPE,
} from "./_shared";

export const zSpawnVfx =
z
  .object({
    kind: z.literal("spawnVfx"),
    ...EFFECT_COMMON_SHAPE,
    /** vfx@1 doc id (SOFT ref — the doc may be imported/authored later). */
    vfxId: zRef("vfx", { soft: true }),
    /** where the one-shot plays: caster (default), first target, or the cast point. */
    at: z.enum(["self", "target", "point"]).optional(),
    /** seconds a continuous doc keeps emitting (client hint; optional). */
    durationSec: z.number().min(0).optional(),
  })
  .strict();
