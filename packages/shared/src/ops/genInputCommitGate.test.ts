/**
 * genInputCommitGate.test.ts —— 改到的檔是某支產生器的**輸入** ⇒ 那支的產物要在**同一個 commit** 裡（GH#1026 ③）。
 *
 * 量到的病（2026-09-06 一夜三次）：`ruling.sh`／`ledger_table.py --map` 寫 `docs/_daily`，
 * `board:build` 的 `ggd-board.html` 沒跟著重生成 ⇒ `skills:check` 紅 —— 而紅的是 Codex 的 PR。
 * ⭐ 對照表**從 `tools/parallel-gates/sync-io.json` 的 `reads` 推導**，⛔ 不手寫 ⇒ 這裡把**出貨那一份表**
 *   拷進暫存 repo（⛔ 不自己造一份會漂的迷你表），真的把 PreToolUse 事件餵進 hook。
 * 三個方向：該擋的擋（產物比輸入舊 / 產物變了卻沒列進 commit）· 該放的放（兩者同一個 commit）·
 *   ⭐ 它真的在讀那張表（把 board:build 的 reads 清空 ⇒ 同一個該擋的 commit 放行）。
 * 突變（一次，commit 訊息記）：`_geninput_violations()` 的推導拿掉 ⇒ ① 紅。
 */
import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(__dirname, "../../../..");
const TABLE = "tools/parallel-gates/sync-io.json";
const LEDGER = "docs/_daily/2026-01-01.md";
const BOARD = "docs/_release/ggd-board.html";

function box() {
  const b = mkdtempSync(join(tmpdir(), "ggd-1026-"));
  for (const d of ["docs/_daily", "docs/_release", "tools/parallel-gates"]) mkdirSync(join(b, d), { recursive: true });
  copyFileSync(join(REPO, TABLE), join(b, TABLE));
  writeFileSync(join(b, LEDGER), "| 01:00 | a | 1 |\n");
  writeFileSync(join(b, BOARD), "<html>old</html>\n");
  const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: b });
  git("init", "-q"); git("add", "-A"); git("commit", "-qm", "init");
  writeFileSync(join(b, LEDGER), "| 01:00 | a | 1 |\n| 01:05 | b | 2 |\n");   // 輸入變了
  utimesSync(join(b, BOARD), new Date(0), new Date(0));                           // 產物比它舊
  const hook = (command: string) => {
    const r = spawnSync("python3", [join(REPO, "scripts/preserve-before-overwrite.py")], {
      cwd: b, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: b },
      input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: b }),
    });
    return { code: r.status ?? -1, err: r.stderr ?? "" };
  };
  return { b, hook };
}
const ONLY_LEDGER = `git commit -m "chore: x" -- ${LEDGER}`;

describe("產生器輸入閘（GH#1026 ③）—— 從 sync-io.json 的 reads 推導", () => {
  it("① 只 commit 帳本、產物比輸入舊 ⇒ 擋，並指名 genrun.sh board:build", () => {
    const { hook } = box();
    const r = hook(ONLY_LEDGER);
    expect(r.code, r.err).toBe(2);
    expect(r.err).toContain("board:build");
    expect(r.err, "訊息要教人怎麼修").toContain("genrun.sh board:build");
  });

  it("② 產物重生成了卻沒列進 pathspec ⇒ 擋，指名要加進 commit；③ 兩者一起 ⇒ 放", () => {
    const { b, hook } = box();
    writeFileSync(join(b, BOARD), "<html>new</html>\n");
    const r = hook(ONLY_LEDGER);
    expect(r.code, r.err).toBe(2);
    expect(r.err).toContain("不在這次 commit 裡");
    expect(hook(`git commit -F /tmp/m.txt -- ${LEDGER} ${BOARD}`).code, "兩者同一個 commit 被誤擋 ⇒ 會擋人的 hook 會被關掉").toBe(0);
    expect(hook("git log --oneline -1").code, "連不是 commit 的指令都擋").toBe(0);
  });

  it("④ ⭐ 它真的在讀那張表：board:build 的 reads 清空 ⇒ 同一個該擋的 commit 放行", () => {
    const { b, hook } = box();
    const t = JSON.parse(readFileSync(join(b, TABLE), "utf8"));
    for (const s of t.steps) if (s.name === "board:build") s.reads = [];
    writeFileSync(join(b, TABLE), JSON.stringify(t));
    const r = hook(ONLY_LEDGER);
    expect(r.code, "表裡沒有這條輸入卻還擋 ⇒ 對照表是手寫的，不是推導的").toBe(0);
    expect(r.err).not.toContain("board:build");
  });
});
