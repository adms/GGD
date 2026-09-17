/**
 * ledgerIdMarkParity.test.ts —— 帳本列的**身分標記** `<!-- id:… -->`（GH#1255）⛔ 不可以印給 owner 看。
 *
 * ⚠️ 為什麼要一條閘（GH#1255 審查後補）：
 *  ① `tools/admin-live/datasets/parallel-board.mjs` 抄了一份剝除正則（JS 讀不到 Python），
 *     b8b1009bd 只用一句註解「那邊改格式要連這一行一起改」守它 ＝ 判準，而且 commit 還寫「格式只住 ledger_table.py」。
 *  ② `scripts/board-roll.sh` 沒剝 ⇒ `docs/_release/戰情版-20260915.md`（`GGD戰情版.md` 指向它）帶著 129 個原樣標記。
 *
 * ⭐ 兩條都**真的跑出貨的程式**（⛔ 不是掃字串）：
 *  · 標記由 `ledger_table.with_id` 產生、期望值由 `ledger_table.strip_id` 算 ⇒ JS 那一支與它逐字比。
 *    兩個方向：該剝的沒剝（格式改了 JS 沒跟）、不該剝的剝了（JS 放寬成剝所有註解）。
 *  · board-roll.sh 在暫存樹上真的跑一次，讀它寫出來的戰情版。
 *
 * ⛔ 體驗層（工具腳本），一條突變（接線類）。突變紀錄見 commit 訊息。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

const PY = `
import json, sys
sys.path.insert(0, "scripts")
import ledger_table as L
marked = [L.with_id("先前那一則", "0123abcd"), L.with_id("有 \\\\| 跳脫的話 ", L.short_id("DEADBEEF-1111-2222")),
          "| 09:00 | " + L.with_id("整列", "aaaaaaaa") + " | #1255 |"]
plain = ["<!-- note -->", "話 <!-- id:XYZ12345 -->", "話 <!-- id:abc -->", "話 <!-- id:0123abcd0 -->", "沒有標記"]
print(json.dumps([{"s": s, "strip": L.strip_id(s), "id": L.row_id(s), "marked": s in marked} for s in marked + plain]))
`;

describe("GH#1255 身分標記不渲染", () => {
  it("admin-live 的 stripLedgerIdMark 與 ledger_table.strip_id 逐字一致（兩個方向）", async () => {
    const r = spawnSync("python3", ["-c", PY], { cwd: REPO, encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    const samples: { s: string; strip: string; id: string | null; marked: boolean }[] = JSON.parse(r.stdout);
    // GUARD THE GUARD：Python 真的產生了標記、也真的剝得掉 ⇒ 下面的比對不是空轉
    expect(samples.filter((x) => x.marked && x.id && x.strip !== x.s)).toHaveLength(3);
    const { stripLedgerIdMark } = await import(join(REPO, "tools/admin-live/datasets/parallel-board.mjs"));
    const wrong = samples.filter((x) => stripLedgerIdMark(x.s) !== x.strip).map((x) => `${x.marked ? "該剝沒剝" : "不該剝卻剝了"}：${x.s}`);
    expect(wrong, "parallel-board.mjs 的 ID_MARK 與 scripts/ledger_table.py 的格式漂開了").toEqual([]);
  });

  it("board-roll.sh 寫出的戰情版 md ⛔ 不帶身分標記（owner 讀原文）", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ggd-boardroll-id-"));
    const today = spawnSync("date", ["+%Y%m%d"], { encoding: "utf8" }).stdout.trim(); // ⭐ 與腳本同一個時鐘
    const iso = `${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6)}`;
    for (const f of ["scripts/board-roll.sh", "scripts/ledger_table.py"]) cpSync(join(REPO, f), join(tmp, f));
    mkdirSync(join(tmp, "docs/_release"), { recursive: true });
    mkdirSync(join(tmp, "docs/_daily"), { recursive: true });
    writeFileSync(join(tmp, `docs/_release/戰情版-${today}.md`), "# 戰情版\n");
    writeFileSync(
      join(tmp, `docs/_daily/${iso}.md`),
      `## 逐則對票\n\n| 時間 | owner 說了什麼（逐字） | 票 |\n|---|---|---|\n| 10:30 | 帶身分的那一則 <!-- id:0123abcd --> | #1255 |\n`,
    );
    const run = spawnSync("bash", [join(tmp, "scripts/board-roll.sh")], { cwd: tmp, encoding: "utf8" });
    expect(run.status, run.stdout + run.stderr).toBe(0);
    const out = readFileSync(join(tmp, `docs/_release/戰情版-${today}.md`), "utf8");
    expect(out, "board-roll.sh 把帳本列的身分標記原樣寫進 owner 讀的戰情版").not.toContain("<!-- id:");
    expect(out, "那一列根本沒進戰情版 ⇒ 上一條斷言是空轉").toContain("| 10:30 | 帶身分的那一則 | #1255 |");
  });
});
