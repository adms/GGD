import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { COLLECTION_NAMES } from "@ggd/shared/content/schema/index";
import { canonicalizeJcs } from "@ggd/shared/content/import/jcs";
import type { HeroPackageCatalog } from "@ggd/shared/content/import/heroPackage";
import type { EditorImportPackage } from "@ggd/shared/content/import/packageSchema";
import { assetSha256 } from "./iconLanding";
import { readNormalizedIcon, type ImportStore } from "./importStore";

/** Read authoring from Main's content tree; never trust submitted dependencies. */
export function readHeroPackageCatalog(root: string, importDir?: string, normalizedAssets: ReadonlyMap<string, Uint8Array> = new Map()): HeroPackageCatalog {
  const documents = new Map<string, Record<string, unknown>>();
  for (const collection of COLLECTION_NAMES) {
    const dir = join(root, collection);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir, { withFileTypes: true })) {
      if (!file.isFile() || !file.name.endsWith(".json") || file.name.startsWith("_")) continue;
      const document = JSON.parse(readFileSync(join(dir, file.name), "utf8")) as Record<string, unknown>;
      if (typeof document.id === "string") documents.set(`${collection}/${document.id}`, document);
    }
  }
  const manifestPath = join(root, "assets-manifest.json");
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) as { entries: { path: string; sha256: string; bytes: number }[] } : null;
  const assets = new Map((manifest?.entries ?? []).map((entry) => [entry.path, entry]));
  const assetRoot = resolve(root, "assets") + sep;
  return { documents, readAsset: (path) => {
    if (normalizedAssets.has(path)) return normalizedAssets.get(path);
    if (importDir) {
      const normalized = readNormalizedIcon(importDir, path);
      if (normalized) return normalized;
    }
    const expected = assets.get(path);
    if (!expected || path.startsWith("assets/blizzard-local/")) return undefined;
    const abs = resolve(root, path);
    if (!abs.startsWith(assetRoot) || !existsSync(abs) || !realpathSync(abs).startsWith(realpathSync(root) + sep + "assets" + sep)) return undefined;
    const bytes = readFileSync(abs);
    if (bytes.length !== expected.bytes || assetSha256(bytes) !== `sha256:${expected.sha256}`) throw new Error(`資產清單已過期：${path}`);
    return bytes;
  } };
}

export function heroPackageFiles(pkg: EditorImportPackage): Map<string, Uint8Array> {
  const encode = (value: unknown) => new TextEncoder().encode(canonicalizeJcs(value));
  // Transport facts are excluded from the semantic digest and the immutable object.
  const { transport: _transport, ...manifest } = pkg.manifest;
  const files = new Map<string, Uint8Array>([["manifest.json", encode(manifest)]]);
  for (const entry of [...pkg.documents, ...pkg.compiled, ...pkg.validation]) files.set(entry.path, encode(entry.document));
  for (const asset of pkg.assets) {
    if (!(asset.bytes instanceof Uint8Array)) throw new Error(`資產不含原始位元組：${asset.path}`);
    files.set(asset.path, asset.bytes);
  }
  return files;
}

export function readHeroWorkPackage(store: ImportStore, workId: string, versionId: string): EditorImportPackage | null {
  const files = store.readWorkFiles(workId, versionId);
  if (!files) return null;
  const bytes = files.get("manifest.json");
  if (!bytes) throw new Error("作品快照缺少 manifest。");
  const manifest = JSON.parse(bytes.toString("utf8")) as EditorImportPackage["manifest"];
  const pkg: EditorImportPackage = { schema: "ggd-editor-import@1", manifest, documents: [], compiled: [], validation: [], assets: [], reports: {} };
  for (const entry of manifest.entries) {
    const content = files.get(entry.path);
    if (!content) throw new Error(`作品快照缺少 ${entry.path}`);
    if (entry.role === "asset") pkg.assets.push({ path: entry.path, bytes: content });
    else {
      const document = JSON.parse(content.toString("utf8")) as unknown;
      if (entry.role === "authoring") pkg.documents.push({ path: entry.path, document });
      else if (entry.role === "compiled") pkg.compiled.push({ path: entry.path, document });
      else if (entry.role === "validation") pkg.validation.push({ path: entry.path, document });
      else throw new Error(`作品快照出現未支援的角色：${entry.role}`);
    }
  }
  return pkg;
}
