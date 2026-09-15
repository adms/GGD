/**
 * ⭐ GH#1256 —— 真的跑**出貨的** `scripts/bmpndd.sh`（暫存 git 樹 ＋ PATH 上假的 pnpm／gh ＋ 假的 genrun），問三件事：
 *   ① 閘（`pnpm ship:check`）的 env 裡**沒有** docker/.env 的值 —— 2026-09-15 當晚 bmpndd 在閘之前
 *      `. docker/.env` ⇒ 正式站 env 讓 game-server 測試紅。（假 pnpm 回 1 ⇒ 停在 P 之前，⛔ 不會碰 ship-it）
 *   ② B／M 指的是**戰情版日檔**（owner 叫「戰情版」的那一份），⛔ 不是 _execution-batches.md；
 *      M 的票號比對容忍沒寫 `#` 的純票號格（1157 要算提到），⭐ 但散文格裡撞號的裸數字**不算**
 *      （1300 只出現在「量到 1300 列」⇒ 仍要報沒提到 —— 修正輪補的反方向，那是空轉綠燈的方向）
 *   ③ B·M 收尾把戰情版、副本與留底帳本 commit 進 git，而且**只收那一族**（逐檔 pathspec）
 *   ④ 換日那一輪（genrun 的 board:roll 換成**真的** board-roll.sh；根目錄捷徑被追蹤＝cb08a41f1 出貨的狀態）：收尾 commit 要連捷徑一起帶
 *      ⇒ **乾淨 clone**（CI checkout 到的樹）上 board:roll:check 綠（修正輪二：只帶新日檔 ⇒ d935cfc98 的形狀，工作樹綠而 CI 紅）
 * 開關（GGD_BMPNDD_*）只測預設那一邊。體驗層（工具腳本），接線類突變一次，紀錄見 commit 訊息。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const REPO = resolve(__dirname, "../../../..");
const BOARD = "docs/_release/戰情版-20260101.md";
const LINK = "GGD戰情版.md";

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
    exe(join(tmp, "scripts/genrun.sh"), 'echo "genrun $*" >> .genrun.log\n[ "$1" = board:roll ] && exec bash scripts/board-roll.sh\nexit 0');
    exe(join(bin, "pnpm"), 'env > "$ENV_DUMP"; exit 1');
    exe(join(bin, "gh"), "printf '1157\\n1300\\n'");
    writeFileSync(join(tmp, BOARD), "## 逐則\n\n| 時間 | 話 | 票 |\n|---|---|---|\n| 10:00 | 某則 | 1157 1158 |\n| 10:01 | 另一則 | — 確認型回覆（量到 1300 列） |\n");
    writeFileSync(join(tmp, "docs/_execution-batches.md"), "# 執行批次計畫\n");
    writeFileSync(join(tmp, "docker/.env"), "PLATFORM_GAME_SHARED_SECRET=from-dotenv\n");
    writeFileSync(join(tmp, "bystander.md"), "別的 lane 的檔\n");
    const envDump = join(tmp, ".env-dump");
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>), PATH: `${bin}:${process.env.PATH ?? ""}`, ENV_DUMP: envDump,
      GGD_BMPNDD_NO_GATE: "0", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
    };
    for (const k of ["PLATFORM_GAME_SHARED_SECRET", "GGD_BMPNDD_BACKUP_SET", "GGD_BMPNDD_M_ROLL", "GGD_BMPNDD_BOARD_WRAP", "GGD_BOARD_LINK_REQUIRED"]) delete env[k];
    const git = (cwd: string, ...a: string[]) => spawnSync("git", ["-c", "core.quotePath=false", ...a], { cwd, env, encoding: "utf8" });
    git(tmp, "init", "-q");
    symlinkSync(BOARD, join(tmp, LINK)); // ④ 只有捷徑先進 git（指向舊日檔）；戰情版家族其餘都還沒進 ⇒ B 真的會留底
    git(tmp, "add", "--", LINK);
    expect(git(tmp, "commit", "-q", "-m", "main", "--", LINK).status, "夾具：捷徑沒進 git ⇒ ④ 測的不是出貨的狀態").toBe(0);
    const r = spawnSync("bash", ["scripts/bmpndd.sh", "測試"], { cwd: tmp, env, encoding: "utf8" });
    const out = r.stdout + r.stderr;

    // ① GUARD THE GUARD：假 pnpm 真的被叫到（⛔ 不然「env 裡沒有」是空轉）
    expect(existsSync(envDump), `閘根本沒跑到\n${out}`).toBe(true);
    expect(readFileSync(envDump, "utf8"), "⛔ docker/.env 被載進閘的 env（正式站設定會讓 game-server 測試紅）").not.toContain("PLATFORM_GAME_SHARED_SECRET");
    expect(r.status, "閘紅要停在 push 之前").toBe(1);

    // ② B 留底的是戰情版日檔；M 先 board:roll，再容忍沒寫 # 的列
    expect(readFileSync(join(tmp, "docs/legacy/_overwrites/_ledger.tsv"), "utf8")).toContain(BOARD);
    expect(readFileSync(join(tmp, ".genrun.log"), "utf8")).toContain("board:roll");
    expect(out, "M 把純票號格的 1157 報成沒提到，或把散文裡撞號的 1300 當成提到而漏報").toMatch(/沒提到\*\*的：#1300\s*$/m);

    // ③ 收尾 commit 收了戰情版、它的副本與留底帳本，⛔ 沒有收別的檔
    const committed = git(tmp, "show", "--name-only", "--format=", "HEAD").stdout;
    expect(committed).toContain(BOARD);
    expect(committed).toMatch(/docs\/legacy\/_overwrites\/.*\/docs\/_execution-batches\.md/);
    expect(committed, "preserve.sh 追加的留底帳本沒收（收尾後它仍躺在工作區）").toContain("docs/legacy/_overwrites/_ledger.tsv");
    expect(committed, "收尾 commit 掃走了戰情版家族以外的檔").not.toMatch(/bystander|scripts\/|docker\//);

    // ④ GUARD THE GUARD：M 真的換日（捷徑改指新日檔）⇒ 下面測的才是換日那一輪的收尾
    expect(readlinkSync(join(tmp, LINK)), `M 的 board:roll 沒有換日\n${out}`).not.toBe(BOARD);
    const clone = mkdtempSync(join(tmpdir(), "ggd-bmpndd-clone-"));
    expect(git(tmp, "clone", "-q", tmp, clone).status, "夾具：clone 失敗").toBe(0);
    for (const f of ["board-roll.sh", "ledger_table.py"]) cpSync(join(REPO, "scripts", f), join(clone, "scripts", f));
    const chk = spawnSync("bash", ["scripts/board-roll.sh", "--check"], { cwd: clone, env, encoding: "utf8" });
    expect(chk.status, `⛔ 乾淨 clone 的 board:roll:check 紅 —— 收尾 commit 帶了新日檔卻沒帶捷徑（d935cfc98 的形狀）\n${chk.stdout}${chk.stderr}`).toBe(0);
  });
});
