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
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
/**
 * ⛔⛔ 這幾條夾具以前寫死 `/private/tmp/…` —— 那是 **macOS 專屬**的路徑
 * （`/tmp` 是它的 symlink）。Linux 上 `/private` 不存在、非 root 也建不出來
 * ⇒ 「先在磁碟上放一份陳舊訊息」那一條 `printf … > <路徑>` 直接 ENOENT
 * ⇒ ⭐ 守衛在 CI 上死於**環境**,而它要驗的那個洞一個字都沒被驗到。
 * ⭐ 路徑本身**不是判準**的一部分（閘讀的是內容,⛔ 不是位置）⇒ 用 `tmpdir()`。
 */
const TMP = tmpdir();

/**
 * 真的把事件餵進出貨的 hook（⛔ 不是掃字串 —— 第三守則）。
 *
 * ⚠️⚠️ **用 `spawnSync` ⛔ 不是 `execFileSync`**（GH#663,2026-08-29）：
 * 舊版在 rc=0 那條路 `return { code: 0, err: "" }` —— ⭐ **把 stderr 丟掉了**。
 * ⇒ 這支量尺**在放行的時候是瞎的**,而 fail-loud（「不擋,但要出聲」）
 *   整族的斷言**只活在那條路上** ⇒ 用它寫「放行時有沒有說話」永遠得到空字串。
 * ⭐ 這正是本檔在驗的那個病:一條看起來量過的東西,量的不是你以為的那個。
 */
function hook(command: string): { code: number; err: string } {
  const r = spawnSync("python3", ["scripts/preserve-before-overwrite.py"], {
    cwd: REPO,
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: REPO }),
    encoding: "utf8",
  });
  return { code: r.status ?? -1, err: r.stderr ?? "" };
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

  /**
   * ⭐⭐ **閘在,而它擋不住真實的違規**（GH#663,2026-08-29 對抗性複驗量到）。
   *
   * 掛載 `0ea4c6df`(08-27T10:58) 之後 **2 小時 08 分**,`98189e4f`(13:06) 照樣落地 ——
   * 訊息裡逐字寫著 `#A5`,而 `commit-ref-lint.sh` 直接跑它是 **exit 1**。
   * ⇒ ⛔ 閘沒壞,**是訊息從來沒送到它手上**:`-F <檔>` 與 commit 在**同一個 Bash 呼叫**裡,
   *   PreToolUse 當下那個檔**還不存在** ⇒ 舊碼 `except OSError: _msg = None` 靜默放行。
   *   ⚠️ 而那一行的註解逐字寫著「它可能是 heredoc 剛要建的檔」——
   *   **它指名了這個案例,然後放它過去**,而訊息就在指令字串裡。
   *
   * ⭐ 夾具是**那一個真實 commit 的訊息**(從 git 讀,⛔ 不抄一份副本 —— 抄的那份會漂)。
   *
   * 突變紀錄（2026-08-29 實跑）：把 `commit_message_of()` 裡「檔讀不到 ⇒ 去 heredoc 找」
   * 那段拿掉（`except OSError: return None`）→ 這條紅（rc 2 → 0）。改回來。
   */
  it("①⭐ 98189e4f 那個**真實**的指令形狀,今天擋得下來", () => {
    const real = execFileSync("git", ["log", "-1", "--format=%B", "98189e4f"], {
      cwd: REPO, encoding: "utf8",
    });
    expect(real, "夾具本身要帶著那個 lane 代號,否則這條在驗空氣").toContain("#A5");

    // 逐字重建當時那一個 Bash 呼叫：heredoc 建訊息檔 ＋ 同一串裡 commit。
    const f = join(TMP, "laneY-real663.txt");
    const shape = (msg: string) =>
      `cd ${REPO}\ncat > ${f} <<'EOF'\n${msg}\nEOF\ngit commit -F ${f} -- tools/parallel-gates/ship.mjs`;

    expect(hook(shape(real)).code, "訊息與 commit 在同一個呼叫裡 ⇒ 檔還不存在 ⇒ 閘收不到訊息")
      .toBe(2);
    // ⭐ 反方向:同一個形狀、乾淨的訊息 ⇒ ⛔ 不可以擋（會擋人的 hook 會被關掉）
    expect(hook(shape("fix(ops)(#663): 乾淨 (lane:A5)\n\n本文。")).code, "同形狀的乾淨訊息被誤擋")
      .toBe(0);
  });

  /**
   * ⭐⭐ **三條修完之後仍然放行的路,其中兩條完全安靜**（GH#663,2026-08-29 對抗性複驗）。
   *
   * ⚠️ 上面那四條全綠,而下面每一條在它們全綠的時候都是**放行**的 ——
   * ⭐ 三條共用一個形狀:**閘跑了,而它讀到的不是要送出的那份訊息**,
   *   ⛔ 且沒有任何東西說出來（CLAUDE.md 逐字:「安靜的跳過與全過長得一樣」）。
   *
   * ①`git -C <dir> commit` —— 偵測式 `\bgit\s+commit\b` 被任何全域旗標切斷 ⇒ rc=0 全靜。
   * ②固定路徑上的**陳舊**訊息檔 —— CLAUDE.md 規定的 `printf "$MSG" > /private/tmp/msg.txt`
   *   形狀,PreToolUse 跑在寫入之前 ⇒ 舊碼讀**上一條 lane 的位元組**去 lint 並標 sure=True。
   * ③訊息內文引用 heredoc 慣用法 —— `_heredocs()` 用無條件 `strip()` 比對結束符,
   *   ⛔ 而 bash 不會被**縮排的** `EOF` 終止（跑過:量到 3 行,⛔ 不是 1 行）
   *   ⇒ 閘讀到**截斷**的訊息,截斷點之後的違規看不到。
   *
   * 突變紀錄（2026-08-29 實跑,⭐ 逐條確認改壞的那一行真的在夾具下被執行到）：
   *   · `_is_heredoc_end()` 改回 `line.strip() == delim` → ③紅（2→0）,①②維持。
   *   · `_GIT_COMMIT` 改回 `\bgit\s+commit\b`         → ①紅（2→0）,②③維持。
   *   · `_command_writes_to()` 永遠回 False            → ②紅（「沒驗到」消失）,①③維持。
   *   ⇒ 三條各自釘住一個洞,⛔ 沒有一條是靠別條綠的。
   */
  it("①⭐ 三條**安靜地**放行的路,現在擋下或出聲", () => {
    const BAD = 'fix(x)(#A5): lane 代號';
    const stale = join(TMP, "laneZ-663-stale.txt");

    // ① 全域旗標把偵測式切斷 ⇒ 以前 rc=0 且一個字都不印
    const c = hook(`git -C ${REPO} commit -m "${BAD}" -- a.ts`);
    expect(c.code, "`git -C … commit` 繞過了整段閘").toBe(2);
    expect(c.err).toContain("#A5");

    // ② 固定路徑上的陳舊訊息 ⇒ ⛔ 不可以拿舊位元組頂替,⭐ 但也不擋（它合法）
    execFileSync("bash", ["-c", `printf 'fix(x)(#663): 上一條 lane 的乾淨訊息\\n' > ${stale}`]);
    const s = hook(`printf '%s\\n' "$MSG" > ${stale}\ngit commit -F ${stale} -- a.ts`);
    execFileSync("bash", ["-c", `rm -f ${stale}`]);
    expect(s.code, "⛔ 這條完全合法,擋它會讓人關掉 hook").toBe(0);
    expect(s.err, "讀了上一條 lane 的位元組還說 ✓ ⇒ 一次**假的驗證**").toContain("沒驗到");

    // ③ 訊息內文引用 heredoc 慣用法（縮排的 EOF）⇒ 解析器提早收尾,而 bash 不會
    const f = join(TMP, "laneZ-663-m.txt");
    const msg = `fix(x): 主旨乾淨\n\n\`\`\`\n    cat > m <<'EOF'\n    x\n    EOF\n\`\`\`\n真正的違規：${BAD}\n`;
    const h = hook(`cat > ${f} <<'EOF'\n${msg}\nEOF\ngit commit -F ${f} -- a.ts`);
    expect(h.code, "縮排的 EOF 把訊息截斷了 ⇒ 後半段的違規看不到").toBe(2);
    expect(h.err).toContain("#A5");
  });

  it("②⭐ 該放的仍然放得過 —— ⛔ 一條都不可以誤擋", () => {
    const OK = 'fix(x)(lane:A5): 正確寫法';
    // 三條反例的乾淨對照 ＋ 一條唯讀 git（⛔ 連「沒驗到」都不可以喊）
    expect(hook(`git -C ${REPO} commit -m "${OK}" -- a.ts`).code, "乾淨的 git -C 被擋").toBe(0);
    const quiet = hook("git log --oneline -5 | grep commit");
    expect(quiet.code, "唯讀 git 被擋").toBe(0);
    expect(quiet.err, "唯讀指令不可以喊「沒驗到」—— 那會把出聲變成雜訊").toBe("");
    const f = join(TMP, "laneZ-663-ok.txt");
    const msg = `fix(x)(#663): 乾淨\n\n\`\`\`\n    cat <<'EOF'\n    x\n    EOF\n\`\`\`\n尾。\n`;
    expect(hook(`cat > ${f} <<'EOF'\n${msg}\nEOF\ngit commit -F ${f} -- a.ts`).code,
      "內文引用 heredoc 的**乾淨**訊息被誤擋").toBe(0);
  });
});
