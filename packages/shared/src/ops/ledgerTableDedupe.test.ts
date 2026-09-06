/**
 * ledgerTableDedupe.test.ts —— 同一句 owner 原話在帳本裡只准有**一列**（GH#1028）。
 *
 * 量到的病：`ruling.sh` 用**執行時間**當列鍵、`message-ledger.sh` 用**訊息時間**，
 * 同一句話插兩次 ⇒ 兩列，一列對了票、一列永遠 ⏸ 未對票。
 * ⭐ 修在兩個寫入端**共用**的 `ledger_table.py` 插入路徑：以**文字**找既有列，有就併票號、時間取較早。
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

describe("scripts/ledger_table.py 同一句話只有一列", () => {
  it("建置器先插（訊息時間、未對票）→ ruling.sh 再插（執行時間、有票）⇒ 一列、票併入、時間取較早", () => {
    const md = join(mkdtempSync(join(tmpdir(), "ggd-ledger-")), "2026-09-06.md");
    insert(md, "01:31", "⏸ 未對票");
    insert(md, "01:32", "#1021 #991");
    const r = rows(md);
    expect(r, "⛔ 同一句話出現兩列 —— 那正是 GH#1028 的病").toHaveLength(1);
    expect(r[0]).toMatch(/^\| 01:31 \|/);
    expect(r[0]).toContain("1021");
    expect(r[0]).not.toContain("未對票");
    // 反方向①：不同的話**要**變成第二列（⛔ 不可以為了去重把一切併成一列）
    insert(md, "01:40", "#1027", "你不是有跟 codex 溝通的方式嗎?");
    expect(rows(md)).toHaveLength(2);
    // 反方向②：⭐ **同樣的短話、不同的時間**是兩則訊息（owner 說了兩次「ok」）——
    //   第一版只比文字，`--dedupe` 當場把 09-05 的 01:25 與 01:49 兩個「ok」併成一列。
    insert(md, "01:25", "— 確認", "ok");
    insert(md, "01:49", "— 確認", "ok");
    expect(rows(md), "⛔ 兩個相隔 24 分鐘的「ok」被併成一列 —— 鑰匙又漂了").toHaveLength(4);
    // ⭐ 2026-09-06 04:03/04:07（A 落地前留下的）：前 24 字相同、之後接的是我的改述 ⇒ 一列，留早的（逐字）那一份
    const V = "你先開票把公式改成你說的 乘數 = 1 + M × 法強/(法強+K) M 先預設10, K先預設100 滿足 你說的 怎麼量 C1 普攻流也能抗衡";
    insert(md, "04:03", "⏸ 未對票", V);
    insert(md, "04:07", "#1029", "你先開票把公式改成你說的 乘數 = 1 + M × 法強/(法強+K) M 先預設10, K先預設100 滿足 C1 普攻流也能抗衡(勝率40-60%) / C2");
    expect(rows(md), "⛔ 前 24 字相同、4 分鐘內、一列有票一列沒有 —— 就是 #1028 的病").toHaveLength(5);
    expect(rows(md)[4]).toMatch(/^\| 04:03 \|.*怎麼量 C1.*\| #1029 \|$/);
    // 反方向③：⭐ 13:00/13:09 —— 後者逐字是前者的**一段**（⛔ 不是前綴）而相隔 9 分鐘 ⇒ 兩則，⛔ 不併
    insert(md, "13:00", "#1", "先不要合併 ① main 的六維公式接上出貨 ② 用新係數重量一次 M/K —— 確認 15/1000 還對不對?");
    insert(md, "13:09", "#2", "用新係數重量一次 M/K —— 確認 15/1000 還對不對?");
    expect(rows(md), "⛔ 子字串就併 ⇒ owner 再講一次的那一段被吃掉").toHaveLength(7);
  });

  it("--dedupe 把已經存在的重複列併掉（一次性清理）", () => {
    const md = join(mkdtempSync(join(tmpdir(), "ggd-ledger-")), "2026-09-05.md");
    insert(md, "02:00", "#991 #993", "P0, P1, P2 可以開票但基於是英雄層級到技能, 機制, 特效 各層都可以有模板設定及微調的前提");
    // 直接造一列重複（模擬舊寫入端留下的），⛔ 不經過插入路徑的去重
    const raw = readFileSync(md, "utf8").replace(/\n$/, "");
    writeFileSync(md, raw + "\n| 02:04 | P0, P1, P2 可以開票但基於是英雄層級到技能, 機制, 特效 各層都可以有模板設定及微調的前提 | ⏸ 未對票 |\n");
    expect(rows(md)).toHaveLength(2);
    const r = spawnSync("python3", [CLI, "--dedupe", md], { encoding: "utf8", cwd: REPO });
    expect(r.status, r.stderr).toBe(0);
    expect(rows(md)).toHaveLength(1);
    expect(rows(md)[0]).toContain("991");
  });
});
