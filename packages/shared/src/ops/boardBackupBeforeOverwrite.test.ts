/**
 * 戰情板產生器**覆蓋前要留底**（owner 2026-08-29：「每次產生記得都有備份」）。
 *
 * ⚠️ 為什麼需要這一條：`scripts/preserve-before-overwrite.py` 那道 hook 只攔
 * Write／Edit／shell 重導 —— ⛔ 對 **Python 檔案 API 直寫是瞎的**，
 * 而 `gen_board.py` 正是那樣寫檔。⇒ 這份戰情板 2026-08-20 被 `cat >` 洗掉過一次，
 * 唯一副本在 scratchpad 且未版控 ⇒ **救不回來**。
 *
 * ⭐ 這條守衛**真的把產生器跑起來**（⛔ 不是掃原始碼字串）：
 * 在 temp 樹放一份假的舊板 → 跑 → 斷言 legacy 底下真的多出一份**內容等於舊板**的副本。
 *
 * 突變紀錄：把 `_preserve_previous()` 那一行拿掉 → 紅（legacy 沒有副本）。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, cpSync, chmodSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("gen_board.py 覆蓋前留底（GH#865）", () => {
  it("舊的那一份被複製進 legacy，且內容一模一樣", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ggd-board-"));
    // 只複製產生器需要的最小輸入 —— ⛔ 不 clone 整個 repo。
    for (const d of ["tools/board", "docs/_daily", "docs/_release"]) {
      const src = join(REPO, d);
      if (existsSync(src)) cpSync(src, join(tmp, d), { recursive: true });
    }
    // ⚠️ 產物隔離區把出貨檔設成 444，而 `cpSync` 把那個模式一起複製過來
    //   ⇒ ⛔ 夾具寫不進去。這裡解鎖的是 **temp 樹**，⛔ 不動 repo。
    const unlockAll = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const f = join(dir, e.name);
        if (e.isDirectory()) unlockAll(f);
        else chmodSync(f, (statSync(f).mode & 0o777) | 0o200);
      }
    };
    unlockAll(tmp);
    mkdirSync(join(tmp, "docs/legacy/_overwrites"), { recursive: true });

    const board = join(tmp, "docs/_release/ggd-board.html");
    const SENTINEL = "<!-- 這是即將被覆蓋的舊板 SENTINEL-8f3a -->";
    writeFileSync(board, SENTINEL, "utf-8");

    execFileSync("python3", [join(tmp, "tools/board/gen_board.py")], { cwd: tmp, encoding: "utf-8" });

    const ow = join(tmp, "docs/legacy/_overwrites");
    const copies = readdirSync(ow)
      .filter((d) => d.startsWith("overwrite_temp_"))
      .map((d) => join(ow, d, "docs/_release/ggd-board.html"))
      .filter(existsSync);

    expect(
      copies.length,
      "⛔ 產生器覆蓋了戰情板卻**沒有留底** —— hook 對 Python 直寫是瞎的，" +
        "所以留底必須由 `gen_board.py` 的 `_preserve_previous()` 自己做。",
    ).toBeGreaterThan(0);
    expect(readFileSync(copies[0]!, "utf-8"), "⛔ 留底的內容不是被覆蓋的那一份").toBe(SENTINEL);

    const ledger = join(tmp, "docs/legacy/_overwrites/_ledger.tsv");
    expect(existsSync(ledger) && readFileSync(ledger, "utf-8").includes("gen_board"), "⛔ 沒記進同一本帳").toBe(true);
  });
});
