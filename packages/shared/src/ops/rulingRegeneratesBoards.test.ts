/**
 * rulingRegeneratesBoards.test.ts —— 帳本的**每一個寫入端**收工要自己重生成吃它的兩支產生器（GH#1026 ①）。
 *
 * 量到的病（2026-09-06 一夜三次）：每記一次裁決／每對一列票 `docs/_daily` 就變，`board:roll`／`board:build`
 * 的產物就過期，`skills:check` 紅 —— ⭐ 而紅的是 Codex 的 PR，⛔ 不是寫入端自己。
 * 三個寫入端（`ruling.sh` · `ledger_table.py --map` · `message-ledger.sh` 建置）共用 `regenerate_boards()` 一份。
 *
 * 體驗層：一條薄守衛。真的把腳本跑起來，用 `GGD_GENRUN` 換成一支會記帳的 stub
 * （⛔ 不在測試裡跑真的產生器 —— 它們寫版控的產物）。`gh` 寫票會失敗 ⇒ `ruling.sh` exit 1 是預期的，
 * 我們斷言的是**帳本寫了、而且兩支都被叫到**；反方向：沒寫帳本／在 genrun 鏈裡 ⇒ ⛔ 不叫。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const LT = join(REPO, "scripts/ledger_table.py");
const TABLE = "## 逐則對票\n\n| 時間 | owner 說了什麼（逐字） | 票 |\n|---|---|---|\n";

/** 一支只記帳的 genrun stub ＋ 指到暫存目錄的帳本。 */
function stub() {
  const dir = mkdtempSync(join(tmpdir(), "ggd-regen-"));
  const log = join(dir, "genrun.log");
  writeFileSync(join(dir, "genrun.sh"), `#!/usr/bin/env bash\necho "$@" >> "${log}"\n`);
  chmodSync(join(dir, "genrun.sh"), 0o755);
  const called = () => (existsSync(log) ? readFileSync(log, "utf8") : "");
  return { dir, env: { ...process.env, GGD_LEDGER_DIR: dir, GGD_GENRUN: `bash ${join(dir, "genrun.sh")}` }, called };
}
function both(called: string, who: string) {
  expect(called, `⛔ ${who} 沒叫 board:roll —— 帳本變了而戰情版不會跟`).toContain("board:roll");
  expect(called, `⛔ ${who} 沒叫 board:build —— 帳本變了而 ggd-board.html 不會跟`).toContain("board:build");
}

describe("帳本寫入端收工重生成 board:roll ＋ board:build（透過 genrun 的入口）", () => {
  it("ruling.sh：帳本真的寫了，兩支都被叫到", () => {
    const s = stub();
    const r = spawnSync("bash", [join(REPO, "scripts/ruling.sh"), "999999"], {
      input: "測試用的一句裁決 —— 不是 owner 說的", encoding: "utf8", cwd: REPO, timeout: 120_000, env: s.env,
    });
    const day = new Date().toLocaleDateString("sv-SE", { timeZone: process.env.TZ ?? undefined });
    expect(existsSync(join(s.dir, `${day}.md`)), `帳本沒寫：${r.stdout}\n${r.stderr}`).toBe(true);
    expect(readFileSync(join(s.dir, `${day}.md`), "utf8")).toContain("測試用的一句裁決");
    both(s.called(), "ruling.sh");
  });

  it("ledger_table.py --map：對到列才叫；⛔ 沒對到（沒寫帳本）就不叫", () => {
    const s = stub();
    const md = join(s.dir, "2026-09-06.md");
    writeFileSync(md, `${TABLE}| 09:00 | 某一則 | ⏸ 未對票 |\n`);
    expect(spawnSync("python3", [LT, "--map", md, "09:59", "#1026"], { encoding: "utf8", cwd: REPO, env: s.env }).status).not.toBe(0);
    expect(s.called(), "沒寫帳本卻重生成 ⇒ 白跑幾秒，而且每對錯一次跑一次").toBe("");
    const r = spawnSync("python3", [LT, "--map", md, "09:00", "#1026"], { encoding: "utf8", cwd: REPO, env: s.env });
    expect(r.status, r.stderr).toBe(0);
    both(s.called(), "--map");
  });

  it("message-ledger.sh 建置：補了列就叫；在 genrun／skills:sync 鏈裡（GGD_QUARANTINE_UNLOCKED=1）⇒ 讓鏈接手，⛔ 不叫", () => {
    for (const nested of [false, true]) {
      const s = stub();
      writeFileSync(join(s.dir, "ledger-source_temp_20200102.md"), "## 10:30\n\n這是一則還沒有對到票的指示,長度要夠讓比對窗吃得到它。\n");
      const env = { ...s.env, GGD_TRANSCRIPT_DIR: s.dir, ...(nested ? { GGD_QUARANTINE_UNLOCKED: "1" } : {}) };
      const r = spawnSync("bash", [join(REPO, "scripts/message-ledger.sh"), "--date", "2020-01-02"], { encoding: "utf8", cwd: REPO, env });
      expect(r.status, r.stderr).toBe(0);
      expect(readFileSync(join(s.dir, "2020-01-02.md"), "utf8")).toContain("10:30");
      if (nested) expect(s.called(), "鏈裡再叫一次 ⇒ 外層 genrun 的對帳會把 board 的產物算成越界寫入").toBe("");
      else both(s.called(), "message-ledger.sh");
    }
  });
});
