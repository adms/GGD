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
export function withContentVersion(url: string): string {
  if (!assetVersion) return url;
  return `${url}${url.includes("?") ? "&" : "?"}h=${assetVersion}`;
}
