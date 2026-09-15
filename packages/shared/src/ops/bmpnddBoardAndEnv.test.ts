/**
 * ⭐ GH#1256 —— 真的跑**出貨的** `scripts/bmpndd.sh`（暫存 git 樹 ＋ PATH 上假的 pnpm／gh ＋ 假的 genrun），問三件事：
 *   ① 閘（`pnpm ship:check`）的 env 裡**沒有** docker/.env 的值 —— 2026-09-15 當晚 bmpndd 在閘之前
 *      `. docker/.env` ⇒ 正式站 env 讓 game-server 測試紅。（假 pnpm 回 1 ⇒ 停在 P 之前，⛔ 不會碰 ship-it）
 *   ② B／M 指的是**戰情版日檔**（owner 叫「戰情版」的那一份），⛔ 不是 _execution-batches.md；
 *      M 的票號比對容忍沒寫 `#` 的列（兩個方向：1157 沒寫 # 要算提到、1300 真的沒提到要報）
 *   ③ B·M 收尾把戰情版與副本 commit 進 git，而且**只收那一族**（逐檔 pathspec）
 * 體驗層（工具腳本），接線類突變一次，紀錄見 commit 訊息。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(__dirname, "../../../..");
const BOARD = "docs/_release/戰情版-20260101.md";

function exe(path: string, body: string) {
  writeFileSync(path, `#!/bin/bash\n${body}\n`);
  chmodSync(path, 0o755);
}

describe("GH#1256 BMPNDD：閘在乾淨 env、B／M 指戰情版日檔、副本進 git", () => {
  it("★ 跑出貨的 bmpndd.sh", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ggd-bmpndd-"));
    const bin = join(tmp, ".bin");
    for (const f of ["bmpndd.sh", "board-roll.sh", "preserve.sh", "ledger_table.py"]) cpSync(join(REPO, "scripts", f), join(tmp, "scripts", f));
    for (const d of ["docs/_release", "docker", ".bin"]) mkdirSync(join(tmp, d), { recursive: true });
    exe(join(tmp, "scripts/genrun.sh"), 'echo "genrun $*" >> .genrun.log');
    exe(join(bin, "pnpm"), 'env > "$ENV_DUMP"; exit 1');
    exe(join(bin, "gh"), "printf '1157\\n1300\\n'");
    writeFileSync(join(tmp, BOARD), "## 逐則\n\n| 時間 | 話 | 票 |\n|---|---|---|\n| 10:00 | 某則 | 1157 1158 |\n");
    writeFileSync(join(tmp, "docs/_execution-batches.md"), "# 執行批次計畫\n");
    writeFileSync(join(tmp, "docker/.env"), "PLATFORM_GAME_SHARED_SECRET=from-dotenv\n");
    writeFileSync(join(tmp, "bystander.md"), "別的 lane 的檔\n");
    const envDump = join(tmp, ".env-dump");
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>), PATH: `${bin}:${process.env.PATH ?? ""}`, ENV_DUMP: envDump,
      GGD_BMPNDD_NO_GATE: "0", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
    };
    delete env.PLATFORM_GAME_SHARED_SECRET;
    spawnSync("git", ["init", "-q"], { cwd: tmp, env });
    const r = spawnSync("bash", ["scripts/bmpndd.sh", "測試"], { cwd: tmp, env, encoding: "utf8" });
    const out = r.stdout + r.stderr;

    // ① GUARD THE GUARD：假 pnpm 真的被叫到（⛔ 不然「env 裡沒有」是空轉）
    expect(existsSync(envDump), `閘根本沒跑到\n${out}`).toBe(true);
    expect(readFileSync(envDump, "utf8"), "⛔ docker/.env 被載進閘的 env（正式站設定會讓 game-server 測試紅）").not.toContain("PLATFORM_GAME_SHARED_SECRET");
    expect(r.status, "閘紅要停在 push 之前").toBe(1);

    // ② B 留底的是戰情版日檔；M 先 board:roll，再容忍沒寫 # 的列
    expect(readFileSync(join(tmp, "docs/legacy/_overwrites/_ledger.tsv"), "utf8")).toContain(BOARD);
    expect(readFileSync(join(tmp, ".genrun.log"), "utf8")).toContain("board:roll");
    expect(out, "M 把沒寫 # 的 1157 報成沒提到，或漏報真的沒提到的 1300").toMatch(/沒提到\*\*的：#1300\s*$/m);

    // ③ 收尾 commit 收了戰情版與它的副本，⛔ 沒有收別的檔
    const committed = spawnSync("git", ["-c", "core.quotePath=false", "show", "--name-only", "--format=", "HEAD"], { cwd: tmp, encoding: "utf8" }).stdout;
    expect(committed).toContain(BOARD);
    expect(committed).toMatch(/docs\/legacy\/_overwrites\/.*\/docs\/_execution-batches\.md/);
    expect(committed, "收尾 commit 掃走了戰情版家族以外的檔").not.toMatch(/bystander|scripts\/|docker\//);
  });
});
