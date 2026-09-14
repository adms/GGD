/**
 * ledgerTableDedupe.test.ts —— 帳本只認**逐字同一則**（同一分鐘 ＋ 同一段文字），⛔ 其餘一律各留一列。
 *
 * owner 2026-09-12（逐字）：
 * > 「我沒說過 我的原則**一定是詳實記錄不會合併** 這應該是你自己說的 **請你要查證我說的話出處**」
 *
 * ⚠️ 這一支在此之前守的是**相反**的東西（GH#1028：「同一句話只准一列」，15 分鐘窗 ＋ 3 分鐘子字串併列）——
 * ⛔ 而 #1028 是我自己開的票，`asked-before.sh` 掃不到一則 owner 原話支持合併；`00e70d518` 拿掉了合併，
 * 這支的期望就過期了（它紅的正是 owner 要的行為）。⇒ 改成守 owner 的原則，**兩個方向**都要：
 *   · ⭐ 該各留一列的（不同分鐘的同一句、「ok」×2、前 24 字相同、子字串）⇒ 各留一列 —— 承重
 *   · 該認得的（兩個寫入端記同一則：同一分鐘 ＋ 同一段文字／截斷前綴）⇒ 一列、票號取聯集
 *
 * 靈魂層以外（工具腳本）⇒ 一條承重守衛 ＋ 一次突變（commit 訊息記）。真的跑 CLI、真的讀表。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const CLI = join(REPO, "scripts/ledger_table.py");
const TEXT = "Discord 為什麼不發 => 說過了 你可以發優化系統 但你可以想想其實有很多間接影響的可能";

function insert(md: string, when: string, ticket: string, text = TEXT) {
  const r = spawnSync("python3", [CLI, md, when, ticket], { input: text, encoding: "utf8", cwd: REPO });
  expect(r.status, r.stderr).toBe(0);
}
const rows = (md: string) => readFileSync(md, "utf8").split("\n").filter((l) => /^\| \d{1,2}:\d{2} \|/.test(l));

describe("scripts/ledger_table.py 只認逐字同一則（⛔ 不合併 —— owner 2026-09-12）", () => {
  it("同一分鐘＋同一段文字 ⇒ 一列、票併入；其餘（不同分鐘、ok×2、前 24 字相同、子字串）⇒ 各留一列", () => {
    const md = join(mkdtempSync(join(tmpdir(), "ggd-ledger-")), "2026-09-06.md");
    // 兩個寫入端記**同一則**（建置器先插、ruling.sh 以訊息時間再插）⇒ 一列，票號併入
    insert(md, "01:31", "⏸ 未對票");
    insert(md, "01:31", "#1021 #991");
    expect(rows(md), "同一分鐘＋同一段文字是同一則 —— 寫兩列就是兩個寫入端的鍵沒對齊").toHaveLength(1);
    expect(rows(md)[0]).toMatch(/^\| 01:31 \|.*1021.*991/);
    expect(rows(md)[0]).not.toContain("未對票");
    // ⭐ 承重：同一句話、**晚一分鐘** ⇒ 第二列（在此之前 15 分鐘窗會把它併掉 —— owner 說過的話就此消失）
    insert(md, "01:32", "#1021");
    expect(rows(md), "⛔ 不同分鐘的同一句被併成一列 —— owner：「詳實記錄不會合併」").toHaveLength(2);
    expect(rows(md)[1]).toMatch(/^\| 01:32 \|/);
    insert(md, "01:40", "#1027", "你不是有跟 codex 溝通的方式嗎?");
    expect(rows(md)).toHaveLength(3);
    // 「ok」說了兩次是兩則訊息
    insert(md, "01:25", "— 確認", "ok");
    insert(md, "01:49", "— 確認", "ok");
    expect(rows(md)).toHaveLength(5);
    // 前 24 字相同、相隔 4 分鐘 ⇒ 兩列，而早的那一份（逐字）一個字都沒被後來的換掉
    const V = "你先開票把公式改成你說的 乘數 = 1 + M × 法強/(法強+K) M 先預設10, K先預設100 滿足 你說的 怎麼量 C1 普攻流也能抗衡";
    insert(md, "04:03", "⏸ 未對票", V);
    insert(md, "04:07", "#1029", "你先開票把公式改成你說的 乘數 = 1 + M × 法強/(法強+K) M 先預設10, K先預設100 滿足 C1 普攻流也能抗衡(勝率40-60%) / C2");
    expect(rows(md), "⛔ 前 24 字相同就跨分鐘併列").toHaveLength(7);
    expect(rows(md)[5]).toMatch(/^\| 04:03 \|.*怎麼量 C1.*\| ⏸ 未對票 \|$/);
    expect(rows(md)[6]).toMatch(/^\| 04:07 \|.*\| #1029 \|$/);
    // 後者逐字是前者的**一段**、相隔 9 分鐘 ⇒ 兩則
    insert(md, "13:00", "#1", "先不要合併 ① main 的六維公式接上出貨 ② 用新係數重量一次 M/K —— 確認 15/1000 還對不對?");
    insert(md, "13:09", "#2", "用新係數重量一次 M/K —— 確認 15/1000 還對不對?");
    expect(rows(md), "⛔ 子字串就併 ⇒ owner 再講一次的那一段被吃掉").toHaveLength(9);
    // 同一分鐘、一份是另一份的**截斷前綴**（建置器 300 字截斷 vs ruling.sh 全文）⇒ 同一則，留完整那份
    const L = "血量倍率4x, M=15 K=1000 這一段要夠長才會被建置器截斷 所以後面再接一些字讓它超過截斷點的長度";
    insert(md, "13:20", "#1300", L);
    insert(md, "13:20", "⏸ 未對票", L.slice(0, 30) + "…");
    expect(rows(md)).toHaveLength(10);
    expect(rows(md)[9]).toMatch(/^\| 13:20 \|.*超過截斷點的長度 \| #1300 \|$/);
  });

  it("--dedupe 只併逐字同一則（同一分鐘），相隔幾分鐘的重講一律留著", () => {
    const md = join(mkdtempSync(join(tmpdir(), "ggd-ledger-")), "2026-09-05.md");
    const P = "P0, P1, P2 可以開票但基於是英雄層級到技能, 機制, 特效 各層都可以有模板設定及微調的前提";
    insert(md, "02:00", "#991 #993", P);
    // 直接造兩列（模擬舊寫入端留下的），⛔ 不經過插入路徑：一列同一分鐘的真重複、一列 owner 4 分鐘後重講
    const raw = readFileSync(md, "utf8").replace(/\n$/, "");
    writeFileSync(md, `${raw}\n| 02:00 | ${P} | ⏸ 未對票 |\n| 02:04 | ${P} | ⏸ 未對票 |\n`);
    expect(rows(md)).toHaveLength(3);
    const r = spawnSync("python3", [CLI, "--dedupe", md], { encoding: "utf8", cwd: REPO });
    expect(r.status, r.stderr).toBe(0);
    expect(rows(md), "同一分鐘的真重複要併掉、02:04 的重講要留著（2026-09-11 17:45/17:47/17:56 那一次）").toHaveLength(2);
    expect(rows(md)[0]).toMatch(/^\| 02:00 \|.*991/);
    expect(rows(md)[1]).toMatch(/^\| 02:04 \|/);
  });
});
