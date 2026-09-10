/**
 * ⭐ GH#1160 的量尺 —— 量**commit 進去的樹**（`git ls-tree -r -l <rev>`），⛔ 不是工作區。
 * 住在獨立模組是為了讓探針能對 origin/main 量（⛔ 從 .test.ts import 會拉進 vitest）。
 *
 * 四類「準備材料」（owner 2026-09-10：成品進 git，其餘進 S3）：
 *   materials/ · docs/legacy/_overwrites/ · 壓縮／切段 · *.log
 * ⭐ 大檔檢查**排除 `content/assets/`** —— 那裡的 GLB／mp3 是**成品**，> 5 MB 也該進 git。
 */
import { execFileSync } from "node:child_process";
import { REPO_ROOT } from "./gitTreeExport";

export type HygieneCat = "materials" | "legacy-overwrites" | "archives" | "logs";
export const HYGIENE_CATS: HygieneCat[] = ["materials", "legacy-overwrites", "archives", "logs"];

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

/** 這個路徑是不是「靠 diff 讀得動的來源」⇒ ⛔ 不算準備材料。`bytes` 省略時只認腳本。 */
export function isDiffReadableSource(path: string, bytes?: number): boolean {
  if (DIFF_READABLE_SOURCE.test(path)) return true;
  if (!DIFF_READABLE_DATA.test(path)) return false;
  return bytes !== undefined && bytes <= DIFF_READABLE_DATA_MAX_BYTES;
}

export function categoryOf(path: string, bytes?: number): HygieneCat | null {
  if (path.startsWith("materials/")) return isDiffReadableSource(path, bytes) ? null : "materials";
  if (path.startsWith("docs/legacy/_overwrites/")) return "legacy-overwrites";
  if (/\.(tar|tgz|gz|zip|7z|rar|part\d*)$/.test(path)) return "archives";
  if (path.endsWith(".log")) return "logs";
  return null;
}

/** 成品目錄 —— 大檔檢查不管它（⛔ 但四類材料的路徑規則仍然適用：`content/assets/x.log` 還是 log）。 */
export function isFinishedAssetPath(path: string): boolean {
  return path.startsWith("content/assets/");
}

export function treeBlobs(rev = "HEAD"): Array<{ bytes: number; path: string }> {
  const out = execFileSync("git", ["ls-tree", "-r", "-l", rev], { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const rows: Array<{ bytes: number; path: string }> = [];
  for (const l of out.split("\n")) {
    if (!l) continue;
    const tab = l.indexOf("\t");
    if (tab < 0) continue;
    const meta = l.slice(0, tab); const path = l.slice(tab + 1);
    rows.push({ bytes: Number(meta.split(/\s+/)[3] ?? 0), path });
  }
  return rows;
}

export function measureHygiene(rev = "HEAD") {
  const cats = Object.fromEntries(HYGIENE_CATS.map((k) => [k, { files: 0, bytes: 0 }])) as Record<HygieneCat, { files: number; bytes: number }>;
  const blobs = treeBlobs(rev);
  for (const b of blobs) { const c = categoryOf(b.path, b.bytes); if (c) { cats[c].files++; cats[c].bytes += b.bytes; } }
  return { cats, blobs };
}
