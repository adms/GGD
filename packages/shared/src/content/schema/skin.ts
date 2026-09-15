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
    /**
     * M COIN price; integer ≥ 0 (0 = free). The upper bound is a typo guard,
     * not a balance opinion (第一守則：欄位要有上界) — GH#1177 made pricing a
     * routine 後台 action, so 750 typed as 7500000 has to stop at validate.
     */
    mcoinPrice: z.number().int().min(0).max(1_000_000),
    /**
     * GH#1177 商店上架開關 —— ABSENT == listed (true), so every skin that shipped
     * before this field keeps selling exactly as before. `false` = 下架：the
     * platform stops OFFERING it (hidden from non-owners' catalog, /store/buy
     * refuses it) but a player who already bought it KEEPS it — it stays in their
     * catalog, stays equippable and still renders. Delisting is the rollback, and
     * it never deletes the doc (an account's ownedSkins still names this id).
     * Consumers: apps/platform/internal/wallet/catalog.go `SkinDef.OnSale`
     * (→ wallet.go CatalogFor / Buy) and apps/client/src/ui/platform/catalog.ts
     * `deriveStoreRows`.
     */
    listed: z.boolean().optional(),
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

/** GH#1177 —— `listed` 缺席＝上架；只有明寫 `false` 才是下架。 */
export function skinOnSale(doc: { listed?: boolean }): boolean {
  return doc.listed !== false;
}
