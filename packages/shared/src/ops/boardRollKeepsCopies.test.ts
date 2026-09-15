/**
 * ⭐ GH#1256 —— owner 2026-09-15：「「戰情版」有三份同名的檔=> 用時間區隔 全部都要備份」
 * ⛔ 在此之前 board-roll.sh 只在**換日那一刻**留底；同一天就地改寫幾十次一次都不留。
 *
 * 在暫存樹上**真的跑出貨的** board-roll.sh：
 *   ① 改寫當日戰情版之前留一份 `戰情版_temp_{時間}.md`，內容＝改寫**前**
 *   ② 內容沒變 ⇒ 不再多留
 *   ③ 同一分鐘已經有一份 ⇒ ⛔ 不蓋舊的
 *   ④ --check：根目錄捷徑不存在（它不進 git）⇒ 放行；存在但指錯 ⇒ 紅（兩個方向）
 * 體驗層（工具腳本），接線類突變一次，紀錄見 commit 訊息。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(__dirname, "../../../..");
const sh = (cmd: string, args: string[], cwd?: string) => spawnSync(cmd, args, { cwd, encoding: "utf8" });

describe("GH#1256 board-roll.sh 用時間區隔留底", () => {
  it("★ 改寫前留一份、沒變不留、舊的不蓋；--check 對捷徑兩個方向", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ggd-boardroll-keep-"));
    const today = sh("date", ["+%Y%m%d"]).stdout.trim(); // ⭐ 與腳本同一個時鐘
    const iso = `${today.slice(0, 4)}-${today.slice(4, 6)}-${today.slice(6)}`;
    for (const f of ["scripts/board-roll.sh", "scripts/ledger_table.py"]) cpSync(join(REPO, f), join(tmp, f));
    for (const d of ["docs/_release", "docs/_daily"]) mkdirSync(join(tmp, d), { recursive: true });
    const board = join(tmp, `docs/_release/戰情版-${today}.md`);
    const ledger = join(tmp, `docs/_daily/${iso}.md`);
    writeFileSync(board, "# 戰情版\n");
    writeFileSync(ledger, "| 時間 | 話 | 票 |\n|---|---|---|\n| 10:30 | 第一則 | #1256 |\n");
    const roll = (...a: string[]) => sh("bash", ["scripts/board-roll.sh", ...a], tmp);
    const temps = () => readdirSync(join(tmp, "docs/_release")).filter((n) => n.startsWith("戰情版_temp_"));
    const read = (n: string) => readFileSync(join(tmp, "docs/_release", n), "utf8");

    expect(roll().status).toBe(0);
    expect(temps().map(read), "① 改寫了戰情版卻沒有留底，或留的不是改寫前那一份").toEqual(["# 戰情版\n"]);

    expect(roll().status).toBe(0);
    expect(temps(), "② 內容沒變也多留了一份").toHaveLength(1);

    const minute = join(tmp, `docs/_release/戰情版_temp_${sh("date", ["+%Y%m%d-%H%M"]).stdout.trim()}.md`);
    writeFileSync(minute, "SENTINEL");
    const before = readFileSync(board, "utf8");
    appendFileSync(ledger, "| 10:31 | 第二則 | #1256 |\n");
    expect(roll().status).toBe(0);
    expect(readFileSync(minute, "utf8"), "③ 同一分鐘的舊副本被蓋掉了").toBe("SENTINEL");
    expect(temps().map(read), "③ 第二次改寫沒有留底").toContain(before);

    rmSync(join(tmp, "GGD戰情版.md"));
    const noLink = roll("--check");
    expect(noLink.status, `④ 捷徑不在（不進 git）就紅了\n${noLink.stdout}`).toBe(0);
    symlinkSync("docs/_release/戰情版-20000101.md", join(tmp, "GGD戰情版.md"));
    expect(roll("--check").status, "④ 捷徑指錯卻放行").toBe(1);
  });
});
