import type { PackageMode } from "./exportPolicy";
import { canonicalizeJcs } from "@ggd/shared/content/import/jcs";
import { sha256Hex } from "@ggd/shared/content/sha256";

export const EDITOR_CONTRACT_VERSION = "1.0.0" as const;

export type ContractRepresentationState = "supported" | "planned" | "unsupported";
export type ContractPromotionPolicy = "admin-package-apply" | "review-required" | "forbidden";

export interface EditorRepresentationContract {
  readonly schema: string;
  readonly packageKind: string;
  readonly state: ContractRepresentationState;
  readonly minStage: string;
  readonly modes: readonly PackageMode[];
  readonly promotionPolicy: ContractPromotionPolicy;
}

export interface EditorContractIndex {
  readonly schema: "ggd-editor-contract-index@1";
  readonly minEditorContractVersion: string;
  readonly digest: string;
  readonly representations: readonly EditorRepresentationContract[];
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} 必須是 JSON object`);
  }
  return value as Record<string, unknown>;
}

function boundedString(value: unknown, field: string, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || value.length < 1 || value.length > 256) {
    throw new Error(`${field} 必須是 1–256 字元字串${nullable ? "或 null" : ""}`);
  }
  return value;
}

function packageModes(value: unknown, field: string): readonly PackageMode[] {
  if (!Array.isArray(value) || value.length > 3) throw new Error(`${field} 必須是 modes array`);
  const modes = value.map((mode) => {
    if (mode !== "bootstrap" && mode !== "full" && mode !== "delta") {
      throw new Error(`${field} 含未知 mode：${String(mode)}`);
    }
    return mode;
  });
  if (new Set(modes).size !== modes.length) throw new Error(`${field} 不得重複`);
  return modes;
}

function versionParts(value: unknown, field: string): readonly [number, number, number] {
  if (typeof value !== "string" || !/^\d+\.\d+\.\d+$/.test(value)) {
    throw new Error(`${field} 必須是 x.y.z 版本`);
  }
  const parts = value.split(".").map(Number) as [number, number, number];
  if (parts.some((part) => !Number.isSafeInteger(part))) {
    throw new Error(`${field} 超出安全整數範圍`);
  }
  return parts;
}

function versionIsNewer(required: readonly number[], current: readonly number[]): boolean {
  for (let index = 0; index < 3; index += 1) {
    if (required[index]! > current[index]!) return true;
    if (required[index]! < current[index]!) return false;
  }
  return false;
}

/**
 * Parse the Main-owned contract registry. Extra fields deliberately survive
 * outside this narrow view; Editor gates only on facts it actually consumes.
 */
export function readEditorContractIndex(raw: unknown, expectedDigest?: string | null): EditorContractIndex {
  const root = record(raw, "contract-index");
  if (root["schema"] !== "ggd-editor-contract-index@1") {
    throw new Error("contract-index schema 必須是 ggd-editor-contract-index@1");
  }
  const digest = boundedString(root["digest"], "contract-index.digest")!;
  if (!/^[0-9a-f]{12}$/.test(digest)) {
    throw new Error("contract-index.digest 必須是 12 位小寫 SHA-256 摘要");
  }
  const body = { ...root };
  delete body["digest"];
  const recomputedDigest = sha256Hex(canonicalizeJcs(body)).slice(0, 12);
  if (digest !== recomputedDigest) {
    throw new Error(`contract-index 內容摘要不符（${digest} != ${recomputedDigest}）`);
  }
  if (expectedDigest && digest !== expectedDigest) {
    throw new Error(`contract-index digest 與 target profile 不一致（${digest} != ${expectedDigest}）`);
  }
  const minEditorContractVersion = boundedString(
    root["minEditorContractVersion"],
    "contract-index.minEditorContractVersion",
  )!;
  if (versionIsNewer(
    versionParts(minEditorContractVersion, "contract-index.minEditorContractVersion"),
    versionParts(EDITOR_CONTRACT_VERSION, "Editor contract version"),
  )) {
    throw new Error(
      `contract-index 要求 Editor 契約 ${minEditorContractVersion}，目前僅支援 ${EDITOR_CONTRACT_VERSION}`,
    );
  }
  if (!Array.isArray(root["representations"]) || root["representations"].length > 256) {
    throw new Error("contract-index.representations 必須是有界陣列");
  }
  const seen = new Set<string>();
  const representations = root["representations"].map((value, index): EditorRepresentationContract => {
    const row = record(value, `representations[${index}]`);
    const schema = boundedString(row["schema"], `representations[${index}].schema`)!;
    if (seen.has(schema)) throw new Error(`contract-index representation 重複：${schema}`);
    seen.add(schema);
    const state = row["state"];
    if (state !== "supported" && state !== "planned" && state !== "unsupported") {
      throw new Error(`${schema}.state 必須是 supported／planned／unsupported`);
    }
    const promotionPolicy = row["promotionPolicy"];
    if (
      promotionPolicy !== "admin-package-apply" &&
      promotionPolicy !== "review-required" &&
      promotionPolicy !== "forbidden"
    ) throw new Error(`${schema}.promotionPolicy 未知`);
    return {
      schema,
      packageKind: boundedString(row["packageKind"], `${schema}.packageKind`)!,
      state,
      minStage: boundedString(row["minStage"], `${schema}.minStage`)!,
      modes: packageModes(row["modes"], `${schema}.modes`),
      promotionPolicy,
    };
  });
  return {
    schema: "ggd-editor-contract-index@1",
    minEditorContractVersion,
    digest,
    representations,
  };
}

export function representationContract(
  index: EditorContractIndex | null,
  representation: string,
): EditorRepresentationContract | null {
  return index?.representations.find((row) => row.schema === representation) ?? null;
}

/** Unknown representation is never promotable, even if a stale UI knows its name. */
export function promotionPolicyFor(
  index: EditorContractIndex | null,
  representation: string,
): ContractPromotionPolicy {
  return representationContract(index, representation)?.promotionPolicy ?? "forbidden";
}

export function modesFor(index: EditorContractIndex | null, representation: string): readonly PackageMode[] {
  const row = representationContract(index, representation);
  return row?.state === "supported" ? row.modes : [];
}
