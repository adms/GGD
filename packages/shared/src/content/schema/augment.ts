/** augment@1 — mirrors `AugmentDef` in sim/content/defs.ts. */
import { z } from "zod";
import type { AugmentId } from "../../ids";
import { zIdFor, zStatModifier } from "./common";
import { zHookDef } from "./effect";

export const zAugmentTier = z.enum(["silver", "gold", "prismatic"]);

export const zAugmentDef = z
  .object({
    id: zIdFor<AugmentId>(),
    name: z.string().min(1),
    description: z.string().min(1),
    tier: zAugmentTier,
    weight: z.number().positive(),
    modifiers: z.array(zStatModifier).optional(),
    hooks: z.array(zHookDef).optional(),
    tags: z.array(z.string()),
  })
  .strict();

export const zAugmentDoc = zAugmentDef.extend({ schema: z.literal("augment@1") }).strict();

export type AugmentDoc = z.infer<typeof zAugmentDoc>;
