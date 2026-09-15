// GH#1236 合併後補：worktree 沒有 scripts/hosts.local.sh ⇒ _hosts.sh 讀主工作樹那一份（否則 BMPNDD 的 D 會死）。
// ⭐ 真的 `git worktree add`＋source 出貨的 _hosts.sh。MUTATION：繼承那個 `[ -f … ]` 改成 `[ -f /nonexistent ]` ⇒ 紅。
import { it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const FAKE = "probe-user-7f3a";

it("★ worktree 讀得到主工作樹的 hosts.local.sh，⛔ stderr 不印值", () => {
  const root = mkdtempSync(join(tmpdir(), "hosts-inherit-"));
  const [primary, wt] = [join(root, "primary"), join(root, "wt")];
  const git = (...a: string[]) => execFileSync("git", ["-C", primary, "-c", "user.email=t@t", "-c", "user.name=t", ...a], { stdio: "ignore" });
  mkdirSync(primary);
  git("init", "-q");
  git("commit", "-q", "--allow-empty", "-m", "x");
  git("worktree", "add", "-q", wt);
  for (const d of [primary, wt]) {
    mkdirSync(join(d, "scripts"));
    copyFileSync(resolve(__dirname, "../../../../scripts/_hosts.sh"), join(d, "scripts/_hosts.sh"));
  }
  writeFileSync(join(primary, "scripts/hosts.local.sh"), `export GGD_MINI_USER="\${GGD_MINI_USER:-${FAKE}}"\n`);
  const env = { ...process.env, GGD_MINI_USER: "", GGD_HOSTS_INHERIT: "" }; // 空字串＝未設（兩處都用 `:-`）
  const r = spawnSync("bash", ["-c", '. "$1"; ggd_host GGD_MINI_USER mini', "_", join(wt, "scripts/_hosts.sh")], { encoding: "utf8", env });
  expect(r.stdout, `⛔ worktree 讀不到主工作樹那一份 ⇒ D 會死\n${r.stderr}`).toBe(FAKE);
  expect(r.stderr, "⛔ 主機身分被印出來了").not.toContain(FAKE);
});
