/**
 * 守衛：worktree helper 壞掉要有人知道（GH#625）。
 *
 * ⭐ 只釘**承重的那幾條**，⛔ 不逐個指令測（體驗層：≤80 行、⛔ 不開對抗輪）。
 * 承重的是「**把 lane 搬進 worktree 之後，hook 還認不認得它**」——
 * 量到的原始狀態是**不認得**：同一份產生器產物在主樹 EXIT=2、在 worktree EXIT=0。
 * ⇒ 那條線斷掉時，每一條 lane 的 genguard 都會**靜默**消失（失敗形態⑧）。
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { LOCKED_SCRIPTS, overlap, sanitizeLane } from "./worktree.mjs";

const REPO = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const HOOK = `${REPO}/scripts/preserve-before-overwrite.py`;

/** 跑真的 hook，回離開碼。⛔ 不模擬它。 */
function hook(ev: Record<string, unknown>): number {
  try {
    execFileSync("python3", [HOOK], { input: JSON.stringify(ev), stdio: ["pipe", "pipe", "pipe"] });
    return 0;
  } catch (e) {
    return (e as { status: number }).status;
  }
}

/**
 * 一棵**形狀為真**的 lane 樹：git 給 worktree 的 `.git` 是一個**檔案**（不是目錄），
 * 而 `tree_root()` 正是靠這個往上找 —— ⛔ 它不呼叫 git，所以這裡不需要真的 git worktree。
 */
function fakeLane(): string {
  const d = mkdtempSync(`${tmpdir()}/ggd-lane-`);
  writeFileSync(`${d}/.git`, `gitdir: ${REPO}/.git/worktrees/probe\n`);
  writeFileSync(`${d}/.ggd-lane.json`, `{"lane":"probe"}\n`);
  mkdirSync(`${d}/docs`, { recursive: true });
  return d;
}

describe("worktree helper", () => {
  it("⭐ genguard 在 lane 的 worktree 裡照樣擋得住產生器產物", () => {
    const lane = fakeLane();
    const owned = "docs/技能標記機制與效果規則.md"; // sync-io.json 裡 skillremake:json 認領的
    writeFileSync(`${lane}/${owned}`, "x");
    // 主樹會擋 —— 這是基準線
    expect(hook({ tool_name: "Edit", cwd: REPO, tool_input: { file_path: `${REPO}/${owned}` } })).toBe(2);
    // ⇒ lane 樹裡**也**要擋。在此之前這一行回 0（靜默放行）。
    expect(hook({ tool_name: "Edit", cwd: lane, tool_input: { file_path: `${lane}/${owned}` } })).toBe(2);
  });

  it("🔒 全域鎖只在 lane 樹裡擋，主樹放行", () => {
    const lane = fakeLane();
    for (const s of LOCKED_SCRIPTS) {
      expect(hook({ tool_name: "Bash", cwd: lane, tool_input: { command: `pnpm ${s}` } })).toBe(2);
      expect(hook({ tool_name: "Bash", cwd: REPO, tool_input: { command: `pnpm ${s}` } })).toBe(0);
    }
    // ⛔ 不可以誤傷:只是提到名字、或在別的字裡
    expect(hook({ tool_name: "Bash", cwd: lane, tool_input: { command: "grep -rn content:build docs/" } })).toBe(0);
  });

  it("land 的配對檢查抓的是「lane 改過 ∩ 主樹現在髒」，⛔ 不是「主樹乾不乾淨」", () => {
    // 主樹常態就有 40+ 個 modified ⇒ 「主樹要乾淨」會讓 land 永遠拒絕,等於沒有這個指令
    expect(overlap(["a.ts", "b.ts"], ["b.ts", "z.ts"])).toEqual(["b.ts"]);
    expect(overlap(["a.ts"], ["z.ts"])).toEqual([]);
  });

  it("lane 名字不可以跑出 worktrees 目錄", () => {
    expect(() => sanitizeLane("../../etc")).toThrow();
    expect(() => sanitizeLane("a/b")).toThrow();
    expect(sanitizeLane("m6-fix.1")).toBe("m6-fix.1");
  });
});
