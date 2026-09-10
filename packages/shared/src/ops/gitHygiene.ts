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

export function categoryOf(path: string): HygieneCat | null {
  if (path.startsWith("materials/")) return "materials";
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
  return out.split("\n").filter(Boolean).map((l) => {
    const [meta, path] = l.split("\t", 2);
    return { bytes: Number(meta.split(/\s+/)[3]), path };
  });
}

export function measureHygiene(rev = "HEAD") {
  const cats = Object.fromEntries(HYGIENE_CATS.map((k) => [k, { files: 0, bytes: 0 }])) as Record<HygieneCat, { files: number; bytes: number }>;
  const blobs = treeBlobs(rev);
  for (const b of blobs) { const c = categoryOf(b.path); if (c) { cats[c].files++; cats[c].bytes += b.bytes; } }
  return { cats, blobs };
}
