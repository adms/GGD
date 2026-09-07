import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { COLLECTION_NAMES } from "@ggd/shared/content/schema/index";
import { referencedAssetPaths } from "@ggd/shared/content/assetReferences";
import { contentSha256 } from "@ggd/shared/content/import/jcs";
import { sha256Bytes } from "@ggd/shared/content/sha256";
import { ImportStore } from "./importStore";
import { readCatalogGeneratorSources, type CatalogSourceArchive } from "./catalogGeneratorSources";

export const HERO_CATALOG_WORK_ID = "ggd-existing-hero-catalog";

/** An initial archive covers both shipping and non-shipping heroes. It does
 * not publish a hero or change ACTIVE. Full-catalog bytes are stored once, and
 * individual heroes refer to the same immutable baseline rather than copying
 * shared models, skills and audio into 119 separate archives. */
export interface CatalogCaptureOptions {
  gameRevision: string;
  repoRoot?: string;
  /** Exact persisted overlay bytes, kept separately from the original files. */
  overlay?: Uint8Array;
  /** Authoring snapshots also preserve incomplete states, explicitly recording
   * missing references and stale manifest entries; they are not publish proof. */
  allowIncomplete?: boolean;
  reuseUnchangedFrom?: string;
}

export function readHeroCatalog(rootPath: string, input: CatalogCaptureOptions) {
  if (!input.gameRevision.trim()) throw new Error("保存完整版本需要遊戲建置版本。");
  const root = realpathSync(rootPath), files = new Map<string, Uint8Array>();
  const observed = new Map<string, string>(), assets = new Set<string>();
  const directories = new Map<string, string>();
  const missing: string[] = [], staleAssets: string[] = [];
  const heroes: { id: string; name: string; path: string; catalog: "shipping" | "legacy" | "overlay" }[] = [];
  let bytes = 0;
  const add = (path: string, data: Uint8Array) => {
    if (!/^[a-zA-Z0-9._/-]+$/.test(path) || path.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("完整版本含不安全路徑。");
    if (files.has(path)) throw new Error(`完整版本檔案重複：${path}`);
    bytes += data.byteLength;
    if (files.size >= 20000 || bytes > 256 * 1024 * 1024) throw new Error("完整初始版本超過 256 MiB 或 20,000 份檔案，未保存不完整版本。");
    files.set(path, data.slice());
  };
  const read = (path: string): Uint8Array => {
    const file = resolve(root, path);
    if (!file.startsWith(root + sep) || !existsSync(file) || !realpathSync(file).startsWith(root + sep)) throw new Error(`完整版本缺少本機檔案或路徑越界：${path}`);
    if (!statSync(file).isFile() || statSync(file).size > 256 * 1024 * 1024) throw new Error(`完整版本檔案類型或大小不合法：${path}`);
    const data = new Uint8Array(readFileSync(file));
    observed.set(path, sha256Bytes(data));
    return data;
  };
  const collect = (data: Uint8Array, path: string, catalog: "shipping" | "legacy" | "overlay") => {
    const document = JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown>;
    referencedAssetPaths(document, assets);
    if (path.includes("/champions/") && typeof document.id === "string") {
      heroes.push({ id: document.id, name: typeof document.name === "string" ? document.name : document.id, path, catalog });
    }
    add(path, data);
  };
  // Original bytes include uncompiled owner text, embedded mirrors, templates,
  // settings and archived heroes. No conversion to a HeroProject is attempted.
  for (const prefix of ["", "_legacy/"]) for (const collection of COLLECTION_NAMES) {
    const dir = resolve(root, prefix + collection);
    const names = () => existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".json")).sort().join("\n") : "<absent>";
    directories.set(dir, names());
    if (!existsSync(dir)) continue;
    if (!realpathSync(dir).startsWith(root + sep)) throw new Error("英雄內容目錄越界。");
    for (const file of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      if (!file.name.endsWith(".json")) continue;
      const sourcePath = `${prefix}${collection}/${file.name}`;
      collect(read(sourcePath), `catalog/${sourcePath}`, prefix ? "legacy" : "shipping");
    }
  }
  for (const path of ["manifest.json", "assets-manifest.json"]) {
    if (input.allowIncomplete && !existsSync(resolve(root, path))) { missing.push(path); continue; }
    add(`catalog/${path}`, read(path));
  }
  const assetManifest = files.has("catalog/assets-manifest.json") ? JSON.parse(new TextDecoder().decode(files.get("catalog/assets-manifest.json")!)) as { entries: { path: string; bytes: number; sha256: string }[] } : { entries: [] };
  for (const entry of assetManifest.entries) assets.add(entry.path);
  if (input.overlay) {
    const overlay = JSON.parse(new TextDecoder().decode(input.overlay)) as { docs: Record<string, unknown>; deleted: Record<string, boolean> };
    if (!overlay.docs || !overlay.deleted) throw new Error("覆蓋層版本不完整。");
    add("catalog/overlay.json", input.overlay);
    for (const [key, value] of Object.entries(overlay.docs)) {
      if (!/^[a-z][a-z-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(key)) throw new Error("覆蓋層文件身分不合法。");
      collect(new TextEncoder().encode(JSON.stringify(value)), `overlay/${key}.json`, "overlay");
    }
  }
  const assetFacts = new Map(assetManifest.entries.map((entry) => [entry.path, entry]));
  for (const path of [...assets].sort()) {
    if (!path.startsWith("assets/") || !/^[a-zA-Z0-9._/-]+$/.test(path) || path.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("素材路徑不在內容素材目錄。");
    if (input.allowIncomplete && !existsSync(resolve(root, path))) { missing.push(path); continue; }
    const data = read(path), fact = assetFacts.get(path);
    if (fact && (data.byteLength !== fact.bytes || sha256Bytes(data) !== fact.sha256)) {
      if (!input.allowIncomplete) throw new Error(`素材已偏離清單，未保存不完整版本：${path}`);
      staleAssets.push(path);
    }
    add(path, data);
  }
  const sources = input.repoRoot && ["sync-io.json", "normalizers.json"].every((name) => existsSync(resolve(input.repoRoot!, "tools/parallel-gates", name)))
    ? readCatalogGeneratorSources(input.repoRoot, [...files.keys()]) : undefined;
  if (sources) {
    for (const [path, data] of sources.files) add(path, data);
    sources.verify();
  }
  // Check both inputs and output data after the complete archive has been read.
  for (const [path, digest] of observed) if (sha256Bytes(read(path)) !== digest) throw new Error(`保存期間內容已更新，請重新取得版本：${path}`);
  for (const [dir, names] of directories) if ((existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".json")).sort().join("\n") : "<absent>") !== names) throw new Error("保存期間內容目錄已更新，請重新取得版本。");
  for (const path of missing) if (existsSync(resolve(root, path))) throw new Error(`保存期間缺少的素材已出現，請重新取得版本：${path}`);
  const sourceInfo: {generatorSources?: CatalogSourceArchive; generatorSourcesUnavailable?: string} = sources
    ? { generatorSources: sources.manifest } : { generatorSourcesUnavailable: "此快照未取得產生器擁有權與來源，不能據此還原產生器。" };
  const manifest = {
    schema: "ggd-hero-catalog-version@1", gameRevision: input.gameRevision,
    ...sourceInfo,
    ...(missing.length || staleAssets.length ? { incomplete: { missing, staleAssets } } : {}),
    heroes: heroes.sort((a, b) => a.path.localeCompare(b.path, "en")),
    files: [...files].sort(([a], [b]) => a.localeCompare(b, "en")).map(([path, data]) => ({ path, bytes: data.byteLength, sha256: `sha256:${sha256Bytes(data)}` })),
  };
  const versionId = contentSha256(manifest);
  add("catalog-version.json", new TextEncoder().encode(JSON.stringify(manifest)));
  return { files, manifest, bytes, versionId };
}

export function captureHeroCatalogVersion(rootPath: string, store: ImportStore, input: CatalogCaptureOptions) {
  const { files, manifest, bytes, versionId } = readHeroCatalog(rootPath, input);
  const result = store.putWorkVersion({ workId: HERO_CATALOG_WORK_ID, projectId: HERO_CATALOG_WORK_ID, packageDigest: versionId }, files, { reuseUnchangedFrom: input.reuseUnchangedFrom });
  return { ...result, manifest, bytes, files };
}
