import type { PackageMode } from "./exportPolicy";

export type ContractRepresentationState = "supported" | "planned";
export type ContractPromotionPolicy = "admin-package-apply" | "review-required" | "forbidden";

export interface EditorRepresentationContract {
  readonly representation: string;
  readonly packageKind: string;
  readonly state: ContractRepresentationState;
  readonly minStage: string | null;
  readonly modes: readonly PackageMode[];
  readonly promotionPolicy: ContractPromotionPolicy;
}

export interface EditorContractIndex {
  readonly schema: "ggd-editor-contract-index@1";
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
  if (expectedDigest && digest !== expectedDigest) {
    throw new Error(`contract-index digest 與 target profile 不一致（${digest} != ${expectedDigest}）`);
  }
  if (!Array.isArray(root["representations"]) || root["representations"].length > 256) {
    throw new Error("contract-index.representations 必須是有界陣列");
  }
  const seen = new Set<string>();
  const representations = root["representations"].map((value, index): EditorRepresentationContract => {
    const row = record(value, `representations[${index}]`);
    const representation = boundedString(row["representation"], `representations[${index}].representation`)!;
    if (seen.has(representation)) throw new Error(`contract-index representation 重複：${representation}`);
    seen.add(representation);
    const state = row["state"];
    if (state !== "supported" && state !== "planned") {
      throw new Error(`${representation}.state 必須是 supported／planned`);
    }
    const promotionPolicy = row["promotionPolicy"];
    if (
      promotionPolicy !== "admin-package-apply" &&
      promotionPolicy !== "review-required" &&
      promotionPolicy !== "forbidden"
    ) throw new Error(`${representation}.promotionPolicy 未知`);
    return {
      representation,
      packageKind: boundedString(row["packageKind"], `${representation}.packageKind`)!,
      state,
      minStage: boundedString(row["minStage"], `${representation}.minStage`, true),
      modes: packageModes(row["modes"], `${representation}.modes`),
      promotionPolicy,
    };
  });
  return { schema: "ggd-editor-contract-index@1", digest, representations };
}

export function representationContract(
  index: EditorContractIndex | null,
  representation: string,
): EditorRepresentationContract | null {
  return index?.representations.find((row) => row.representation === representation) ?? null;
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
