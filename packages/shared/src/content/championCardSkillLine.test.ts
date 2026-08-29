/**
 * champion 卡面「(可學習的)技能：」行 ↔ 實際掛的技能名（GH#814，接手 #764 AC2/AC5）。
 *
 * ⭐ **這條閘只對「真接錯」紅，⛔ 不對「改名」紅。** 兩者長得一模一樣，而它們
 * 完全相反：GGD 有自己的命名層（記憶 `ggd-naming-layer`：**改名不是缺陷，數值／
 * 行為／編號才是**），所以把 45 格對不上的名字全部當缺陷去「修」，會毀掉刻意取的名字。
 *
 * ⚠️ 票文逐字警告過另一半：「今天直接開閘 ＝ 29 列棘輪，而訊號會被雜訊完全埋掉」。
 * ⇒ 45 格裡 **39 格是推導的**（29 格「GGD 名字＝原作技能自己的名字」⇒ 對不上的是
 *   **原作的英雄卡面清單**；10 格 `provenance=owner-spec` ⇒ 階梯第 1 層贏第 4 層），
 *   只有 **6 格**進帶理由的帳本。豁免表越短，第 7 列出現時才有人看。
 *
 * 做法跟 `skillRemakeDocsFresh.test.ts` 一樣：**真的把腳本跑起來**（`--check`，唯讀、
 * 回非零），⛔ 不是掃原始碼字串（失敗形態⑥），也⛔ 不把 45／29／6 這些會變的數字
 * 抄進斷言（第四個住處必過期）。
 *
 * 它紅了 ⛔ **不要改這條測試**，跑：
 *     python3 tools/champion-cards/skill_line_audit.py
 * 先判那一格是①合法改名還是②接錯，再決定改內容或補一列帳本。
 *
 * 突變紀錄：
 *   · 從 `skill-line-naming.json` 拿掉 `godie-osam.Q` 那一列 → 紅（`--check` 回 1，
 *     訊息指名 `godie-osam.Q`、GGD 名與原作名）→ 放回去。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = join(ROOT, "tools/champion-cards/skill_line_audit.py");
const LEDGER = join(ROOT, "tools/champion-cards/skill-line-naming.json");

describe("champion 卡面的技能行", () => {
  it("⭐ 沒有接錯的槽位，而每一格改名都解釋得出來（⛔ 不對合法改名紅）", () => {
    cover("champion-card-skill-line");
    // 夾具前提：這兩個檔不在的話，下面的 try 會把一切吞掉 ⇒ 守衛永遠綠。
    expect(existsSync(SCRIPT), "skill_line_audit.py 不見了 —— 這條守衛在測空氣").toBe(true);
    expect(existsSync(LEDGER), "命名帳本不見了 —— 每一格改名都會變成未分類").toBe(true);

    let code = 0;
    let out = "";
    try {
      out = execFileSync("python3", [SCRIPT, "--check"], { cwd: ROOT, encoding: "utf8" });
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      code = err.status ?? 1;
      out = (err.stdout ?? "") + (err.stderr ?? "");
    }
    expect(
      code,
      "⛔ 不要改這條測試。跑 `python3 tools/champion-cards/skill_line_audit.py` 看是哪一格，\n" +
        "  🚨 接錯（編號重複／英雄段不一致／01..04 缺號）⇒ 修內容\n" +
        "  ⛔ 未分類的改名 ⇒ 判成①合法改名就在 skill-line-naming.json 補一列**帶理由**的登記\n" +
        `腳本說：\n${out.trim()}`,
    ).toBe(0);
  });
});
