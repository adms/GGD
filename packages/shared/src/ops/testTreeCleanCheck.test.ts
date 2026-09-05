/**
 * ⭐ `scripts/test-tree-clean-check.sh` —— GH#1002 的收工閘：跑完測試出貨樹要跟跑之前一樣乾淨。
 * 真的把腳本跑起來（⛔ 不掃字串），在一棵 temp git 樹上。
 *
 * 突變（落地前跑過）：把腳本「髒 ⇒ `exit 1`」那一行改成 `exit 0` → 🔴（第一條）
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = join(REPO, "scripts/test-tree-clean-check.sh");

/** 一棵 committed 的小樹：一份產物 ＋ 一份產生器來源（閘預設看的兩個目錄）。 */
function tree(): string {
  const d = mkdtempSync(join(tmpdir(), "ggd-tree-clean-"));
  const git = (...a: string[]): void => {
    const r = spawnSync("git", ["-C", d, ...a], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${a[0]}: ${r.stderr}`);
  };
  git("init", "-q");
  git("config", "user.email", "t@t");
  git("config", "user.name", "t");
  mkdirSync(join(d, "content/abilities"), { recursive: true });
  mkdirSync(join(d, "tools/skill-remake/heroes"), { recursive: true });
  writeFileSync(join(d, "content/abilities/a.r.json"), "{}\n");
  writeFileSync(join(d, "tools/skill-remake/heroes/a.py"), "x = 1\n");
  git("add", "content", "tools");
  git("commit", "-q", "-m", "init");
  return d;
}
const run = (root: string, ...args: string[]): { code: number | null; out: string } => {
  const r = spawnSync("bash", [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, GGD_TREE_ROOT: root },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

describe("test-tree-clean-check.sh —— 跑完測試出貨樹要乾淨（GH#1002）", () => {
  it("★ 乾淨 ⇒ 0；髒 ⇒ 1 **並指名那個檔**（⛔ 不是只說「樹髒了」）", () => {
    const d = tree();
    expect(run(d).code, "儀器：乾淨的樹就紅 ⇒ 下面量的是空氣").toBe(0);
    writeFileSync(join(d, "content/abilities/a.r.json"), '{"x":1}\n');
    writeFileSync(join(d, "tools/skill-remake/heroes/new.py"), "y = 2\n"); // ⭐ untracked 也算髒
    const r = run(d);
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain("content/abilities/a.r.json");
    expect(r.out).toContain("tools/skill-remake/heroes/new.py");
  });

  it("⭐ baseline：跑之前就髒的不算，只有**新增**的髒才紅（本機多 lane 並行）", () => {
    const d = tree();
    writeFileSync(join(d, "tools/skill-remake/heroes/a.py"), "x = 2\n"); // 別條 lane 的改動
    const base = join(d, "base.txt");
    expect(run(d, "snapshot", "--out", base).code).toBe(0);
    expect(run(d, "--baseline", base).code, "基線之後沒有新髒 ⇒ 要綠").toBe(0);
    writeFileSync(join(d, "content/abilities/a.r.json"), '{"x":1}\n');
    const r = run(d, "--baseline", base);
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain("content/abilities/a.r.json");
    expect(r.out, "⛔ 把別條 lane 的改動算到測試頭上").not.toContain("heroes/a.py");
  });
});
