/**
 * rulingScript.test.ts —— 裁決要落在**下一輪真的會讀到的地方**。
 *
 * ⭐ 這兩條治的是「為何每次都拿到錯的資訊」的機制,⛔ 不是潔癖:
 *   `gh issue view N` **只印 body,留言要 `--comments`。只活在留言裡的更正等於不存在。**
 *   —— #447/#446 的 body 至今仍寫著被 owner 推翻的數字,而更正躺在留言裡。
 *
 * ⛔ 掃原始碼字串對這個形態永遠是綠的(兩支腳本「看起來」都有呼叫 gh),
 * 所以照 backupRules / memoryTempScript 的先例**真的把腳本跑起來**,
 * 用 PATH 前置一支假 `gh` 收集它到底下了哪些子指令。
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
  return { d, env: { ...process.env, PATH: `${join(d, "bin")}:${process.env.PATH}`, GH_FAKE_DIR: d } };
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
    // ⛔ 少了這一行,更正就只活在留言裡 —— 而 `gh issue view N` 讀不到留言。
    expect(calls, "`gh issue view N` 印 body,留言要 `--comments`。只活在留言裡的更正等於不存在。")
      .toContain("issue edit");

    const body = readFileSync(join(d, "edit-body.md"), "utf8");
    expect(body.split("\n")[0], "更正要在**最上面**,往下捲才看得到等於沒有").toMatch(/^## ⛔ 已被更正（/);
    expect(body).toContain("跟主動一樣就好");
    expect(body, "⛔ 前置,不是覆蓋(第一·五守則:另存/保留)").toContain("Lv18 中位有效血量 9,048");

    const day = readdirSync(ledger).find((f) => f.endsWith(".md"))!;
    expect(readFileSync(join(ledger, day), "utf8")).toContain("跟主動一樣就好");
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
