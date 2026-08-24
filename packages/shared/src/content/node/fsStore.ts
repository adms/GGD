/**
 * Node-side content/ tree maintenance: atomic doc writes, per-collection
 * _index.json (re)builds, and manifest.json (re)builds. Used by the shared
 * scripts (exportContentToJson / buildIndexes / contentValidate) and by the
 * dev content-api's incremental reindex.
 */
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { writeProduct } from "../../ops/writeProduct";
import {
  CONTENT_BUNDLE_FILE,
  buildContentBundle,
  serializeContentBundle,
  type ContentBundle,
} from "../bundle";
import { hashCollection, contentVersion, hashDoc } from "../hash";
import { COLLECTION_NAMES, ID_RE, type CollectionName } from "../schema/index";
import type { CollectionIndex, IndexEntry, Manifest, ManifestCollection } from "../types";

/** Pretty, git-friendly JSON files (hashes use stableStringify, not file bytes). */
export function fileJson(v: unknown): string {
  return JSON.stringify(v, null, 2) + "\n";
}

export function docFileName(id: string): string {
  return `${id}.json`;
}

/**
 * Resolve `<root>/<collection>/<id>.json` and REFUSE anything that escapes the
 * content root (path confinement — also re-checked by the content-api).
 */
export function docPath(rootDir: string, collection: CollectionName, id: string): string {
  if (!ID_RE.test(id)) throw new Error(`invalid id "${id}"`);
  const root = resolve(rootDir);
  const p = resolve(root, collection, docFileName(id));
  if (!p.startsWith(root + sep)) throw new Error(`path escapes content root: ${p}`);
  return p;
}

/** Atomic write: tmp file + rename. Returns the doc's content hash. */
export function writeDocAtomic(
  rootDir: string,
  collection: CollectionName,
  doc: { id: string },
): { path: string; hash: string } {
  const target = docPath(rootDir, collection, doc.id);
  mkdirSync(dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, fileJson(doc), "utf8");
  renameSync(tmp, target);
  return { path: target, hash: hashDoc(doc) };
}

export function deleteDocFile(rootDir: string, collection: CollectionName, id: string): boolean {
  const target = docPath(rootDir, collection, id);
  if (!existsSync(target)) return false;
  rmSync(target);
  return true;
}

/**
 * (Re)build one collection's _index.json from the *.json docs on disk.
 * Deterministic: entries sorted by id; hashes are stable-stringify hashes of
 * the parsed doc objects (independent of file formatting/key order).
 */
export function rebuildCollectionIndex(
  rootDir: string,
  collection: CollectionName,
  opts: {
    write?: boolean;
    /**
     * Optional sink for the parsed docs this pass already read+parsed, so the
     * bundle emitter can reuse them instead of reading the tree a second time
     * (one read = the bundle and the index can never disagree).
     */
    onDoc?: (id: string, doc: unknown) => void;
  } = { write: true },
): CollectionIndex {
  const dir = join(rootDir, collection);
  const entries: IndexEntry[] = [];
  if (existsSync(dir)) {
    for (const name of readdirSync(dir).sort()) {
      // Skip non-docs: the generated _index.json, any other underscore-prefixed
      // meta/config sidecar (e.g. models/_standin-overrides.json — a render-side
      // override map, not a content doc; doc ids never start with "_"), and tmp.
      if (!name.endsWith(".json") || name.startsWith("_") || name.endsWith(".tmp")) continue;
      const id = name.slice(0, -".json".length);
      const full = join(dir, name);
      const raw = readFileSync(full, "utf8");
      const doc = JSON.parse(raw) as { id?: string };
      if (doc.id !== id) {
        throw new Error(`${collection}/${name}: filename stem must equal doc id (got "${doc.id}")`);
      }
      entries.push({
        id,
        path: `${collection}/${name}`,
        hash: hashDoc(doc),
        size: statSync(full).size,
      });
      opts.onDoc?.(id, doc);
    }
  }
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const index: CollectionIndex = { collection, hash: hashCollection(entries), entries };
  if (opts.write !== false) {
    mkdirSync(dir, { recursive: true });
    // ⭐ 隔離區：`_index.json` 是**直寫**（⛔ 不像 bundle/manifest 走 tmp+rename ——
    //    rename 不需要目標的寫權限,所以那兩個天生免疫）⇒ 要先解鎖。
    writeProduct(join(dir, "_index.json"), fileJson(index));
  }
  return index;
}

/**
 * (Re)build manifest.json from every existing collection dir. Pure function
 * of content — no timestamps, so identical content always yields an identical
 * manifest (and contentVersion).
 */
export function rebuildManifest(
  rootDir: string,
  opts: { write?: boolean; indexes?: Partial<Record<CollectionName, CollectionIndex>> } = {},
): Manifest {
  const collections: Partial<Record<CollectionName, ManifestCollection>> = {};
  const hashes: Record<string, string> = {};
  for (const name of COLLECTION_NAMES) {
    const dir = join(rootDir, name);
    if (!existsSync(dir)) continue;
    const index =
      opts.indexes?.[name] ??
      (existsSync(join(dir, "_index.json"))
        ? (JSON.parse(readFileSync(join(dir, "_index.json"), "utf8")) as CollectionIndex)
        : rebuildCollectionIndex(rootDir, name, { write: false }));
    collections[name] = {
      hash: index.hash,
      count: index.entries.length,
      path: `${name}/_index.json`,
    };
    hashes[name] = index.hash;
  }
  const manifest: Manifest = { contentVersion: contentVersion(hashes), collections };
  if (opts.write !== false) {
    writeProduct(join(rootDir, "manifest.json"), fileJson(manifest)); // 同 _index:直寫 ⇒ 要解鎖
  }
  return manifest;
}

/** Absolute path of the one-file content bundle (content root, NOT a collection dir). */
export function bundlePath(rootDir: string): string {
  return join(rootDir, CONTENT_BUNDLE_FILE);
}

/**
 * Write content/bundle.json — every doc in ONE deterministic file.
 *
 * Deliberately at the content ROOT: rebuildManifest only walks
 * COLLECTION_NAMES subdirectories and rebuildCollectionIndex only reads *.json
 * inside a collection dir, so this file is invisible to both and CANNOT
 * perturb contentVersion. Verified by test (cv_ before == cv_ after).
 */
export function writeContentBundle(
  rootDir: string,
  manifest: Manifest,
  indexes: Partial<Record<CollectionName, CollectionIndex>>,
  docs: Partial<Record<CollectionName, Record<string, unknown>>>,
): { path: string; bytes: number; bundle: ContentBundle } {
  const bundle = buildContentBundle(manifest, indexes, docs);
  const text = serializeContentBundle(bundle);
  const target = bundlePath(rootDir);
  // atomic: a half-written bundle would be a parse error for every client at
  // once (the fallback would catch it, but a torn file must never be servable).
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, target);
  return { path: target, bytes: Buffer.byteLength(text, "utf8"), bundle };
}

/**
 * Remove content/bundle.json. Used by the dev content-api after a per-doc
 * write: a stale bundle would silently feed the client OLD docs while the
 * game-server (FsContentSource, always fresh) has the new ones. Deleting is
 * the safe default — the client's FallbackContentSource then goes back to
 * per-doc fetching until the next `pnpm content:build`.
 */
export function deleteContentBundle(rootDir: string): boolean {
  const target = bundlePath(rootDir);
  // The PRECOMPRESSED SIDECARS COUNT AS THE BUNDLE. nginx's gzip_static (and
  // brotli_static) will happily serve `bundle.json.gz` after `bundle.json`
  // itself is gone — so deleting only the source would leave the exact stale
  // artifact this function exists to remove, visible to every gzip-capable
  // client and invisible to everyone else. nginx/precompress.sh writes these
  // whenever it is pointed at content/.
  let removed = false;
  for (const suffix of ["", ".gz", ".br"]) {
    const f = target + suffix;
    if (existsSync(f)) {
      rmSync(f);
      if (suffix === "") removed = true;
    }
  }
  return removed;
}

/**
 * Rebuild every _index.json + manifest.json + bundle.json. Returns the manifest.
 * The bundle is built from the SAME parsed doc objects the index pass read, so
 * a second disk read (and any chance of index/bundle disagreement) is impossible.
 */
export function rebuildAllIndexes(
  rootDir: string,
  opts: { write?: boolean; bundle?: boolean } = {},
): Manifest {
  const indexes: Partial<Record<CollectionName, CollectionIndex>> = {};
  const docs: Partial<Record<CollectionName, Record<string, unknown>>> = {};
  for (const name of COLLECTION_NAMES) {
    if (!existsSync(join(rootDir, name))) continue;
    const byId: Record<string, unknown> = {};
    docs[name] = byId;
    indexes[name] = rebuildCollectionIndex(rootDir, name, {
      write: opts.write,
      onDoc: (id, doc) => {
        byId[id] = doc;
      },
    });
  }
  const manifest = rebuildManifest(rootDir, { write: opts.write, indexes });
  if (opts.write !== false && opts.bundle !== false) {
    writeContentBundle(rootDir, manifest, indexes, docs);
  }
  return manifest;
}
