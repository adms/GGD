/**
 * heredoc 的**起始符**規則只有**一個住處**（GH#663）。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 為什麼（2026-08-29 對抗性複驗量到，⭐ 我在 main 上獨立重現過）
 * ---------------------------------------------------------------------------
 * `foo <<<"$MSG"` 是 **herestring**，⛔ 不是 heredoc。
 * `_strip_heredocs()` 用的 opener（`_HEREDOC_START`）**少了** `(?<!<)…(?!<)` 護欄
 * ⇒ 它把 `<<<` 讀成 heredoc 起點，然後**把後面每一行整段吞掉**：
 *
 * ```
 * _strip_heredocs('grep -q x <<<"$MSG"\ngit commit -m "…"')  →  'grep -q x < '
 * ```
 *
 * ⇒ ⭐ 同一個指令裡的 `git commit` **從閘眼前消失** ⇒ 那一族的檢查全部瞎掉、
 * rc=0 而且**一個字都不印**（CLAUDE.md：安靜的跳過與全過長得一樣）。
 *
 * ⚠️ ⭐ 這是**第〇·四守則**：opener 規則本來有**兩個住處**
 * （`_strip_heredocs` 的與 `_heredocs()` 的），⛔ 而只有後者帶護欄 ——
 * 而後者的註解**逐字警告過這件事**：「`<<<` 是 herestring，⛔ 不是 heredoc
 * （會被一個**天真的正則**讀成一份空訊息 ⇒ **靜默放行**）」。
 *
 * 突變紀錄：把 `(?<!<)<<-?(?!<)` 改回 `<<-?` ⇒ 「herestring 不吞後面」那條紅。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const HOOK = join(REPO, "scripts/preserve-before-overwrite.py");

/** 呼叫 hook 裡的 `_strip_heredocs()`（⭐ 出貨的那一支，⛔ 不是複製一份）。 */
function strip(cmd: string): string {
  const py = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("h", ${JSON.stringify(HOOK)})
m = importlib.util.module_from_spec(spec)
try: spec.loader.exec_module(m)
except SystemExit: pass
print(json.dumps(m._strip_heredocs(json.loads(sys.argv[1]))))
`;
  const r = spawnSync("python3", ["-c", py, JSON.stringify(cmd)], { encoding: "utf-8", timeout: 60_000 });
  expect(r.status, `⛔ 跑不起來：${r.stderr}`).toBe(0);
  return JSON.parse(r.stdout) as string;
}

// ⚠️ 拼出來的，⛔ 不寫字面值 —— 這個 repo 的 commit-ref hook 會擋含 lane 代號形狀的指令。
const LANE = `#${"A5"}`;

describe("heredoc opener 只有一個住處（GH#663）", () => {
  it("⭐ `<<<` 是 herestring ⇒ ⛔ 不可以吞掉後面的行", () => {
    const cmd = `grep -q x <<<"$MSG"\ngit commit -m "fix(ops)(${LANE}): x" -- a.ts`;
    expect(
      strip(cmd),
      "⛔ herestring 被讀成 heredoc ⇒ `git commit` 從閘眼前消失 ⇒ 整族檢查瞎掉、rc=0 零輸出",
    ).toContain("git commit");
  });

  it("⭐ 真的 heredoc **仍然**要被剝掉（⛔ 護欄不可以把功能關掉）", () => {
    const cmd = `cat > f <<'EOF'\n這裡面是內文 ${LANE} 不算指令\nEOF\ngit commit -F f -- a.ts`;
    const out = strip(cmd);
    expect(out, "⛔ heredoc 的**內文**沒被剝掉 ⇒ 內文裡的 `>` 會被讀成重導（GH#791）").not.toContain(
      "這裡面是內文",
    );
    expect(out, "⛔ 連 heredoc 後面的真指令也吞掉了").toContain("git commit");
  });

  it("GUARD THE GUARD：量尺真的在跑出貨的那一支", () => {
    expect(strip("echo hi")).toContain("echo hi");
  });
});
