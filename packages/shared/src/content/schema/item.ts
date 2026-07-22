/** item@1 — mirrors `ItemDef` in sim/content/defs.ts. */
import { z } from "zod";
import type { ItemId } from "../../ids";
import { zIdFor, zItemStatModifier } from "./common";
import { zHookDef } from "./effect";

export const zItemDef = z
  .object({
    id: zIdFor<ItemId>(),
    name: z.string().min(1),
    /**
     * Human-readable item description recovered from the w3x source (WC3 color
     * codes stripped, line breaks normalized). Optional metadata — absent when
     * the map yields no text. Not consumed by the sim; drives editor/UI display.
     */
    description: z.string().optional(),
    cost: z.number().int().min(0),
    tier: z.number().int().min(1).max(5),
    unique: z.boolean().optional(),
    /** Range-guarded: see `zItemStatModifier` for why items get their own band. */
    modifiers: z.array(zItemStatModifier).optional(),
    passive: z.array(zHookDef).optional(),
    iconKey: z.string().optional(),
    /**
     * w3x item icon extracted from the map archive (task #33), path relative
     * to content/, e.g. "assets/icons/items/godie-i022.png". Absent = the
     * source used Blizzard STOCK art — client keeps its text-only fallback.
     * (`iconKey` above is the legacy skeleton-era symbolic key — unrelated.)
     */
    icon: z.string().regex(/^assets\//, "icon must be relative to content/ and start with assets/").optional(),
    tags: z.array(z.string()),
  })
  .strict();

export const zItemDoc = zItemDef.extend({ schema: z.literal("item@1") }).strict();

export type ItemDoc = z.infer<typeof zItemDoc>;
