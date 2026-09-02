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
  /** Main's complete read receipt. These are evidence/audit fields, not write instructions. */
  readonly writers?: readonly string[];
  readonly product?: {
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
  };
  readonly source?: {
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
    /** Human/audit evidence only. The no-code Editor never rewrites Python source text. */
    readonly text: string;
  } | null;
  readonly normalizedFields?: readonly string[];
  readonly why?: string;
}

/** Local fail-safe until main supplies the authoritative descriptor route. */
export function generatedAbilityBlockers(doc: Record<string, unknown>): string[] {
  if (doc["provenance"] !== "owner-spec") return [];
  return [
    "這支技能由 tools/skill-remake 的來源資料產生，不能直接改產物；content/abilities 的變更會在下一次 sync 被覆蓋。" +
      "編輯器已停止寫入，必須經 editor-source 的產生器轉接器修改來源後再重建。",
  ];
}

/** champion@1 output has no per-doc provenance today, so absence must fail safe. */
export function generatedChampionBlockers(): string[] {
  return [
    "英雄文件由 tools/skill-remake 的來源資料產生，不能直接改 content/champions 產物；" +
      "在 editor-source 回報可寫來源或來源轉接器以前，編輯器已停止直接寫入。",
  ];
}

/** One source-of-truth decision shared by every editor save surface. */
export function sourceWriteBlockers(
  collection: CollectionName,
  doc: unknown,
  source: EditorSourceDescriptor | null,
): string[] {
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    return [];
  }
  if (source) {
    if (source.writePolicy === "document") return [];
    const owner = source.ownership.producer ? `（${source.ownership.producer}）` : "";
    const paths = source.ownership.sourcePaths.length > 0
      ? `來源：${source.ownership.sourcePaths.join("、")}`
      : "主程式尚未提供可編輯來源";
    const affected = source.ownership.editableMembers?.length
      ? `；重生成影響：${source.ownership.editableMembers.join("、")}`
      : "";
    const normalized = source.normalizedFields?.length
      ? `；以下欄位會由正規化器重新解析：${source.normalizedFields.join("、")}`
      : "";
    return [
      source.writePolicy === "source-adapter"
        ? `這份文件由產生器擁有${owner}，不能直接改產物。Main 目前的來源轉接器只接受整份來源文字；` +
          `no-code Editor 不會把 JSON 成員差異猜寫成 Python。必須等 Main 提供可預覽、CAS 保護的結構化成員寫回接縫。` +
          `${paths}${affected}${normalized}`
        : `這份文件目前唯讀${owner}；不能直接改產物。${paths}`,
    ];
  }
  if (collection === "abilities") return generatedAbilityBlockers(doc as Record<string, unknown>);
  if (collection === "champions") return generatedChampionBlockers();
  return [];
}
