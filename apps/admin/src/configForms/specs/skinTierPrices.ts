// ──────────────────── 造型分級售價 (config/skin-tier-prices) ─
/**
 * 🏷️ GH#1177 追加 —— owner 2026-09-15（逐字）：「新模型加購參考 LOL 分級標價」。
 *
 * ⭐ 整份 spec 從 Zod 推導（`specFromZod`，文件層的人話住 `zConfigSkinTierPricesDoc` 的 `.describe()`），
 * 這裡只補引擎推導不到的那一格：`tiers` 是 `z.record`（鍵＝分級 id）⇒ 畫成 `recordScalars` 表。
 *
 * ⛔ **鍵不開放編輯（`keysFixed`）**：分級 id 是造型文件 `priceTier` 引用的 join key ——
 * 後台改一個字 ⇒ 掛那個分級的造型全部解析不到 ⇒ 平台下次開機拒絕載入。增刪分級走內容（content/）。
 * ⭐ 三格上界都讀 schema 那一側的常數（第〇·四：⛔ 不在這裡抄第二份數字）。
 */
import { SKIN_PRICE_MAX } from "@ggd/shared/content/schema/skin";
import {
  SKIN_PRICE_TIER_LABEL_MAX,
  SKIN_PRICE_TIER_STANDARD_MAX,
  zConfigSkinTierPricesDoc,
} from "@ggd/shared/content/schema/config/skinTierPrices";
import type { ConfigDocSpec } from "../engine";
import { specFromZod } from "../schemaToForm";

export const SKIN_TIER_PRICES_SPEC: ConfigDocSpec<"skinTierPrices"> = specFromZod(zConfigSkinTierPricesDoc, "skinTierPrices", {
  tables: [
    {
      path: "tiers",
      shape: "recordScalars",
      keysFixed: true,
      title: "分級（一列一個，上架時從這裡選）",
      intro: [
        "**每一列是一個分級**：模型版本上架為造型時，後台只讓你選分級 —— 售價就是這一列的「M幣」。改這一格，所有掛這個分級的造型一起變價（已經買過的玩家不受影響）。",
        "⭐ 出貨預設是 LoL 的 RP 價目 1:1。「內容標準」那一欄是 LoL 同級造型通常做到的程度，只是幫你判斷一顆新模型該進哪一級，⛔ 不影響任何行為。",
      ],
      key: {
        zh: "分級 id",
        note: "造型文件的 priceTier 逐字引用這個字串。⛔ 唯讀：改一個字，掛這個分級的造型全部解析不到售價 ⇒ 平台下一次開機會拒絕載入整份商店目錄。要增刪分級請改 content/config/skin-tier-prices.json。",
        maxLen: 32,
      },
      columns: [
        {
          field: "label",
          zh: "分級名稱",
          kind: "text",
          maxLen: SKIN_PRICE_TIER_LABEL_MAX,
          width: 90,
          note: "上架下拉選單與商品列上看到的名字（例：一般、史詩）。⛔ 不要把價錢寫進名稱 —— 價錢住右邊那一格，名稱裡的數字在你改價的那一刻就變成謊話。",
        },
        {
          field: "mcoin",
          zh: "M幣",
          kind: "int",
          min: 0,
          max: SKIN_PRICE_MAX,
          width: 110,
          note: "這個分級的造型賣多少 M幣（0＝免費）。存檔後玩家下一次打開商店就是新價，購買也照新價扣；⛔ 已經買過的人不退不補。上界是打錯字的柵欄。",
        },
        {
          field: "standard",
          zh: "內容標準",
          kind: "text",
          maxLen: SKIN_PRICE_TIER_STANDARD_MAX,
          width: 260,
          note: "這一級的造型通常做到什麼程度（LoL 的分級標準：貼圖／新動作與音效／全面重做／多型態）。它只出現在上架下拉選單裡幫你挑分級，⛔ 遊戲不讀它。",
        },
      ],
      minRows: 1,
      maxRows: 32,
    },
  ],
});
