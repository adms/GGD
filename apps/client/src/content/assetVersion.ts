/**
 * Content ASSET cache key — the `?h=` query arg nginx keys its immutable policy
 * on (`map $arg_h $content_cache`: absent → `no-cache`, present → `public,
 * max-age=31536000, immutable`; nginx/nginx.conf).
 *
 * The JSON docs already get it — HttpContentSource stamps every _index/doc URL
 * with its own per-doc hash off the manifest. NOTHING ELSE did: glb, mp3/wav and
 * png/webp asset URLs were built as a bare `"/content/" + path`, so every model,
 * every clip and every icon carried `Cache-Control: no-cache` and revalidated on
 * EVERY visit (a 304 round trip per file, per match entry).
 *
 * WHICH KEY. Two candidates existed:
 *   - the per-file `.hash` sidecars under content/assets — REJECTED. Only 874 of
 *     the 1,676 asset files have one (they are the TTS generator's provenance
 *     records, not a general asset-hash pass), so a missing sidecar would silently
 *     fall back to no-cache while a STALE one would pin a dead byte range as
 *     immutable for a year. A wrong hash here is far worse than the revalidation
 *     it replaces.
 *   - the manifest's `contentVersion` — CHOSEN. One value for the whole tree,
 *     already computed and already trusted by the edge, and manifest.json itself
 *     is served no-cache so a client learns the new value on the very next boot.
 *     It is derived from the content DOCS, so any content change that ships a doc
 *     edit (which is what every content wave in this repo has done — the asset
 *     compression wave d0f643a moved 683 content files AND contentVersion) rolls
 *     the whole asset namespace at once.
 *
 * Residual risk, stated plainly: a binary replaced IN PLACE at the same path with
 * no doc edit anywhere in the tree leaves contentVersion unmoved, and that asset
 * would then be served from cache as immutable. The fix belongs in the content
 * build (fold asset bytes into the manifest hash), not here — see the note in the
 * lane hand-off. Until then, `content:build` must be re-run for any asset swap.
 *
 * Until the manifest lands (`setContentAssetVersion`), URLs stay bare — i.e.
 * exactly today's behaviour, revalidating. Never a guessed/derived key.
 */

/** The active `?h=` value, or null before the manifest is read. */
import { frozenContentAssetUrl } from "./frozenAssets";
let assetVersion: string | null = null;

/**
 * Publish the content tree's version (manifest `contentVersion`, e.g.
 * "cv_8b91ac43fbdb"). Called once when the content boot settles. A null/empty
 * value clears it, which returns every URL to the bare (revalidating) form.
 */
export function setContentAssetVersion(version: string | null | undefined): void {
  assetVersion = version ? version : null;
}

/** Current content asset version, or null when the manifest has not landed. */
export function getContentAssetVersion(): string | null {
  return assetVersion;
}

/**
 * Stamp a content URL with the immutable cache key. No-op (returns `url`
 * unchanged) before the manifest lands, so the URL is never poisoned with a
 * placeholder. Appends with `&` when the URL already carries a query.
 */
/**
 * ⭐ GH#1116 —— CDN 設定的**消費端**（第四個住處）。
 *
 * ⛔ 本文件記過三次「三個住處齊全 ≠ 已上線」：config ＋ Zod ＋ admin 都有，
 * 而**沒有任何一行 production 程式讀那一格** ⇒ 那格開關是裝飾。
 * ⇒ ⭐ 這一行就是「`<檔>:<行>` 讀它」的那一行。
 *
 * ⚠️ 出貨 `enabled: false`（CloudFront 還沒建）⇒ 這條路今天**不會走到**，
 * ⛔ 而它不是死碼：owner 填好 `baseUrl` 並打開那一格，下一次載入就生效。
 */
let cdn: { enabled: boolean; baseUrl: string; fallbackToLocal: boolean } | null = null;

/** 由內容載入時注入（⛔ 這個模組不 import 註冊表 —— 它跑在首次繪製之前）。 */
export function setAssetCdn(cfg: { enabled: boolean; baseUrl: string; fallbackToLocal: boolean }): void {
  cdn = cfg;
}

/**
 * ⭐ GH#1124 —— 簽署網址那條路的**消費端**（第四個住處）。
 *
 * ⛔ 出貨 `enabled: false`（正式站沒有 AWS 憑證、bucket 沒有 CORS —— 兩個都是 owner 的動作），
 * ⇒ 這條路今天回 `null`，⭐ 而它不是死碼：兩個擋點解掉、開關打開，下一次載入就走它。
 *
 * ⚠️ ⭐ 這裡**只回報「要不要走簽署網址」** —— ⛔ 實際去要網址是 #1125 的三層快取
 * （記憶體 → Cache Storage → 簽署網址）。⭐ 分開是刻意的：這個模組跑在**首次繪製之前**，
 * ⛔ 不可以在這裡做任何非同步的事。
 */
let downloads: { enabled: boolean; signedUrlTtlSec: number } | null = null;

/** 由內容載入時注入（同 {@link setAssetCdn}）。 */
export function setAssetDownloads(cfg: { enabled: boolean; signedUrlTtlSec: number }): void {
  downloads = cfg;
}

/**
 * ⭐ 這一顆素材要不要走「後端簽署網址」？⛔ 回 false ＝ 走站台自己。
 *
 * ⚠️ 兩個方向都要驗（#1116 的教訓）：關著時**必須**回 false，
 * ⛔ 而不是「反正沒有人呼叫它」。
 */
export function needsSignedUrl(url: string): boolean {
  if (!downloads?.enabled) return false;
  return url.startsWith("/content/assets/");
}

/** 簽署網址的存活秒數（⭐ 給 #1125 的快取層決定何時重簽）。 */
export function signedUrlTtlSec(): number {
  return downloads?.signedUrlTtlSec ?? 900;
}

/** 素材網址 → CDN 網址。⭐ 關著、沒網址、或不是 `/content/assets/` 底下 ⇒ 原樣回傳。 */
export function cdnAssetUrl(url: string): string | null {
  if (!cdn?.enabled || cdn.baseUrl === "") return null;
  if (!url.startsWith("/content/assets/")) return null;
  return `${cdn.baseUrl}${url}`;
}

export function withContentVersion(url: string): string {
  const fixed = frozenContentAssetUrl(url);
  if (fixed) return fixed;
  // ⭐ GH#1116 —— CDN 開著就改走它。⚠️ `fallbackToLocal` 由**載入失敗**那一層處理
  //   （這裡只組網址）;⛔ 而退回時要說出來 —— 靜默的 fail-open 才是缺陷。
  const viaCdn = cdnAssetUrl(url);
  if (viaCdn) return assetVersion ? `${viaCdn}?h=${assetVersion}` : viaCdn;
  const instance = /^\/content\/assets\/hero-instances\/([a-f0-9]{64}\.[a-z0-9]+)(?:\?.*)?$/.exec(url);
  if (instance) return `/api/v1/content-overlay/assets/${instance[1]}`;
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  if (!assetVersion) return url;
  return `${url}${url.includes("?") ? "&" : "?"}h=${assetVersion}`;
}
