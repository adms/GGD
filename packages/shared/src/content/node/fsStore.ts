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
import { dirname, join, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
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
 * ⭐ 資產樹的內容摘要（GH#838）—— `content/assets/**` 的每一個位元組。
 *
 * ⚠️ 決定性：只吃**相對路徑＋位元組**，⛔ 不吃 mtime／inode／順序（走排序）。
 * 不存在的資產目錄回 `undefined`（⇒ 這一格不進 manifest，舊行為逐位元不變）。
 */
export function hashAssetTree(assetsDir: string): string | undefined {
  if (!existsSync(assetsDir)) return undefined;
  const files: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(assetsDir);
  files.sort();
  const h = createHash("sha256");
  for (const f of files) {
    h.update(relative(assetsDir, f).split(sep).join("/"));
    h.update("\0");
    h.update(readFileSync(f));
    h.update("\0");
  }
  return h.digest("hex").slice(0, 12);
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
  // ⭐⭐ GH#838 —— **資產位元組也要進 contentVersion**（owner 2026-08-28：
  //    「Rider EX 地上魔法陣沒有去背透明，你已經不是第一次沒去背乾淨」）。
  //
  // ⛔ 那一次「不是第一次」的真根因**不是漏了哪一張圖** —— 那張圖 2026-08-24 就
  //    修好了。根因是**交付**：客戶端用 `?h=<contentVersion>` 抓每一顆 glb
  //    （`AssetManager.ts`），而 nginx 對非空 `?h=` 給
  //    `max-age=31536000, immutable`（`deploy/helm/ggd/files/nginx.conf`）——
  //    ⭐ 而 `contentVersion` 在這一行之前**只由 JSON 文件推導**，
  //    `content/assets/**` 貢獻 **0 bit**。
  //    ⇒ 一次「只改 glb、零份文件」的修復（`a9cf7187` 改了 25 顆）產生**一模一樣**
  //      的 cv ⇒ 修好的資產用**跟壞掉那份完全相同的 URL** 出貨 ⇒ 每一個看過壞版本
  //      的瀏覽器把它鎖一年。**修好了，而玩家看到的還是壞的，且沒有任何東西會紅。**
  //
  // ⇒ 把資產樹摘要成一格 hash 餵進去。實測 12,551 檔 / 340MB ⇒ **1.1 秒**，
  //    而它換掉的是「靜默交付失敗」——那是划算的（⛔ 不要為了省 1 秒退回去）。
  // ⚠️ 摘要**只吃路徑與位元組**（⛔ 不吃 mtime）：同一份內容在任何機器上都要算出
  //    同一個 cv，否則每一次 CI 都會 bust 掉全世界的快取。
  const assetsHash = hashAssetTree(join(rootDir, "assets"));
  if (assetsHash !== undefined) hashes["__assets"] = assetsHash;
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
