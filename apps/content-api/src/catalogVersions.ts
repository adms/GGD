import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import { COLLECTION_NAMES } from "@ggd/shared/content/schema/index";
import { referencedAssetPaths } from "@ggd/shared/content/assetReferences";
import { contentSha256 } from "@ggd/shared/content/import/jcs";
import { sha256Bytes } from "@ggd/shared/content/sha256";
import { ImportStore } from "./importStore";
import { readCatalogGeneratorSources, type CatalogSourceArchive } from "./catalogGeneratorSources";

export const HERO_CATALOG_WORK_ID = "ggd-existing-hero-catalog";

/**
 * 完整目錄快照的**位元組上限**。
 *
 * > owner 2026-09-10（逐字）：「**如果這是我本機端的話 2x 就好**」
 *
 * ⇒ 256 → **512 MiB**。⚠️ 這支只在 dev（`buildServer` 在 `NODE_ENV=production`
 * 下拒絕啟動），所以它保護的是 owner 這台機器的記憶體，⛔ 不是線上。
 *
 * ⚠️ 量到的代價（2026-09-10）：`capture()` 掛在**每一次英雄寫入**上
 * （`writeTextAtomic` → `catalogHistory.capture()`），實測目錄 237 MiB 時
 * 單獨一次快照 = **9.1 秒**，一次模型版本註冊總共 20.9 秒。
 * ⇒ 上限翻倍不會讓現在變慢（它是**上限**不是工作量），
 *   ⛔ 但目錄真的長到 512 MiB 時，每一次後台存檔都會付約 18 秒。
 *
 * ⭐ 真正的根因**不是這個數字**：`freeze()` 用的是來源 GLB 的原始位元組，
 * 所以凍結出來的 `versions/<sha>.glb` 與它的來源檔**逐位元組相同**，
 * 而 `add()` 是按**路徑**擋重複、⛔ 不是按內容 ⇒ 同一份位元組被算兩次。
 * 2026-09-10 量到已經有 13.1 MiB 這種重複，41 顆模型全部版本化會變成約 66 MiB。
 * ⇒ 下一步應該是**讀取時按 sha256 去重**，那會讓這個上限退回成單純的安全閥。
 */
const CATALOG_BYTE_CAP = 512 * 1024 * 1024;

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
  /** Immutable assets previously instantiated by this server, outside the
   * read-only shipped tree. Never a caller-controlled URL. */
  readArchivedAsset?: (path: string) => Uint8Array | null;
}

export function readHeroCatalog(rootPath: string, input: CatalogCaptureOptions) {
  if (!input.gameRevision.trim()) throw new Error("保存完整版本需要遊戲建置版本。");
  const root = realpathSync(rootPath), files = new Map<string, Uint8Array>();
  const observed = new Map<string, string>(), assets = new Set<string>();
  const directories = new Map<string, string>();
  const missing: string[] = [], staleAssets: string[] = [];
  const heroes: { id: string; name: string; path: string; catalog: "shipping" | "legacy" | "overlay" }[] = [];
  let bytes = 0;
  /**
   * ⭐ 同一份**位元組**只算一次、只存一份 —— 判準是**內容雜湊**，⛔ 不是路徑。
   *
   * > owner 2026-09-10（逐字）：「⭐ 更好的一刀：內容去重（根因在這裡）⋯**do it**」
   *
   * ⚠️ 為什麼這裡一定會有重複：模型版本化（`ModelVersions.freeze()`）保存的是
   * **來源 GLB 的原始位元組**，所以凍結出來的 `versions/<binarySha256>.glb`
   * 與它的來源檔**逐位元組相同** —— 兩個路徑、一份內容。
   * ⛔ 而原本的 `add()` 只按 `files.has(path)` 擋重複，於是同一份位元組被
   * **算兩次、也存兩份**。2026-09-10 量到：那時已經有 **13.1 MiB** 這種重複，
   * 41 顆模型全部版本化會長成約 **66 MiB** —— ⭐ 那正好就是撞上限的量。
   *
   * ⭐ 去重之後 `files` 裡多個路徑**共用同一個 Uint8Array 實例**：
   * 下游（`retainHeroTemplates` / 物件庫寫入）全部是唯讀的，⛔ 沒有人改它。
   * ⚠️ 份數上限（20,000）仍然按**路徑**算 —— 那一格擋的是檔案數，⛔ 不是位元組。
   */
  const unique = new Map<string, Uint8Array>();
  // ⚠️ `digest` 是**已經算過**的內容雜湊 —— ⛔ 不傳就在這裡再算一次。
  //    這一格重要:`read()`(記進 `observed`)、素材清單對帳、以及最後那一輪
  //    防競態重讀,本來就各自雜湊一次;⛔ 去重再算第四次會讓整次快照多一倍時間
  //    (實測 9.1s → 18.5s)。⇒ 大宗的兩條路(文件與素材)一律把算好的帶下來。
  const add = (path: string, data: Uint8Array, digest?: string) => {
    if (!/^[a-zA-Z0-9._/-]+$/.test(path) || path.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("完整版本含不安全路徑。");
    if (files.has(path)) throw new Error(`完整版本檔案重複：${path}`);
    if (files.size >= 20000) throw new Error(`完整初始版本超過 ${CATALOG_BYTE_CAP / 1024 / 1024} MiB 或 20,000 份檔案，未保存不完整版本。`);
    digest ??= sha256Bytes(data);
    const shared = unique.get(digest);
    if (shared) { files.set(path, shared); return; }
    bytes += data.byteLength;
    if (bytes > CATALOG_BYTE_CAP) throw new Error(`完整初始版本超過 ${CATALOG_BYTE_CAP / 1024 / 1024} MiB 或 20,000 份檔案，未保存不完整版本。`);
    const copy = data.slice();
    unique.set(digest, copy);
    files.set(path, copy);
  };
  const read = (path: string): Uint8Array => {
    const file = resolve(root, path);
    if (!file.startsWith(root + sep) || !existsSync(file) || !realpathSync(file).startsWith(root + sep)) throw new Error(`完整版本缺少本機檔案或路徑越界：${path}`);
    if (!statSync(file).isFile() || statSync(file).size > 256 * 1024 * 1024) throw new Error(`完整版本檔案類型或大小不合法：${path}`);
    const data = new Uint8Array(readFileSync(file));
    observed.set(path, sha256Bytes(data));
    return data;
  };
  const collect = (data: Uint8Array, path: string, catalog: "shipping" | "legacy" | "overlay", digest?: string) => {
    const document = JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown>;
    referencedAssetPaths(document, assets);
    if (path.includes("/champions/") && typeof document.id === "string") {
      heroes.push({ id: document.id, name: typeof document.name === "string" ? document.name : document.id, path, catalog });
    }
    add(path, data, digest);
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
      collect(read(sourcePath), `catalog/${sourcePath}`, prefix ? "legacy" : "shipping", observed.get(sourcePath));
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
    const archived = !existsSync(resolve(root, path)) ? input.readArchivedAsset?.(path) : null;
    if (input.allowIncomplete && !archived && !existsSync(resolve(root, path))) { missing.push(path); continue; }
    const data = archived ?? read(path), fact = assetFacts.get(path);
    const digest = observed.get(path) ?? sha256Bytes(data);
    if (fact && (data.byteLength !== fact.bytes || digest !== fact.sha256)) {
      if (!input.allowIncomplete) throw new Error(`素材已偏離清單，未保存不完整版本：${path}`);
      staleAssets.push(path);
    }
    add(path, data, digest);
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
