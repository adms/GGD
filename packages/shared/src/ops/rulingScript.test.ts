/**
 * rulingScript.test.ts —— 裁決要落在**下一輪真的會讀到的地方**。
 *
 * ⭐ 這兩條治的是「為何每次都拿到錯的資訊」的機制,⛔ 不是潔癖:
 *   `gh issue view N` **只印 body,留言要 `--comments`。只活在留言裡的更正等於不存在。**
 *   —— #447/#446 的 body 至今仍寫著被推翻的數字,而 owner 的更正躺在留言裡。
 * ⛔ 掃原始碼字串對這個形態永遠是綠的(兩支腳本「看起來」都有呼叫 gh),所以照
 * backupRules/memoryTempScript 的先例**真的把腳本跑起來**,用 PATH 前置一支假 `gh`。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const FAKE_GH = `#!/usr/bin/env bash
d="$GH_FAKE_DIR"; echo "$*" >> "$d/calls.log"
case "$*" in
  *"issue view"*--comments*) cat "$d/comments.txt"; exit 0;;
  *"issue view"*)            cat "$d/body.txt";     exit 0;;
  *"issue list"*)            cat "$d/list.txt";     exit 0;;
esac
sub=other; case "$*" in *"issue comment"*) sub=comment;; *"issue edit"*) sub=edit;; esac
prev=""; for a in "$@"; do [ "$prev" = --body-file ] && cp "$a" "$d/$sub-body.md"; prev="$a"; done
`;

function sandbox() {
  const d = mkdtempSync(join(tmpdir(), "ggd-ruling-"));
  mkdirSync(join(d, "bin"));
  writeFileSync(join(d, "bin", "gh"), FAKE_GH, { mode: 0o755 });
  for (const f of ["body.txt", "comments.txt", "list.txt"]) writeFileSync(join(d, f), "");
  const PATH = `${join(d, "bin")}:${process.env.PATH}`;
  return { d, env: { ...process.env, PATH, GH_FAKE_DIR: d } };
}

describe("裁決腳本", () => {
  it("ruling.sh 把更正同時寫進留言**與 body 最上面**,且原 body 一個字都沒被洗掉", () => {
    cover("ruling-writes-issue-body");
    const { d, env } = sandbox();
    writeFileSync(join(d, "body.txt"), "原始內容:Lv18 中位有效血量 9,048\n");
    const ledger = join(d, "daily");
    const r = spawnSync("bash", [join(REPO, "scripts/ruling.sh"), "447"], {
      input: "跟主動一樣就好", encoding: "utf8", env: { ...env, GGD_LEDGER_DIR: ledger },
    });
    expect(r.status, r.stderr).toBe(0);

    const calls = readFileSync(join(d, "calls.log"), "utf8");
    expect(calls).toContain("issue comment");
    // ⛔ 少了 edit,更正就只活在留言裡 —— 而 `gh issue view N` 讀不到留言。
    expect(calls, "`gh issue view N` 印 body,留言要 `--comments`。只活在留言裡的更正等於不存在。")
      .toContain("issue edit");
    const body = readFileSync(join(d, "edit-body.md"), "utf8");
    expect(body.split("\n")[0], "更正要在**最上面**,往下捲才看得到等於沒有").toMatch(/^## ⛔ 已被更正（/);
    expect(body).toContain("跟主動一樣就好");
    expect(body, "⛔ 前置,不是覆蓋(第一·五守則:另存/保留)").toContain("Lv18 中位有效血量 9,048");
    const day = readdirSync(ledger).find((f) => f.endsWith(".md"))!;
    expect(readFileSync(join(ledger, day), "utf8")).toContain("跟主動一樣就好");
  });

  /**
   * ⭐ GH#1028 A：列鍵是**訊息時間**（帳本自己宣告的鍵），⛔ 不是執行時間。
   * 假 transcript 放一則「一小時前」的 owner 訊息 ⇒ 列上的 HH:MM 必須是那一則的時間；
   * 接著跑建置器 ⇒ 同一句話仍只有一列（承重的那一條）。
   * ⭐ 夾具刻意用 2026-09-06 12:28 量到的形狀：我記的裁決**掉了 owner 開頭三個字、尾巴接了我的註**
   *   （A 落地之後仍重複的那一對）⇒ 訊息時間要找得到、併列之後留的是 owner 的原話、`--check` 綠。
   * ⚠️ jsonl 要**緊湊**（`"type":"user"` 不帶空白）—— 建置器的 bytes 粗篩就是這麼篩的。
   */
  it("ruling.sh 的列鍵＝transcript 裡那一則的時間；再跑建置器仍只有一列（且留 owner 原話）", () => {
    const { d, env } = sandbox();
    const tx = join(d, "tx"); mkdirSync(tx);
    const said = new Date(Date.now() - 3600_000);
    const local = new Date(said.getTime() + 8 * 3600_000);                 // 帳本按 GMT+8 分日
    const [day, hhmm] = [local.toISOString().slice(0, 10), local.toISOString().slice(11, 16)];
    const SAID = "好吧 先開票 血量倍率4x, M=15 K=1000（測試夾具）";
    const RULED = "血量倍率4x, M=15 K=1000（測試夾具） （⇒ 我接在後面的註記，⛔ 不是 owner 說的）";
    writeFileSync(join(tx, "s.jsonl"), JSON.stringify({
      type: "user", timestamp: said.toISOString(), message: { role: "user", content: SAID },
    }) + "\n");
    const ledger = join(d, "daily");
    const E = { ...env, GGD_LEDGER_DIR: ledger, GGD_TRANSCRIPT_DIR: tx, GGD_LEDGER_NO_REGEN: "1" };
    const r = spawnSync("bash", [join(REPO, "scripts/ruling.sh"), "1028"], { input: RULED, encoding: "utf8", env: E, cwd: REPO });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout, "沒去 transcript 找 ⇒ 還是執行時間").toContain("列鍵＝訊息時間");
    const rows = () => readFileSync(join(ledger, `${day}.md`), "utf8").split("\n").filter((l) => /^\| \d{1,2}:\d{2} \|/.test(l));
    expect(rows()[0], "列鍵不是那一則的時間").toMatch(new RegExp(`^\\| ${hhmm} \\|`));
    const b = spawnSync("bash", [join(REPO, "scripts/message-ledger.sh"), "--date", day], { encoding: "utf8", env: E, cwd: REPO });
    expect(b.status, b.stderr).toBe(0);
    expect(rows(), "建置器又插了一列 ⇒ 兩個寫入端的鍵仍不一致").toHaveLength(1);
    expect(rows()[0]).toContain("1028");
    expect(rows()[0], "併列要留 owner 的原話，⛔ 不是我的改述").toContain("好吧 先開票");
    const c = spawnSync("bash", [join(REPO, "scripts/message-ledger.sh"), "--check", "--date", day], { encoding: "utf8", env: E, cwd: REPO });
    expect(c.status, `併完之後 --check 還紅：${c.stdout}`).toBe(0);
  });

  it("asked-before.sh 命中時印出**那段文字本身**,⛔ 不是只有票號", () => {
    const { d, env } = sandbox();
    const KW = "ZZ樣本關鍵字";
    writeFileSync(join(d, "list.txt"), `  #447 open — ${KW} 的票\n`);
    writeFileSync(join(d, "comments.txt"), `前言\nowner:${KW} => 答案是三十秒\n後記\n`);
    const r = spawnSync("bash", [join(REPO, "scripts/asked-before.sh"), KW], { encoding: "utf8", env });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout, "票號不是答案 —— 印不出原文我就會再問 owner 一次").toContain("答案是三十秒");
  });
});
