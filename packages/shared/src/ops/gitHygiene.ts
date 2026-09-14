/**
 * ⭐ GH#1160 的量尺 —— 量**commit 進去的樹**（`git ls-tree -r -l <rev>`），⛔ 不是工作區。
 * 住在獨立模組是為了讓探針能對 origin/main 量（⛔ 從 .test.ts import 會拉進 vitest）。
 *
 * 四類「準備材料」（owner 2026-09-10：成品進 git，其餘進 S3）：
 *   materials/ · docs/legacy/_overwrites/ · 壓縮／切段 · *.log
 * ⭐ 大檔檢查**排除 `content/assets/` 底下的出貨媒體**（GLB／mp3…）—— 那是**成品**，≥ 5 MiB 也該進 git。
 *
 * ⭐ 判定都是**純函式**（吃 blob 陣列）：真樹與合成夾具走**同一支**，⛔ 不是測試自己抄一份判準（形態⑤）。
 */
import { execFileSync } from "node:child_process";
import { assetMediaType } from "../content/assetReferences";
import { REPO_ROOT } from "./gitTreeExport";

export type HygieneCat = "materials" | "legacy-overwrites" | "archives" | "logs";
export const HYGIENE_CATS: HygieneCat[] = ["materials", "legacy-overwrites", "archives", "logs"];

export interface TreeBlob { bytes: number; path: string }
export interface HygieneRow { path: string; bytes: number; why: string }
/** `tools/git-hygiene/baseline.json` 的形狀。 */
export interface HygieneBaseline {
  bigBlobBytes: number;
  legacyPerFileBytes: number;
  legacyOverFiles: HygieneRow[];
  categories: Record<HygieneCat, { files: number; bytes: number }>;
  bigBlobs: HygieneRow[];
}

/**
 * ⭐ GH#1220 —— owner 的判準是「**這個位元組能不能靠 diff 讀**」，⛔ 不是目錄名。
 *
 * owner 2026-09-08 逐字把該進 git 的點名了兩類：「**解析／轉換程式**」與「**版本清單**、SHA-256、文件」。
 * ⇒ `materials/` 底下的**腳本**與**小的結構化清單**⛔ 不是「準備材料」—— 它們正是規則說要留在 git 的東西。
 *
 * ⚠️ ⭐ 而 `.json` 要吃**尺寸**：CLAUDE.md 逐字把 `OBJECTS.json`（96,429 行）這種**解析傾印**歸到 S3。
 *   ⇒ 判準不是副檔名，是「**沒有人讀它的 diff，只有雜湊驗得了**」⇒ 用大小當那條線。
 *   （2026-09-11 量到：ou99 批次的 12 個檔最大 88 KB —— 全部讀得動 diff；而一份 483 KB 的傾印仍被算成材料，突變驗過。）
 */
const DIFF_READABLE_SOURCE = /\.(py|ts|tsx|mjs|cjs|js|sh|bash|md|txt)$/;
const DIFF_READABLE_DATA = /\.(json|csv|tsv|ya?ml|toml)$/;
/** 結構化資料超過這個大小就算**傾印**（讀不動 diff）⇒ 仍然是材料。 */
export const DIFF_READABLE_DATA_MAX_BYTES = 256 * 1024;

/**
 * ⭐ 壓縮檔**與它的分段**。PR #1112 的形狀是 `payload.tar.gz.part000…033`（`aa24208cc`）。
 * 分段常見三種名字：`.part000`／`.part-01`（自訂）· `.001`（7z／zip 分卷）· `.tar.gz.aa`（`split` 預設）。
 * ⚠️ 切得比大檔上限小（例：220 段 × 4.9 MiB）時大檔檢查量不到 ⇒ 靠 archives 這一類的**檔數**棘輪攔。
 */
const ARCHIVE_OR_SEGMENT = /\.(tar|tgz|gz|zip|7z|rar|part[-_]?\d*|\d{3})$|\.(tar|tgz|gz|zip|7z|rar)\.([a-z]{2}|\d{2,})$/;

/**
 * 素材庫的固定中央索引。這些檔案是後台與其他工作流的正式查詢入口，
 * 即使超過一般 diff 可讀上限，仍依素材庫契約保存在 Git；原始包、解析傾印與
 * 中間產物不在此清單內，仍由 materials 棘輪攔截並送往 S3 legacy/。
 */
export const REQUIRED_ASSET_LIBRARY_INDEXES = new Set([
  "materials/asset-library/current-resources.json",
  "materials/hero-model-library/download-sources.json",
  "materials/hero-model-library/inventory.json",
  "materials/hero-model-library/public-source-files.json",
  "materials/hero-model-library/voice-files.jsonl.gz",
  "materials/hero-model-library/voice-index.json",
  "materials/hero-model-library/已取得模型待設計英雄.json",
]);

/** 這個路徑是不是「靠 diff 讀得動的來源」⇒ ⛔ 不算準備材料。`bytes` 省略時只認腳本。 */
export function isDiffReadableSource(path: string, bytes?: number): boolean {
  if (DIFF_READABLE_SOURCE.test(path)) return true;
  if (!DIFF_READABLE_DATA.test(path)) return false;
  return bytes !== undefined && bytes <= DIFF_READABLE_DATA_MAX_BYTES;
}

export function categoryOf(path: string, bytes?: number): HygieneCat | null {
  if (REQUIRED_ASSET_LIBRARY_INDEXES.has(path)) return null;
  if (path.startsWith("materials/")) return isDiffReadableSource(path, bytes) ? null : "materials";
  if (path.startsWith("docs/legacy/_overwrites/")) return "legacy-overwrites";
  if (ARCHIVE_OR_SEGMENT.test(path)) return "archives";
  if (path.endsWith(".log")) return "logs";
  return null;
}

/**
 * 成品 —— 大檔檢查不管它（⛔ 但四類材料的路徑規則仍然適用：`content/assets/x.log` 還是 log）。
 * ⭐ 成品＝`content/assets/` 底下、副檔名是**出貨媒體型別**（`BINARY_ASSET_TYPES`，資產清單收集器用的同一張表）。
 * ⛔ `application/octet-stream`（`.bin`）不算：那個型別說的是「不知道是什麼位元組」⇒ 它保證不了是成品，
 *   而 #1112 的分段改名成 `.bin`／`.part000` 丟進 `content/assets/` 就正好躲在這裡。
 * ⚠️ 管不到：分段改名成**具體**媒體副檔名（`.glb`）—— 那要讀檔頭魔數，刻意不做（見 GH#1160 留言）。
 */
export function isFinishedAssetPath(path: string): boolean {
  const type = path.startsWith("content/assets/") ? assetMediaType(path) : undefined;
  return type !== undefined && type !== "application/octet-stream";
}

export function treeBlobs(rev = "HEAD", cwd = REPO_ROOT): TreeBlob[] {
  // `-z` preserves non-ASCII paths verbatim. Without it Git quotes Chinese filenames,
  // so policy sets and baseline entries cannot match the actual path.
  const out = execFileSync("git", ["ls-tree", "-r", "-l", "-z", rev], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const rows: TreeBlob[] = [];
  for (const l of out.split("\0")) {
    if (!l) continue;
    const tab = l.indexOf("\t");
    if (tab < 0) continue;
    const meta = l.slice(0, tab); const path = l.slice(tab + 1);
    rows.push({ bytes: Number(meta.split(/\s+/)[3] ?? 0), path });
  }
  return rows;
}

export function measureCategories(blobs: TreeBlob[]): HygieneBaseline["categories"] {
  const cats = Object.fromEntries(HYGIENE_CATS.map((k) => [k, { files: 0, bytes: 0 }])) as HygieneBaseline["categories"];
  for (const b of blobs) { const c = categoryOf(b.path, b.bytes); if (c) { cats[c].files++; cats[c].bytes += b.bytes; } }
  return cats;
}

export function measureHygiene(rev = "HEAD") {
  const blobs = treeBlobs(rev);
  return { cats: measureCategories(blobs), blobs };
}

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

/**
 * ⭐ 每一類的 files／bytes 只准變少。legacy-overwrites 例外：留底 hook 的落點（owner 2026-08-20：備份到 legacy
 * 資料夾沒關係）⇒ 它**會**長，改用單檔上限（GH#1192）。
 */
export function categoryGrowth(cats: HygieneBaseline["categories"], base: Pick<HygieneBaseline, "categories">): string[] {
  return HYGIENE_CATS.filter((k) => k !== "legacy-overwrites").flatMap((k) => {
    const now = cats[k], was = base.categories[k];
    return now.files > was.files || now.bytes > was.bytes
      ? [`${k}：files ${was.files}→${now.files}，bytes ${was.bytes}→${now.bytes} —— ⛔ 這一類不准長（owner 2026-09-10：準備材料進 S3，⭐ git 只留 manifest/SHA-256）`]
      : [];
  });
}

/**
 * ⭐ ≥ bigBlobBytes、不是成品、也沒列在 bigBlobs 的 blob ⇒ **逐檔指名大小**（⛔ 不是「有東西太大」）。
 * ⭐ 是 `>=`：剛好等於上限也紅（GH#1160 AC「造一份 5 MiB 的假二進位 ⇒ 紅」；在此之前 `>` 讓它剛好溜過）。
 */
export function bigBlobViolations(blobs: TreeBlob[], base: Pick<HygieneBaseline, "bigBlobBytes" | "bigBlobs">): string[] {
  const listed = new Set(base.bigBlobs.map((b) => b.path));
  return blobs.filter((b) => b.bytes >= base.bigBlobBytes && !isFinishedAssetPath(b.path) && !listed.has(b.path))
    .map((b) => `${mb(b.bytes)}  ${b.path} —— ⛔ 沒列在 tools/git-hygiene/baseline.json 的 bigBlobs（要留就寫理由；否則走 S3）`);
}

/** ⭐ 豁免列的 why 不可以是佔位字（GH#1160 AC：「每一列有理由，⛔ 沒有『還沒收』」）。 */
const PLACEHOLDER_WHY = /還沒收|待補|TODO|要寫得出/;
export function rowsWithoutReason(base: Pick<HygieneBaseline, "bigBlobs" | "legacyOverFiles">): string[] {
  return [...base.bigBlobs, ...base.legacyOverFiles]
    .filter((r) => !r.why || r.why.trim().length < 4 || PLACEHOLDER_WHY.test(r.why))
    .map((r) => `${r.path} —— why 是空的或佔位字（「${r.why ?? ""}」）⇒ 寫一個能被反駁的理由，或把它搬出 git`);
}

/**
 * ⭐ rollback 開關（GH#1160 AC④ 爭議）：「只能靠雜湊驗」的位元組總量。只有設了 `GGD_HYGIENE_TOTAL_CAP_BYTES`
 * 才會被當成閘（原票 AC④ 的總量棘輪）；預設不設 ⇒ 照 owner 2026-09-10「成品一律上傳至git」⛔ 不擋總量。
 */
export function hashOnlyBytes(blobs: TreeBlob[]): number {
  return blobs.reduce((sum, b) => sum + (isDiffReadableSource(b.path, b.bytes) ? 0 : b.bytes), 0);
}
