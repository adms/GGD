import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import {
  contentVersion,
  hashCollection,
  hashDoc,
  sha256Hex,
  isCollectionName,
  validateDoc,
  type CollectionName,
  type ContentBundle,
  type Manifest,
} from "@ggd/shared/content";
import type { RuntimeCapabilityManifest } from "@ggd/shared/content/editorCapabilities";
import {
  EDITOR_DESKTOP_SOURCE_SCHEMA,
  type EditorDesktopConflict,
  type EditorDesktopSourceInfo,
} from "@ggd/shared/editorDesktop";
import {
  fileJson,
  rebuildAllIndexes,
  writeDocAtomic,
} from "@ggd/shared/content/node";

export const REMOTE_WORKSPACE_SCHEMA = "ggd-editor-remote-workspace@1" as const;

export interface RemoteWorkspacePolicy {
  /** HTTPS hosts accepted as immutable read-only bases. Loopback is always accepted for development. */
  readonly allowedHosts: readonly string[];
  readonly maxManifestBytes: number;
  readonly maxBundleBytes: number;
  readonly maxAssetBytes: number;
  readonly requestTimeoutMs: number;
}

const TRANSPORT_BOUNDS = {
  maxManifestBytes: [64 * 1024, 16 * 1024 * 1024],
  maxBundleBytes: [1024 * 1024, 256 * 1024 * 1024],
  maxAssetBytes: [1024 * 1024, 256 * 1024 * 1024],
  requestTimeoutMs: [1000, 120_000],
} as const;

function boundedEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  bounds: readonly [number, number],
): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < bounds[0] || value > bounds[1]) {
    throw new Error(`${key} 必須是 ${bounds[0]}–${bounds[1]} 的整數，目前是 ${raw}`);
  }
  return value;
}

/**
 * Desktop transport policy has one runtime home. The setup screen, JSON sync,
 * asset bridge and tests all consume this object; no caller carries a shadow
 * copy of the byte/time budgets.
 */
export function remoteWorkspacePolicy(env: NodeJS.ProcessEnv = process.env): RemoteWorkspacePolicy {
  const allowedHosts = (env.GGD_EDITOR_REMOTE_HOSTS ?? "ggd.adms.ai")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (
    allowedHosts.length === 0 ||
    allowedHosts.some((host) => !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host))
  ) {
    throw new Error("GGD_EDITOR_REMOTE_HOSTS 必須是逗號分隔的純 hostname");
  }
  return {
    allowedHosts: [...new Set(allowedHosts)],
    maxManifestBytes: boundedEnv(env, "GGD_EDITOR_REMOTE_MANIFEST_MAX_BYTES", 2 * 1024 * 1024, TRANSPORT_BOUNDS.maxManifestBytes),
    maxBundleBytes: boundedEnv(env, "GGD_EDITOR_REMOTE_BUNDLE_MAX_BYTES", 64 * 1024 * 1024, TRANSPORT_BOUNDS.maxBundleBytes),
    maxAssetBytes: boundedEnv(env, "GGD_EDITOR_REMOTE_ASSET_MAX_BYTES", 128 * 1024 * 1024, TRANSPORT_BOUNDS.maxAssetBytes),
    requestTimeoutMs: boundedEnv(env, "GGD_EDITOR_REMOTE_TIMEOUT_MS", 20_000, TRANSPORT_BOUNDS.requestTimeoutMs),
  };
}

export type RemoteConflict = EditorDesktopConflict;

export interface RemoteWorkspaceMetadata {
  readonly schema: typeof REMOTE_WORKSPACE_SCHEMA;
  readonly sourceUrl: string;
  readonly contentBaseUrl: string;
  readonly pinnedContentVersion: string;
  readonly latestRemoteContentVersion: string;
  readonly lastSuccessfulCheckAt: string;
  readonly conflicts: readonly RemoteConflict[];
  readonly compatibilityWarnings: readonly string[];
  readonly targetProfileDigest: string | null;
}

export interface NormalizedRemoteSource {
  readonly sourceUrl: string;
  readonly contentBaseUrl: string;
}

export interface SyncRemoteWorkspaceOptions {
  readonly sourceInput: string;
  readonly workspaceRoot: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
  readonly policy?: RemoteWorkspacePolicy;
}

interface RemoteBundleCollection {
  readonly hash: string;
  readonly entries: readonly { id: string; hash: string; doc: unknown }[];
}

interface RemoteBundle {
  readonly schema: "content-bundle@1";
  readonly contentVersion: string;
  readonly collections: Readonly<Record<string, RemoteBundleCollection>>;
}

interface RemoteEditorTargetProfile {
  readonly schema: "ggd-editor-target-profile@1";
  /** 舊版出貨檔曾帶時間；新版刻意 clock-free。 */
  readonly generatedAt?: string;
  readonly readOnly: true;
  readonly content: {
    readonly contentVersion: string;
    readonly collections: Readonly<Record<string, { hash: string; count: number }>>;
    readonly collectionCount: number;
  };
  readonly contract: {
    readonly compiler: { readonly contractVersion: string | null; readonly fingerprint: string | null };
  };
  readonly runtimeCapabilities: RuntimeCapabilityManifest;
  readonly curation: {
    readonly championDigest: string | null;
    readonly itemDigest: string | null;
  };
  readonly assetManifestDigest: string | null;
  readonly deltaExportAllowed: boolean;
  readonly supportedModes: readonly ("bootstrap" | "full" | "delta")[];
  readonly unavailable: readonly { field: string; reason: string }[];
  readonly authoringModel?: {
    readonly accepts: readonly string[];
    readonly notRequired: readonly string[];
    readonly intentField?: string;
    readonly note?: string;
  };
  readonly profileDigest: string;
  readonly [key: string]: unknown;
}

export type PinnedTargetProfile = RemoteEditorTargetProfile;

/**
 * V1 deliberately allowlists the official host. Loopback is accepted for tests
 * and private development. This prevents a pasted URL turning the desktop app
 * into an SSRF client for arbitrary LAN services.
 */
export function normalizeRemoteSource(
  input: string,
  policy: RemoteWorkspacePolicy = remoteWorkspacePolicy(),
): NormalizedRemoteSource {
  const trimmed = input.trim();
  if (trimmed === "") throw new Error("請輸入遊戲網站 URL");
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  if (url.username || url.password) throw new Error("URL 不可包含帳號或密碼");
  if (url.search || url.hash) throw new Error("URL 不可包含查詢參數或錨點");
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new Error("遠端資料來源必須使用 HTTPS");
  }
  if (!policy.allowedHosts.includes(url.hostname.toLowerCase()) && !loopback) {
    throw new Error(`遠端 hostname ${url.hostname} 不在 GGD_EDITOR_REMOTE_HOSTS 白名單`);
  }

  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  let contentUrl: URL;
  let sourceUrl: URL;
  if (url.pathname === "/content" || url.pathname.endsWith("/content")) {
    contentUrl = new URL(url.href);
    sourceUrl = new URL(url.href);
    sourceUrl.pathname = sourceUrl.pathname.slice(0, -"/content".length) || "/";
  } else {
    sourceUrl = new URL(url.href);
    const base = sourceUrl.href.endsWith("/") ? sourceUrl.href : `${sourceUrl.href}/`;
    contentUrl = new URL("content/", base);
  }
  return {
    sourceUrl: sourceUrl.href.replace(/\/$/, ""),
    contentBaseUrl: `${contentUrl.href.replace(/\/$/, "")}/`,
  };
}

export function remoteWorkspaceKey(
  sourceUrl: string,
  policy: RemoteWorkspacePolicy = remoteWorkspacePolicy(),
): string {
  const normalized = normalizeRemoteSource(sourceUrl, policy);
  const host = new URL(normalized.sourceUrl).hostname.replace(/[^a-z0-9.-]+/gi, "-");
  const digest = createHash("sha256").update(normalized.sourceUrl).digest("hex").slice(0, 12);
  return `${host}-${digest}`;
}

function metadataFile(root: string): string {
  return join(root, "workspace.json");
}

function readMetadata(root: string): RemoteWorkspaceMetadata | null {
  try {
    const parsed = JSON.parse(readFileSync(metadataFile(root), "utf8")) as RemoteWorkspaceMetadata;
    return parsed.schema === REMOTE_WORKSPACE_SCHEMA
      ? {
        ...parsed,
        compatibilityWarnings: parsed.compatibilityWarnings ?? [],
        targetProfileDigest: parsed.targetProfileDigest ?? null,
      }
      : null;
  } catch {
    return null;
  }
}

function targetProfileFile(root: string, version: string): string {
  return join(root, "base", version, "editor-target-profile.json");
}

function writeMetadata(root: string, metadata: RemoteWorkspaceMetadata): void {
  mkdirSync(root, { recursive: true });
  const target = metadataFile(root);
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, fileJson(metadata), "utf8");
  renameSync(tmp, target);
}

function workingContentDir(root: string): string {
  return join(root, "working", "content");
}

function snapshotContentDir(root: string, version: string): string {
  return join(root, "base", version, "content");
}

function readManifest(root: string): Manifest | null {
  try {
    return JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as Manifest;
  } catch {
    return null;
  }
}

async function fetchJsonLimited(
  fetchImpl: typeof fetch,
  url: string,
  maxBytes: number,
  timeoutMs: number,
): Promise<{ value: unknown; etag: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      redirect: "error",
    });
    if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new Error(`${url} 超過下載上限 ${maxBytes} bytes`);
    }
    if (!response.body) throw new Error(`${url} 沒有回應內容`);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel("remote JSON exceeded limit");
          throw new Error(`${url} 超過下載上限 ${maxBytes} bytes`);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let cursor = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, cursor);
      cursor += chunk.byteLength;
    }
    return {
      value: JSON.parse(new TextDecoder().decode(bytes)) as unknown,
      etag: response.headers.get("etag"),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function validateRemoteManifest(raw: unknown): Manifest {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("遠端 manifest 不是物件");
  const value = raw as Partial<Manifest>;
  if (typeof value.contentVersion !== "string" || !/^cv_[0-9a-f]{12}$/i.test(value.contentVersion)) {
    throw new Error("遠端 manifest 缺少有效 contentVersion");
  }
  if (typeof value.collections !== "object" || value.collections === null) {
    throw new Error("遠端 manifest 缺少 collections");
  }
  return value as Manifest;
}

/** Validate every document and every advertised digest before it reaches disk. */
export function validateRemoteBundle(
  raw: unknown,
  manifest: Manifest,
  compatibilityWarnings: string[] = [],
): ContentBundle {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("bundle: payload 不是物件");
  const bundle = raw as RemoteBundle;
  if (bundle.schema !== "content-bundle@1" || typeof bundle.collections !== "object" || bundle.collections === null) {
    throw new Error("bundle: schema 或 collections 無效");
  }
  if (bundle.contentVersion !== manifest.contentVersion) {
    throw new Error(`manifest ${manifest.contentVersion} 與 bundle ${bundle.contentVersion} 不一致`);
  }
  const editableCollections: ContentBundle["collections"] = {};
  const editableHashes: Record<string, string> = {};
  for (const [collection, col] of Object.entries(bundle.collections)) {
    if (typeof col !== "object" || col === null || typeof col.hash !== "string" || !Array.isArray(col.entries)) {
      throw new Error(`${collection}: bundle collection 無效`);
    }
    const ids = new Set<string>();
    const validEntries: { id: string; hash: string; doc: unknown }[] = [];
    const incompatibleIds: string[] = [];
    for (const entry of col.entries) {
      if (typeof entry !== "object" || entry === null || typeof entry.id !== "string" || typeof entry.hash !== "string" || !("doc" in entry)) {
        throw new Error(`${collection}: bundle entry 無效`);
      }
      if (ids.has(entry.id)) throw new Error(`${collection}/${entry.id}: bundle id 重複`);
      ids.add(entry.id);
      const docId = (entry.doc as { id?: unknown }).id;
      if (docId !== entry.id) throw new Error(`${collection}/${entry.id}: 文件 id 不一致`);
      if (hashDoc(entry.doc) !== entry.hash) throw new Error(`${collection}/${entry.id}: hash 不一致`);
      if (isCollectionName(collection)) {
        const parsed = validateDoc(collection, entry.doc);
        if (parsed.ok) validEntries.push(entry);
        else incompatibleIds.push(entry.id);
      }
    }
    const actualCollectionHash = hashCollection(col.entries);
    if (actualCollectionHash !== col.hash) throw new Error(`${collection}: collection hash 不一致`);
    const advertised = (manifest.collections as Readonly<Record<string, { hash: string; count: number } | undefined>>)[collection];
    if (!advertised || advertised.hash !== col.hash || advertised.count !== col.entries.length) {
      throw new Error(`${collection}: manifest 與 bundle 索引不一致`);
    }
    if (isCollectionName(collection)) {
      if (validEntries.length > 0) {
        const editableHash = hashCollection(validEntries);
        editableCollections[collection] = { hash: editableHash, entries: validEntries };
        editableHashes[collection] = editableHash;
      }
      if (incompatibleIds.length > 0) {
        const sample = incompatibleIds.slice(0, 5).join("、");
        compatibilityWarnings.push(
          `${collection}：${incompatibleIds.length} 份文件使用新版 schema，僅驗證線上完整性、未匯入本機 Editor（${sample}${incompatibleIds.length > 5 ? "…" : ""}）`,
        );
      }
    } else {
      compatibilityWarnings.push(
        `${collection}：目前 Editor 未支援此集合，已驗證 ${col.entries.length} 份文件完整性但不匯入`,
      );
    }
  }
  for (const name of Object.keys(manifest.collections)) {
    if (!Object.prototype.hasOwnProperty.call(bundle.collections, name)) throw new Error(`${name}: manifest 在 bundle 中缺件`);
  }
  // `contentVersion` is no longer a function of JSON collection hashes alone:
  // main deliberately folds a deterministic `__assets` tree hash into it so a
  // repaired GLB/texture invalidates immutable browser caches.  That component
  // is not a public collection and therefore cannot be reconstructed from the
  // bundle.  Integrity is still fail-closed here: manifest and bundle versions
  // must match, every advertised collection must be present, and every entry,
  // collection hash and manifest fact is recomputed above.
  return { schema: "content-bundle@1", contentVersion: contentVersion(editableHashes), collections: editableCollections };
}

export function validateRemoteTargetProfile(raw: unknown, manifest: Manifest): RemoteEditorTargetProfile {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("editor target profile 不是物件");
  const profile = raw as RemoteEditorTargetProfile;
  if (profile.schema !== "ggd-editor-target-profile@1") throw new Error("editor target profile schema 必須是 ggd-editor-target-profile@1");
  if (profile.readOnly !== true || profile.content?.contentVersion !== manifest.contentVersion) {
    throw new Error(`target profile ${String(profile.content?.contentVersion)} 與 manifest ${manifest.contentVersion} 不一致`);
  }
  const profileCollections = profile.content.collections;
  if (typeof profileCollections !== "object" || profileCollections === null) throw new Error("target profile 缺少 content.collections");
  for (const [name, fact] of Object.entries(manifest.collections)) {
    const remote = profileCollections[name];
    if (!remote || remote.hash !== fact.hash || remote.count !== fact.count) throw new Error(`${name}: target profile 與 manifest 不一致`);
  }
  if (
    profile.content.collectionCount !== Object.keys(profileCollections).length ||
    Object.keys(profileCollections).length !== Object.keys(manifest.collections).length
  ) throw new Error("target profile collectionCount 不一致");
  if (typeof profile.runtimeCapabilities?.fingerprint !== "string" || !Array.isArray(profile.supportedModes)) {
    throw new Error("target profile 缺少 runtime capabilities");
  }
  if (typeof profile.profileDigest !== "string" || !/^[0-9a-f]{12}$/i.test(profile.profileDigest)) {
    throw new Error("target profile 缺少有效 profileDigest");
  }
  // Static profile generation is clock-free and intentionally hashes JSON
  // insertion order. Mirroring that policy is part of receipt validation.
  const { profileDigest, ...digestBody } = profile;
  const { generatedAt: _legacyGeneratedAt, ...stable } = digestBody;
  const actual = sha256Hex(JSON.stringify(stable)).slice(0, 12);
  if (actual !== profileDigest) throw new Error(`target profile digest 不一致（預期 ${actual}）`);
  return profile;
}

async function fetchTargetProfile(
  fetchImpl: typeof fetch,
  normalized: NormalizedRemoteSource,
  manifest: Manifest,
  policy: RemoteWorkspacePolicy,
): Promise<RemoteEditorTargetProfile | null> {
  try {
    const result = await fetchJsonLimited(
      fetchImpl,
      new URL("editor-target-profile.json", normalized.contentBaseUrl).href,
      policy.maxManifestBytes,
      policy.requestTimeoutMs,
    );
    return validateRemoteTargetProfile(result.value, manifest);
  } catch (error) {
    if (error instanceof Error && /HTTP 404\b/.test(error.message)) return null;
    throw error;
  }
}

function persistTargetProfile(root: string, version: string, profile: RemoteEditorTargetProfile | null): void {
  if (!profile) return;
  const target = targetProfileFile(root, version);
  mkdirSync(dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  writeFileSync(tmp, fileJson(profile), "utf8");
  renameSync(tmp, target);
}

export function readPinnedTargetProfile(root: string, version: string | null): PinnedTargetProfile | null {
  if (!version) return null;
  try {
    const profile = JSON.parse(
      readFileSync(targetProfileFile(root, version), "utf8"),
    ) as RemoteEditorTargetProfile;
    return profile.schema === "ggd-editor-target-profile@1" ? profile : null;
  } catch {
    return null;
  }
}

function writeBundleTree(target: string, bundle: ContentBundle): void {
  mkdirSync(target, { recursive: true });
  for (const [collection, col] of Object.entries(bundle.collections) as [CollectionName, NonNullable<ContentBundle["collections"][CollectionName]>][]) {
    for (const entry of col.entries) writeDocAtomic(target, collection, entry.doc as { id: string });
  }
  const rebuilt = rebuildAllIndexes(target);
  if (rebuilt.contentVersion !== bundle.contentVersion) {
    throw new Error(`本機重建版本 ${rebuilt.contentVersion} 與遠端 ${bundle.contentVersion} 不同`);
  }
}

function ensureBaseSnapshot(root: string, bundle: ContentBundle, remoteVersion: string): string {
  const finalDir = snapshotContentDir(root, remoteVersion);
  if (existsSync(join(finalDir, "manifest.json"))) return finalDir;
  const stage = join(root, "staging", `${bundle.contentVersion}-${process.pid}-${Date.now()}`, "content");
  writeBundleTree(stage, bundle);
  mkdirSync(dirname(finalDir), { recursive: true });
  renameSync(stage, finalDir);
  return finalDir;
}

function entryMap(bundle: ContentBundle): Map<string, { collection: CollectionName; id: string; hash: string; doc: unknown }> {
  const map = new Map<string, { collection: CollectionName; id: string; hash: string; doc: unknown }>();
  for (const [collection, col] of Object.entries(bundle.collections) as [CollectionName, NonNullable<ContentBundle["collections"][CollectionName]>][]) {
    for (const entry of col.entries) map.set(`${collection}/${entry.id}`, { collection, ...entry });
  }
  return map;
}

function readBundleFromSnapshot(root: string, version: string): ContentBundle {
  const raw = JSON.parse(readFileSync(join(snapshotContentDir(root, version), "bundle.json"), "utf8")) as unknown;
  // Base snapshots only contain collections understood by this Editor build.
  const manifest = readManifest(snapshotContentDir(root, version));
  if (!manifest) throw new Error(`Base ${version} 缺少 manifest`);
  return validateRemoteBundle(raw, manifest);
}

function baseWorkingVersion(root: string, remoteVersion: string): string | null {
  return readManifest(snapshotContentDir(root, remoteVersion))?.contentVersion ?? null;
}

function localHash(contentRoot: string, collection: CollectionName, id: string): string | null {
  const file = join(contentRoot, collection, `${id}.json`);
  if (!existsSync(file)) return null;
  return hashDoc(JSON.parse(readFileSync(file, "utf8")) as unknown);
}

/**
 * Document-level three-way merge. Remote-only changes are adopted, local-only
 * changes survive, and a true collision keeps the local document while being
 * recorded for the UI. No Owner prose is rewritten or field-merged.
 */
function mergeRemoteBase(
  root: string,
  oldBundle: ContentBundle,
  nextBundle: ContentBundle,
): readonly RemoteConflict[] {
  const current = workingContentDir(root);
  const stage = join(root, "staging", `merge-${process.pid}-${Date.now()}`, "content");
  cpSync(current, stage, { recursive: true });
  const oldEntries = entryMap(oldBundle);
  const nextEntries = entryMap(nextBundle);
  const keys = new Set([...oldEntries.keys(), ...nextEntries.keys()]);
  const conflicts: RemoteConflict[] = [];

  for (const key of [...keys].sort()) {
    const oldEntry = oldEntries.get(key);
    const nextEntry = nextEntries.get(key);
    const reference = nextEntry ?? oldEntry!;
    const ours = localHash(current, reference.collection, reference.id);

    if (!oldEntry && nextEntry) {
      if (ours === null) writeDocAtomic(stage, nextEntry.collection, nextEntry.doc as { id: string });
      else if (ours !== nextEntry.hash) conflicts.push({ collection: nextEntry.collection, id: nextEntry.id, reason: "remote-added-local-added" });
      continue;
    }
    if (oldEntry && !nextEntry) {
      if (ours === oldEntry.hash) rmSync(join(stage, oldEntry.collection, `${oldEntry.id}.json`));
      else if (ours !== null) conflicts.push({ collection: oldEntry.collection, id: oldEntry.id, reason: "remote-deleted-local-modified" });
      continue;
    }
    if (!oldEntry || !nextEntry || oldEntry.hash === nextEntry.hash) continue;
    if (ours === oldEntry.hash) writeDocAtomic(stage, nextEntry.collection, nextEntry.doc as { id: string });
    else if (ours !== nextEntry.hash) conflicts.push({ collection: nextEntry.collection, id: nextEntry.id, reason: "both-modified" });
  }

  rebuildAllIndexes(stage);
  const history = join(root, "history", `${oldBundle.contentVersion}-${Date.now()}`, "content");
  mkdirSync(dirname(history), { recursive: true });
  renameSync(current, history);
  mkdirSync(dirname(current), { recursive: true });
  renameSync(stage, current);
  return conflicts;
}

function sourceInfo(
  root: string,
  normalized: NormalizedRemoteSource,
  metadata: RemoteWorkspaceMetadata,
  state: EditorDesktopSourceInfo["state"],
  offline: boolean,
  message: string,
): EditorDesktopSourceInfo {
  return {
    schema: EDITOR_DESKTOP_SOURCE_SCHEMA,
    kind: "remote",
    state,
    sourceUrl: normalized.sourceUrl,
    contentBaseUrl: normalized.contentBaseUrl,
    workspacePath: root,
    pinnedContentVersion: metadata.pinnedContentVersion,
    latestRemoteContentVersion: metadata.latestRemoteContentVersion,
    workingContentVersion: readManifest(workingContentDir(root))?.contentVersion ?? null,
    offline,
    conflicts: metadata.conflicts,
    compatibilityWarnings: metadata.compatibilityWarnings,
    contractStatus: metadata.targetProfileDigest ? "remote-target-profile" : "static-content-only",
    targetProfileDigest: metadata.targetProfileDigest,
    message,
  };
}

export async function syncRemoteWorkspace(options: SyncRemoteWorkspaceOptions): Promise<EditorDesktopSourceInfo> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const policy = options.policy ?? remoteWorkspacePolicy();
  const root = options.workspaceRoot;
  const normalized = normalizeRemoteSource(options.sourceInput, policy);
  const previous = readMetadata(root);
  const working = workingContentDir(root);
  mkdirSync(root, { recursive: true });

  try {
    const manifestResult = await fetchJsonLimited(
      fetchImpl,
      new URL("manifest.json", normalized.contentBaseUrl).href,
      policy.maxManifestBytes,
      policy.requestTimeoutMs,
    );
    const manifest = validateRemoteManifest(manifestResult.value);
    const targetProfile = await fetchTargetProfile(fetchImpl, normalized, manifest, policy);

    if (previous?.pinnedContentVersion === manifest.contentVersion && existsSync(join(working, "manifest.json"))) {
      const workingVersion = readManifest(working)?.contentVersion ?? null;
      const state = previous.conflicts.length > 0 ? "merged-with-conflicts" : workingVersion === baseWorkingVersion(root, manifest.contentVersion) ? "current" : "local-changes";
      persistTargetProfile(root, manifest.contentVersion, targetProfile);
      const metadata = {
        ...previous,
        latestRemoteContentVersion: manifest.contentVersion,
        lastSuccessfulCheckAt: now().toISOString(),
        targetProfileDigest: targetProfile?.profileDigest ?? previous.targetProfileDigest,
      };
      writeMetadata(root, metadata);
      return sourceInfo(root, normalized, metadata, state, false, state === "current" ? "已與線上基準同步" : "已保留本機修改");
    }

    const bundleResult = await fetchJsonLimited(
      fetchImpl,
      new URL("bundle.json", normalized.contentBaseUrl).href,
      policy.maxBundleBytes,
      policy.requestTimeoutMs,
    );
    const compatibilityWarnings: string[] = [];
    const bundle = validateRemoteBundle(bundleResult.value, manifest, compatibilityWarnings);
    const base = ensureBaseSnapshot(root, bundle, manifest.contentVersion);
    persistTargetProfile(root, manifest.contentVersion, targetProfile);
    let conflicts: readonly RemoteConflict[] = [];

    if (!existsSync(join(working, "manifest.json"))) {
      mkdirSync(dirname(working), { recursive: true });
      cpSync(base, working, { recursive: true });
    } else if (previous && existsSync(join(snapshotContentDir(root, previous.pinnedContentVersion), "bundle.json"))) {
      conflicts = mergeRemoteBase(root, readBundleFromSnapshot(root, previous.pinnedContentVersion), bundle);
    } else {
      throw new Error("找不到舊的 Base 快照，為了不覆蓋本機修改已停止同步");
    }

    const metadata: RemoteWorkspaceMetadata = {
      schema: REMOTE_WORKSPACE_SCHEMA,
      sourceUrl: normalized.sourceUrl,
      contentBaseUrl: normalized.contentBaseUrl,
      pinnedContentVersion: manifest.contentVersion,
      latestRemoteContentVersion: manifest.contentVersion,
      lastSuccessfulCheckAt: now().toISOString(),
      conflicts,
      compatibilityWarnings,
      targetProfileDigest: targetProfile?.profileDigest ?? null,
    };
    writeMetadata(root, metadata);
    const state = conflicts.length > 0 ? "merged-with-conflicts" : readManifest(working)?.contentVersion === bundle.contentVersion ? "current" : "local-changes";
    return sourceInfo(
      root,
      normalized,
      metadata,
      state,
      false,
      conflicts.length > 0 ? `線上版本已合併；${conflicts.length} 份雙方修改的文件保留本機版` : "線上基準已更新",
    );
  } catch (error) {
    if (!previous || !existsSync(join(working, "manifest.json"))) throw error;
    return sourceInfo(
      root,
      normalized,
      previous,
      "offline-cache",
      true,
      `無法連線，正在使用上次快取：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function contentDirForRemoteWorkspace(root: string): string {
  return workingContentDir(root);
}
