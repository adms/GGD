/**
 * The content OVERLAY merge (task #189) — how the durable `data/` overlay the
 * platform stores is laid over the shipped `content/` tree the consumers load:
 *
 *   merged = shipped(content/) ⊕ overlay(data/content-overlay/)
 *
 * `OverlayContentSource` wraps ANY `ContentSource` (FsContentSource on the
 * game-server, BundleContentSource/HttpContentSource in the browser) and applies
 * the overlay in the three seam methods, so `ContentLoader` — and every registry
 * downstream of it — is untouched. Both consumers share this ONE implementation,
 * exactly the seam the design doc requires (docs/design/content-sync.md §7): two
 * machines that merged differently would silently lose data.
 *
 * PURE + DETERMINISTIC: no fs, no clock, no network here. The overlay bundle is
 * fetched by the caller and handed in; this file only decides what the merged
 * tree looks like and recomputes the hashes/contentVersion from it. An EMPTY
 * overlay is the identity element — the base manifest is returned byte-for-byte,
 * so a host with no edits sees exactly the shipped content and the shipped cv_.
 *
 * NOT the schema authority: overlay docs are validated by the game loader's Zod
 * schemas on ingest (a bad doc fails the load the same way a bad shipped doc
 * would), and by the admin console before it ever writes. This file trusts the
 * bytes and only merges them.
 */
import { hashCollection, hashDoc, contentVersion } from "./hash";
import type { CollectionName } from "./schema/index";
import type { CollectionIndex, ContentSource, IndexEntry, Manifest } from "./types";

/**
 * The overlay bundle as the platform serves it (GET /content-overlay/bundle).
 * `docs` upserts a content doc keyed "collection/id"; `deleted` tombstones a
 * shipped doc so the merged tree drops it. A key is never in both at once.
 */
export interface OverlayBundle {
  generation: number;
  docs: Record<string, unknown>;
  deleted: Record<string, boolean>;
}

/** An overlay that changes nothing. */
export function emptyOverlayBundle(): OverlayBundle {
  return { generation: 0, docs: {}, deleted: {} };
}

/** True when the overlay would change nothing about the merged tree. */
export function isOverlayEmpty(o: OverlayBundle | null | undefined): boolean {
  if (!o) return true;
  return Object.keys(o.docs).length === 0 && Object.keys(o.deleted).length === 0;
}

/** Split a flat "collection/id" key. Returns null for a malformed key. */
export function splitOverlayKey(key: string): { collection: string; id: string } | null {
  const i = key.indexOf("/");
  if (i <= 0 || i >= key.length - 1) return null;
  return { collection: key.slice(0, i), id: key.slice(i + 1) };
}

interface PerCollection {
  /** id -> overlay doc (upsert) */
  docs: Map<string, unknown>;
  /** ids tombstoned in this collection */
  deleted: Set<string>;
}

/** Group a flat overlay into per-collection upserts/tombstones. */
function groupByCollection(o: OverlayBundle): Map<string, PerCollection> {
  const out = new Map<string, PerCollection>();
  const bucket = (c: string): PerCollection => {
    let b = out.get(c);
    if (!b) {
      b = { docs: new Map(), deleted: new Set() };
      out.set(c, b);
    }
    return b;
  };
  for (const [key, doc] of Object.entries(o.docs)) {
    const k = splitOverlayKey(key);
    if (k) bucket(k.collection).docs.set(k.id, doc);
  }
  for (const [key, on] of Object.entries(o.deleted)) {
    if (!on) continue;
    const k = splitOverlayKey(key);
    if (k) bucket(k.collection).deleted.add(k.id);
  }
  return out;
}

/**
 * Merge one collection's shipped index with the overlay for that collection:
 * drop tombstoned ids, replace an edited doc's hash, append overlay-only docs,
 * and recompute the collection hash from the result. Pure.
 */
export function mergeCollectionIndex(
  base: CollectionIndex,
  per: PerCollection | undefined,
): CollectionIndex {
  if (!per || (per.docs.size === 0 && per.deleted.size === 0)) return base;
  const entries: IndexEntry[] = [];
  const seen = new Set<string>();
  for (const e of base.entries) {
    if (per.deleted.has(e.id)) continue; // tombstoned → gone
    seen.add(e.id);
    const edited = per.docs.get(e.id);
    if (edited !== undefined) {
      // an edited doc keeps its path but gets a fresh content hash so `?h=`
      // cache-busting reflects the change
      entries.push({ ...e, hash: hashDoc(edited), size: byteLen(edited) });
    } else {
      entries.push(e);
    }
  }
  // overlay-only docs (added on this host, not in the shipped tree)
  for (const [id, doc] of per.docs) {
    if (seen.has(id) || per.deleted.has(id)) continue;
    entries.push({
      id,
      path: `${base.collection}/${id}.json`,
      hash: hashDoc(doc),
      size: byteLen(doc),
    });
  }
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    collection: base.collection,
    hash: hashCollection(entries.map((e) => ({ id: e.id, hash: e.hash }))),
    entries,
  };
}

function byteLen(doc: unknown): number {
  try {
    return JSON.stringify(doc)?.length ?? 0;
  } catch {
    return 0;
  }
}

/**
 * A `ContentSource` that lays an overlay over a base source. Drop-in for
 * `ContentLoader`. When the overlay is empty every call delegates unchanged.
 */
export class OverlayContentSource implements ContentSource {
  private readonly grouped: Map<string, PerCollection>;
  private readonly empty: boolean;

  constructor(
    private readonly base: ContentSource,
    private readonly overlay: OverlayBundle,
  ) {
    this.empty = isOverlayEmpty(overlay);
    this.grouped = this.empty ? new Map() : groupByCollection(overlay);
  }

  async readManifest(): Promise<Manifest> {
    const base = await this.base.readManifest();
    if (this.empty) return base;

    const collections: Manifest["collections"] = { ...base.collections };
    // start from the shipped per-collection hashes, override the affected ones
    const mergedHashes: Record<string, string> = {};
    for (const [name, col] of Object.entries(base.collections)) {
      if (col) mergedHashes[name] = col.hash;
    }
    for (const coll of this.grouped.keys()) {
      const merged = await this.readIndex(coll as CollectionName);
      const prev = base.collections[coll as CollectionName];
      collections[coll as CollectionName] = {
        hash: merged.hash,
        count: merged.entries.length,
        path: prev?.path ?? `${coll}/_index.json`,
      };
      mergedHashes[coll] = merged.hash;
    }
    return { contentVersion: contentVersion(mergedHashes), collections };
  }

  async readIndex(collection: CollectionName): Promise<CollectionIndex> {
    const per = this.grouped.get(collection);
    let base: CollectionIndex;
    try {
      base = await this.base.readIndex(collection);
    } catch (e) {
      // an overlay-only collection has no shipped index — start from empty
      if (per) base = { collection, hash: hashCollection([]), entries: [] };
      else throw e;
    }
    return mergeCollectionIndex(base, per);
  }

  async readObject(collection: CollectionName, entry: IndexEntry): Promise<unknown> {
    const per = this.grouped.get(collection);
    const edited = per?.docs.get(entry.id);
    if (edited !== undefined) return edited;
    return this.base.readObject(collection, entry);
  }
}
