/**
 * rulingRegeneratesBoards.test.ts —— `ruling.sh` 寫完帳本要**自己**重生成兩支吃它的產生器（GH#1026 ①）。
 *
 * 量到的病（2026-09-06 一夜三次）：每記一次裁決 `docs/_daily` 就變，`board:roll`／`board:build`
 * 的產物就過期，`skills:check` 紅 —— ⭐ 而紅的是 Codex 的 PR，⛔ 不是寫入端自己。
 *
 * 體驗層：一條薄守衛。真的跑 `ruling.sh`，用 `GGD_GENRUN` 換成一支會記帳的 stub
 * （⛔ 不在測試裡跑真的產生器 —— 它們寫版控的產物）。`gh` 寫票會失敗 ⇒ 腳本 exit 1 是預期的，
 * 我們斷言的是**帳本寫了、而且兩支都被叫到**。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("scripts/ruling.sh 收工重生成 board:roll ＋ board:build", () => {
  it("寫完帳本之後兩支都被叫到（透過 genrun 的入口），帳本本身也真的寫了", () => {
    const dir = mkdtempSync(join(tmpdir(), "ggd-ruling-"));
    const log = join(dir, "genrun.log");
    const stub = join(dir, "genrun.sh");
    writeFileSync(stub, `#!/usr/bin/env bash\necho "$@" >> "${log}"\n`);
    chmodSync(stub, 0o755);

    const r = spawnSync("bash", [join(REPO, "scripts/ruling.sh"), "999999"], {
      input: "測試用的一句裁決 —— 不是 owner 說的",
      encoding: "utf8",
      cwd: REPO,
      timeout: 120_000,
      env: { ...process.env, GGD_LEDGER_DIR: dir, GGD_GENRUN: `bash ${stub}` },
    });
    // gh 對不存在的票會失敗 ⇒ exit 1 是預期；帳本與重生成在那之前就該發生
    const day = new Date().toLocaleDateString("sv-SE", { timeZone: process.env.TZ ?? undefined });
    const ledger = join(dir, `${day}.md`);
    expect(existsSync(ledger), `帳本沒寫：${r.stdout}\n${r.stderr}`).toBe(true);
    expect(readFileSync(ledger, "utf8")).toContain("測試用的一句裁決");

    const called = existsSync(log) ? readFileSync(log, "utf8") : "";
    expect(called, "⛔ board:roll 沒被叫 —— 帳本變了而戰情版不會跟").toContain("board:roll");
    expect(called, "⛔ board:build 沒被叫 —— 帳本變了而 ggd-board.html 不會跟").toContain("board:build");
  });
});
