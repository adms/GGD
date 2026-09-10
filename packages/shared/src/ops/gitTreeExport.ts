/**
 * ⭐ 把某個 commit 的 `content/` **從 git 匯出**到暫存目錄 —— 給「只讀 git」的閘用。
 *
 * 為什麼要有這一支（2026-09-10 一天兩次事故，CLAUDE.md 第二守則）：
 *   · 正式站 502 —— 索引指著同一個 commit 裡被刪掉的檔（GH#1172）
 *   · 「第十一回合開了」四個 commit 而玩家拿到 false —— 產物沒進 commit（GH#1180）
 * ⭐ 兩次**每一條既有的閘都是綠的**，因為它們讀的是**工作區**，
 *   而工作區同時看得到已追蹤、未追蹤、以及**還沒 commit 的**改動。
 * ⛔ 出貨的是 git（部署走 `git fetch + checkout`），⛔ 不是某台機器的工作區。
 *
 * ⚠️ 併行 lane 會讓工作區永遠是髒的 ⇒ 這一族的閘**不可以**用工作區當輸入。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** monorepo 根（packages/shared/src/ops → 上四層）。 */
export const REPO_ROOT = join(HERE, "../../../..");

/** 這棵樹有沒有 .git —— 沒有（source tarball）⇒ 這一族的閘要**明說跳過**，⛔ 不假裝綠。 */
export function hasGit(): boolean {
  return existsSync(join(REPO_ROOT, ".git"));
}

/** 這個 rev 在本機 object store 裡嗎（夾具 commit 可能被淺 clone 抓不到）。 */
export function revExists(rev: string): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `${rev}^{commit}`], { cwd: REPO_ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * `git archive <rev> content | tar -x` 到暫存目錄，回傳那個 `content/` 的絕對路徑。
 * ⭐ 它匯出的正是 git 樹裡的位元組 —— 工作區的髒檔、未追蹤檔一個都進不來。
 */
export function exportContentAt(rev: string): string {
  const dir = mkdtempSync(join(tmpdir(), `ggd-tree-${rev.slice(0, 8)}-`));
  execFileSync("bash", ["-c", `git archive "$1" content | tar -x -C "$2"`, "_", rev, dir], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "ignore", "pipe"],
  });
  return join(dir, "content");
}
