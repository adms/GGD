/**
 * messageLedgerScript.test.ts —— owner 的每一則訊息都要對到一張票。
 *
 * owner 2026-08-20：「🧾 逐則對票 · owner 的每一句話在哪張票上 => **你要持續更新吧**」
 *
 * ⚠️ 承重的那一行是**插入位置**（`scripts/ledger_table.py::_table_end`）：舊的
 * `ruling.sh` 用 `>>` 附加到**檔尾**，於是 7 則裁決落在 `## 逐則對票` 區段外面 ——
 * `gen_board.py` 的 `section()` 一列都讀不到，而寫入端每次都回報「✓ 已寫入」。
 * ⭐ 掃字串對這個形態永遠是綠的，所以這裡**真的把腳本跑起來**再讀落點。
 *
 * ⛔ 體驗層，一條突變（接線類），⛔ 不開對抗輪（第零守則③⑦）。
 * 突變紀錄（跑過）：`ledger_table.insert()` 的 `lines[at:at] = …` 改成
 * `lines += …`（＝退回舊 bug）→ 第一條紅，指出新列跑到後續區段外面。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DAY = "2020-01-02"; // ⛔ 不可能有 transcript 的日期 ⇒ 走已版控存檔那條來源
const TAIL = "## ⛔ 後面還有一節";

/** 帳本：表格後面**還有別的區段** —— 附加到檔尾與插進表格才分得出來。 */
const LEDGER =
  `# ${DAY}\n\n## 逐則對票 —— 帶後綴的標題（比對要容忍）\n\n` +
  `| 時間 | owner 說了什麼（逐字） | 票 |\n|---|---|---|\n| 09:00 | 先前那一則 | #111 |\n\n${TAIL}\n\n尾巴。\n`;
const ARCHIVE = "# 存檔\n\n## 10:30\n\n這是一則還沒有對到票的指示,請你把它記下來並開票追蹤。\n";

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "ggd-msgledger-"));
  writeFileSync(join(dir, `${DAY}.md`), LEDGER);
  writeFileSync(join(dir, "ledger-source_temp_20200102.md"), ARCHIVE);
  return dir;
}
const run = (dir: string, ...args: string[]) =>
  spawnSync("bash", [join(REPO, "scripts/message-ledger.sh"), "--date", DAY, ...args], {
    cwd: REPO,
    encoding: "utf8",
    // ⚠️ 也把 transcript 指到空目錄:出貨那份是 GB 級的,掃四次 = 這條守衛 16 秒
    env: { ...process.env, GGD_LEDGER_DIR: dir, GGD_TRANSCRIPT_DIR: dir },
  });

describe("逐則對票 scripts/message-ledger.sh", () => {
  it("🔴 新列插進「逐則對票」表格裡,⛔ 不是檔尾", () => {
    const dir = fixture();
    const r = run(dir);
    expect(r.status, r.stderr).toBe(0);

    const lines = readFileSync(join(dir, `${DAY}.md`), "utf8").split("\n");
    const row = lines.findIndex((l) => l.startsWith("| 10:30 |"));
    expect(row, "新列根本沒寫進去").toBeGreaterThan(0);
    expect(
      row,
      "新列跑到後面的區段外面 —— gen_board.py 的 section() 讀不到它（＝舊 ruling.sh 的 bug）",
    ).toBeLessThan(lines.indexOf(TAIL));
    expect(lines[row - 1], "要接在表格最後一列之後").toBe("| 09:00 | 先前那一則 | #111 |");
  });

  it("🔴 --check 兩種紅：訊息漏了列 / 列還是「⏸ 未對票」", () => {
    const dir = fixture();
    const missing = run(dir, "--check"); // ① 存檔有這一則,表格裡沒有
    expect(missing.status, "漏了一則訊息卻是綠的").toBe(1);
    expect(missing.stdout).toContain("漏了 10:30");

    run(dir); // 補列 —— 推不出票號 ⇒ ⏸ 未對票
    expect(run(dir, "--check").status, "票號還是「⏸ 未對票」卻是綠的").toBe(1); // ②

    const p = join(dir, `${DAY}.md`);
    writeFileSync(p, readFileSync(p, "utf8").replace("⏸ 未對票", "#222"));
    expect(run(dir, "--check").status, "填了票號就該綠").toBe(0);
  });

  /**
   * GH#876 —— 失敗形態⑨：**一個永遠不會綠的閘**。
   *
   * transcript 在 session 進行中一直長 ⇒ owner 每講一句就多一則「沒有列」的訊息，
   * 而補列進去的票號是 `⏸ 未對票`（＝第二種紅）⇒ ⭐ **沒有任何動作能讓它綠**。
   * ⇒ 分母改成「**已經結束的每一天**」（今天只印不擋）。
   * ⛔ 這不是放寬比對：每一天最終都會被硬檢查一次 —— 在它結束的隔天。
   *
   * 突變紀錄（跑過）：`message-ledger.sh` 的
   * `hard, live = [yesterday(TODAY)], (None if STRICT_TODAY else TODAY)`
   * 改回 `hard, live = [yesterday(TODAY), TODAY], None`（＝退回「今天也硬檢查」）
   * → 第二條斷言紅（今天還有漏列，卻擋下了）。
   */
  it("🔴 今天（進行中）漏列不擋，昨天的「⏸ 未對票」才擋", () => {
    const day = (d: number) =>
      new Date(Date.now() + 8 * 3600e3 + d * 864e5).toISOString().slice(0, 10);
    const [today, yest] = [day(0), day(-1)];
    const TABLE = "| 時間 | owner 說了什麼（逐字） | 票 |\n|---|---|---|\n";
    const SAID = "這是昨天那一則指示,長度要夠讓比對窗吃得到它。";

    const dir = mkdtempSync(join(tmpdir(), "ggd-msgledger-live-"));
    writeFileSync(join(dir, `${yest}.md`), `## 逐則對票\n\n${TABLE}| 09:00 | ${SAID} | ⏸ 未對票 |\n`);
    writeFileSync(join(dir, `ledger-source_temp_${yest.replaceAll("-", "")}.md`), `## 09:00\n\n${SAID}\n`);
    writeFileSync(join(dir, `${today}.md`), `## 逐則對票\n\n${TABLE}`); // ⇒ 今天那一則沒有列
    writeFileSync(join(dir, `ledger-source_temp_${today.replaceAll("-", "")}.md`), `## 10:30\n\n今天這一則還在 transcript 裡,帳本還沒有它。\n`);
    const live = (...a: string[]) =>
      spawnSync("bash", [join(REPO, "scripts/message-ledger.sh"), "--check", ...a], {
        cwd: REPO,
        encoding: "utf8",
        env: { ...process.env, GGD_LEDGER_DIR: dir, GGD_TRANSCRIPT_DIR: dir, GGD_LEDGER_STRICT_TODAY: "" },
      });

    const before = live();
    expect(before.status, "昨天還有『⏸ 未對票』卻是綠的").toBe(1);
    expect(before.stdout, "今天的漏列要印出來（fail-open ⛔ 不靜默）").toContain("⏳ 漏了 10:30");

    // ⭐ 帳本平時 chmod 444 + genguard 擋 Edit ⇒ 填票號**只有這一條合法路徑**（GH#876 一起補的）
    const mapped = spawnSync(
      "python3",
      [join(REPO, "scripts/ledger_table.py"), "--map", join(dir, `${yest}.md`), "09:00", "— 不需開票"],
      { cwd: REPO, encoding: "utf8" },
    );
    expect(mapped.status, mapped.stderr).toBe(0);

    const after = live();
    expect(after.status, "今天還有漏列就擋下 ⇒ 這條閘又變成永遠不會綠（GH#876）").toBe(0);
    expect(after.stdout).toContain("⏳ 漏了 10:30");

    const strict = spawnSync("bash", [join(REPO, "scripts/message-ledger.sh"), "--check"], {
      cwd: REPO,
      encoding: "utf8",
      env: { ...process.env, GGD_LEDGER_DIR: dir, GGD_TRANSCRIPT_DIR: dir, GGD_LEDGER_STRICT_TODAY: "1" },
    });
    expect(strict.status, "逃生口 GGD_LEDGER_STRICT_TODAY=1 要能把今天拉回硬檢查").toBe(1);
  });
});
