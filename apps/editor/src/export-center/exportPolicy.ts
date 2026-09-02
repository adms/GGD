import { packageRuntimeRepresentations, type EditorContractIndex } from "./editorContractIndex";

export const DEFAULT_TARGET_PROFILE_URL =
  "https://ggd.adms.ai/content/editor-target-profile.json";

export type PackageMode = "bootstrap" | "full" | "delta";

const RUNTIME_SCHEMA_BY_COLLECTION = {
  abilities: "ability@1",
  items: "item@1",
} as const;

type RuntimeAuthoringCollection = keyof typeof RUNTIME_SCHEMA_BY_COLLECTION;
type EditorRuntimeSchema = typeof RUNTIME_SCHEMA_BY_COLLECTION[RuntimeAuthoringCollection];

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

export function rawRuntimeSchemaFor(collection: RuntimeAuthoringCollection): EditorRuntimeSchema {
  return RUNTIME_SCHEMA_BY_COLLECTION[collection];
}

export function runtimeCollectionForSchema(schema: string): RuntimeAuthoringCollection | null {
  for (const [collection, knownSchema] of Object.entries(RUNTIME_SCHEMA_BY_COLLECTION)) {
    if (knownSchema === schema) return collection as RuntimeAuthoringCollection;
  }
  return null;
}
