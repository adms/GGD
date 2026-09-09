import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⛔⛔ **同一句玩家公告被發第二次。**
 *
 * 2026-09-09 量到（同一天兩次）：玩家那一句住在**票**上，⛔ 而票會被再次動到
 * （補標記、改 commit、關票）⇒ ⭐ 它落進**下一版**的區間 ⇒ 又發一次。
 * 實例：#1129 的「107 張舊畫風的圖示重畫了」在 v0.42.13 發過，
 * 而我把它的進度標記 commit 更新成稽核 commit ⇒ **v0.42.17 又發了一次**。
 *
 * ⭐ 而分辨它**不需要新資訊** —— 帳本第三欄就記著「哪一版發過哪一句」。
 *   ⇒ 這支腳本一直**答得出來**，⛔ 只是沒有人問它。
 *
 * ⚠️ ⭐ 而「已經發過」⛔ 不等於「沒寫玩家句」：後者**擋住**整版公告，
 *   ⭐ 前者不可以 —— 那會讓一個正常的維護版發不出去。三個方向都要驗。
 */

const REPO = join(import.meta.dirname, "../../../..");
const SCRIPT = join(REPO, "scripts/release-note-players.sh");
const LINE = "測試用的一句玩家公告";

function run(ledgerRows: string[], until = "HEAD"): { code: number; out: string } {
  const dir = mkdtempSync(join(tmpdir(), "ggd-dup-"));
  // ⭐ 標記的 sha 必須**落在** SINCE..UNTIL 裡 —— ⛔ 用 HEAD 會在 `--until <tag>` 時掉出區間
  const head = execFileSync("git", ["rev-parse", until], { cwd: REPO, encoding: "utf8" }).trim();
  const marker = [
    "## 🧭 進度標記", "", "| | |", "|---|---|", "| **狀態** | `完成` |",
    `| **commit** | ${head} |`, "", "**基線（動手之前它今天的行為）**：測試用",
    "", "**下一個人從哪裡接**：測試用", "", `**🎮 玩家看得到的（給公告用）**：${LINE}`, "", "---",
  ].join("\n");
  const payload = JSON.stringify({ title: "[重要][fix] 測試用的票", comments: [{ body: marker }] });
  writeFileSync(
    join(dir, "gh"),
    `#!/bin/sh\ncase "$*" in\n  *"issue list"*) echo 9999 ;;\n` +
      `  *"issue view"*) cat <<'J'\n${payload}\nJ\n  ;;\nesac\n`,
  );
  chmodSync(join(dir, "gh"), 0o755);
  const ledger = join(dir, "_announced.tsv");
  writeFileSync(ledger, ledgerRows.join("\n") + (ledgerRows.length ? "\n" : ""));
  // ⭐ 上一個 tag 要相對於 `until` 算 —— ⛔ 用 HEAD^ 會在 `--until <tag>` 時得到同一個 tag（空區間）
  const since = execFileSync("git", ["describe", "--tags", "--abbrev=0", `${until}^`], {
    cwd: REPO, encoding: "utf8",
  }).trim();
  try {
    const out = execFileSync("bash", [SCRIPT, "--since", since, "--until", until], {
      cwd: REPO, encoding: "utf8", timeout: 60_000,
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GGD_PLAYERNOTE_CACHE: "",
             GGD_ANNOUNCE_LEDGER: ledger },
    });
    return { code: 0, out };
  } catch (e) {
    const x = e as { status?: number; stdout?: string };
    return { code: x.status ?? -1, out: x.stdout ?? "" };
  }
}

describe("同一句玩家公告⛔不發第二次（2026-09-09 量到，同一天兩次）", () => {
  it("① 帳本上沒有 ⇒ ⭐ 照常發", () => {
    const { code, out } = run([`v0.0.1\t2026-01-01\t別的一句話`]);
    expect(code).toBe(0);
    expect(out, "⛔ 一句沒發過的話被吞掉了").toContain(LINE);
  });

  it("② 帳本上已經有 ⇒ ⛔ 不重複發，⭐ 但要說出來", () => {
    const { code, out } = run([`v0.0.1\t2026-01-01\t${LINE}`]);
    expect(code, "⛔ 已經發過的一句把整版公告擋住了 —— 那不是「沒寫」").toBe(0);
    expect(out).not.toMatch(new RegExp(`^- ${LINE}`, "m"));
    expect(out, "⛔ 靜默吞掉 —— 那與沒有這一句長得一樣").toContain("已經在更早的版本公告過");
  });

  it("③ 而它仍然發得出**這一版的**維護句（⭐ 證明②不是把公告整個關掉）", () => {
    expect(run([`v0.0.1\t2026-01-01\t${LINE}`]).out).toContain("系統優化更新");
  });

  // ⛔⛔ **「這一版自己那一列」⛔ 不可以算成重複** —— 2026-09-09 當場踩到：
  //   一次刻意的補發（`--until v0.42.13`，而帳本第 v0.42.13 列就是那一句）被自己擋掉
  //   ⇒ ⭐ **真內容退化成罐頭**，而且帳本被罐頭覆寫回去。
  //   ⚠️ 那一輪一口氣重發 24 版，⭐ 其中 3 版有真內容的**全部變成罐頭**。
  //
  // ⇒ 修法：`awk -F'\t' -v now="$NOW" '$1!=now{print $3}'` —— ⛔ 只比對**別的版號**那幾列。
  //
  // ⛔⛔ **而這一條刻意沒有寫成測試**（⚠️ 誠實地寫在這裡，⛔ 不是漏了）：
  //   我寫過一版，⭐ 而**突變（把自己那一列也算進去）不會讓它紅** ——
  //   ⇒ 照第二守則，那就**不是守衛**，⛔ 而一條看起來綠的假閘比沒有更糟。
  //   ⭐ 它今天的證據是**生產環境的實跑**：v0.42.0／v0.42.9／v0.42.13 三版
  //   在修好之後補發，⭐ 三則都回到真內容（HTTP 204，帳本第三欄也跟著換回去）。
  //   ⇒ ⚠️ **這一格仍然缺一條會紅的閘** —— ⛔ 不要因為上面三條綠就以為它被守著。
});
