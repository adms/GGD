/**
 * #541 —— 「連段→收尾」29 個 JASS 函式的對照表不可以無聲過期。
 *
 * owner 2026-08-22：「⭐ **間隔就是動畫節奏的來源**」。那些秒數是從
 * `war3map.j` **逐字抄**的（⛔ 沒有四捨五入、⛔ 沒有統一成 0.12），
 * 所以它們一旦被手改、或重掃之後對不上，動畫節奏就會跟原作說謊 ——
 * 而 `content:build` 與全套測試對這件事**全部是綠的**（第一·五守則的形狀）。
 *
 * 做法跟 `skillRemakeDocsFresh.test.ts` 一樣：**真的把 python 跑起來**
 * （`--check` 唯讀、過期回非零），⛔ 不是掃原始碼字串（失敗形態⑥）。
 *
 * ⚠️ 它紅了**不要改這條測試**，跑：
 *     python3 tools/jass-combo/extract.py
 * 然後 `git add content/config/combo-strikes.json docs/_reference/jass-combo-29.md`。
 *
 * 突變紀錄：
 *   · 把 combo-strikes.json 裡 `superff7` 的第一段 0.2 改成 0.12 → 紅（--check 回 1，
 *     訊息指名 content/config/combo-strikes.json）
 *
 * ⚠️⚠️ **上面點名的檔是產生器的產物,⛔ 不是可以直接編的東西。**
 * 改之前先查它是誰的:`bash scripts/genguard.sh content/config/combo-strikes.json`
 *   · `content/config/combo-strikes.json` 是 **jasscombo:build** 的產物,而且住在**產物隔離區**
 *     (chmod 444 —— 用檔案 API 直寫會吃 PermissionError,⛔ 不是靜默成功)。
 *   · 要動它:改**來源**再 `bash scripts/genrun.sh jasscombo:build`。⛔ 手改出貨 JSON 會被下一次
 *     sync 打回來,而那個「又紅了」看起來像**新的**錯(owner 2026-08-24:「發生上百次」)。
 *   · ⭐ **精確範圍**(逐支讀過那支產生器,⛔ 不是照抄稽核的一句話):
 *     tools/jass-combo/extract.py 從 JASS 重建**整份** ⇒ 手改必被 jasscombo:check 判 stale。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = join(ROOT, "tools/jass-combo/extract.py");

describe("JASS 連段對照表", () => {
  it("⭐ 29 列的間隔仍然逐字等於 war3map.j —— 過期就紅", () => {
    cover("jass-combo-table-fresh");
    // 夾具前提：腳本不在的話下面那個 try 會吞掉一切，這條守衛就變成永遠綠。
    expect(existsSync(SCRIPT), "extract.py 不見了 —— 這條守衛在測空氣").toBe(true);

    let code = 0;
    let out = "";
    try {
      out = execFileSync("python3", [SCRIPT, "--check"], { cwd: ROOT, encoding: "utf8" });
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      code = err.status ?? 1;
      out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    }
    expect(
      code,
      `連段表與 war3map.j 不同步了。⛔ 不要改這條測試 —— 跑：\n` +
        `    python3 tools/jass-combo/extract.py\n` +
        `再把 content/config/combo-strikes.json 與 docs/_reference/jass-combo-29.md ` +
        `一起 commit。\n腳本說：${out.trim()}`,
    ).toBe(0);
  });
});
