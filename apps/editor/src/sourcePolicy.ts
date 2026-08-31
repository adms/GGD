import type { CollectionName } from "@ggd/shared/content";

/** Main-owned source descriptor returned by GET /content-api/editor-source. */
export interface EditorSourceDescriptor {
  readonly schema: "ggd-editor-source@1";
  readonly collection: CollectionName;
  readonly id: string;
  readonly outputPath: string;
  readonly ownership: {
    readonly kind: "hand-authored" | "generator-owned" | "normalizer-only";
    readonly producer?: string;
    readonly sourcePaths: readonly string[];
    readonly regenerateCommand?: string;
    readonly editableMembers?: readonly string[];
  };
  readonly writePolicy: "document" | "source-adapter" | "readonly";
}

/** Local fail-safe until main supplies the authoritative descriptor route. */
export function generatedAbilityBlockers(doc: Record<string, unknown>): string[] {
  if (doc["provenance"] !== "owner-spec") return [];
  return [
    "這支技能由 tools/skill-remake 的來源資料產生，不能直接改產物；content/abilities 的變更會在下一次 sync 被覆蓋。" +
      "編輯器已停止寫入，必須經 editor-source 的產生器轉接器修改來源後再重建。",
  ];
}

/** One source-of-truth decision shared by every editor save surface. */
export function sourceWriteBlockers(
  collection: CollectionName,
  doc: unknown,
  source: EditorSourceDescriptor | null,
): string[] {
  if (collection !== "abilities" || typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    return [];
  }
  if (source) {
    if (source.writePolicy === "document") return [];
    const owner = source.ownership.producer ? `（${source.ownership.producer}）` : "";
    const paths = source.ownership.sourcePaths.length > 0
      ? `來源：${source.ownership.sourcePaths.join("、")}`
      : "主程式尚未提供可編輯來源";
    return [
      source.writePolicy === "source-adapter"
        ? `這支技能由產生器擁有${owner}；必須透過來源轉接器寫入，不能直接改產物。${paths}`
        : `這支技能目前唯讀${owner}；不能直接改產物。${paths}`,
    ];
  }
  return generatedAbilityBlockers(doc as Record<string, unknown>);
}
