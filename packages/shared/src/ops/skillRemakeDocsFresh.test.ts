/**
 * 90 支重製技能的文件不可以無聲過期。
 *
 * ⚠️ 這條守衛的存在理由是一次真的發生過的事（2026-08-12）：
 * 產生器 `tools/skill-remake/batch1.py` 修了 8 個缺陷、90 支 JSON **全部變了**，
 * 而 `docs/技能編輯器引擎須知 20260811.md` §13.10 裡貼著的那一份還是舊的 ——
 * **沒有任何東西叫**。那一節是 Codex（外部編輯器開發者）真的會照著抄的東西，
 * 過期的合約比沒有合約更糟。
 *
 * 做法跟 `backupRules.test.ts` 一樣：**真的把腳本跑起來**（`--check` 模式，
 * 唯讀、回非零），⛔ 不是掃原始碼字串（失敗形態⑥）。
 *
 * ⚠️ 它紅了**不要改這條測試**，跑：
 *     python3 tools/skill-remake/refresh_docs.py
 * 然後把兩份文件一起 commit。
 *
 * 突變紀錄：
 *   · 在 §13.10 裡插一行字 → 紅（`--check` 回 1）
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = join(ROOT, "tools/skill-remake/refresh_docs.py");

describe("重製技能文件與產生器同步", () => {
  it("⭐ §13.10 與 90 支 md 都是從現在這支產生器生出來的 —— 過期就紅", () => {
    cover("skill-remake-docs-fresh");
    // 夾具前提：腳本不在的話下面那個 try 會吞掉一切，這條守衛就變成永遠綠。
    expect(existsSync(SCRIPT), "refresh_docs.py 不見了 —— 這條守衛在測空氣").toBe(true);

    let code = 0;
    let out = "";
    try {
      out = execFileSync("python3", [SCRIPT, "--check"], { cwd: ROOT, encoding: "utf8" });
    } catch (e) {
      const err = e as { status?: number; stdout?: string };
      code = err.status ?? 1;
      out = err.stdout ?? "";
    }
    expect(
      code,
      `文件與產生器不同步了。⛔ 不要改這條測試 —— 跑：\n` +
        `    bash scripts/genrun.sh skillremake:docs   # ⛔ 不要手改那兩份 md（產物,444）——直跑 python3 會吃 EACCES\n` +
        `再把 docs/ 的兩份一起 commit。\n腳本說：${out.trim()}`,
    ).toBe(0);
  });
});
