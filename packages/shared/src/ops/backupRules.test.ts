/**
 * backupRules.test.ts —— 規則快照必須真的產生檔案。
 *
 * owner 2026-08-05：「每次改變 CLAUDE.md 與記憶 就產生一個舊的 backup file」。
 *
 * ⚠️ 實測前提：記憶目錄（43 檔、216K）在此之前**完全沒有版本控制**，
 * 而 CLAUDE.md 在 git 裡已有 10 版。所以這支腳本真正補的是記憶那一半。
 *
 * ⛔ 只有一條，而且不做突變 —— 被測的是一支 `cp` + `git commit` 的工具腳本，
 * 不是靈魂層（CLAUDE.md 第零守則③）。但它**必須跑起來**：一個「cp 打錯路徑」
 * 的版本掃字串照樣綠，而備份靜默失敗正是這個 repo 最貴的那種形狀。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("規則快照 scripts/backup-rules.sh", () => {
  it("真的把 CLAUDE.md 與每一份記憶存成一份時間戳快照,並給記憶開 git", () => {
    cover("backup-rules-writes");
    const home = mkdtempSync(join(tmpdir(), "ggd-rules-"));
    mkdirSync(join(home, "memory"), { recursive: true });
    writeFileSync(join(home, "memory", "a.md"), "one");
    writeFileSync(join(home, "memory", "b.md"), "two");

    const r = spawnSync("bash", [join(REPO, "scripts/backup-rules.sh")], {
      encoding: "utf8",
      env: { ...process.env, GGD_RULES_HOME: home },
    });
    expect(r.status).toBe(0);

    const snaps = readdirSync(join(home, "rules-backup"));
    expect(snaps).toHaveLength(1);
    const snap = join(home, "rules-backup", snaps[0]!);
    // ⛔ 兩邊都要讀：只驗 CLAUDE.md 的話，一個漏拷記憶的版本照樣過 ——
    // 而記憶才是原本零版本控制的那一半。
    expect(existsSync(join(snap, "CLAUDE.md"))).toBe(true);
    expect(readdirSync(join(snap, "memory")).sort()).toEqual(["a.md", "b.md"]);
    // 記憶自己的 git（真的能看 diff 的那個版本控制）
    expect(existsSync(join(home, "memory", ".git"))).toBe(true);
  });
});
