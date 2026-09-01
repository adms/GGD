export const DEFAULT_TARGET_PROFILE_URL =
  "https://ggd.adms.ai/content/editor-target-profile.json";

export type PackageMode = "bootstrap" | "full" | "delta";

export interface TargetProfileFacts {
  schema: string;
  contentVersion: string | null;
  capabilityFingerprint: string | null;
  profileDigest: string | null;
  implementedStage: string | null;
  authoringStoreState: string | null;
  supportedModes: readonly PackageMode[];
  deltaExportAllowed: boolean;
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
    implementedStage: stringOrNull(root["implementedStage"]),
    authoringStoreState: stringOrNull(root["authoringStoreState"]),
    supportedModes: modes(root["supportedModes"]),
    deltaExportAllowed: root["deltaExportAllowed"] === true,
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

export function packageModeBlockers(facts: TargetProfileFacts, mode: PackageMode): readonly string[] {
  const blockers: string[] = [];
  if (!facts.supportedModes.includes(mode)) blockers.push(`目標未宣告支援 ${mode}`);
  if (!facts.contentVersion) blockers.push("缺少 base.contentVersion");
  if (!facts.gameRevision) blockers.push("缺少 base.gameRevision");
  if (facts.implementedStage !== "G2") blockers.push("目標未宣告 importer G2");
  if (!facts.authoringAccepts.includes("ability@1") || !facts.authoringAccepts.includes("item@1")) {
    blockers.push("目標未宣告接受 ability@1／item@1 authoring");
  }
  if (!facts.compilerContractVersion || !facts.compilerFingerprint) {
    blockers.push("目標沒有可 pin 的 compiler contractVersion／fingerprint");
  }
  if (mode === "bootstrap" && !facts.migrationFingerprint) blockers.push("缺少 migrationFingerprint");
  if (mode !== "bootstrap") {
    if (!facts.activationDigest) blockers.push("缺少 base.activationDigest");
    if (!facts.authoringDigest) blockers.push("缺少 base.authoringDigest");
  }
  if (mode === "delta" && !facts.deltaExportAllowed) blockers.push("目標禁止 delta export");
  return [...new Set(blockers)];
}

export function rawRuntimeSchemaFor(collection: "abilities" | "items"): "ability@1" | "item@1" {
  return collection === "abilities" ? "ability@1" : "item@1";
}
