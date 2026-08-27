/**
 * 🏷️ **commit 訊息的票號 / lane 代號閘，真的掛上去了嗎**（GH#663）。
 *
 * `scripts/commit-ref-lint.sh` 在 `9d634cfe` 就寫好了，⛔ **而沒有任何東西呼叫它**
 * —— 一支沒有掛上去的閘等於沒有閘。這條守衛驗的是**掛載**那一半：
 * 真的把一個 `git commit` 事件餵進 PreToolUse hook，看它擋不擋。
 *
 * ⚠️⚠️ 為什麼是「擋」而不是「警告」：併行 lane ⛔ 禁止 `git commit --amend`
 * （它動的是 HEAD，而 HEAD 不屬於任何一條 lane）⇒ 訊息**落地那一刻就是永久的**，
 * 警告完全沒有用（看到的時候 commit 已經跑完了）。唯一有效的時機是**送出之前**。
 *
 * ⭐ 兩個方向（⛔ 只驗「擋得住」就會養出一支擋掉所有人的 hook —— 那是本 lane 最貴的失敗）：
 *   ① 該擋的擋得住：lane 代號寫成 `(#A5)` · 對不到任何 issue 的票號
 *   ② ⭐ **該放的放得過**：`(lane:A5)` · 真票號 · ⛔ 根本不是 git commit 的指令
 *
 * 突變紀錄（2026-08-27 實跑）：把 hook 裡 `if _r.returncode == 1:` 改成 `== 99`
 * → ① 兩條都紅（rc 變 0）。改回來。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/** 真的把事件餵進出貨的 hook（⛔ 不是掃字串 —— 第三守則）。 */
function hook(command: string): { code: number; err: string } {
  try {
    execFileSync("python3", ["scripts/preserve-before-overwrite.py"], {
      cwd: REPO,
      input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: REPO }),
      encoding: "utf8",
    });
    return { code: 0, err: "" };
  } catch (e) {
    const r = e as { status?: number; stderr?: string };
    return { code: r.status ?? -1, err: r.stderr ?? "" };
  }
}

describe("commit 訊息閘：掛上去了，而且兩個方向都對", () => {
  it("① 該擋的擋得住 —— lane 代號冒充票號", () => {
    const r = hook(`git commit -m "fix(x)(#A5): lane 代號" -- a.ts`);
    expect(r.code, "沒擋 ⇒ 那支 lint 沒有被呼叫（＝寫好了但沒掛上去）").toBe(2);
    expect(r.err).toContain("#A5");
    expect(r.err, "訊息要教人怎麼改").toContain("lane:");
  });

  it("① 該擋的擋得住 —— `-F <檔>`（CLAUDE.md 規定的併行 commit 形狀）", () => {
    const f = join(REPO, "../.laneY-cm-probe.txt");
    execFileSync("bash", ["-c", `printf 'fix(x)(#D10): x\\n' > ${JSON.stringify(f)}`]);
    const r = hook(`git commit -F ${f} -- a.ts`);
    execFileSync("bash", ["-c", `rm -f ${JSON.stringify(f)}`]);
    expect(r.code, "-F 那條路沒被解析 ⇒ 併行 lane 的**唯一**合法 commit 形狀完全沒被驗到")
      .toBe(2);
    expect(r.err).toContain("#D10");
  });

  it("② ⭐ 該放的放得過 —— 正確寫法 · 真票號 · 不是 commit 的指令", () => {
    expect(hook(`git commit -m "fix(x)(lane:A5): 正確寫法" -- a.ts`).code, "(lane:A5) 被擋了")
      .toBe(0);
    expect(hook(`git commit -m "fix(infra)(#663): 真票號" -- a.ts`).code, "真的票號被擋了").toBe(0);
    expect(hook("ls -l && git log --oneline -3").code, "⛔ 連不是 commit 的指令都擋 ⇒ 全員停擺")
      .toBe(0);
  });
});
