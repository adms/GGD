/**
 * BundleContentSource — the whole content set in ONE GET.
 *
 * Implements the same three-method `ContentSource` seam as
 * `HttpContentSource`, so `ContentLoader` (and every registry downstream of it)
 * is untouched: `readManifest()` fetches `<base>/bundle.json` once, and
 * `readIndex` / `readObject` are then pure in-memory lookups — 1 request
 * instead of 1 + 12 + 1,441.
 *
 * Deliberately NOT cache-busted with `?h=`: the client cannot know the
 * contentVersion before it has the bundle, and paying an extra round trip on
 * manifest.json to learn it would defeat the point. `/content/bundle.json`
 * falls into nginx's `$arg_h == ""` branch → `Cache-Control: no-cache`, so a
 * returning player revalidates and gets a 304 (one round trip, zero bytes)
 * whenever content has not changed.
 *
 * MEMORY: the response text is handed straight to `res.json()` and never
 * retained; `release()` drops the parsed graph once `registerAll(store)` has
 * copied what it needs (the loader keeps the docs it parsed, not ours).
 */
import {
  indexFromBundle,
  manifestFromBundle,
  parseContentBundle,
  CONTENT_BUNDLE_FILE,
  type ContentBundle,
} from "../bundle";
import type { CollectionName } from "../schema/index";
import type { CollectionIndex, ContentSource, IndexEntry, Manifest } from "../types";

export interface BundleContentSourceOptions {
  /** content mount, e.g. "/content" */
  baseUrl: string;
  /** bundle file name relative to `baseUrl` (default "bundle.json") */
  file?: string;
  fetchFn?: typeof fetch;
}

export class BundleContentSource implements ContentSource {
  private readonly url: string;
  private readonly fetchFn: typeof fetch;
  private bundle: ContentBundle | null = null;
  /** collection -> id -> doc, built once so readObject is O(1), not O(n) */
  private docs = new Map<string, Map<string, unknown>>();
  /** bytes of the bundle response, for boot telemetry */
  private bytes = 0;

  constructor(opts: BundleContentSourceOptions) {
    this.url = `${opts.baseUrl.replace(/\/+$/, "")}/${opts.file ?? CONTENT_BUNDLE_FILE}`;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  /** Transferred size of the bundle body (0 until readManifest succeeds). */
  get transferredBytes(): number {
    return this.bytes;
  }

  async readManifest(): Promise<Manifest> {
    const res = await this.fetchFn(this.url);
    if (!res.ok) throw new Error(`GET ${this.url} -> ${res.status}`);
    // Read as text so we can (a) report the real transferred size and (b) turn
    // a truncated/corrupt body into a throw the fallback wrapper can catch —
    // a partial bundle must degrade to per-doc fetching, never to silent loss.
    const text = await res.text();
    this.bytes = text.length;
    const bundle = parseContentBundle(JSON.parse(text) as unknown);
    this.bundle = bundle;
    this.docs = new Map(
      Object.entries(bundle.collections).map(([name, col]) => [
        name,
        new Map(col.entries.map((e) => [e.id, e.doc])),
      ]),
    );
    return manifestFromBundle(bundle);
  }

  async readIndex(collection: CollectionName): Promise<CollectionIndex> {
    if (!this.bundle) throw new Error("BundleContentSource: readManifest() first");
    return indexFromBundle(this.bundle, collection);
  }

  async readObject(collection: CollectionName, entry: IndexEntry): Promise<unknown> {
    const byId = this.docs.get(collection);
    if (!byId || !byId.has(entry.id)) {
      throw new Error(`bundle: ${collection}/${entry.id} not in bundle`);
    }
    return byId.get(entry.id);
  }

  /**
   * Drop the parsed bundle so the ~1.2 MB object graph can be collected.
   *
   * NOTHING CALLS THIS, deliberately: `loadAllContent` drops its last reference
   * to the source when it returns, so GC reclaims the graph anyway. Kept as an
   * explicit hook for a future caller that holds a source alive across scenes —
   * it is an optimisation, not a guarantee anyone is currently enforcing.
   */
  release(): void {
    this.bundle = null;
    this.docs = new Map();
  }
}
