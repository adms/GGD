/**
 * backupRules.test.ts —— 規則快照必須真的產生檔案。
 *
 * owner 2026-08-05：「每次改變 CLAUDE.md 與記憶 就產生一個舊的 backup file」。
 *
 * ⚠️ 實測前提：記憶目錄（43 檔、216K）在此之前**完全沒有版本控制**，
 * 而 CLAUDE.md 在 git 裡已有 10 版。所以這支腳本真正補的是記憶那一半。
 *
 * ⛔ 只有一條，而且不做突變 —— 被測的是一支 `cp` + `git commit` 的工具腳本，
 * 不是靈魂層（CLAUDE.md 第零守則③）。但它**必須跑起來**：一個「cp 打錯路徑」
 * 的版本掃字串照樣綠，而備份靜默失敗正是這個 repo 最貴的那種形狀。
 */
import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * 🪤 覆蓋前留底 hook 對**加引號**的重導目標失明（GH#976）：`cat > "docs/中文檔名.md"` 靜默放行，
 * 而 `docs/` 幾乎每一份都要加引號。⭐ 真的把 hook 跑起來（餵 PreToolUse 事件），
 * `CLAUDE_PROJECT_DIR` 指到一個暫存 git repo ⇒ 留底與帳本都落在那裡，⛔ 不碰真 repo。
 * 兩個方向：三種寫法都要留底 **且** 已追蹤且乾淨的不重複留底（⛔ 否則 legacy 會爆）。
 * 突變（一次，commit 訊息記）：`_unquote()` 改成原樣回傳 ⇒ 雙引號那條紅。
 */
describe("覆蓋前留底 hook —— 重導目標要吃引號（GH#976）", () => {
  it("裸／雙引號／單引號都留底；已追蹤且乾淨的只記帳", () => {
    const box = mkdtempSync(join(tmpdir(), "ggd-976-"));
    const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: box });
    git("init", "-q");
    mkdirSync(join(box, "docs"));
    for (const f of ["技能 係數.md", "守則.md", "tracked.md"]) writeFileSync(join(box, "docs", f), "v1\n");
    git("add", "docs/tracked.md"); git("commit", "-qm", "init");
    const hook = (command: string) =>
      spawnSync("python3", [join(REPO, "scripts/preserve-before-overwrite.py")], {
        cwd: box, encoding: "utf8", env: { ...process.env, CLAUDE_PROJECT_DIR: box },
        input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: box }),
      });
    const kept = (name: string) => {
      const root = join(box, "docs/legacy/_overwrites");
      return existsSync(root) && readdirSync(root).some((d) => existsSync(join(root, d, "docs", name)));
    };
    for (const [label, cmd, name] of [
      ["雙引號（檔名含空白）", `cat > "docs/技能 係數.md" <<'EOF'\nx\nEOF`, "技能 係數.md"],
      ["單引號", "cat > 'docs/守則.md'", "守則.md"],
      ["裸路徑", "cat > docs/守則.md", "守則.md"],
    ] as const) {
      const r = hook(cmd);
      expect(r.status, `${label}：hook 永遠 exit 0`).toBe(0);
      expect(r.stderr, `${label}：仍然解析不了 —— 引號沒剝`).not.toContain("解析不了");
      expect(kept(name), `${label}：沒留底 ⇒ 唯一副本沒有退路`).toBe(true);
    }
    // 反方向：git 已有副本 ⇒ 只記帳，⛔ 不重複留底
    const r = hook('cat > "docs/tracked.md"');
    expect(r.status).toBe(0);
    expect(kept("tracked.md"), "已追蹤且乾淨的也留底了 ⇒ legacy 會爆").toBe(false);
    expect(readFileSync(join(box, "docs/legacy/_overwrites/_ledger.tsv"), "utf8")).toContain("SKIP(git 有)");
  });
});

describe("規則快照 scripts/backup-rules.sh", () => {
  it("真的把 CLAUDE.md 與每一份記憶存成一份時間戳快照,並給記憶開 git", () => {
    cover("backup-rules-writes");
    const home = mkdtempSync(join(tmpdir(), "ggd-rules-"));
    mkdirSync(join(home, "memory"), { recursive: true });
    writeFileSync(join(home, "memory", "a.md"), "one");
    writeFileSync(join(home, "memory", "b.md"), "two");

    const r = spawnSync("bash", [join(REPO, "scripts/backup-rules.sh")], {
      encoding: "utf8",
      env: { ...process.env, GGD_RULES_HOME: home },
    });
    expect(r.status).toBe(0);

    const snaps = readdirSync(join(home, "rules-backup"));
    expect(snaps).toHaveLength(1);
    const snap = join(home, "rules-backup", snaps[0]!);
    // ⛔ 兩邊都要讀：只驗 CLAUDE.md 的話，一個漏拷記憶的版本照樣過 ——
    // 而記憶才是原本零版本控制的那一半。
    expect(existsSync(join(snap, "CLAUDE.md"))).toBe(true);
    expect(readdirSync(join(snap, "memory")).sort()).toEqual(["a.md", "b.md"]);
    // 記憶自己的 git（真的能看 diff 的那個版本控制）
    expect(existsSync(join(home, "memory", ".git"))).toBe(true);
  });
});
