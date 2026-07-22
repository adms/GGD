/**
 * HttpContentSource — fetch-based ContentSource for the browser.
 *
 * Two layouts:
 *  - "static" (default): the nginx-served content/ tree. Objects/indexes are
 *    fetched by their index path with `?h=<hash>` (immutable-cached);
 *    manifest.json is fetched fresh (no-cache).
 *  - "api": the dev content-api ( /content-api/manifest, /:collection/_index,
 *    /:collection/:id ).
 *
 * The client never computes hashes — it only reads them off the manifest/index
 * to build cache-busting URLs.
 */
import type { CollectionName } from "../schema/index";
import type { CollectionIndex, ContentSource, IndexEntry, Manifest } from "../types";

export interface HttpContentSourceOptions {
  /** e.g. "/content" (static) or "/content-api" (dev api) */
  baseUrl: string;
  mode?: "static" | "api";
  fetchFn?: typeof fetch;
}

export class HttpContentSource implements ContentSource {
  private readonly base: string;
  private readonly mode: "static" | "api";
  private readonly fetchFn: typeof fetch;
  private manifest: Manifest | null = null;

  constructor(opts: HttpContentSourceOptions) {
    this.base = opts.baseUrl.replace(/\/+$/, "");
    this.mode = opts.mode ?? "static";
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  private async getJson(url: string): Promise<unknown> {
    const res = await this.fetchFn(url);
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
    return res.json();
  }

  async readManifest(): Promise<Manifest> {
    // manifest freshness is the EDGE's job: nginx serves manifest.json no-cache
    const url = this.mode === "api" ? `${this.base}/manifest` : `${this.base}/manifest.json`;
    const m = (await this.getJson(url)) as Manifest;
    this.manifest = m;
    return m;
  }

  async readIndex(collection: CollectionName): Promise<CollectionIndex> {
    if (this.mode === "api") {
      return (await this.getJson(`${this.base}/${collection}/_index`)) as CollectionIndex;
    }
    const meta = this.manifest?.collections[collection];
    const path = meta?.path ?? `${collection}/_index.json`;
    const h = meta ? `?h=${meta.hash}` : "";
    return (await this.getJson(`${this.base}/${path}${h}`)) as CollectionIndex;
  }

  async readObject(collection: CollectionName, entry: IndexEntry): Promise<unknown> {
    if (this.mode === "api") {
      return this.getJson(`${this.base}/${collection}/${entry.id}`);
    }
    return this.getJson(`${this.base}/${entry.path}?h=${entry.hash}`);
  }
}
