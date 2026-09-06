import { COLLECTIONS, type CollectionName } from "@ggd/shared/content";
import { packageRuntimeRepresentations, type EditorContractIndex } from "./editorContractIndex";

export const DEFAULT_TARGET_PROFILE_URL =
  "https://ggd.adms.ai/content/editor-target-profile.json";

export type PackageMode = "bootstrap" | "full" | "delta";

/**
 * ⭐⭐ GH#1024 B1 —— 投稿包**裝得下**哪幾個集合。這是唯一的住處。
 *
 * ⚠️ 在此之前這份清單住**兩個地方**（這裡的 `RUNTIME_SCHEMA_BY_COLLECTION`
 * 與 `exportBuilder.ts:28` 的 `RuntimeAuthoringCollection`），而且兩邊都把
 * `ability@1` / `item@1` 這兩個 schema tag 又抄了一次 —— 第〇·四守則說的第二個住處。
 * ⇒ 現在 tag 一律從 `COLLECTIONS`（shared 的集合表）**推導**，⛔ 不抄字面值。
 *
 * ⭐ 「投稿一個英雄」要的閉包是 `champions → abilities → vfx`（＋ icon 二進位）。
 * ⛔ `vfx-scripts` / `vfx-subtypes` **刻意不在這張表上** —— 它們今天只以
 * **引用**（`requires[]`）的身分進包：contract-index 把 `vfx-script@1` 記成
 * `planned` / `modes: []`，把它列成可投稿集合就是「宣告 supported 但其實沒有」。
 */
export const RUNTIME_AUTHORING_COLLECTIONS = [
  "abilities",
  "champions",
  "items",
  "vfx",
] as const satisfies readonly CollectionName[];

export type RuntimeAuthoringCollection = (typeof RUNTIME_AUTHORING_COLLECTIONS)[number];

export function isRuntimeAuthoringCollection(value: string): value is RuntimeAuthoringCollection {
  return (RUNTIME_AUTHORING_COLLECTIONS as readonly string[]).includes(value);
}

/**
 * ⭐ 一個集合**收得下哪幾個 schema tag** —— 從 shared 的 Zod 推導，⛔ 不是手寫清單。
 *
 * ⚠️ ⭐ `vfx` 這一格是理由：那個集合是一個 discriminated union
 * （出貨語料量到 `vfx@1` 629 · `ribbon@1` 67 · `attachment@1` 6）——
 * 只認 `COLLECTIONS.vfx.schemaTag`（`vfx@1`）會讓一支引用 ribbon 的技能**包不起來**，
 * 而錯誤訊息會說「它不是 vfx@1」⇒ 讀起來像內容壞了，⛔ 而壞的是打包器。
 *
 * ⛔ **fail closed**：拆不出 union（zod 換了內部形狀）⇒ 只回主 tag，
 * ⇒ 包不起來而**訊息指名那一份**，⛔ 不是默默放行一份集合不認得的文件。
 * 守衛：`exportPolicy.test.ts`「vfx 的三個 tag 都認得」。
 */
export function runtimeSchemaTagsFor(collection: RuntimeAuthoringCollection): readonly string[] {
  const spec = COLLECTIONS[collection];
  let node: unknown = spec.schema;
  // ZodEffects（`.superRefine()` / `.refine()`）把 union 包在 `_def.schema` 底下。
  while (node && typeof node === "object" && "_def" in node && (node as { _def: { schema?: unknown } })._def.schema) {
    node = (node as { _def: { schema: unknown } })._def.schema;
  }
  const optionsMap = (node as { _def?: { optionsMap?: unknown } } | null)?._def?.optionsMap;
  if (optionsMap instanceof Map) {
    const tags = [...optionsMap.keys()].filter((key): key is string => typeof key === "string");
    if (tags.length > 0) return tags;
  }
  return [spec.schemaTag];
}

export interface TargetProfileFacts {
  schema: string;
  contentVersion: string | null;
  capabilityFingerprint: string | null;
  profileDigest: string | null;
  contractIndexDigest: string | null;
  contractIndexHref: string | null;
  implementedStage: string | null;
  authoringStoreState: string | null;
  supportedModes: readonly PackageMode[];
  deltaExportAllowed: boolean;
  authoringProcessorKind: string | null;
  authoringProcessorContractVersion: string | null;
  authoringProcessorFingerprint: string | null;
  compilerContractVersion: string | null;
  compilerFingerprint: string | null;
  activationDigest: string | null;
  authoringDigest: string | null;
  gameRevision: string | null;
  migrationFingerprint: string | null;
  authoringAccepts: readonly string[];
  authoringNotRequired: readonly string[];
  unavailable: readonly string[];
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function modes(value: unknown): PackageMode[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is PackageMode =>
    item === "bootstrap" || item === "full" || item === "delta");
}

export function readTargetProfileFacts(profile: unknown): TargetProfileFacts {
  const root = record(profile);
  if (!root) throw new Error("target profile 必須是 JSON object");
  const schema = stringOrNull(root["schema"]);
  if (schema !== "ggd-content-target-profile@1" && schema !== "ggd-editor-target-profile@1") {
    throw new Error(`不支援的 target profile schema：${String(root["schema"])}`);
  }
  const runtime = record(root["runtimeCapabilities"]);
  const content = record(root["content"]);
  const base = record(root["base"]);
  const contract = record(root["contract"]);
  const contractIndex = record(root["contractIndex"]);
  const authoringProcessor = record(root["authoringProcessor"]);
  const compiler = record(root["compiler"]) ?? record(contract?.["compiler"]);
  const authoringModel = record(root["authoringModel"]);
  const unavailable = Array.isArray(root["unavailable"])
    ? root["unavailable"].map((item) => {
        const row = record(item);
        return row
          ? `${stringOrNull(row["field"]) ?? "unknown"}：${stringOrNull(row["reason"]) ?? "未提供原因"}`
          : String(item);
      })
    : [];
  return {
    schema,
    contentVersion: stringOrNull(base?.["contentVersion"]) ?? stringOrNull(content?.["contentVersion"]),
    capabilityFingerprint: stringOrNull(runtime?.["fingerprint"]),
    profileDigest: stringOrNull(root["profileDigest"]),
    contractIndexDigest: stringOrNull(contractIndex?.["digest"]),
    contractIndexHref: stringOrNull(contractIndex?.["href"]),
    implementedStage: stringOrNull(root["implementedStage"]),
    authoringStoreState: stringOrNull(root["authoringStoreState"]),
    supportedModes: modes(root["supportedModes"]),
    deltaExportAllowed: root["deltaExportAllowed"] === true,
    authoringProcessorKind: stringOrNull(authoringProcessor?.["kind"]),
    authoringProcessorContractVersion: stringOrNull(authoringProcessor?.["contractVersion"]),
    authoringProcessorFingerprint: stringOrNull(authoringProcessor?.["fingerprint"]),
    compilerContractVersion: stringOrNull(compiler?.["contractVersion"]),
    compilerFingerprint: stringOrNull(compiler?.["fingerprint"]),
    activationDigest: stringOrNull(base?.["activationDigest"]),
    authoringDigest: stringOrNull(base?.["authoringDigest"]),
    gameRevision: stringOrNull(base?.["gameRevision"]) ?? stringOrNull(root["gameRevision"]),
    migrationFingerprint: stringOrNull(base?.["migrationFingerprint"]) ?? stringOrNull(root["migrationFingerprint"]),
    authoringAccepts: Array.isArray(authoringModel?.["accepts"])
      ? authoringModel["accepts"].filter((value): value is string => typeof value === "string")
      : [],
    authoringNotRequired: Array.isArray(authoringModel?.["notRequired"])
      ? authoringModel["notRequired"].filter((value): value is string => typeof value === "string")
      : [],
    unavailable,
  };
}

export function packageModeBlockers(
  facts: TargetProfileFacts,
  mode: PackageMode,
  contractIndex: EditorContractIndex | null,
): readonly string[] {
  const blockers: string[] = [];
  if (!contractIndex) blockers.push("缺少已驗證的 Main contract-index");
  if (!facts.supportedModes.includes(mode)) blockers.push(`目標未宣告支援 ${mode}`);
  if (!facts.contentVersion) blockers.push("缺少 base.contentVersion");
  if (!facts.gameRevision) blockers.push("缺少 base.gameRevision");
  if (mode === "bootstrap") {
    if (facts.implementedStage !== "G1" && facts.implementedStage !== "G2") {
      blockers.push("目標未宣告 importer G1／G2");
    }
  } else if (facts.implementedStage !== "G2") {
    blockers.push("目標未宣告 importer G2");
  }
  const runtimeRepresentations = packageRuntimeRepresentations(contractIndex);
  if (contractIndex && runtimeRepresentations.length === 0) {
    blockers.push("contract-index 沒有可由 package apply 的 runtime-document");
  }
  for (const representation of runtimeRepresentations) {
    if (!representation.modes.includes(mode)) {
      blockers.push(`contract-index 未宣告 ${representation.schema} 支援 ${mode}`);
    }
    if (!runtimeCollectionForSchema(representation.schema)) {
      blockers.push(`Editor 尚未實作 ${representation.schema} 的 runtime package builder`);
    }
  }
  if (contractIndex) {
    const profileSchemas = [...new Set(facts.authoringAccepts)].sort();
    const contractSchemas = runtimeRepresentations.map((row) => row.schema).sort();
    if (JSON.stringify(profileSchemas) !== JSON.stringify(contractSchemas)) {
      blockers.push(
        `target profile 與 contract-index 的 runtime representations 不一致（profile=${profileSchemas.join(",") || "∅"}；contract=${contractSchemas.join(",") || "∅"}）`,
      );
    }
  }
  if (
    facts.authoringProcessorKind !== "runtime-direct" ||
    facts.authoringProcessorContractVersion !== "runtime-direct@1" ||
    !facts.authoringProcessorFingerprint
  ) {
    blockers.push("目標沒有可 pin 的 runtime-direct authoringProcessor receipt");
  }
  if (mode === "bootstrap" && !facts.migrationFingerprint) blockers.push("缺少 migrationFingerprint");
  if (mode !== "bootstrap") {
    if (!facts.activationDigest) blockers.push("缺少 base.activationDigest");
    if (!facts.authoringDigest) blockers.push("缺少 base.authoringDigest");
  }
  if (mode === "delta" && !facts.deltaExportAllowed) blockers.push("目標禁止 delta export");
  return [...new Set(blockers)];
}

/** 這個集合的**主** schema tag（`champion@1`…），⛔ 不是它收得下的全部（見上）。 */
export function rawRuntimeSchemaFor(collection: RuntimeAuthoringCollection): string {
  return COLLECTIONS[collection].schemaTag;
}

export function runtimeCollectionForSchema(schema: string): RuntimeAuthoringCollection | null {
  return RUNTIME_AUTHORING_COLLECTIONS.find((collection) =>
    runtimeSchemaTagsFor(collection).includes(schema)) ?? null;
}
