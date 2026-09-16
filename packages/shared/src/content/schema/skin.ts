/**
 * skin@1 — a purchasable cosmetic skin for one champion. A skin swaps the
 * champion's model (modelKey → models collection) and is bought with M COIN
 * on the platform (see content/config/store.json for champion pricing and
 * match rewards). The price is EXACTLY ONE of a literal `mcoinPrice` (0 = free)
 * or a `priceTier` resolved from content/config/skin-tier-prices.json (GH#1177 追加).
 */
import { z } from "zod";
import { zAlpha, zId, zRef, zTintRgb } from "./common";

/**
 * GH#1177 —— 造型售價的上界，⭐ 唯一住處（第〇·四守則）。
 * 讀它的：下面 `mcoinPrice` 的 Zod `.max` ＋ 分級表每一格的 `mcoin`（`config/skinTierPrices.ts`）＋
 * 後台「造型分級售價」那一欄的上界（`apps/admin/src/configForms/specs/skinTierPrices.ts`）。
 * 打錯字的柵欄，⛔ 不是平衡意見；要放寬就改這一行，三邊一起動。
 */
export const SKIN_PRICE_MAX = 1_000_000;

/**
 * GH#1177 追加 —— 造型**分級**的 id 形狀，⭐ 唯一住處。owner 2026-09-15（逐字）：「新模型加購參考 LOL 分級標價」。
 * 讀它的：下面的 `priceTier` ＋ `config/skinTierPrices.ts` 的 `tiers` 鍵（同一條正則，⛔ 不抄第二份）。
 */
export const zSkinPriceTierId = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,31}$/, "分級 id 只能是小寫英數與連字號（例 epic、standard-3）");

/**
 * 一份造型的定價**寫法**有沒有犯規 —— ⭐ Zod（下面的 superRefine）與 `resolveSkinPrice()`
 * （`config/skinTierPrices.ts`）共用這一條，Go 那一側對表見 `skinPricing.cases.json`。
 *   `both` ＝ `mcoinPrice` 與 `priceTier` 都寫了（第〇·四守則：級別與算好的值不可並存）
 *   `none` ＝ 兩個都沒寫（⛔ 不可以讀成 0 元 —— 缺價錢讀成免費正是 championPrices 送英雄的形狀）
 */
export function skinPriceShapeIssue(doc: { mcoinPrice?: number; priceTier?: string }): "both" | "none" | null {
  const literal = doc.mcoinPrice !== undefined;
  const tier = doc.priceTier !== undefined;
  if (literal && tier) return "both";
  return literal || tier ? null : "none";
}

export const zSkinDoc = z
  .object({
    id: zId,
    schema: z.literal("skin@1"),
    /** the champion this skin applies to */
    championId: zRef("champions"),
    name: z.string().min(1),
    description: z.string().optional(),
    /**
     * LITERAL M COIN price; integer ≥ 0 (0 = free). The upper bound is a typo
     * guard, not a balance opinion (第一守則：欄位要有上界).
     *
     * ⚠️ GH#1177 追加：exactly ONE of `mcoinPrice` / `priceTier` (superRefine below).
     * The 14 skins that shipped before the tier table keep their literal price
     * untouched; a model version listed from 後台 writes `priceTier` only.
     */
    mcoinPrice: z.number().int().min(0).max(SKIN_PRICE_MAX).optional(),
    /**
     * GH#1177 追加 —— 分級名（`content/config/skin-tier-prices.json` 的一個鍵）。⭐ 售價在**載入時**
     * 從那張表解析（第〇·四守則：值只住表上，⛔ 不烘進造型文件）。消費端：
     * `apps/platform/internal/wallet/skinprice.go` `resolveSkinPrice`（→ /store/catalog、/store/buy）。
     * 表上查不到的分級名 ⇒ 平台開機失敗（⛔ 不是 0 元），`skinTierPrices.test.ts` 在 commit 前先擋。
     */
    priceTier: zSkinPriceTierId.optional(),
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
  .strict()
  .superRefine((doc, ctx) => {
    const issue = skinPriceShapeIssue(doc);
    if (issue === "both") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["priceTier"], message: "mcoinPrice 與 priceTier 只能寫一個（新造型只寫 priceTier，售價從分級表解析）" });
    } else if (issue === "none") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["priceTier"], message: "造型沒有售價：mcoinPrice（字面價）或 priceTier（分級）要寫一個 —— ⛔ 不會被當成 0 元" });
    }
  });

export type SkinDoc = z.infer<typeof zSkinDoc>;

/** GH#1177 —— `listed` 缺席＝上架；只有明寫 `false` 才是下架。 */
export function skinOnSale(doc: { listed?: boolean }): boolean {
  return doc.listed !== false;
}
