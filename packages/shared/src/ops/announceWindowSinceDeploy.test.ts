/**
 * ⭐ GH#1171 —— 玩家公告的視窗是「上一個 tag」而不是「上一次部署」⇒ 81 名英雄上線發成「系統優化更新」。
 * GH#1162 —— BMPNDD 六步裡零個閘：N 步卡 4 分鐘 0% CPU 而最後一行讀起來像「在等我寫」。
 *
 * 兩條守衛都**真的跑**腳本裡的函式（sed 抽出來 source），⛔ 不是 grep 字串。
 * MUTATION LOG：① resolve_since 改回永遠回上一個 tag ⇒ 「視窗從上一次部署算」紅
 *              ② deadline 改成不 alarm ⇒ 「逾時要回非零」紅
 */
import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const RN = resolve(__dirname, "../../../../scripts/release-note-players.sh");
const SI = resolve(__dirname, "../../../../scripts/ship-it.sh");
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
function fn(src: string, name: string): string {
  const text = readFileSync(src, "utf8");
  // 單行函式（`deadline() { …; }`）與多行函式（`resolve_since() {\n…\n}`）都要抽得到
  const m = new RegExp(`^${name}\\(\\) \\{[^\\n]*\\}\\s*$`, "m").exec(text) ?? new RegExp(`^${name}\\(\\) \\{[\\s\\S]*?^\\}`, "m").exec(text);
  if (!m) throw new Error(`${src} 裡找不到 ${name}() —— 修法被拿掉了？`);
  return m[0];
}
/** 三個 tag：v1（部署過）→ v2（只打 tag）→ v3（HEAD）。舊算法會回 v2，⭐ 對的答案是 v1 的 sha。 */
function repoWithSkippedTag() {
  const d = mkdtempSync(join(tmpdir(), "announce-window-"));
  git(d, "init", "-q", "-b", "main", "."); git(d, "config", "user.email", "t@t"); git(d, "config", "user.name", "t");
  git(d, "commit", "-q", "--allow-empty", "-m", "v1"); git(d, "tag", "v0.1.0"); const deployed = git(d, "rev-parse", "HEAD");
  git(d, "commit", "-q", "--allow-empty", "-m", "v2"); git(d, "tag", "v0.1.1");
  git(d, "commit", "-q", "--allow-empty", "-m", "v3"); git(d, "tag", "v0.1.2");
  return { d, deployed, prevTag: "v0.1.1" };
}
describe("GH#1171 公告視窗從上一次部署算", () => {
  it("★ 帳本指向 v1 而中間還打了 v2 ⇒ 視窗起點是 v1 的 sha，⛔ 不是上一個 tag v2", () => {
    const { d, deployed, prevTag } = repoWithSkippedTag();
    const ledger = join(d, "_deployed.tsv"); writeFileSync(ledger, `${deployed}\tv0.1.0\t2026-09-11T00:00:00Z\tmini\n`);
    const r = spawnSync("bash", ["-c", `${fn(RN, "resolve_since")}\nNOW=v0.1.2; resolve_since`], { cwd: d, encoding: "utf8", env: { ...process.env, GGD_DEPLOYED_LEDGER: ledger } });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(deployed);
    expect(r.stdout.trim()).not.toBe(git(d, "rev-parse", prevTag));
  });
  it("沒有帳本 ⇒ 退回上一個 tag，而且**喊**出來（⛔ 不靜靜地）", () => {
    const { d, prevTag } = repoWithSkippedTag();
    const r = spawnSync("bash", ["-c", `${fn(RN, "resolve_since")}\nNOW=v0.1.2; resolve_since`], { cwd: d, encoding: "utf8", env: { ...process.env, GGD_DEPLOYED_LEDGER: join(d, "nope.tsv") } });
    expect(r.stdout.trim()).toBe(prevTag);
    expect(r.stderr).toContain("退回上一個 tag");
  });
});
describe("GH#1162 每一步有 deadline", () => {
  it("★ 逾時要回非零，而且不能等到指令自己結束", () => {
    const t0 = Date.now();
    const r = spawnSync("bash", ["-c", `${fn(SI, "deadline")}\ndeadline 1 sleep 5; echo rc=$?`], { encoding: "utf8" });
    expect(r.stdout).toMatch(/rc=[1-9]/);
    expect(Date.now() - t0).toBeLessThan(4000);
  });
});
