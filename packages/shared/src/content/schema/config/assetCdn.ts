/**
 * `config.asset-cdn@1` —— ⭐ 素材走 CDN 還是走站台自己（GH#1116）。
 *
 * ## ⭐ owner 要的那件事
 *
 * > 「使用 S3 存資源庫 作為**所有網站上下傳統一資源庫** (icon, 3d model, voice, music ...etc)，
 * >  這樣**不管哪個網站執行 GGD 專案都可以運用 S3 加速下載**而不會卡在網站本身速度」
 * >  （2026-09-08，逐字）
 *
 * ## ⛔ 為什麼出貨是 `enabled: false`
 *
 * S3 上的東西**已經齊了**（2026-09-09 實測：manifest 1,611 個唯一 key，S3 上缺 **0**）。
 * ⛔ 缺的是 **CloudFront distribution** —— 而 Main 的 AWS profile 刻意只有
 * `ListBucket` / `GetObject` / `PutObject`，⭐ 建 distribution 是 owner 的動作。
 *
 * ⇒ ⭐ 這一格是**先把線接好**：owner 把 `baseUrl` 填進來、`enabled` 打開就生效，
 * ⛔ 不需要改任何一行程式、⛔ 不需要一次部署。
 *
 * ## ⚠️ `fallbackToLocal` 為什麼預設 true
 *
 * CDN 掛掉 / 某一顆還沒同步 ⇒ ⭐ 退回站台自己那一份，⛔ 而不是破圖。
 * ⚠️ 而這是一個 **fail-open** —— 本文件的規矩是「fail-open 沒錯，**靜默**才是缺陷」
 * ⇒ 退回時客戶端 console 會說出來（消費端 `withContentVersion` 那一行）。
 */
import { z } from "zod";
import { zId } from "../ref";

export interface AssetCdn {
  /** ⛔ 止血閥：false ⇒ 素材完全走站台自己（＝ 2026-09-09 之前的行為）。 */
  readonly enabled: boolean;
  /** CloudFront（或任何 CDN）的根網址，⛔ 結尾不帶斜線。空字串 ＝ 還沒建。 */
  readonly baseUrl: string;
  /** CDN 拿不到時退回站台自己那一份。⭐ 預設 true。 */
  readonly fallbackToLocal: boolean;
}

export const DEFAULT_ASSET_CDN: AssetCdn = Object.freeze({
  // ⭐ 出貨關著 —— CloudFront 還沒建（見檔頭）。⛔ 這不是「這個功能沒做」。
  enabled: false,
  baseUrl: "",
  fallbackToLocal: true,
});

export const zConfigAssetCdnDoc = z
  .object({
    id: zId,
    schema: z.literal("config.asset-cdn@1"),
    note: z.string().optional(),
    enabled: z.boolean().describe(
      "@zh 素材走 CDN\n" +
        "@note ⭐ 打開之後 glb／webp／音檔從 CDN 拿，⛔ 不再從站台自己。⚠️ **先把 `baseUrl` 填好**再打開 —— 空的 baseUrl 配 enabled=true 會被 schema 擋下。",
    ),
    baseUrl: z.string().describe(
      "@zh CDN 根網址\n" +
        "@note 例：`https://dxxxx.cloudfront.net`。⛔ **結尾不要帶斜線**。空字串 ＝ 還沒建 distribution。",
    ),
    fallbackToLocal: z.boolean().describe(
      "@zh CDN 拿不到時退回站台\n" +
        "@note ⭐ 預設開著：某一顆還沒同步 / CDN 掛掉 ⇒ 退回站台自己那一份，⛔ 而不是破圖。⚠️ 退回時 console 會說出來（⛔ 靜默的 fail-open 才是缺陷）。",
    ),
  })
  .strict();

/**
 * ⭐⭐ 兩個名詞的**關係**（⛔ 不是各自合法就好）——
 * 打開 CDN 而沒有網址 ＝ 每一顆素材都指向 `/assets/…` 前面接一個空字串
 * ⇒ 全站破圖，⚠️ 而它會在**部署之後**才顯形（本文件記過的「相容性故障」形狀）。
 *
 * ⛔ **不能寫成 schema 的 `.refine()`** —— 那會讓它變成 `ZodEffects`，
 * 而 config union 是靠 `.shape.schema` 判別的 ⇒ 整份內容驗證會在載入時炸掉
 * （實測 2026-09-09：`TypeError: Cannot read properties of undefined (reading 'schema')`）。
 * ⇒ ⭐ 關係檢查住這裡，由 `assetCdnConsistent.test.ts` 與消費端各自呼叫。
 */
export function assetCdnProblem(d: Pick<AssetCdn, "enabled" | "baseUrl">): string | null {
  if (d.enabled && d.baseUrl.trim() === "")
    return "⛔ enabled=true 而 baseUrl 是空的 —— 每一顆素材都會指向一個不存在的網域（先填 baseUrl）";
  if (d.baseUrl.endsWith("/"))
    return "⛔ baseUrl 結尾不可以帶斜線（組出來會變成 `//assets/…`）";
  return null;
}

export type ConfigAssetCdnDoc = z.infer<typeof zConfigAssetCdnDoc>;

/** 文件 → 執行期值。⭐ 缺席就走 {@link DEFAULT_ASSET_CDN}。 */
export function assetCdnFromDoc(doc: Partial<ConfigAssetCdnDoc> | undefined): AssetCdn {
  if (!doc) return DEFAULT_ASSET_CDN;
  return Object.freeze({
    enabled: doc.enabled ?? DEFAULT_ASSET_CDN.enabled,
    baseUrl: doc.baseUrl ?? DEFAULT_ASSET_CDN.baseUrl,
    fallbackToLocal: doc.fallbackToLocal ?? DEFAULT_ASSET_CDN.fallbackToLocal,
  });
}
