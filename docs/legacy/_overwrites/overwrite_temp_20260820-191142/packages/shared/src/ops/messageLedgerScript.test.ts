/**
 * messageLedgerScript.test.ts —— owner 的每一則訊息都要對到一張票。
 *
 * owner 2026-08-20：「🧾 逐則對票 · owner 的每一句話在哪張票上 => **你要持續更新吧**」
 *
 * ⚠️ 被測的**承重那一行**是插入位置（`ledger_table._table_end`）：舊的 `ruling.sh`
 * 用 `>>` 附加到**檔尾**，於是 7 則裁決落在 `## 逐則對票` 區段外面 ——
 * `gen_board.py` 的 `section()` 一列都讀不到，而寫入端每次都回報「✓ 已寫入」。
 * ⭐ 掃字串對這個形態永遠是綠的，所以這裡**真的把腳本跑起來**再讀落點。
 *
 * ⛔ 體驗層，一條突變（接線類），⛔ 不開對抗輪（第零守則③⑦）。
 * 突變紀錄（跑過）：把 `insert()` 的 `lines[at:at]` 改成 `lines.extend(...)`（＝退回舊 bug）
 * → 第一條紅，訊息指出新列跑到後續區段外面。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DAY = "2020-01-02"; // ⛔ 不可能有 transcript 的日期 ⇒ 走已版控存檔那條來源
const run = (dir: string, ...args: string[]) =>
  spawnSync("bash", [join(REPO, "scripts/message-ledger.sh"), "--date", DAY, ...args], {
    cwd: REPO,
    encoding: "utf8",
    env: { ...process.env, GGD_LEDGER_DIR: dir },
  });

/** 帳本：表格後面**還有別的區段** —— 附加到檔尾與插進表格才分得出來。 */
const LEDGER = [
  `# ${DAY}`,
  "",
  "## 逐則對票 —— 帶後綴的標題（比對要容忍）",
  "",
  "| 時間 | owner 說了什麼（逐字） | 票 |",
  "|---|---|---|",
  "| 09:00 | 先前那一則 | #111 |",
  "",
  "## ⛔ 後面還有一節",
  "",
  "尾巴。",
  "",
].join("\n");

const ARCHIVE = `# 存檔\n\n## 10:30\n\n這是一則還沒有對到票的指示,請你把它記下來並開票追蹤。\n`;

describe("逐則對票 scripts/message-ledger.sh", () => {
  it("🔴 新列插進「逐則對票」表格裡,⛔ 不是檔尾", () => {
    cover("message-ledger-insert");
    const dir = mkdtempSync(join(tmpdir(), "ggd-msgledger-"));
    writeFileSync(join(dir, `${DAY}.md`), LEDGER);
    writeFileSync(join(dir, "ledger-source_temp_20200102.md"), ARCHIVE);

    const r = run(dir);
    expect(r.status, r.stderr).toBe(0);

    const lines = readFileSync(join(dir, `${DAY}.md`), "utf8").split("\n");
    const row = lines.findIndex((l) => l.startsWith("| 10:30 |"));
    const tail = lines.findIndex((l) => l.startsWith("## ⛔ 後面還有一節"));
    expect(row, "新列根本沒寫進去").toBeGreaterThan(0);
    expect(
      row,
      "新列跑到後面的區段外面了 —— gen_board.py 的 section() 讀不到它（＝舊 ruling.sh 的 bug）",
    ).toBeLessThan(tail);
    expect(lines[row - 1], "要接在表格最後一列之後").toBe("| 09:00 | 先前那一則 | #111 |");
  });

  it("🔴 --check 兩種紅：訊息漏了列 / 列還是「⏸ 未對票」", () => {
    const dir = mkdtempSync(join(tmpdir(), "ggd-msgledger-"));
    writeFileSync(join(dir, `${DAY}.md`), LEDGER);
    writeFileSync(join(dir, "ledger-source_temp_20200102.md"), ARCHIVE);

    const missing = run(dir, "--check"); // ① 存檔有這一則,表格裡沒有
    expect(missing.status, "漏了一則訊息卻是綠的").toBe(1);
    expect(missing.stdout).toContain("漏了 10:30");

    run(dir); // 補列 —— 推不出票號 ⇒ ⏸ 未對票
    const unmapped = run(dir, "--check"); // ② 有列但沒對到票
    expect(unmapped.status, "票號還是「⏸ 未對票」卻是綠的").toBe(1);
    expect(unmapped.stdout).toContain("未對票");

    const p = join(dir, `${DAY}.md`);
    writeFileSync(p, readFileSync(p, "utf8").replace("⏸ 未對票", "#222"));
    expect(run(dir, "--check").status, "填了票號就該綠").toBe(0);
  });
});
