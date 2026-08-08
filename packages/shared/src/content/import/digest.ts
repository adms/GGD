/**
 * 規格 §10「Package digest 算法」四步的實作。
 *
 *   ① 建 `semanticManifestProjection`：移除 `packageDigest`、signature、`transport`、
 *      archive hash 與任何非重現 metadata。
 *   ② `selectionRoots`／`changes`／`entries`／`requires`／`expected*`／
 *      `requiredScenarios`／`fidelityDecisions` 依 POSIX path／id **byte order** 排序；
 *      ⛔ 不得依容器（ZIP entry／JSON array）的輸入順序。
 *   ③ 對 projection 的 JCS canonical UTF-8 bytes 取 SHA-256 → `packageDigest`。
 *   ④ 同一批 semantic entries 的 JSON bundle 與 ZIP 必須得到相同結果 ——
 *      這是 ①②的推論，不是額外一步：ZIP 專屬的 `transport`／`rawSha256`／`rawSize`
 *      在 ① 被移除，entry 順序在 ② 被正規化，所以兩條路徑餵給 ③ 的 bytes 完全相同。
 *
 * ⚠️ 為什麼 ② 的排序鍵要寫成一張**表**而不是散在程式裡（CLAUDE.md 第零守則⑨）：
 * 規格逐條列了七類陣列，但沒有逐類指定「用哪個欄位當鍵」。那是七個決策點。
 * 表格讓「我們用哪個鍵」變成一份可以直接拿去跟對面專案對帳的資料，
 * 而不是七段各自長得不一樣的 `.sort()`。要改就改表。
 */
import { canonicalizeJcs, compareUtf8Bytes, SHA256_PREFIX } from "./jcs";
import { sha256Hex } from "../sha256";

/**
 * ① 不進 semantic projection 的 top-level manifest key。
 *
 * `packageDigest` 自己顯然不能參與（遞迴）；`transport` 是 ZIP 專屬，留著 JSON 與 ZIP
 * 就永遠不會相等；`signature` 蓋在 digest 之上；`archiveSha256` 是 transport integrity，
 * 規格明說「不寫回 archive 造成遞迴 hash」。
 */
export const NON_SEMANTIC_MANIFEST_KEYS: readonly string[] = [
  "packageDigest",
  "signature",
  "transport",
  "archiveSha256",
];

/**
 * ② 每一類陣列的排序鍵（依序比較；缺欄位視為空）。
 *
 * 最後一律再以「該元素的完整 JCS canonical 字串」收尾當 tie-break，
 * 所以排序是**全序**：鍵相同的兩個元素也有唯一順序，不會落到「看輸入順序」。
 */
export const MANIFEST_ARRAY_SORT_KEYS: Readonly<Record<string, readonly string[]>> = {
  selectionRoots: ["kind", "id", "revision"],
  changes: ["path", "id", "kind"],
  entries: ["path"],
  requires: ["id", "revision"],
  requiredScenarios: ["id"],
  fidelityDecisions: ["id"],
};

/** `expected*`（expectedCompiled／expectedDerived／未來新增的）共用這組鍵。 */
export const EXPECTED_ARRAY_SORT_KEYS: readonly string[] = ["path", "id"];

type JsonObject = Record<string, unknown>;

function sortKeysFor(field: string): readonly string[] | undefined {
  if (field in MANIFEST_ARRAY_SORT_KEYS) return MANIFEST_ARRAY_SORT_KEYS[field];
  if (field.startsWith("expected")) return EXPECTED_ARRAY_SORT_KEYS;
  return undefined;
}

function sortKeyOf(element: unknown, fields: readonly string[]): string {
  const parts = fields.map((f) => {
    const v = element !== null && typeof element === "object" ? (element as JsonObject)[f] : undefined;
    if (v === undefined) return "";
    return typeof v === "string" ? v : canonicalizeJcs(v);
  });
  // U+0000 分隔：它比任何實際內容字元都小，所以 "a" 排在 "ab" 前面這種前綴關係
  // 不會因為串接而反轉。最後一段是全元素 canonical，保證全序。
  return [...parts, canonicalizeJcs(element)].join("\u0000");
}

/**
 * ① + ②：把 manifest 化成可重現的 semantic projection。
 * 純函式，不改動傳入的物件。
 */
export function semanticManifestProjection(manifest: unknown): JsonObject {
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("packageDigest: manifest 必須是 JSON object");
  }

  const out: JsonObject = {};
  for (const [key, value] of Object.entries(manifest as JsonObject)) {
    if (NON_SEMANTIC_MANIFEST_KEYS.includes(key)) continue;

    const fields = sortKeysFor(key);
    if (fields && Array.isArray(value)) {
      out[key] = [...value]
        .map((el) => [sortKeyOf(el, fields), el] as const)
        .sort((a, b) => compareUtf8Bytes(a[0], b[0]))
        .map(([, el]) => el);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** ③：`packageDigest` = `sha256:<64 小寫 hex>`，對 projection 的 JCS canonical UTF-8 bytes。 */
export function packageDigest(manifest: unknown): string {
  return SHA256_PREFIX + sha256Hex(canonicalizeJcs(semanticManifestProjection(manifest)));
}
