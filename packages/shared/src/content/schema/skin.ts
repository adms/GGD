/**
 * skin@1 — a purchasable cosmetic skin for one champion. A skin swaps the
 * champion's model (modelKey → models collection) and is bought with M COIN
 * on the platform (see content/config/store.json for champion pricing and
 * match rewards). `mcoinPrice` 0 means the skin is free.
 */
import { z } from "zod";
import { zAlpha, zId, zRef, zTintRgb } from "./common";

export const zSkinDoc = z
  .object({
    id: zId,
    schema: z.literal("skin@1"),
    /** the champion this skin applies to */
    championId: zRef("champions"),
    name: z.string().min(1),
    description: z.string().optional(),
    /** M COIN price; integer ≥ 0 (0 = free) */
    mcoinPrice: z.number().int().min(0),
    /** replacement model when the skin is equipped */
    modelKey: zRef("models"),
    /**
     * Vertex-colour MULTIPLY `[r,g,b]` 0..1 that OVERRIDES the champion's own
     * `tint` while this skin is equipped (a skin swaps the mesh, so it must be
     * able to restate the colour). Absent = fall back to `champion.tint`;
     * `[1,1,1]` = explicitly clear a tinted champion back to neutral.
     */
    tint: zTintRgb.optional(),
    /** Opacity 0..1 overriding `champion.alpha`; absent = fall back. */
    alpha: zAlpha.optional(),
  })
  .strict();

export type SkinDoc = z.infer<typeof zSkinDoc>;
