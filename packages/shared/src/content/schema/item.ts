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
    /**
     * Crafting/provenance role recovered from the source-map TRIGGERS
     * (tools/w3x-import/extract_item_roles.py), NOT inferred from cost or name.
     * The shop lists only `final`; the 3-choose-1 draft offers only `quest`.
     * See `ItemCraftRole` in sim/content/defs.ts for the full role vocabulary
     * and task #70 for why a structural marker had to replace the cost filter.
     */
    craftRole: z
      .enum(["final", "component", "quest", "token", "direct", "service", "none"])
      .optional(),
    /**
     * The recipe a `final` item's own trigger implements (book + components),
     * kept for auditability. GGD has no combine step; this is provenance only.
     */
    recipe: z
      .object({
        book: zIdFor<ItemId>().optional(),
        components: z.array(zIdFor<ItemId>()),
      })
      .strict()
      .optional(),
  })
  .strict();

export const zItemDoc = zItemDef.extend({ schema: z.literal("item@1") }).strict();

export type ItemDoc = z.infer<typeof zItemDoc>;
