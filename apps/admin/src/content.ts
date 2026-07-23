/**
 * Read-only access to the content tree from the admin console.
 *
 * The curation page has to list EVERY authored doc (113 champions / 212 items
 * / 554 abilities), which the content store only exposes as one JSON file per
 * doc plus a per-collection `_index.json`. So: fetch the index (1 request, ids
 * only) to paint rows immediately, then hydrate names/icons in a bounded
 * concurrency pool, streaming partial results to the UI as they land.
 *
 * The mount is `/content` — nginx serves it same-origin in prod and the admin
 * vite dev server mirrors it (see vite.config.ts) so icons and names work at
 * http://127.0.0.1:60721/admin/ too. `fetchFn` is injectable so all of this is
 * unit-testable under node.
 */
import type { EditCollection } from "@ggd/shared/content/editModel";
import type { ContentRow } from "./curation";

/** Default content mount (same-origin in dev and prod). */
export const CONTENT_BASE = "/content";

export interface IndexEntry {
  id: string;
  path: string;
}

/** Parse a collection `_index.json`; anything malformed yields no entries. */
export function parseIndex(raw: unknown): IndexEntry[] {
  if (raw === null || typeof raw !== "object") return [];
  const entries = (raw as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return [];
  const out: IndexEntry[] = [];
  for (const e of entries) {
    if (e === null || typeof e !== "object") continue;
    const rec = e as Record<string, unknown>;
    const id = rec["id"];
    const path = rec["path"];
    if (typeof id === "string" && id !== "" && typeof path === "string" && path !== "") {
      out.push({ id, path });
    }
  }
  return out;
}

/** A row before its doc arrives — id only, so the list renders instantly. */
export function placeholderRow(id: string): ContentRow {
  return { id, name: id, hydrated: false };
}

/**
 * Project a fetched doc down to the fields the curation list renders. Unknown
 * / partial docs degrade to the id as the name — the operator can still enable
 * them (the whitelist is ids, not content).
 */
export function rowFromDoc(id: string, raw: unknown): ContentRow {
  const row: ContentRow = { id, name: id, hydrated: true };
  if (raw === null || typeof raw !== "object") return row;
  const doc = raw as Record<string, unknown>;
  if (typeof doc["name"] === "string" && doc["name"] !== "") row.name = doc["name"];
  if (typeof doc["icon"] === "string" && doc["icon"].startsWith("assets/")) row.icon = doc["icon"];
  if (typeof doc["role"] === "string") row.role = doc["role"];
  if (typeof doc["cost"] === "number") row.cost = doc["cost"];
  if (typeof doc["tier"] === "number") row.tier = doc["tier"];
  return row;
}

/**
 * Resolve a doc's content-relative `icon` to a URL. Absent or foreign paths
 * return null so the caller keeps its text-only row — the admin never
 * fabricates a URL for docs whose WC3 art was Blizzard stock (no icon field).
 */
export function contentAssetUrl(icon: string | null | undefined, base = CONTENT_BASE): string | null {
  if (!icon || !icon.startsWith("assets/")) return null;
  return `${base}/${icon}`;
}

export interface LoadOptions {
  fetchFn?: typeof fetch;
  base?: string;
  /** parallel doc fetches (default 16) */
  concurrency?: number;
  /** called with the full row array whenever a batch of docs lands */
  onProgress?: (rows: ContentRow[], hydrated: number) => void;
}

async function getJson(fetchFn: typeof fetch, url: string): Promise<unknown> {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as unknown;
}

/**
 * Load every doc id in a collection, then hydrate names/icons. Rejects only if
 * the index itself is unreachable (nothing to show); individual doc failures
 * just leave that row as its id.
 */
export async function loadCollection(kind: EditCollection, opts: LoadOptions = {}): Promise<ContentRow[]> {
  const fetchFn = opts.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const base = opts.base ?? CONTENT_BASE;
  const concurrency = Math.max(1, opts.concurrency ?? 16);

  const index = parseIndex(await getJson(fetchFn, `${base}/${kind}/_index.json`));
  const rows = index.map((e) => placeholderRow(e.id));
  opts.onProgress?.([...rows], 0);
  if (rows.length === 0) return rows;

  let next = 0;
  let hydrated = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      const entry = index[i];
      if (entry === undefined) return;
      try {
        rows[i] = rowFromDoc(entry.id, await getJson(fetchFn, `${base}/${entry.path}`));
      } catch {
        // keep the placeholder row — a missing doc must not break the page
      }
      hydrated++;
      if (hydrated % 32 === 0) opts.onProgress?.([...rows], hydrated);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker));
  opts.onProgress?.([...rows], hydrated);
  return rows;
}
