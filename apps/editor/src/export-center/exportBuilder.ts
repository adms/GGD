import {
  COLLECTION_NAMES,
  contentVersion,
  extractRefs,
  hashCollection,
  hashDoc,
  isCollectionName,
  validateDoc,
  type CollectionName,
} from "@ggd/shared/content";
import { packageDigest } from "@ggd/shared/content/import/digest";
import { canonicalizeJcs, compareUtf8Bytes, contentSha256, jcsByteLength, SHA256_PREFIX } from "@ggd/shared/content/import/jcs";
import {
  zEditorImportPackage,
  zPackageManifest,
  type EditorImportPackage,
  type PackageManifest,
} from "@ggd/shared/content/import/packageSchema";
import { checkZipSafety } from "@ggd/shared/content/import/zipSafety";
import {
  ASSET_ROLE,
  iconOutputPath,
  parseIconAssetPath,
} from "@ggd/shared/content/import/iconAssets";
import { normalizeTemplateBinding } from "@ggd/shared/content/templates/expand";
import type { TargetProfileFacts, PackageMode } from "./exportPolicy";

export type RuntimeAuthoringCollection = "abilities" | "items";

export interface RuntimeAuthoringDocument {
  readonly collection: RuntimeAuthoringCollection;
  readonly id: string;
  readonly document: Record<string, unknown>;
}

export interface ExactBaseDocument {
  readonly collection: CollectionName;
  readonly id: string;
  readonly document: Record<string, unknown>;
  readonly contentSha256: string;
}

export interface RuntimeBaseSnapshot {
  readonly schema: "ggd-content-runtime-bundle@1";
  readonly activationDigest: string;
  readonly packageDigest: string;
  readonly contentVersion: string;
  readonly runtimeDocuments: readonly RuntimeAuthoringDocument[];
  readonly documents: readonly ExactBaseDocument[];
}

export interface DeltaRuntimeClosure {
  /** Only documents whose bytes differ from the exact Base. */
  readonly documents: readonly RuntimeAuthoringDocument[];
  /** The roots the operator explicitly picked, whether or not the root itself changed. */
  readonly selectionRoots: readonly RuntimeAuthoringDocument[];
  /** Changed forward dependencies automatically pulled into the package. */
  readonly addedDependencies: readonly RuntimeAuthoringDocument[];
}

export interface RuntimeRequire {
  readonly kind: string;
  readonly id: string;
  readonly contentSha256: string;
}

export interface RuntimePackageBinaryAsset {
  readonly path: string;
  readonly collection: "abilities" | "champions" | "items";
  readonly id: string;
  readonly mime: "image/png" | "image/jpeg" | "image/webp";
  readonly targetField: "icon";
  readonly contentSha256: string;
  readonly contentSize: number;
  readonly bytes: Uint8Array;
  /** Required for full/delta; omitted only for bootstrap. */
  readonly baseSha256?: string | null;
}

export interface BuildRuntimePackageInput {
  readonly mode: PackageMode;
  readonly target: TargetProfileFacts;
  /** bootstrap/full: complete ability+item corpus; delta: selected closed roots only. */
  readonly documents: readonly RuntimeAuthoringDocument[];
  /**
   * User intent, kept separate from the changed dependency closure. Required
   * for delta; bootstrap/full default to the complete document set.
   */
  readonly selectionRoots?: readonly RuntimeAuthoringDocument[];
  /** Required for full/delta so changes[].before is exact and full cannot imply delete. */
  readonly baseDocuments?: readonly RuntimeAuthoringDocument[];
  readonly requires?: readonly RuntimeRequire[];
  readonly assets?: readonly RuntimePackageBinaryAsset[];
}

export interface BuiltRuntimePackage {
  readonly package: EditorImportPackage;
  /** Semantic entries excluding manifest.json; ZIP adds transport metadata around these exact values. */
  readonly entries: ReadonlyMap<string, unknown>;
  /** Raw binary entries; never JCS-encoded. */
  readonly binaryEntries: ReadonlyMap<string, Uint8Array>;
  readonly filenameStem: string;
}

const documentPath = (doc: RuntimeAuthoringDocument): string =>
  `authoring/${doc.collection}/${doc.id}.json`;

const documentKind = (collection: RuntimeAuthoringCollection): "ability" | "item" =>
  collection === "abilities" ? "ability" : "item";

const keyOf = (doc: Pick<RuntimeAuthoringDocument, "collection" | "id">): string => `${doc.collection}/${doc.id}`;

function sortedDocuments(input: readonly RuntimeAuthoringDocument[]): RuntimeAuthoringDocument[] {
  const seen = new Set<string>();
  return [...input].sort((a, b) => compareUtf8Bytes(keyOf(a), keyOf(b))).map((doc) => {
    const key = keyOf(doc);
    if (seen.has(key)) throw new Error(`Package 文件重複：${key}`);
    seen.add(key);
    const expected = doc.collection === "abilities" ? "ability@1" : "item@1";
    if (doc.document.schema !== expected || doc.document.id !== doc.id) {
      throw new Error(`${key} 必須是 id 相符的 ${expected}`);
    }
    return doc;
  });
}

const sameContent = (a: RuntimeAuthoringDocument, b: RuntimeAuthoringDocument | undefined): boolean =>
  b !== undefined && contentSha256(a.document) === contentSha256(b.document);

/**
 * Starting from the operator's selected roots, find changed runtime documents
 * that are required to resolve those roots. Unrelated local edits are never
 * included. Traversal continues through unchanged nodes because a changed
 * dependency may sit more than one edge below the selected root.
 */
export function resolveDeltaRuntimeClosure(
  currentDocuments: readonly RuntimeAuthoringDocument[],
  baseDocuments: readonly RuntimeAuthoringDocument[],
  selected: readonly Pick<RuntimeAuthoringDocument, "collection" | "id">[],
): DeltaRuntimeClosure {
  if (selected.length === 0) throw new Error("delta 必須至少選擇一份 root");
  // Do not schema-validate unrelated local drafts: delta isolation means an
  // invalid, unselected document cannot poison a different root's export.
  const current = new Map<string, RuntimeAuthoringDocument>();
  for (const doc of currentDocuments) {
    const key = keyOf(doc);
    if (current.has(key)) throw new Error(`Runtime corpus 文件重複：${key}`);
    current.set(key, doc);
  }
  const base = new Map(sortedDocuments(baseDocuments).map((doc) => [keyOf(doc), doc]));
  const selectedKeys = new Set(selected.map(keyOf));
  const roots = [...selectedKeys].map((key) => {
    const doc = current.get(key);
    if (!doc) throw new Error(`選取的 delta root 不存在：${key}`);
    return doc;
  });

  const visited = new Set<string>();
  const changed = new Map<string, RuntimeAuthoringDocument>();
  const queue = [...roots];
  while (queue.length > 0) {
    const doc = queue.shift()!;
    const key = keyOf(doc);
    if (visited.has(key)) continue;
    visited.add(key);
    sortedDocuments([doc]); // validate only the reachable envelope
    if (!sameContent(doc, base.get(key))) changed.set(key, doc);

    for (const edge of extractRefs(doc.collection, doc.document)) {
      if (edge.targetCollection !== "abilities" && edge.targetCollection !== "items") continue;
      const targetKey = `${edge.targetCollection}/${edge.targetId}`;
      const target = current.get(targetKey);
      if (!target) throw new Error(`delta closure 找不到 ${targetKey}（由 ${key}.${edge.field} 引用）`);
      if (!visited.has(targetKey)) queue.push(target);
    }
  }

  const documents = sortedDocuments([...changed.values()]);
  return {
    documents,
    selectionRoots: sortedDocuments(roots),
    addedDependencies: documents.filter((doc) => !selectedKeys.has(keyOf(doc))),
  };
}

function requireTarget(target: TargetProfileFacts, mode: PackageMode): void {
  const missing: string[] = [];
  if (!target.contentVersion) missing.push("contentVersion");
  if (!target.gameRevision) missing.push("gameRevision");
  if (target.authoringProcessorKind !== "runtime-direct") missing.push("authoringProcessor.kind=runtime-direct");
  if (target.authoringProcessorContractVersion !== "runtime-direct@1") missing.push("authoringProcessor.contractVersion=runtime-direct@1");
  if (!target.authoringProcessorFingerprint) missing.push("authoringProcessor.fingerprint");
  if (mode === "bootstrap" && !target.migrationFingerprint) missing.push("migrationFingerprint");
  if (mode !== "bootstrap" && !target.activationDigest) missing.push("activationDigest");
  if (mode !== "bootstrap" && !target.authoringDigest) missing.push("authoringDigest");
  if (missing.length > 0) throw new Error(`Target profile 缺少建包欄位：${missing.join("、")}`);
}

export function buildRuntimePackage(input: BuildRuntimePackageInput): BuiltRuntimePackage {
  requireTarget(input.target, input.mode);
  const documents = sortedDocuments(input.documents);
  const selectionRootDocs = sortedDocuments(
    input.selectionRoots ?? (input.mode === "delta" ? [] : documents),
  );
  if (input.mode === "delta" && selectionRootDocs.length === 0) {
    throw new Error("delta 必須明示 selectionRoots，不能把 dependency closure 冒充使用者選取");
  }
  const selectedKeys = new Set(selectionRootDocs.map(keyOf));
  const ownerDocs = new Map(
    [...documents, ...selectionRootDocs].map((doc) => [keyOf(doc), doc] as const),
  );
  const binaryEntries = new Map<string, Uint8Array>();
  const assets = [...(input.assets ?? [])]
    .sort((a, b) => compareUtf8Bytes(a.path, b.path))
    .map((asset) => {
      if (binaryEntries.has(asset.path)) throw new Error(`Package asset 路徑重複：${asset.path}`);
      const parsed = parseIconAssetPath(asset.path);
      if (!parsed || parsed.collection !== asset.collection || parsed.id !== asset.id) {
        throw new Error(`Icon asset 路徑與 owner 不一致：${asset.path}`);
      }
      const owner = ownerDocs.get(`${asset.collection}/${asset.id}`);
      const outputPath = iconOutputPath(asset.collection, asset.id);
      if (!owner || owner.document[asset.targetField] !== outputPath) {
        throw new Error(`Icon asset ${asset.path} 沒有被同包 selection root 的 ${asset.targetField}=${outputPath} 引用`);
      }
      if (asset.bytes.length !== asset.contentSize) {
        throw new Error(`Icon asset ${asset.path} 的 bytes／contentSize 不一致`);
      }
      if (!SHA256_DIGEST_RE.test(asset.contentSha256)) {
        throw new Error(`Icon asset ${asset.path} 缺少有效 contentSha256`);
      }
      if (input.mode !== "bootstrap" && asset.baseSha256 === undefined) {
        throw new Error(`Icon asset ${asset.path} 在 ${input.mode} 缺少 per-asset CAS`);
      }
      binaryEntries.set(asset.path, asset.bytes);
      return asset;
    });
  if (documents.length === 0 && assets.length === 0) {
    throw new Error("Package 至少要有一份 ability／item 或 Icon asset");
  }
  const base = new Map(sortedDocuments(input.baseDocuments ?? []).map((doc) => [keyOf(doc), doc]));
  const packaged = new Map(documents.map((doc) => [keyOf(doc), doc]));
  if (input.mode !== "delta") {
    const packageKeys = [...packaged.keys()].sort(compareUtf8Bytes);
    const rootKeys = [...selectedKeys].sort(compareUtf8Bytes);
    if (JSON.stringify(packageKeys) !== JSON.stringify(rootKeys)) {
      throw new Error(`${input.mode} 的 selectionRoots 必須等於完整 package membership`);
    }
  }
  for (const root of selectionRootDocs) {
    const key = keyOf(root);
    const included = packaged.get(key);
    if (included && contentSha256(included.document) !== contentSha256(root.document)) {
      throw new Error(`selectionRoot 與 package entry 內容不一致：${key}`);
    }
    if (input.mode === "delta" && !sameContent(root, base.get(key)) && !included) {
      throw new Error(`選取 root 已變更卻未列入 changes：${key}`);
    }
  }
  if (input.mode !== "bootstrap" && base.size === 0) throw new Error(`${input.mode} 必須載入 exact base runtime bundle`);
  if (input.mode === "full") {
    const current = new Set(documents.map(keyOf));
    const omitted = [...base.keys()].filter((key) => !current.has(key));
    if (omitted.length > 0) throw new Error(`IMPLICIT_DELETE_FORBIDDEN：full 少了 ${omitted.slice(0, 5).join("、")}`);
  }

  const changes = documents.flatMap((doc) => {
    const afterHash = contentSha256(doc.document);
    const before = base.get(keyOf(doc));
    const beforeHash = before ? contentSha256(before.document) : null;
    if (input.mode !== "bootstrap" && beforeHash === afterHash) return [];
    return [{
      kind: documentKind(doc.collection),
      id: doc.id,
      path: documentPath(doc),
      op: "upsert" as const,
      before: beforeHash ? { contentSha256: beforeHash } : null,
      after: { contentSha256: afterHash },
      reason: selectedKeys.has(keyOf(doc)) ? "selected" as const : "required-dependency" as const,
    }];
  });
  if (input.mode !== "bootstrap" && changes.length === 0 && assets.length === 0) {
    throw new Error("選取內容與 exact base 相同，沒有可匯出的變更");
  }

  const reports = {
    "reports/validation.json": {
      schema: "ggd-editor-validation-report@1",
      mode: input.mode,
      status: "editor-validated",
      documentCount: documents.length,
      changeCount: changes.length,
      assetCount: assets.length,
      note: "Importer must independently validate; this report is evidence, not authority.",
    },
    "reports/diff.json": {
      schema: "ggd-editor-diff-report@1",
      mode: input.mode,
      changed: changes.map((change) => ({ kind: change.kind, id: change.id, before: change.before, after: change.after })),
      assets: assets.map((asset) => ({
        collection: asset.collection,
        id: asset.id,
        path: asset.path,
        contentSha256: asset.contentSha256,
        baseSha256: input.mode === "bootstrap" ? undefined : asset.baseSha256,
      })),
    },
  } as const;
  const entryValues = new Map<string, unknown>();
  for (const doc of documents) entryValues.set(documentPath(doc), doc.document);
  for (const [path, value] of Object.entries(reports)) entryValues.set(path, value);
  const entries: PackageManifest["entries"][number][] = [...entryValues.entries()].sort(([a], [b]) => compareUtf8Bytes(a, b)).map(([path, value]) => {
    const doc = documents.find((candidate) => documentPath(candidate) === path);
    return {
      path,
      role: doc ? "authoring" as const : "report" as const,
      contentSha256: contentSha256(value),
      contentSize: jcsByteLength(value),
      ...(doc ? {
        collection: doc.collection,
        id: doc.id,
        schema: String(doc.document.schema),
        op: "upsert" as const,
      } : {}),
    };
  });
  entries.push(...assets.map((asset) => ({
    path: asset.path,
    role: ASSET_ROLE,
    contentSha256: asset.contentSha256,
    contentSize: asset.contentSize,
    collection: asset.collection,
    id: asset.id,
    mime: asset.mime,
    targetField: asset.targetField,
    ...(input.mode === "bootstrap" ? {} : { baseSha256: asset.baseSha256 }),
  })));
  entries.sort((a, b) => compareUtf8Bytes(a.path, b.path));

  const selectionRoots = selectionRootDocs.map((doc) => ({
    kind: documentKind(doc.collection),
    id: doc.id,
    contentSha256: contentSha256(doc.document),
  }));
  const unsigned = {
    schema: "ggd-editor-package@1" as const,
    mode: input.mode,
    gameId: "ggd",
    packageDigest: `${SHA256_PREFIX}${"0".repeat(64)}`,
    base: {
      gameRevision: input.target.gameRevision!,
      contentVersion: input.target.contentVersion!,
      activationDigest: input.mode === "bootstrap" ? null : input.target.activationDigest,
      authoringDigest: input.mode === "bootstrap" ? null : input.target.authoringDigest,
    },
    ...(input.mode === "bootstrap" ? { migrationFingerprint: input.target.migrationFingerprint! } : {}),
    selectionRoots,
    changes,
    authoringProcessor: {
      kind: "runtime-direct" as const,
      contractVersion: "runtime-direct@1" as const,
      fingerprint: input.target.authoringProcessorFingerprint!,
    },
    ...(input.target.compilerContractVersion && input.target.compilerFingerprint
      ? { compiler: {
          contractVersion: input.target.compilerContractVersion,
          fingerprint: input.target.compilerFingerprint,
        } }
      : {}),
    requiredCapabilities: [],
    entries,
    requires: [...(input.requires ?? [])].sort((a, b) => compareUtf8Bytes(`${a.kind}/${a.id}`, `${b.kind}/${b.id}`)),
    expectedCompiled: [],
    expectedDerived: [],
    validationPolicy: { runtimeSchema: "shared-zod", references: "exact", activation: "atomic" },
    requiredScenarios: [],
    fidelityDecisions: [],
    acceptedWarnings: [],
  };
  const manifest = { ...unsigned, packageDigest: packageDigest(unsigned) };
  const packageValue = {
    schema: "ggd-editor-import@1" as const,
    manifest,
    documents: documents.map((doc) => ({ path: documentPath(doc), document: doc.document })),
    compiled: [],
    validation: [],
    assets: assets.map((asset) => ({ path: asset.path, bytes: asset.bytes })),
    reports,
  };
  const parsed = zEditorImportPackage.safeParse(packageValue);
  if (!parsed.success) throw new Error(`自我驗證失敗：${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("；")}`);
  return {
    package: parsed.data,
    entries: entryValues,
    binaryEntries,
    filenameStem: `ggd-${input.mode}-${manifest.packageDigest.slice("sha256:".length, "sha256:".length + 12)}`,
  };
}

/** Reference rows are calculated separately so the UI can fetch exact target documents concurrently. */
export function runtimeReferenceKeys(documents: readonly RuntimeAuthoringDocument[]): readonly {
  collection: CollectionName;
  id: string;
}[] {
  const included = new Set(documents.map(keyOf));
  const refs = new Map<string, { collection: CollectionName; id: string }>();
  for (const doc of documents) {
    for (const edge of extractRefs(doc.collection, doc.document)) {
      const key = `${edge.targetCollection}/${edge.targetId}`;
      if (!included.has(key)) refs.set(key, { collection: edge.targetCollection, id: edge.targetId });
    }
    if (doc.collection === "abilities" && doc.document.template !== undefined) {
      for (const card of normalizeTemplateBinding(doc.document.template).cards) {
        refs.set(`ability-templates/${card.ref}`, { collection: "ability-templates", id: card.ref });
      }
    }
  }
  return [...refs.values()].sort((a, b) => compareUtf8Bytes(`${a.collection}/${a.id}`, `${b.collection}/${b.id}`));
}

const SHA256_DIGEST_RE = /^sha256:[0-9a-f]{64}$/;

/** Validate an imported active runtime bundle before using it as full/delta before-state. */
export function runtimeBaseSnapshotFromBundle(
  raw: unknown,
  expectedContentVersion: string,
  expectedActivationDigest?: string | null,
): RuntimeBaseSnapshot {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("Base bundle 必須是 JSON object");
  const bundle = raw as {
    schema?: unknown;
    activationDigest?: unknown;
    packageDigest?: unknown;
    contentVersion?: unknown;
    collections?: Record<string, { hash?: unknown; count?: unknown; entries?: unknown }>;
  };
  if (bundle.schema !== "ggd-content-runtime-bundle@1" || bundle.contentVersion !== expectedContentVersion || !bundle.collections) {
    throw new Error(`Base bundle 必須是 ggd-content-runtime-bundle@1 且版本等於 ${expectedContentVersion}`);
  }
  if (typeof bundle.activationDigest !== "string" || !SHA256_DIGEST_RE.test(bundle.activationDigest)) {
    throw new Error("Base bundle 缺少有效 activationDigest");
  }
  if (expectedActivationDigest && bundle.activationDigest !== expectedActivationDigest) {
    throw new Error("Base bundle activationDigest 與 target profile 不一致");
  }
  if (typeof bundle.packageDigest !== "string" || !SHA256_DIGEST_RE.test(bundle.packageDigest)) {
    throw new Error("Base bundle 缺少有效 packageDigest");
  }
  const runtimeDocuments: RuntimeAuthoringDocument[] = [];
  const documents: ExactBaseDocument[] = [];
  const collectionHashes: Record<string, string> = {};
  for (const collection of Object.keys(bundle.collections).sort(compareUtf8Bytes)) {
    if (!isCollectionName(collection)) throw new Error(`Base bundle 含未知 collection：${collection}`);
    const group = bundle.collections[collection];
    if (
      !group ||
      typeof group.hash !== "string" ||
      !Number.isSafeInteger(group.count) ||
      (group.count as number) < 0 ||
      !Array.isArray(group.entries)
    ) throw new Error(`Base bundle 缺少 ${collection} 的 hash／count／entries`);
    const entries = group.entries as { id?: unknown; hash?: unknown; doc?: unknown }[];
    if (group.count !== entries.length) throw new Error(`${collection} collection count 不一致`);
    const hashes: { id: string; hash: string }[] = [];
    for (const entry of entries) {
      if (typeof entry.id !== "string" || typeof entry.hash !== "string" || typeof entry.doc !== "object" || entry.doc === null) {
        throw new Error(`${collection} entry 無效`);
      }
      if ((entry.doc as { id?: unknown }).id !== entry.id || hashDoc(entry.doc) !== entry.hash) {
        throw new Error(`${collection}/${entry.id} 的 id／hash 不一致`);
      }
      const parsed = validateDoc(collection, entry.doc);
      if (!parsed.ok) throw new Error(`${collection}/${entry.id} 不符合目前 runtime schema`);
      hashes.push({ id: entry.id, hash: entry.hash });
      const document = entry.doc as Record<string, unknown>;
      documents.push({ collection, id: entry.id, document, contentSha256: contentSha256(document) });
      if (collection === "abilities" || collection === "items") {
        runtimeDocuments.push({ collection, id: entry.id, document });
      }
    }
    if (hashCollection(hashes) !== group.hash) throw new Error(`${collection} collection hash 不一致`);
    collectionHashes[collection] = group.hash;
  }
  for (const collection of COLLECTION_NAMES) {
    if (!bundle.collections[collection]) throw new Error(`Base bundle 缺少 ${collection}`);
  }
  const rebuiltContentVersion = contentVersion(collectionHashes);
  if (rebuiltContentVersion !== bundle.contentVersion) {
    throw new Error(`Base bundle contentVersion 重算不一致：${rebuiltContentVersion}`);
  }
  return {
    schema: "ggd-content-runtime-bundle@1",
    activationDigest: bundle.activationDigest,
    packageDigest: bundle.packageDigest,
    contentVersion: bundle.contentVersion,
    runtimeDocuments: sortedDocuments(runtimeDocuments),
    documents: documents.sort((a, b) => compareUtf8Bytes(`${a.collection}/${a.id}`, `${b.collection}/${b.id}`)),
  };
}

/** Back-compatible narrow view used by existing callers and tests. */
export function runtimeDocumentsFromBaseBundle(
  raw: unknown,
  expectedContentVersion: string,
  expectedActivationDigest?: string | null,
): RuntimeAuthoringDocument[] {
  return [...runtimeBaseSnapshotFromBundle(raw, expectedContentVersion, expectedActivationDigest).runtimeDocuments];
}

const UTF8 = new TextEncoder();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function header(size: number): { bytes: Uint8Array; view: DataView } {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}

export function deterministicStoredZip(files: readonly { path: string; bytes: Uint8Array }[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = UTF8.encode(file.path);
    const crc = crc32(file.bytes);
    const local = header(30 + name.length);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x0800, true);
    local.view.setUint16(8, 0, true); // STORE: deterministic, no implementation-specific deflate stream.
    local.view.setUint16(10, 0, true);
    local.view.setUint16(12, 0x0021, true); // 1980-01-01.
    local.view.setUint32(14, crc, true);
    local.view.setUint32(18, file.bytes.length, true);
    local.view.setUint32(22, file.bytes.length, true);
    local.view.setUint16(26, name.length, true);
    local.bytes.set(name, 30);
    locals.push(local.bytes, file.bytes);

    const central = header(46 + name.length);
    central.view.setUint32(0, 0x02014b50, true);
    central.view.setUint16(4, 0x0314, true);
    central.view.setUint16(6, 20, true);
    central.view.setUint16(8, 0x0800, true);
    central.view.setUint16(10, 0, true);
    central.view.setUint16(12, 0, true);
    central.view.setUint16(14, 0x0021, true);
    central.view.setUint32(16, crc, true);
    central.view.setUint32(20, file.bytes.length, true);
    central.view.setUint32(24, file.bytes.length, true);
    central.view.setUint16(28, name.length, true);
    central.view.setUint32(38, 0x81a40000, true); // regular 0644
    central.view.setUint32(42, offset, true);
    central.bytes.set(name, 46);
    centrals.push(central.bytes);
    offset += local.bytes.length + file.bytes.length;
  }
  const centralBytes = concat(centrals);
  const end = header(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, files.length, true);
  end.view.setUint16(10, files.length, true);
  end.view.setUint32(12, centralBytes.length, true);
  end.view.setUint32(16, offset, true);
  return concat([...locals, centralBytes, end.bytes]);
}

export async function binarySha256(bytes: Uint8Array): Promise<string> {
  const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return SHA256_PREFIX + [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildRuntimePackageZip(built: BuiltRuntimePackage): Promise<{
  bytes: Uint8Array;
  archiveSha256: string;
  filename: string;
}> {
  const dataFiles = [...built.entries.entries()]
    .sort(([a], [b]) => compareUtf8Bytes(a, b))
    .map(([path, value]) => ({ path, text: `${canonicalizeJcs(value)}\n` }));
  const transportEntries: { path: string; rawSha256: string; rawSize: number }[] = [];
  for (const { path, text } of dataFiles) {
    const bytes = UTF8.encode(text);
    transportEntries.push({ path, rawSha256: await binarySha256(bytes), rawSize: bytes.length });
  }
  const binaryFiles = [...built.binaryEntries.entries()]
    .sort(([a], [b]) => compareUtf8Bytes(a, b))
    .map(([path, bytes]) => ({ path, bytes }));
  const assetManifest = new Map(
    built.package.manifest.entries
      .filter((entry) => entry.role === ASSET_ROLE)
      .map((entry) => [entry.path, entry] as const),
  );
  for (const file of binaryFiles) {
    const entry = assetManifest.get(file.path);
    const rawSha256 = await binarySha256(file.bytes);
    if (!entry || entry.contentSize !== file.bytes.length || entry.contentSha256 !== rawSha256) {
      throw new Error(`ZIP asset ${file.path} 的 manifest／原始位元組不一致`);
    }
    transportEntries.push({ path: file.path, rawSha256, rawSize: file.bytes.length });
  }
  const manifest: PackageManifest = {
    ...built.package.manifest,
    transport: { format: "zip", policy: "store-jcs-utf8-v1", entries: transportEntries },
  };
  const parsedManifest = zPackageManifest.safeParse(manifest);
  if (!parsedManifest.success) throw new Error(`ZIP manifest 自我驗證失敗：${parsedManifest.error.message}`);
  if (packageDigest(manifest) !== built.package.manifest.packageDigest) throw new Error("JSON／ZIP packageDigest 不一致");
  const files = [
    { path: "manifest.json", bytes: UTF8.encode(`${canonicalizeJcs(manifest)}\n`) },
    ...dataFiles.map(({ path, text }) => ({ path, bytes: UTF8.encode(text) })),
    ...binaryFiles,
  ];
  const safety = checkZipSafety(files.map((file) => ({
    path: file.path,
    uncompressedSize: file.bytes.length,
    compressedSize: file.bytes.length,
    unixMode: 0x81a4,
    utf8NameFlag: true,
  })));
  if (!safety.ok) throw new Error(`ZIP safety 自我驗證失敗：${safety.diagnostics.map((d) => d.code).join("、")}`);
  const bytes = deterministicStoredZip(files);
  return { bytes, archiveSha256: await binarySha256(bytes), filename: `${built.filenameStem}.zip` };
}
