/**
 * 📋 守則犯錯帳本是**活的** —— owner 2026-08-27：「記成一張表…統計每次犯錯的頻率及原因」。
 *
 * ## 這條閘在問什麼（⛔ 不是「那個檔存在嗎」）
 * 一份**統計**只有在兩件事同時成立時才有意義：①統計區與資料列一致（⛔ 不是手改的）
 * ②每一列的代號都在**封閉詞彙表**裡。⭐ 第②條是重點：打錯一個字的代號會把
 * 「同一種錯」分裂成兩列，於是「最常犯的是什麼」這個問題**靜默地得到錯的答案** ——
 * 而那正是這張表存在的唯一理由。
 *
 * ⚠️ 它刻意**不**斷言筆數或內容：帳本只會變長，釘任何數字都會在下一次犯錯時
 * 用一個與缺陷無關的訊息紅掉（第〇守則：出貨數值不住測試裡，這裡同理）。
 *
 * ── 突變紀錄（一批一條）──────────────────────────────────────────────────
 *  · 在 `docs/守則犯錯.md` 插一列用不存在的代號（例 `技術-離開碼X`）
 *    → `--check` 非零並逐列指名 → 這一條紅。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = join(REPO, "scripts/rule-slip.sh");
const LEDGER = join(REPO, "docs/守則犯錯.md");

describe("守則犯錯帳本 (rule-slip-ledger)", () => {
  it("⭐ 帳本與記錄指令都在（⛔ 少了任何一半，這條規則就退回散文）", () => {
    expect(existsSync(LEDGER), "docs/守則犯錯.md 不見了").toBe(true);
    expect(existsSync(SCRIPT), "scripts/rule-slip.sh 不見了 —— 沒有指令就不會有人記").toBe(true);
    const md = readFileSync(LEDGER, "utf8");
    for (const mark of ["<!-- SLIP_STATS_BEGIN -->", "<!-- SLIP_STATS_END -->", "<!-- SLIP_ROWS -->"]) {
      expect(md.includes(mark), `帳本缺標記 ${mark} —— 產生器會拒絕寫入`).toBe(true);
    }
  });

  it("⭐ `--check` 是 0：統計區與資料列一致，而且沒有一個代號在詞彙表外", () => {
    // ⭐ 真的把腳本跑起來，⛔ 不是掃字串（第二守則失敗形態⑥）。
    let out = "";
    let code = 0;
    try {
      out = execFileSync("bash", [SCRIPT, "--check"], { cwd: REPO, encoding: "utf8" });
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      code = e.status ?? 1;
      out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    }
    expect(
      code,
      `⛔ 守則犯錯帳本不一致。⛔ 不要改這條測試 —— 跑：\n` +
        `  bash scripts/rule-slip.sh --stats\n` +
        `（代號打錯的話它會逐列指名；代號只准用 tools/rule-slip/ledger.py 的詞彙表）\n\n` +
        out,
    ).toBe(0);
  });

  it("CLAUDE.md 真的把它寫成守則（owner:「請你記到開發守則」）", () => {
    const rules = readFileSync(join(REPO, "CLAUDE.md"), "utf8");
    expect(rules.includes("守則犯錯.md"), "CLAUDE.md 沒提到這份帳本 —— 那它就不是守則").toBe(true);
    expect(
      rules.includes("scripts/rule-slip.sh"),
      "CLAUDE.md 沒給記錄指令 —— 只寫「要記得記」就是這份文件記過五次的失效形態",
    ).toBe(true);
  });
});
