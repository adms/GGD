/**
 * contentOverlay — the game-server's read side of the durable content overlay
 * (task #189). At boot the shard fetches the overlay the platform stores in
 * data/ (GET /api/v1/content-overlay/bundle) and lays it over the shipped
 * content tree via the shared OverlayContentSource, so an admin's 內容管理 edit
 * on the host actually reaches matches.
 *
 * OFFLINE-FIRST / FAIL-SAFE. The fetch is best-effort: an unreachable platform,
 * a non-200, or a malformed body all resolve to `null` (= no overlay), and the
 * caller loads the shipped tree exactly as before. The overlay is an
 * ACCELERATOR of the operator's edits, never a boot dependency — the same
 * contract the content-bus and #48 already hold the platform to.
 *
 * WHY BOOT, NOT LIVE. Applying an overlay swaps the content registries the sim
 * reads; doing that mid-process would change content under a running match
 * (Champions/Items are read live during champ-select and combat), which is
 * exactly what the content-bus refuses to do for the operator docs it already
 * carries ("NEW MATCHES ONLY"). A durable overlay lands on the next shard boot —
 * and the deploy pipeline restarts the game container on every pull, which is
 * when a git-pulled overlay change would arrive anyway. Live-without-restart
 * pickup of the full content tree is a separate, larger piece of work.
 */
import { emptyOverlayBundle, isOverlayEmpty, type OverlayBundle } from "@ggd/shared/content";

/** Where the platform serves the overlay bundle (public, cacheable). */
export function overlayBundleUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/v1/content-overlay/bundle`;
}

/** Milliseconds a boot overlay fetch may take before it is abandoned. */
export const OVERLAY_FETCH_TIMEOUT_MS = 4000;

/** Narrow an unknown JSON value into an OverlayBundle, or null if it is not one. */
export function parseOverlayBundle(raw: unknown): OverlayBundle | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const docs = r.docs;
  const deleted = r.deleted;
  if (typeof docs !== "object" || docs === null || Array.isArray(docs)) return null;
  if (typeof deleted !== "object" || deleted === null || Array.isArray(deleted)) return null;
  // keep only truthy tombstones, and coerce generation
  const del: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(deleted as Record<string, unknown>)) {
    if (v === true) del[k] = true;
  }
  return {
    generation: typeof r.generation === "number" ? r.generation : 0,
    docs: docs as Record<string, unknown>,
    deleted: del,
  };
}

export interface FetchOverlayOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  log?: typeof console.log;
}

/**
 * Fetch the overlay bundle. Resolves to `null` on ANY failure (unreachable,
 * non-200, malformed) — never throws, never blocks the boot beyond the timeout.
 * An empty overlay also resolves to `null` (nothing to lay on).
 */
export async function fetchOverlayBundle(
  baseUrl: string,
  opts: FetchOverlayOptions = {},
): Promise<OverlayBundle | null> {
  const fetchFn = opts.fetchFn ?? fetch;
  const url = overlayBundleUrl(baseUrl);
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? OVERLAY_FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const body = parseOverlayBundle(await res.json());
    if (!body || isOverlayEmpty(body)) return null;
    return body;
  } catch {
    return null;
  }
}

/** The empty overlay, re-exported so callers can express "no overlay" cleanly. */
export { emptyOverlayBundle };
