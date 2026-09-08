/**
 * Content BUNDLE — the whole authored content set in ONE file.
 *
 * WHY. The per-doc transport costs 1 manifest + 12 `_index.json` + 1,441 doc
 * fetches at boot (measured: 1,454 requests / 2,150,365 raw bytes). Over
 * HTTP/1.1 the browser funnels those through 6 connections, so the cost is
 * dominated by round trips, not payload. Worse, prod nginx has
 * `gzip_min_length 1024`, and 983 of the 1,441 docs are under 1 KB — they are
 * never compressed at all. Concatenating the docs lets ONE deflate window span
 * near-identical documents, which is where the real win comes from.
 *
 * WHAT THIS IS NOT. This is a TRANSPORT artifact, not a data model. The bundle
 * carries exactly the same `IndexEntry` metadata and exactly the same parsed
 * doc objects the per-doc path yields, so `ContentLoader` (and therefore every
 * registry and every consumer API) is untouched: a bundle-backed
 * `ContentSource` and an HTTP-backed one produce a byte-identical ContentStore.
 *
 * DETERMINISM (this protects `contentVersion`). The file is serialized with the
 * SAME `stableStringify` the hashes use — keys sorted at every depth — and
 * entry arrays are sorted by id. Two builds of identical content therefore
 * produce byte-identical bundles. The bundle lives at the content ROOT
 * (`content/bundle.json`), not inside a collection dir, so neither
 * `rebuildCollectionIndex` (skips `_`-prefixed names in collection dirs) nor
 * `rebuildManifest` (walks COLLECTION_NAMES subdirectories only) can see it —
 * `contentVersion` is provably unaffected by its existence.
 *
 * ONE VALUE IS NORMALIZED. 69 authored docs contain `-0.0` (mdx→glb import
 * artefacts in model offsets). `JSON.parse` yields -0, but no JSON serializer
 * can write it back — `JSON.stringify(-0) === "0"` — so a doc reaching the
 * client through the bundle carries 0 where the per-doc path carried -0. This
 * is not a new decision: `stableStringify`, the function `hashDoc` hashes,
 * already collapses -0 to 0, so the content-addressing system has ALWAYS
 * treated the two as the same document. Hashes and `contentVersion` are
 * unchanged, and -0 and 0 are indistinguishable under every arithmetic and
 * comparison the sim and renderer perform. Asserted by bundle.test.ts.
 */
import { stableStringify } from "./hash";
import { isCollectionName, type CollectionName } from "./schema/index";
import type { CollectionIndex, IndexEntry, Manifest } from "./types";

/** Schema tag written into every bundle; bumped if the wire shape changes. */
export const CONTENT_BUNDLE_SCHEMA = "content-bundle@1";

/** File name of the bundle, relative to the content root. */
export const CONTENT_BUNDLE_FILE = "bundle.json";

/**
 * One doc plus the minimum metadata needed to rebuild its `IndexEntry`.
 *
 * `path` and `size` are deliberately NOT on the wire: `path` is always
 * `<collection>/<id>.json` (fsStore.docFileName) and `size` only ever fed a
 * progress bar the one-request path does not have. Measured on the real tree,
 * carrying them cost 12,582 B of gzip-5 (231,343 + 229,934 vs 224,321 baseline)
 * for information the reader can derive.
 *
 * `hash` IS carried (17,330 B gzip-5 — random hex barely compresses) because it
 * is the one field that cannot be derived without re-running sha256 over every
 * doc in the browser, and it keeps `indexFromBundle` honest for any consumer
 * that later wants content-addressed URLs or a cheap integrity check.
 */
export interface BundleEntry {
  id: string;
  /** 12-hex object content hash — identical to the one in `_index.json` */
  hash: string;
  /** the parsed document object (pre-schema-parse, exactly as on disk) */
  doc: unknown;
}

export interface BundleCollection {
  /** 12-hex collection hash — identical to the one in `_index.json` */
  hash: string;
  /** sorted by id (stableStringify does NOT sort arrays, so this is load-bearing) */
  entries: BundleEntry[];
}

export interface ContentBundle {
  schema: typeof CONTENT_BUNDLE_SCHEMA;
  /** the `cv_<12hex>` this bundle was built from — lets a consumer spot drift */
  contentVersion: string;
  collections: Partial<Record<CollectionName, BundleCollection>>;
}

/**
 * Assemble a bundle from the manifest, the per-collection indexes, and the
 * parsed docs. Pure: no fs, no clock — callable from node scripts and tests.
 *
 * `docs` is keyed `collection` → `id` → parsed doc. Throws if a doc listed in
 * an index is missing, so a bundle can never silently omit content.
 */
export function buildContentBundle(
  manifest: Manifest,
  indexes: Partial<Record<CollectionName, CollectionIndex>>,
  docs: Partial<Record<CollectionName, Record<string, unknown>>>,
): ContentBundle {
  const collections: Partial<Record<CollectionName, BundleCollection>> = {};
  // sort collection names so the emitted object is order-independent even for
  // consumers that do NOT re-sort (stableStringify does, but be explicit).
  const names = (Object.keys(manifest.collections) as CollectionName[]).slice().sort();
  for (const name of names) {
    const index = indexes[name];
    if (!index) throw new Error(`buildContentBundle: no index for collection "${name}"`);
    const byId = docs[name] ?? {};
    const entries: BundleEntry[] = index.entries
      .map((e) => {
        if (!Object.prototype.hasOwnProperty.call(byId, e.id)) {
          throw new Error(`buildContentBundle: missing doc ${name}/${e.id}`);
        }
        return { id: e.id, hash: e.hash, doc: byId[e.id] };
      })
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    collections[name] = { hash: index.hash, entries };
  }
  return { schema: CONTENT_BUNDLE_SCHEMA, contentVersion: manifest.contentVersion, collections };
}

/**
 * Deterministic bytes for the bundle file: `stableStringify` (keys sorted at
 * every depth) + a trailing newline. NOT pretty-printed — this file is a
 * transport artifact, never hand-edited, and pretty-printing it would add
 * ~40% for nothing.
 */
export function serializeContentBundle(bundle: ContentBundle): string {
  return stableStringify(bundle) + "\n";
}

/**
 * Cheap structural check. Deliberately shallow — it proves the payload is a
 * bundle of the expected version, not that every doc is valid; per-doc
 * validation is still the ContentLoader's job (unchanged Zod parse).
 * Throws with a specific message so the fallback path can log WHY it fell back.
 */
export function parseContentBundle(raw: unknown): ContentBundle {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("bundle: payload is not an object");
  }
  const b = raw as Partial<ContentBundle>;
  if (b.schema !== CONTENT_BUNDLE_SCHEMA) {
    throw new Error(`bundle: schema must be "${CONTENT_BUNDLE_SCHEMA}" (got ${String(b.schema)})`);
  }
  // Non-empty string only, NOT the `cv_<12hex>` regex: the schema tag above is
  // what identifies the payload, and a stricter test here would turn a future
  // version-string format into a silent, permanent fallback to 1,454 requests.
  if (typeof b.contentVersion !== "string" || b.contentVersion === "") {
    throw new Error(`bundle: bad contentVersion ${String(b.contentVersion)}`);
  }
  if (typeof b.collections !== "object" || b.collections === null) {
    throw new Error("bundle: collections missing");
  }
  for (const [name, col] of Object.entries(b.collections)) {
    if (!isCollectionName(name)) throw new Error(`bundle: unknown collection "${name}"`);
    if (typeof col?.hash !== "string" || !Array.isArray(col.entries)) {
      throw new Error(`bundle: collection "${name}" is malformed`);
    }
    // ENTRY SHAPE, not just collection shape. Checking only the collection let a
    // well-formed-but-HOLLOW bundle through: entries of `{id, hash}` with no
    // `doc` pass every check above, and then BundleContentSource.readObject
    // returns `undefined` without throwing. The loader's try/catch never fires,
    // Zod's `parse(undefined)` error is ACCUMULATED rather than rethrown, so
    // FallbackContentSource never learns anything went wrong and the boot ends
    // at the 2-champion skeleton instead of the per-doc path this artifact
    // promises to degrade to. ~1 ms over 1,441 entries buys that guarantee.
    // `"doc" in e` rather than a truthiness test: `null`/`0`/`""` are all
    // decisions the per-doc Zod parse should get to reject with a real message.
    for (const e of col.entries) {
      if (
        typeof e !== "object" ||
        e === null ||
        typeof (e as { id?: unknown }).id !== "string" ||
        typeof (e as { hash?: unknown }).hash !== "string" ||
        !("doc" in e)
      ) {
        throw new Error(`bundle: collection "${name}" has a malformed entry`);
      }
    }
  }
  return b as ContentBundle;
}

/** Synthesize the manifest the per-doc path would have fetched. */
export function manifestFromBundle(bundle: ContentBundle): Manifest {
  const collections: Manifest["collections"] = {};
  for (const [name, col] of Object.entries(bundle.collections) as [
    CollectionName,
    BundleCollection,
  ][]) {
    collections[name] = { hash: col.hash, count: col.entries.length, path: `${name}/_index.json` };
  }
  return { contentVersion: bundle.contentVersion, collections };
}

/**
 * Synthesize the `_index.json` the per-doc path would have fetched.
 * `path` is reconstructed (`<collection>/<id>.json` — the layout fsStore
 * writes) and `size` is the doc's compact-JSON length, so an entry stays a
 * complete, non-lying `IndexEntry` without carrying either on the wire. (It is
 * the compact size, not the on-disk pretty-printed size — the only consumer of
 * `size` is a progress readout, and native JSON.stringify over the whole tree
 * measures 8.6 ms, versus 12,582 B of gzip-5 to ship the numbers.)
 */
export function indexFromBundle(bundle: ContentBundle, collection: CollectionName): CollectionIndex {
  const col = bundle.collections[collection];
  if (!col) throw new Error(`bundle: collection "${collection}" not present`);
  const entries: IndexEntry[] = col.entries.map(({ id, hash, doc }) => ({
    id,
    path: `${collection}/${id}.json`,
    hash,
    // APPROXIMATE, AND NOTHING READS IT. This is UTF-16 code units, not bytes,
    // and with this much CJK text the two differ substantially. `IndexEntry.size`
    // is documented as bytes; grepped, there is no consumer anywhere in the repo,
    // so the discrepancy costs nothing today. Stated rather than implying parity —
    // if a consumer ever appears, compute Buffer.byteLength here instead.
    size: JSON.stringify(doc)?.length ?? 0,
  }));
  return { collection, hash: col.hash, entries };
}
