import { extractRefs, hashCollection, hashDoc, validateDoc, type CollectionName } from "@ggd/shared/content";
import { packageDigest } from "@ggd/shared/content/import/digest";
import { canonicalizeJcs, compareUtf8Bytes, contentSha256, jcsByteLength, SHA256_PREFIX } from "@ggd/shared/content/import/jcs";
import {
  zEditorImportPackage,
  zPackageManifest,
  type EditorImportPackage,
  type PackageManifest,
} from "@ggd/shared/content/import/packageSchema";
import { checkZipSafety } from "@ggd/shared/content/import/zipSafety";
import type { TargetProfileFacts, PackageMode } from "./exportPolicy";

export type RuntimeAuthoringCollection = "abilities" | "items";

export interface RuntimeAuthoringDocument {
  readonly collection: RuntimeAuthoringCollection;
  readonly id: string;
  readonly document: Record<string, unknown>;
}

export interface RuntimeRequire {
  readonly kind: string;
  readonly id: string;
  readonly contentSha256: string;
}

export interface BuildRuntimePackageInput {
  readonly mode: PackageMode;
  readonly target: TargetProfileFacts;
  /** bootstrap/full: complete ability+item corpus; delta: selected closed roots only. */
  readonly documents: readonly RuntimeAuthoringDocument[];
  /** Required for full/delta so changes[].before is exact and full cannot imply delete. */
  readonly baseDocuments?: readonly RuntimeAuthoringDocument[];
  readonly requires?: readonly RuntimeRequire[];
}

export interface BuiltRuntimePackage {
  readonly package: EditorImportPackage;
  /** Semantic entries excluding manifest.json; ZIP adds transport metadata around these exact values. */
  readonly entries: ReadonlyMap<string, unknown>;
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

function requireTarget(target: TargetProfileFacts, mode: PackageMode): void {
  const missing: string[] = [];
  if (!target.contentVersion) missing.push("contentVersion");
  if (!target.gameRevision) missing.push("gameRevision");
  if (!target.compilerContractVersion) missing.push("compiler.contractVersion");
  if (!target.compilerFingerprint) missing.push("compiler.fingerprint");
  if (mode === "bootstrap" && !target.migrationFingerprint) missing.push("migrationFingerprint");
  if (mode !== "bootstrap" && !target.activationDigest) missing.push("activationDigest");
  if (mode !== "bootstrap" && !target.authoringDigest) missing.push("authoringDigest");
  if (missing.length > 0) throw new Error(`Target profile 缺少建包欄位：${missing.join("、")}`);
}

export function buildRuntimePackage(input: BuildRuntimePackageInput): BuiltRuntimePackage {
  requireTarget(input.target, input.mode);
  const documents = sortedDocuments(input.documents);
  if (documents.length === 0) throw new Error("Package 至少要有一份 ability 或 item");
  const base = new Map(sortedDocuments(input.baseDocuments ?? []).map((doc) => [keyOf(doc), doc]));
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
      reason: "selected" as const,
    }];
  });
  if (input.mode !== "bootstrap" && changes.length === 0) throw new Error("選取內容與 exact base 相同，沒有可匯出的變更");

  const reports = {
    "reports/validation.json": {
      schema: "ggd-editor-validation-report@1",
      mode: input.mode,
      status: "editor-validated",
      documentCount: documents.length,
      changeCount: changes.length,
      note: "Importer must independently validate; this report is evidence, not authority.",
    },
    "reports/diff.json": {
      schema: "ggd-editor-diff-report@1",
      mode: input.mode,
      changed: changes.map((change) => ({ kind: change.kind, id: change.id, before: change.before, after: change.after })),
    },
  } as const;
  const entryValues = new Map<string, unknown>();
  for (const doc of documents) entryValues.set(documentPath(doc), doc.document);
  for (const [path, value] of Object.entries(reports)) entryValues.set(path, value);
  const entries = [...entryValues.entries()].sort(([a], [b]) => compareUtf8Bytes(a, b)).map(([path, value]) => {
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

  const selectionRoots = documents.map((doc) => ({
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
    compiler: {
      contractVersion: input.target.compilerContractVersion!,
      fingerprint: input.target.compilerFingerprint!,
    },
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
    reports,
  };
  const parsed = zEditorImportPackage.safeParse(packageValue);
  if (!parsed.success) throw new Error(`自我驗證失敗：${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("；")}`);
  return {
    package: parsed.data,
    entries: entryValues,
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
    const template = doc.collection === "abilities" && typeof doc.document.template === "object" && doc.document.template !== null
      ? (doc.document.template as { ref?: unknown }).ref
      : undefined;
    if (typeof template === "string" && template !== "") {
      refs.set(`ability-templates/${template}`, { collection: "ability-templates", id: template });
    }
  }
  return [...refs.values()].sort((a, b) => compareUtf8Bytes(`${a.collection}/${a.id}`, `${b.collection}/${b.id}`));
}

/** Validate an imported active runtime bundle before using it as full/delta before-state. */
export function runtimeDocumentsFromBaseBundle(raw: unknown, expectedContentVersion: string): RuntimeAuthoringDocument[] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("Base bundle 必須是 JSON object");
  const bundle = raw as {
    schema?: unknown;
    contentVersion?: unknown;
    collections?: Record<string, { hash?: unknown; entries?: unknown }>;
  };
  if (bundle.schema !== "content-bundle@1" || bundle.contentVersion !== expectedContentVersion || !bundle.collections) {
    throw new Error(`Base bundle 必須是 content-bundle@1 且版本等於 ${expectedContentVersion}`);
  }
  const result: RuntimeAuthoringDocument[] = [];
  for (const collection of ["abilities", "items"] as const) {
    const group = bundle.collections[collection];
    if (!group || typeof group.hash !== "string" || !Array.isArray(group.entries)) throw new Error(`Base bundle 缺少 ${collection}`);
    const entries = group.entries as { id?: unknown; hash?: unknown; doc?: unknown }[];
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
      result.push({ collection, id: entry.id, document: entry.doc as Record<string, unknown> });
    }
    if (hashCollection(hashes) !== group.hash) throw new Error(`${collection} collection hash 不一致`);
  }
  return sortedDocuments(result);
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

function deterministicStoredZip(files: readonly { path: string; bytes: Uint8Array }[]): Uint8Array {
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

async function binarySha256(bytes: Uint8Array): Promise<string> {
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
