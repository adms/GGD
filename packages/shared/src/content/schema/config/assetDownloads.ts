/**
 * `config.asset-downloads@1` —— ⭐ 素材的**短效簽署網址**（GH#1124）。
 *
 * ## ⭐ owner 的交接文件逐字（第六節）
 *
 * > 「玩家先查記憶體與本機持久快取。缺檔時，向 GGD 後端請求固定版本的素材。
 * >  後端依已核准索引，解析精確 S3 object key。後端產生**短效 GET 簽署網址**，例如 15 分鐘。」
 *
 * ⭐ 那條路裡**沒有 CloudFront** —— 而 owner 2026-09-09 補了理由：
 * 「我的 S3 已經是放**台北機房**，應該會比 CF 快才對」。
 *
 * ## ⛔ 為什麼出貨是 `enabled: false`
 *
 * ⭐ 2026-09-09 在正式站（mini）實測：
 *
 * ```
 * AWS_PROFILE=vibe-coding aws sts get-caller-identity → command not found: aws
 * ~/.aws → ⛔ 不存在
 * ```
 *
 * ⇒ ⭐ **後端今天簽不出任何網址。** ⛔ 不是權限不足 —— 是工具與憑證都不在那台機器上。
 * ⚠️ 而那一項是 owner 的**安全決策**（憑證怎麼進正式站），⛔ 不是我可以順手做的。
 *
 * ⭐ 這一格先接好：憑證到位之後打開開關就生效，⛔ 不用改程式、⛔ 不用一次部署。
 *
 * ## ⚠️ 第二個擋點：bucket **沒有任何 CORS**
 *
 * 同一天實測：`OPTIONS` 預檢回 **403**，簽章 GET 的回應**一個 `Access-Control-*` 都沒有**
 * ⇒ ⭐ 即使簽得出網址，**瀏覽器 fetch 仍然會被擋**。
 * ⭐ 好消息：`Range` 本身可用（206 ＋ `Content-Range` ＋ `ETag`）。
 * ⇒ ⛔ 打開這一格之前**兩個擋點都要解**，而它們都是 owner 的動作。
 */
import { z } from "zod";
import { zId } from "../ref";

export interface AssetDownloads {
  /** ⛔ 止血閥：false ⇒ 素材完全走站台自己（＝ 今天的行為）。 */
  readonly enabled: boolean;
  /** 簽署網址的存活秒數。⭐ 出貨 900（15 分鐘，owner 交接文件的例子）。 */
  readonly signedUrlTtlSec: number;
}

export const DEFAULT_ASSET_DOWNLOADS: AssetDownloads = Object.freeze({
  // ⭐ 出貨關著 —— 正式站沒有憑證（見檔頭）。⛔ 這不是「這個功能沒做」。
  enabled: false,
  signedUrlTtlSec: 900,
});

export const zConfigAssetDownloadsDoc = z
  .object({
    id: zId,
    schema: z.literal("config.asset-downloads@1"),
    note: z.string().optional(),
    enabled: z.boolean().describe(
      "@zh 素材走簽署網址\n" +
        "@note ⭐ 打開之後玩家端向後端要一個短效網址再去 S3 拿素材。⚠️ ⛔ **兩個擋點都要先解**：① 正式站要有 AWS 憑證（2026-09-09 實測完全沒有）② bucket 要設 CORS（實測預檢 403）。⛔ 兩個都沒解就打開 ⇒ 每一顆素材都拿不到。",
    ),
    signedUrlTtlSec: z
      .number()
      .int()
      .min(60)
      .max(3600)
      .describe(
        "@zh 簽署網址存活秒數\n" +
          "@note ⭐ 出貨 {{出貨值}} 秒（owner 交接文件的例子是 15 分鐘）。⚠️ 調短＝玩家中途換頁要重簽（多一次往返）；調長＝那個網址被轉貼出去的可用時間也變長。⛔ 上限 3600 是刻意的：一個活一整天的「短效」網址不是短效。",
      ),
  })
  .strict();

export type ConfigAssetDownloadsDoc = z.infer<typeof zConfigAssetDownloadsDoc>;

/** 文件 → 執行期值。⭐ 缺席就走 {@link DEFAULT_ASSET_DOWNLOADS}。 */
export function assetDownloadsFromDoc(
  doc: Partial<ConfigAssetDownloadsDoc> | undefined,
): AssetDownloads {
  if (!doc) return DEFAULT_ASSET_DOWNLOADS;
  return Object.freeze({
    enabled: doc.enabled ?? DEFAULT_ASSET_DOWNLOADS.enabled,
    signedUrlTtlSec: doc.signedUrlTtlSec ?? DEFAULT_ASSET_DOWNLOADS.signedUrlTtlSec,
  });
}
