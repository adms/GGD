/**
 * 技能模板**驗收標準**（票 #450）的兩道薄閘。
 *
 * owner 2026-08-22 要的是**一把尺**（三軸 script + 給 Codex 的合約），
 * ⛔ 不是「把三支修好」。所以這裡驗的也是**尺還準不準**，⛔ 不是缺口變小了沒有。
 *
 * ⚠️ 為什麼**兩條**而不是一條：
 * 只跑 `--check` 的話，`war3map.j` 讀不到（或 JASS 剖析整支壞掉）時，
 * 產生器會很開心地產出一份「每支技能的原作側都是 0」的文件，
 * 而那份文件與磁碟上那份**一致** ⇒ `--check` 綠。
 * ⭐ 一把量到 0 的尺跟一把準的尺，在逐位元組比對面前長得一模一樣（失敗形態⑤）。
 * ⇒ 第二條去問標本**量到了什麼**。
 *
 * ⛔ 它們紅了不要改測試 —— 跑：
 *     python3 tools/skill-audit/audit.py
 * 然後 `git add docs/技能模板驗收標準.md`。
 *
 * 突變紀錄（跑過）：`jassfacts.closure()` 拿掉沿 `EnableTrigger` 展開的那一段
 * （改成 `return list(seeds)`）→ 第二條紅：42-04 世界終結的演出鏈從 2 個群組
 * 掉成 1 個，週期驅動的那一半整段消失。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = join(ROOT, "tools/skill-audit/audit.py");

const run = (args: string[]): { code: number; out: string } => {
  try {
    return { code: 0, out: execFileSync("python3", [SCRIPT, ...args], { cwd: ROOT, encoding: "utf8" }) };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: (err.stdout ?? "") + (err.stderr ?? "") };
  }
};

describe("技能模板驗收標準與產生器同步", () => {
  it("⭐ docs/技能模板驗收標準.md 是從現在這支 audit.py 生出來的 —— 過期就紅", () => {
    // 夾具前提：腳本不在的話下面會以「python 找不到檔」紅，而它說的是別的故事。
    expect(existsSync(SCRIPT), "audit.py 不見了 —— 這條守衛在測空氣").toBe(true);

    const { code, out } = run(["--check"]);
    expect(
      code,
      `合約文件與產生器不同步了。⛔ 不要手改那份文件、⛔ 不要改這條測試 —— 跑：\n` +
        `    python3 tools/skill-audit/audit.py\n再 git add docs/。\n腳本說：${out.trim()}`,
    ).toBe(0);
  });

  it("🔴 尺真的量得到東西：標本的 JASS 演出鏈**跨得過 `EnableTrigger`**", () => {
    // 42-04 世界終結：rawcode 只掛在施法那一個 trigger，而它承諾的連續打擊住在
    // 它 `EnableTrigger` 起來的週期 trigger 裡。⛔ 不跟著那條邊走，audit 會對著
    // 一支「原作只打 1 下」的技能報「沒有缺口」—— 一個綠燈，而缺口有 11 下。
    const { code, out } = run(["--id", "godie-n01g.r", "--json", "-"]);
    expect(code, `量單支失敗了：${out.trim()}`).toBe(0);
    const rows = JSON.parse(out) as {
      chain: string[];
      src: { periodicSec: number | null };
      promised: { hits: number | null };
    }[];
    expect(rows.length, "`--id` 一支都沒回 —— 標本被改名或被刪了").toBe(1);
    const row = rows[0]!;

    expect(row.chain.length, "演出鏈只剩施法那一個群組 —— `EnableTrigger` 那條邊沒被走").toBeGreaterThan(1);
    expect(row.src.periodicSec, "週期驅動的那一半沒被看到（它正是連續打擊住的地方）").not.toBeNull();
    // ⭐ 卡面承諾要讀得出來（剝台詞那一關若壞了，這裡會是 null）。
    // ⛔ 刻意不斷言**次數是多少** —— 那是內容，會被改；壞掉的是「讀不讀得到」。
    expect(row.promised.hits, "讀不到卡面承諾的次數 —— 傷害軸少了一半的輸入").not.toBeNull();
  });
});
