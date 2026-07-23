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
  opts: { write?: boolean } = { write: true },
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
    }
  }
  entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const index: CollectionIndex = { collection, hash: hashCollection(entries), entries };
  if (opts.write !== false) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "_index.json"), fileJson(index), "utf8");
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
    writeFileSync(join(rootDir, "manifest.json"), fileJson(manifest), "utf8");
  }
  return manifest;
}

/** Rebuild every _index.json + manifest.json. Returns the manifest. */
export function rebuildAllIndexes(rootDir: string, opts: { write?: boolean } = {}): Manifest {
  const indexes: Partial<Record<CollectionName, CollectionIndex>> = {};
  for (const name of COLLECTION_NAMES) {
    if (!existsSync(join(rootDir, name))) continue;
    indexes[name] = rebuildCollectionIndex(rootDir, name, { write: opts.write });
  }
  return rebuildManifest(rootDir, { write: opts.write, indexes });
}
