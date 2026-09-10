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
import { compareUtf8Bytes, contentSha256, jcsByteLength, SHA256_PREFIX } from "@ggd/shared/content/import/jcs";
import {
  zAuthoringKind,
  zEditorImportPackage,
  zPackageManifest,
  type EditorImportPackage,
  type PackageManifest,
} from "@ggd/shared/content/import/packageSchema";
import { binarySha256 } from "@ggd/shared/content/import/packageZip";
export { binarySha256 } from "@ggd/shared/content/import/packageZip";
import {
  ASSET_ROLE,
  iconOutputPath,
  parseIconAssetPath,
} from "@ggd/shared/content/import/iconAssets";
import { normalizeTemplateBinding } from "@ggd/shared/content/templates/expand";
import {
  isRuntimeAuthoringCollection,
  runtimeSchemaTagsFor,
  type RuntimeAuthoringCollection,
} from "./exportPolicy";
import type { TargetProfileFacts, PackageMode } from "./exportPolicy";

/**
 * ⭐ GH#1024 B1 —— 清單住 `exportPolicy.RUNTIME_AUTHORING_COLLECTIONS`（唯一住處）。
 * 這一行只是**再匯出**，讓既有的 import 端不必改（`ExportCenterPage` 等）。
 */
export type { RuntimeAuthoringCollection };

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
  /** bootstrap/full: the complete runtime corpus (champions/abilities/items/vfx); delta: selected closed roots only. */
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

/** manifest `changes[].kind` / `selectionRoots[].kind` 用的詞彙（`zAuthoringKind`）。 */
const PACKAGE_KIND_BY_COLLECTION: Readonly<Record<RuntimeAuthoringCollection, string>> = {
  abilities: "ability",
  champions: "champion",
  items: "item",
  vfx: "vfx",
};

/**
 * ⭐ **2026-09-09 更正：Main 的契約已經收 `champion` 了。**
 *
 * ⛔ 這一段在此之前逐字寫著「Main 的 package 契約今天還沒有 `champion` 這個 kind」——
 *   而 GH#1024 PR-2 **在 2026-09-07 就把它補進去了**
 *   （`packages/shared/src/content/import/packageSchema.ts:168`）。
 * ⇒ ⭐ 實測：`exportBuilder.test.ts` 的「匯出一隻英雄 ⇒ 包裡有 `champion@1` ＋ 它的技能」
 *   **今天是綠的**（13 passed / 1 skipped，⭐ 而跳過的正是「擋住的是哪一行」那一條）。
 *
 * ⚠️ ⭐ 留這段話的代價本 repo 記過兩次（GH#763／#759）：
 *   **一張票的程式做完了，而它被自己的一行過期散文卡著** ——
 *   ⛔ 那一行不會因為程式做完就自己更新，⭐ 而下一輪讀到時它看起來就是「還沒做」。
 *
 * ⭐ 下面的守衛**留著**：它問的是「這個 kind 在不在契約裡」，
 *   ⛔ 而那個問題在契約再變一次時仍然要有人答。
 *
 * ⭐ 這裡**先擋、並指名要改哪一行**，⛔ 不是讓 zod 丟一句
 * `manifest.changes.0.kind: Invalid enum value` —— 那句話讀起來像「英雄文件壞了」，
 * ⛔ 而壞的是**兩個名詞之間的關係**（Editor 包得出來 · Main 的詞彙表收不下）。
 * ⚠️ 也⛔ **不在 Editor 這一側改名繞過**（例如把英雄叫成 `vfx`）——
 * 那會讓 importer 拿一份謊稱種類的 manifest 去建 store。
 */
function documentKind(collection: RuntimeAuthoringCollection): string {
  const kind = PACKAGE_KIND_BY_COLLECTION[collection];
  if (!(zAuthoringKind.options as readonly string[]).includes(kind)) {
    throw new Error(
      `PACKAGE_KIND_NOT_IN_CONTRACT：Main 的 zAuthoringKind 還不收 kind="${kind}"（${collection}）——` +
      `今天只有 ${zAuthoringKind.options.join("／")}。` +
      `⇒ 要 Main 在 packages/shared/src/content/import/packageSchema.ts 的 zAuthoringKind 補上 "${kind}"；` +
      `⛔ 不要在 Editor 這一側改名繞過。`,
    );
  }
  return kind;
}

const keyOf = (doc: Pick<RuntimeAuthoringDocument, "collection" | "id">): string => `${doc.collection}/${doc.id}`;

function sortedDocuments(input: readonly RuntimeAuthoringDocument[]): RuntimeAuthoringDocument[] {
  const seen = new Set<string>();
  return [...input].sort((a, b) => compareUtf8Bytes(keyOf(a), keyOf(b))).map((doc) => {
    const key = keyOf(doc);
    if (seen.has(key)) throw new Error(`Package 文件重複：${key}`);
    seen.add(key);
    // ⭐ 收得下哪幾個 tag 從 shared 的集合 Zod 推導（`vfx` 是三個：vfx／ribbon／attachment），
    //   ⛔ 不是「主 tag 一個」—— 見 `runtimeSchemaTagsFor` 的檔頭。
    const expected = runtimeSchemaTagsFor(doc.collection);
    if (!expected.includes(String(doc.document.schema)) || doc.document.id !== doc.id) {
      throw new Error(`${key} 必須是 id 相符的 ${expected.join(" 或 ")}`);
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
      if (!isRuntimeAuthoringCollection(edge.targetCollection)) continue;
      const targetKey = `${edge.targetCollection}/${edge.targetId}`;
      const target = current.get(targetKey);
      if (!target) {
        // ⭐ SOFT ref（`ability.vfxKey` / `spawnVfx.vfxId`）＝「內容可以先寫名字、美術後補」
        //   —— 載入期只 warn（`refs.ts`）。⛔ 這裡也不可以升級成錯：
        //   ⚠️ 那會讓一支「特效還沒畫」的技能**整包匯不出去**，而遊戲裡它是活的。
        if (edge.soft) continue;
        throw new Error(`delta closure 找不到 ${targetKey}（由 ${key}.${edge.field} 引用）`);
      }
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
    throw new Error("Package 至少要有一份 runtime 文件（champion／ability／item／vfx）或 Icon asset");
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
        // ⭐ 2026-09-07：`undefined` 會讓 JCS 擲（規格要求「明示 null 或整個 key 不存在」）——
        //   bootstrap 沒有 base ⇒ **整個 key 不放**，⛔ 不是放一個 undefined。
        ...(input.mode === "bootstrap" ? {} : { baseSha256: asset.baseSha256 ?? null }),
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

/** 一份文件身上所有「⭐ 模板 ref」的落點 —— 技能一份、英雄卡上內嵌的四格各一份。 */
function templateBindings(doc: RuntimeAuthoringDocument): readonly unknown[] {
  if (doc.collection === "abilities") return doc.document.template === undefined ? [] : [doc.document.template];
  // ⭐ 英雄卡的 Q/W/E/R 是**內嵌**技能，而它們身上也可以掛 `template:{ref,params}`
  //   （`refs.ts::refEdgesOf` 對 champions 就是逐格展開的）。
  //   ⛔ 漏掉這一段 ⇒ 一隻用模板做技能的英雄，包裡少了它引用的模板卡。
  if (doc.collection !== "champions") return [];
  const abilities = doc.document.abilities;
  if (typeof abilities !== "object" || abilities === null) return [];
  return Object.values(abilities as Record<string, unknown>)
    .map((slot) => (typeof slot === "object" && slot !== null ? (slot as Record<string, unknown>).template : undefined))
    .filter((binding) => binding !== undefined);
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
    for (const binding of templateBindings(doc)) {
      for (const card of normalizeTemplateBinding(binding).cards) {
        refs.set(`ability-templates/${card.ref}`, { collection: "ability-templates", id: card.ref });
      }
    }
  }
  return [...refs.values()].sort((a, b) => compareUtf8Bytes(`${a.collection}/${a.id}`, `${b.collection}/${b.id}`));
}

/**
 * ⭐ GH#1024 B1 —— `vfx-script@1` 的邊是**反向的**：腳本身上有 `abilityId`，
 * ⛔ 技能身上**沒有**任何指回腳本的欄位（`refs.ts` 的 `REFERENCES.abilities` 量過）。
 * ⇒ 一支「特效工坊做過演出」的技能，光靠 `extractRefs` 是**找不到**它的腳本的。
 *
 * ⚠️ 所以這一支要吃一份 `vfx-scripts` 的索引（呼叫端從 `api.index("vfx-scripts")` 拿）。
 * ⛔ 它回的是**引用**（`requires[]`），⛔ 不是包裡的文件：contract-index 今天把
 * `vfx-script@1` 記成 `planned` / `modes: []`。
 */
export function vfxScriptReferenceKeys(
  documents: readonly RuntimeAuthoringDocument[],
  scripts: readonly { readonly id: string; readonly abilityId: string }[],
): readonly { collection: CollectionName; id: string }[] {
  const abilityIds = new Set<string>();
  for (const doc of documents) {
    if (doc.collection === "abilities") abilityIds.add(doc.id);
  }
  return scripts
    .filter((script) => abilityIds.has(script.abilityId))
    .map((script) => ({ collection: "vfx-scripts" as CollectionName, id: script.id }))
    .sort((a, b) => compareUtf8Bytes(a.id, b.id));
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
      if (isRuntimeAuthoringCollection(collection)) {
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

export { buildRuntimePackageZip, deterministicStoredZip } from "@ggd/shared/content/import/packageZip";
