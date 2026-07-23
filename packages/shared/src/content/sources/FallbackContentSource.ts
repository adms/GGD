/**
 * FallbackContentSource — try one transport, silently fall back to another.
 *
 * Exists so a missing or corrupt `content/bundle.json` (a stale deploy, a
 * half-written file, a proxy that mangled the body) degrades to EXACTLY today's
 * per-doc behaviour instead of bricking the client. The trigger is any thrown
 * error from the primary — HTTP status AND `JSON.parse` AND shape-check
 * failures alike — because "the bundle 404s" and "the bundle is one byte
 * corrupt" must both end up on the same safe path.
 *
 * Once the primary has failed, EVERY subsequent call goes to the fallback: the
 * fallback's own `readManifest()` is replayed first (HttpContentSource caches
 * the manifest to build `?h=` URLs, so skipping it would silently drop
 * cache-busting).
 */
import type { CollectionName } from "../schema/index";
import type { CollectionIndex, ContentSource, IndexEntry, Manifest } from "../types";

export class FallbackContentSource implements ContentSource {
  private usingFallback = false;
  private fallbackManifest: Promise<Manifest> | null = null;
  private failure: string | null = null;

  constructor(
    private readonly primary: ContentSource,
    private readonly fallback: ContentSource,
    /** called once, with the reason, when the primary is abandoned */
    private readonly onFallback?: (reason: string) => void,
  ) {}

  /** true once the primary was abandoned (boot telemetry / tests). */
  get didFallback(): boolean {
    return this.usingFallback;
  }

  /** why the primary was abandoned, or null if it is still in use. */
  get fallbackReason(): string | null {
    return this.failure;
  }

  private demote(e: unknown): void {
    if (this.usingFallback) return;
    this.usingFallback = true;
    this.failure = e instanceof Error ? e.message : String(e);
    this.onFallback?.(this.failure);
  }

  /** Single-flight fallback manifest read (needed before index/object reads). */
  private ensureFallbackManifest(): Promise<Manifest> {
    this.fallbackManifest ??= this.fallback.readManifest();
    return this.fallbackManifest;
  }

  async readManifest(): Promise<Manifest> {
    try {
      return await this.primary.readManifest();
    } catch (e) {
      this.demote(e);
      return this.ensureFallbackManifest();
    }
  }

  async readIndex(collection: CollectionName): Promise<CollectionIndex> {
    if (!this.usingFallback) {
      try {
        return await this.primary.readIndex(collection);
      } catch (e) {
        this.demote(e);
      }
    }
    await this.ensureFallbackManifest();
    return this.fallback.readIndex(collection);
  }

  async readObject(collection: CollectionName, entry: IndexEntry): Promise<unknown> {
    if (!this.usingFallback) {
      try {
        return await this.primary.readObject(collection, entry);
      } catch (e) {
        this.demote(e);
      }
    }
    await this.ensureFallbackManifest();
    return this.fallback.readObject(collection, entry);
  }
}
