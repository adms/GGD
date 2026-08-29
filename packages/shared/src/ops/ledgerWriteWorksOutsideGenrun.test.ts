/**
 * 帳本的寫入端**必須自解鎖** —— ⛔ 不可以假設「`genrun` 會先解鎖」（GH#771 AC3 的前提是錯的）。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 為什麼（2026-08-29 用實驗推翻的）
 * ---------------------------------------------------------------------------
 * #771 的 AC3 逐字是「**三處寫入端自解鎖拆掉**之後，`pnpm skills:sync` 仍然綠」。
 * 它的前提是：`writes` 宣告好之後 `scripts/genrun.sh` 會解鎖產物 ⇒ 自解鎖變成死碼。
 *
 * ⚠️ 我照著拆了，而且 `bash scripts/genrun.sh msgledger:build` → **EXIT=0**
 * —— ⛔ **那個綠燈是假的**：那一次根本沒有新列要寫（冪等），所以它從來沒碰過檔案。
 *
 * ⭐ 真正的測法是**走 `ruling.sh` 那條路**：它記錄 owner 的裁決，
 * ⛔ **不經過 `genrun`**（`scripts/ruling.sh:94` 直接 `python3 scripts/ledger_table.py`）。
 * 拆掉自解鎖之後它當場 `PermissionError: docs/_daily/<今天>.md`。
 *
 * ⇒ ⭐ **拆掉自解鎖 ＝ owner 的裁決記不進帳本** ——
 * 而 CLAUDE.md 記著那條規則已經失效過**四次**（同一題問了三遍以上）。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 這條閘守什麼
 * ---------------------------------------------------------------------------
 * 「對一份**鎖著的**帳本呼叫 `insert()`，它要寫得進去」——
 * ⛔ 不是「`genrun` 跑得起來」（那是另一條路，而且它會因為冪等而假綠）。
 *
 * 突變紀錄：拿掉 `ledger_table.py` 的任一處 `_unlock(path)` ⇒ 紅。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("帳本寫入端自解鎖（GH#771 AC3 的前提是錯的）", () => {
  it("⭐ 對**鎖著的**帳本 insert() 要寫得進去（＝ ruling.sh 那條路）", () => {
    const dir = mkdtempSync(join(tmpdir(), "ggd-ledger-"));
    const f = join(dir, "2026-01-01.md");
    writeFileSync(f, "# 2026-01-01\n", "utf-8");
    // ⭐ 出貨態：產物隔離區把它設成 444
    chmodSync(f, 0o444);
    expect(statSync(f).mode & 0o222, "⛔ 夾具沒鎖上 —— 這條守衛量不到任何東西").toBe(0);

    const py = [
      "import sys; sys.path.insert(0, 'scripts')",
      "import ledger_table as LT",
      "from pathlib import Path",
      `LT.insert(Path(${JSON.stringify(f)}), [("00:00", "probe", "—")])`,
    ].join("\n");

    let err: string | null = null;
    try {
      execFileSync("python3", ["-c", py], { cwd: REPO, encoding: "utf-8", timeout: 60_000 });
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    expect(
      err,
      "⛔ 寫不進去 —— ⭐ 那代表 `scripts/ruling.sh` 記不了 owner 的裁決\n" +
        "  （它 **不經過 `genrun`**，所以「genrun 會先解鎖」這個前提對它不成立）。\n" +
        "  ⚠️ CLAUDE.md 記著那條規則已經失效過四次 —— ⛔ 不要再拆掉自解鎖。",
    ).toBeNull();
    expect(readFileSync(f, "utf-8")).toContain("probe");
  });
});
