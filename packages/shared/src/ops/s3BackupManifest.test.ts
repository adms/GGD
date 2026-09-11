/**
 * ⭐⭐【S3 備份的收據要**指得到真的東西**】(GH#1231)
 *
 * owner 2026-09-11（逐字）：
 * > 「**S3 是備份不是互斥** 所有產生器 抽取器 成品也都要在 S3 上一份 作為備份站點」
 *
 * ⭐ 那句話把這張票整個翻過來了：原本要決定「那 209 MB 要不要從 git 移除」，
 * ⛔ 而答案是**不移除** —— S3 是多一份，⇒ ⭐ 不必改寫歷史（那是唯一沒有 rollback 的一步）。
 *
 * ── ⭐ 這條閘問什麼 ───────────────────────────────────────────────────────
 * ⛔ 它**不**下載 907 MB 去比對（那是 `scripts/backup-s3.sh --check` 的事，
 *    而它刻意是一支獨立指令：一條要跑十分鐘的測試會被人跳過，⭐ 而被跳過的閘等於沒有閘）。
 *
 * ⭐ 它問的是**關係**：這份收據**指得到一個真的 commit 嗎**？
 * ⚠️ 一份 sha 打錯／被手改／從別的 repo 複製過來的 manifest，
 * 每一個欄位看起來都完全正常 —— ⛔ 而它備份的是一個不存在的東西。
 * ⇒ ⭐ 「位元組在 S3、雜湊在 git」這個設計，⛔ 只有在那個雜湊指得到東西時才成立。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const MANIFEST = join(ROOT, "docs", "_data", "s3-backup-manifest.json");

interface Manifest {
  readonly schema?: string;
  readonly bucket?: string;
  readonly gitTree?: { commit?: string; key?: string; sha256?: string; bytes?: number };
  readonly intermediates?: readonly { tree?: string; prefix?: string; objects?: number }[];
}

describe("S3 備份收據（GH#1231）", () => {
  const present = existsSync(MANIFEST);
  const doc: Manifest = present ? (JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest) : {};

  it("⭐ 收據在，而且形狀對", () => {
    expect(present, "⛔ 沒有 docs/_data/s3-backup-manifest.json ⇒ 跑 `bash scripts/backup-s3.sh`").toBe(true);
    expect(doc.schema).toBe("ggd-s3-backup-manifest@1");
    expect(doc.bucket, "⛔ bucket 不是授權的那一個").toBe("ggd-390630837668-ap-east-2-an");
    expect(doc.gitTree?.sha256, "⛔ 雜湊不是 64 個十六進位字元 ⇒ 它驗不了任何東西")
      .toMatch(/^[0-9a-f]{64}$/);
    expect(doc.gitTree?.bytes ?? 0, "⛔ 0 bytes 的備份 ⇒ 那是一個空檔案").toBeGreaterThan(0);
  });

  it("⛔ 收據記的 commit 必須**真的存在於這個 repo**（⭐ 這是關係，不是名詞）", () => {
    const commit = doc.gitTree?.commit ?? "";
    expect(commit, "⛔ 沒有記 commit ⇒ 這份備份是哪一版的無人知道").toMatch(/^[0-9a-f]{40}$/);
    let exists = true;
    try {
      execFileSync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: ROOT, stdio: "ignore" });
    } catch {
      exists = false;
    }
    expect(
      exists,
      `⛔⛔ 收據說備份的是 commit ${commit.slice(0, 12)}…，⭐ 而這個 repo 裡**沒有這個 commit**。\n` +
        "⇒ 這份 manifest 被手改過、複製自別的 repo、或 sha 打錯了 —— " +
        "⛔ 而它的每一個欄位看起來都完全正常。\n" +
        "⇒ 重跑 `bash scripts/backup-s3.sh`，⛔ 不要改這條測試。",
    ).toBe(true);
  });

  it("⭐ 半成品那幾棵要記到物件數（⛔ 0 個物件的備份是空的，而它讀起來像備份過了）", () => {
    const trees = doc.intermediates ?? [];
    expect(trees.length, "⛔ 一棵都沒記 ⇒ 只備份了 git，半成品沒有").toBeGreaterThan(0);
    const empty = trees.filter((t) => (t.objects ?? 0) <= 0).map((t) => t.tree);
    expect(empty, "⛔ 這幾棵記了 0 個物件 —— ⭐ 那不是「備份好了」，是 sync 沒有送到").toEqual([]);
  });
});
