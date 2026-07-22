/**
 * status-effect@1 — minimal metadata for statuses referenced by
 * `applyStatus.statusId`. The mechanical parameters (slow %, root, stun) live
 * inline on the effect; these docs give statuses a display identity (name,
 * icon, tags) and an existence check (soft ref — warn only).
 */
import { z } from "zod";
import type { StatusId } from "../../ids";
import { zIdFor } from "./common";

export const zStatusEffectDoc = z
  .object({
    id: zIdFor<StatusId>(),
    schema: z.literal("status-effect@1"),
    name: z.string().min(1),
    description: z.string().optional(),
    iconKey: z.string().optional(),
    /** presentation hint for the HUD (debuff = red border, etc.) */
    polarity: z.enum(["buff", "debuff"]).optional(),
    tags: z.array(z.string()).optional(),
  })
  .strict();

export type StatusEffectDoc = z.infer<typeof zStatusEffectDoc>;
