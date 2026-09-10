import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⛔⛔ **「人答過：玩家看不到」與「沒有人回答」被判成同一件事。**
 *
 * 2026-09-09 owner 揪到：v0.41.0–v0.42.15 **21 版**的 Discord 公告全部是罐頭句子。
 * 根因有兩層，這一條守第二層 ——
 *   `case "$P" in 無*|—*|-|"") P="";;` 把**答過的**與**沒答的**壓成同一個空字串
 *   ⇒ 那道「有玩家可見的票卻沒寫玩家句 ⇒ ⛔ 不發」的閘變成**答不出來的**：
 *     唯一出路是去改票的類型標籤，⛔ 而那是為了讓閘閉嘴去竄改一張票。
 *
 * ⭐ 兩個方向都驗（⛔ 一把只驗過單邊的尺不算自證過）：
 *   ① 寫了「無（…）」⇒ 放行（exit 0）  ② 什麼都沒寫 ⇒ 擋下（exit 1）
 */

const REPO = join(import.meta.dirname, "../../../..");
const SCRIPT = join(REPO, "scripts/release-note-players.sh");
// 沿用 playerNoteReadsShippedCommits 的固定維護區間，避免 PR 的功能提交混入 fixture。
const SINCE = "v0.41.2";
const UNTIL = "v0.41.3";

/** ⭐ 用一支假 `gh` 餵一張受控的票 —— 跑的仍是**出貨的那支腳本**。 */
function runWith(playerLine: string | null, extraEnv: Record<string, string> = {}): {
  code: number;
  out: string;
} {
  const dir = mkdtempSync(join(tmpdir(), "ggd-pn-"));
  const head = execFileSync("git", ["rev-parse", `${UNTIL}^{commit}`], { cwd: REPO, encoding: "utf8" }).trim();
  const marker = [
    "## 🧭 進度標記", "", "| | |", "|---|---|", "| **狀態** | `完成` |",
    `| **commit** | ${head} |`, "", "**基線（動手之前它今天的行為）**：測試用",
    "", "**下一個人從哪裡接**：測試用",
    ...(playerLine ? ["", `**🎮 玩家看得到的（給公告用）**：${playerLine}`] : []),
    "", "---",
  ].join("\n");
  // ⭐ `null` ＝ 這張票**連一則進度標記都沒有**（第一層根因的情境）
  const payload = JSON.stringify({
    title: "[重要][fix] 測試用的票",
    comments: playerLine === null ? [{ body: "一則與進度無關的留言" }] : [{ body: marker }],
  });
  writeFileSync(
    join(dir, "gh"),
    `#!/bin/sh\ncase "$*" in\n  *"issue list"*) echo 9999 ;;\n` +
      `  *"issue view"*) cat <<'J'\n${payload}\nJ\n  ;;\nesac\n`,
  );
  chmodSync(join(dir, "gh"), 0o755);
  try {
    const out = execFileSync("bash", [SCRIPT, "--since", SINCE, "--until", UNTIL], {
      cwd: REPO, encoding: "utf8", timeout: 60_000,
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        GGD_PLAYERNOTE_CACHE: "",
        ...extraEnv,
      },
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    return { code: err.status ?? -1, out: err.stdout ?? "" };
  }
}

describe("「人答過玩家看不到」⛔ 不等於「沒有人回答」（owner 2026-09-09）", () => {
  it("① 寫了「無（…）」⇒ ⭐ 放行，並把它印在自己那一欄", () => {
    const { code, out } = runWith("無（測試用；玩家那一面看不到）");
    expect(code, `⛔ 答過了還被擋下 ——\n${out.slice(0, 800)}`).toBe(0);
    expect(out).toContain("系統優化更新");
    expect(out, "⛔ 答案被靜默吞掉 —— 那與沒有答案長得一樣").toContain("人答過了");
  });

  it("② 什麼都沒寫 ⇒ ⛔ 擋下（⭐ 這一條證明①不是靠放寬換來的）", () => {
    const { code, out } = runWith("");
    expect(code, `⛔ 沒人回答卻放行 —— 那正是 21 版罐頭句子的來源\n${out.slice(0, 800)}`).toBe(1);
    expect(out).toContain("#9999");
  });

  // ⭐ 第一層根因：`[ -n "$B" ] || continue` 讓**連進度標記都沒有**的票整個消失
  //   ⇒ 它既不進 LINES 也不進 MISSING ⇒ 閘看不到它 ⇒ 腳本誠實地印
  //     「這一版**真的**沒有玩家可見的票」——⛔ 而那是假的。
  it("③ 連進度標記都沒有 ⇒ ⛔ 仍然擋下（⭐ 它不可以靜靜消失）", () => {
    // ⭐ `SCOPE=updated` 跳過「這張票在不在這一版」那一段 —— ⛔ 它不是這條要驗的東西；
    //   要驗的是**進到了迴圈裡**的票，⛔ 不可以因為沒有標記就消失。
    const { code, out } = runWith(null, { GGD_PLAYERNOTE_SCOPE: "updated" });
    expect(code, `⛔ 沒有標記的票整個消失了 —— 第一層根因回來了\n${out.slice(0, 800)}`).toBe(1);
    expect(out).toContain("#9999");
  });
});
