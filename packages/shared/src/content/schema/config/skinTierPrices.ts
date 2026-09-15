/**
 * `config.skin-tier-prices@1` —— 🏷️ 造型的**分級售價表**（GH#1177 追加）。
 *
 * owner 2026-09-15 15:13（逐字，對 #1177「售價由你決定」的回答）：
 *
 * > 「新模型加購參考 LOL 分級標價」
 *
 * ## ⭐ 第〇·四守則：造型文件只寫**分級名**，售價在載入時從這張表解析
 *
 * | 形狀 | 判定 |
 * |---|---|
 * | `{"priceTier": "epic"}` —— 價錢在 `resolveSkinPrice()`（TS）／`resolveSkinPrice`（Go）從表解析 | ⭐ 對 |
 * | `{"priceTier": "epic", "mcoinPrice": 1350}` | ⛔ 錯：`mcoinPrice` 是第二個住處（`zSkinDoc` 的 superRefine 擋） |
 *
 * ⇒ owner 在後台改一格分級的價錢，**所有**掛那個分級的造型一起動 —— ⛔ 不是 N 份文件各改一次。
 *
 * ## 為什麼 `tiers` 是**以分級 id 為鍵的物件**，⛔ 不是陣列
 *
 * 後台通用引擎畫得動的表格形狀是 `recordScalars`（一個 entry 模板 × N 列，`keysFixed`），
 * 物件陣列它畫不動（`arena-rules.round11.events` 那一列逐字記著）。⇒ 鍵＝分級 id（造型文件引用它），
 * 「有序」由 {@link skinPriceTierRows} 按售價排出來，⛔ 不另存一個順序欄位。
 *
 * ## ⛔ 名字刻意**不**以 `-tiers` 結尾
 *
 * 這個 repo 的 `config.*-tiers@N` 是「技能五級距」的慣例：`tools/skill-tiers/gen_tiers.ts`（每一份都要表態是不是技能軸）
 * 與 `tools/skill-spec/gen_spec.ts::tierLadderSection`（把它畫進 Codex 的技能規格）都用那條正則掃。
 * 售價分級不是技能的一軸 ⇒ 叫 `skin-tier-prices`，⛔ 不去污染那兩份產物
 * （2026-09-15 第一版叫 `skin-price-tiers`，`content:build` 裡的 gen_tiers 當場擋下並指名它）。
 *
 * ## ⛔ `label` 不含價錢
 *
 * 「一般 390」這種名稱會讓價錢住兩處（`label` 與 `mcoin`）—— owner 把 390 改成 400 的那一刻，
 * 名稱就變成謊話。⇒ 名稱只寫分級（一般／史詩…），畫面上的「一般 · 390 M幣」在顯示時組出來。
 */
import { z } from "zod";
import { zId } from "../common";
import { SKIN_PRICE_MAX, skinPriceShapeIssue, zSkinPriceTierId } from "../skin";

/** 出貨文件的 id。⭐ 消費端一律用它，⛔ 不要重打字串。 */
export const SKIN_TIER_PRICES_DOC_ID = "skin-tier-prices";
/** 藍水晶價＝M幣價 × 這個倍率的上界（打錯字的柵欄）。Go 那一半：`skinprice.go` 的 `MaxSkinCrystalPerMcoin`。 */
export const SKIN_CRYSTAL_PER_MCOIN_MAX = 1000;
/** 分級名稱的字數上界（⭐ Zod 與後台那一欄共用）。 */
export const SKIN_PRICE_TIER_LABEL_MAX = 12;
/** 內容標準說明的字數上界（⭐ Zod 與後台那一欄共用）。 */
export const SKIN_PRICE_TIER_STANDARD_MAX = 60;

const zSkinPriceTier = z
  .object({
    label: z.string().min(1).max(SKIN_PRICE_TIER_LABEL_MAX),
    mcoin: z.number().int().min(0).max(SKIN_PRICE_MAX),
    standard: z.string().min(1).max(SKIN_PRICE_TIER_STANDARD_MAX),
  })
  .strict();

export const zConfigSkinTierPricesDoc = z
  .object({
    id: zId,
    schema: z.literal("config.skin-tier-prices@1"),
    note: z.string().optional(),
    /** 造型也可以用藍水晶買：藍水晶價＝M幣價 × 這個倍率（owner 2026-09-15「造型也可以用 藍水晶來買 價格是 M幣*20倍 就好 (一樣後台設定)」）。 */
    crystalPerMcoin: z
      .number()
      .int()
      .min(0)
      .max(SKIN_CRYSTAL_PER_MCOIN_MAX)
      .describe(
        "@zh 藍水晶價倍率（M幣 × N）\n" +
          "@note 造型也可以用藍水晶買，藍水晶價＝該造型的 M幣價 × 這個倍率（出貨 {{出貨值}}；依據 owner 2026-09-15 對造型用藍水晶購買的裁決，逐字住 content/config/skin-tier-prices.json 的 note 與 GH#1177）。0 ＝ 不開放藍水晶購買。存檔後玩家下一次打開商店就是新價。",
      ),
    tiers: z.record(zSkinPriceTierId, zSkinPriceTier),
  })
  .strict()
  // ⛔ 頂層不可以 `.superRefine`（`zConfigDoc` 是 discriminatedUnion，成員必須是 ZodObject）。
  //   `.describe()` 回的仍然是 ZodObject。
  .describe(
    "@title 造型分級售價\n" +
      "@nav 🏷️ 武器道具 造型分級售價\n" +
      "@intro owner 2026-09-15：「新模型加購參考 LOL 分級標價」。⭐ 後台「模型版本 → 上架為造型」選的是**分級**，⛔ 不是填數字 —— 價錢住這張表，改一格，所有掛那個分級的造型一起變價。\n" +
      "@intro ⭐ 出貨預設 M幣＝LoL RP 1:1（一般四檔、史詩、傳說、終極；Mythic 以上用精華或抽獎取得，⛔ 不收）。來源寫在 `content/config/skin-tier-prices.json` 的 note。\n" +
      "@intro ⚠️ 只影響**寫了分級**的造型。GH#1177 之前出貨的 14 份造型寫的是字面價（mcoinPrice），⛔ 這張表改不到它們。\n" +
      "@intro ⚠️ 已經買過的玩家不受影響（擁有權不看價錢）；改價只影響之後的購買。\n" +
      "@intro ⭐ 造型也可以用**藍水晶**買：藍水晶價＝M幣價 × 「藍水晶價倍率」（owner 2026-09-15「造型也可以用 藍水晶來買 價格是 M幣*20倍 就好 (一樣後台設定)」；0 ＝ 不開放）。\n" +
      "@consumer apps/platform/internal/wallet/skinprice.go 的 resolveSkinPrice（→ wallet.go CatalogFor 的 /store/catalog 價錢、Buy 的 /store/buy 扣款）；後台 ui/ChampionModelVersionShop.tsx 的分級下拉\n" +
      "@effect 價錢**下一次請求就生效**（平台每一次算價都重讀覆蓋層，⛔ 不必重啟、⛔ 不必部署）。⚠️ 分級的**增刪**與造型文件本身仍住 content/，要 content:build＋commit＋完整部署。",
  );

export type ConfigSkinTierPricesDoc = z.infer<typeof zConfigSkinTierPricesDoc>;

/** 表上的一列（顯示用）。 */
export interface SkinPriceTierRow {
  id: string;
  label: string;
  mcoin: number;
  standard: string;
}

/** 分級 id → 售價。文件缺席 ⇒ 空表（⇒ 任何寫了分級的造型都解析不到，⛔ 不是 0 元）。 */
export function skinPriceTable(doc: Pick<ConfigSkinTierPricesDoc, "tiers"> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, tier] of Object.entries(doc?.tiers ?? {})) out[id] = tier.mcoin;
  return out;
}

/** 表上的每一列，**按售價由低到高**（同價按 id）—— 「有序」只從資料推導。 */
export function skinPriceTierRows(doc: Pick<ConfigSkinTierPricesDoc, "tiers"> | null | undefined): SkinPriceTierRow[] {
  return Object.entries(doc?.tiers ?? {})
    .map(([id, tier]) => ({ id, label: tier.label, mcoin: tier.mcoin, standard: tier.standard }))
    .sort((a, b) => a.mcoin - b.mcoin || a.id.localeCompare(b.id));
}

export type SkinPriceResolution =
  | { ok: true; mcoin: number; tier: string | null }
  | { ok: false; error: "both" | "none" | "unknown-tier" };

/**
 * ⭐ **造型定價的唯一規則**（TS 那一半）。Go 那一半是 `apps/platform/internal/wallet/skinprice.go`
 * 的 `resolveSkinPrice`，兩邊跑同一份案例 `packages/shared/src/content/skinPricing.cases.json`。
 */
export function resolveSkinPrice(
  skin: { mcoinPrice?: number; priceTier?: string },
  table: Readonly<Record<string, number>>,
): SkinPriceResolution {
  const shape = skinPriceShapeIssue(skin);
  if (shape) return { ok: false, error: shape };
  if (skin.priceTier === undefined) return { ok: true, mcoin: skin.mcoinPrice!, tier: null };
  const mcoin = Object.prototype.hasOwnProperty.call(table, skin.priceTier) ? table[skin.priceTier] : undefined;
  return mcoin === undefined ? { ok: false, error: "unknown-tier" } : { ok: true, mcoin, tier: skin.priceTier };
}

/** 名次 → 一場發幾枚 M幣（`config.store@1` 的 `mcoinRewards` 那一塊的形狀）。 */
export interface McoinPlacementRewards {
  placement1: number;
  placement2: number;
  placement3: number;
  placement4: number;
}

/**
 * ⭐ 「這個價要打幾場」的**唯一算式** —— owner 2026-09-15（逐字）：
 * 「LoL 點數購買分級為一般 390/520/750/975、史詩 1350、傳說 1820、終極 3250 => 對應打幾場的獎勵呢? 記得後台可動態參數設定」
 *
 * - `perGameAverage` ＝ 四個名次獎勵的平均（假設四個名次機會均等）；
 * - `gamesAtAverage` ＝ 價 ÷ 平均，無條件進位；平均是 0 ⇒ `null`（打多少場都拿不到）；
 * - `gamesAllFirst` ＝ 價 ÷ 第一名獎勵，無條件進位；第一名是 0 ⇒ `null`。
 * ⚠️ 平台**只在全真人對局**發 M幣（`apps/platform/internal/gamelink/callback.go` 的 perfectLobby）⇒
 *    這裡算的是「全真人對局的場數」，⛔ 不是任何一場。
 */
export function gamesToAffordSkin(
  mcoin: number,
  rewards: McoinPlacementRewards,
): { perGameAverage: number; gamesAtAverage: number | null; gamesAllFirst: number | null } {
  const perGameAverage = (rewards.placement1 + rewards.placement2 + rewards.placement3 + rewards.placement4) / 4;
  const price = Math.max(0, mcoin);
  return {
    perGameAverage,
    gamesAtAverage: perGameAverage > 0 ? Math.ceil(price / perGameAverage) : price === 0 ? 0 : null,
    gamesAllFirst: rewards.placement1 > 0 ? Math.ceil(price / rewards.placement1) : price === 0 ? 0 : null,
  };
}

/** 造型的藍水晶價（M幣價 × 倍率）；倍率 0 ⇒ `null`（不開放藍水晶購買）。Go 那一半：`Catalog.SkinCrystalPrice`。 */
export function skinCrystalPrice(mcoin: number, crystalPerMcoin: number): number | null {
  return crystalPerMcoin > 0 ? mcoin * crystalPerMcoin : null;
}
