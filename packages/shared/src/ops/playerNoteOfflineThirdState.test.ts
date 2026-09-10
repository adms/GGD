/**
 * ⭐ GH#1167 —— 兩條玩家公告閘互相矛盾：「沒票也要出一行」vs「沒查票就發＝假話」
 * ⇒ `GGD_PLAYERNOTE_NO_GH=1`（離線、沒有 gh）那條路**依定義必 exit 1**，⛔ 而它是離線時唯一的出路。
 * ⭐ 第三個狀態：離線 ⇒ 公告**待補** —— 不發、不記帳、預覽 exit 0；`--post` 拒絕（exit 4，⛔ 不是 0 也不是 1）。
 *
 * 這條守衛**真的跑**腳本：一個臨時 git repo，兩個 tag 之間一顆 `feat(client)` commit（玩家面向），
 * NO_GH=1 ⇒ 舊寫法 exit 1、新寫法預覽 exit 0 且印「待補」。⛔ 兩條閘都還在（線上模式一個字沒動）。
 * MUTATION LOG：把第三態那個 elif 拿掉 ⇒ 「離線預覽 exit 0」紅。
 */
import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(__dirname, "../../../../scripts/release-note-players.sh");
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
function repo(): string {
  const d = mkdtempSync(join(tmpdir(), "playernote-offline-"));
  git(d, "init", "-q", "-b", "main", "."); git(d, "config", "user.email", "t@t"); git(d, "config", "user.name", "t");
  git(d, "commit", "-q", "--allow-empty", "-m", "base"); git(d, "tag", "v0.1.0");
  git(d, "commit", "-q", "--allow-empty", "-m", "feat(client): 玩家看得到的東西 (#1)"); git(d, "tag", "v0.1.1");
  return d;
}
function run(cwd: string, ...args: string[]) {
  // ⚠️ 腳本開頭 `cd "$(dirname "$0")/.."` 會回到 GGD repo ⇒ 用 --since/--until 指到臨時 repo 的 tag 做不到；
  //   所以把腳本複製到臨時 repo 的 scripts/ 底下跑，它的相對路徑就指到臨時 repo。
  execFileSync("mkdir", ["-p", join(cwd, "scripts")]);
  execFileSync("cp", [SCRIPT, join(cwd, "scripts/release-note-players.sh")]);
  const r = spawnSync("bash", ["scripts/release-note-players.sh", ...args], {
    cwd, encoding: "utf8", env: { ...process.env, GGD_PLAYERNOTE_NO_GH: "1", GGD_DISCORD_WEBHOOK: "", GGD_DEPLOYED_LEDGER: "/nonexistent" },
  });
  return { code: r.status, out: r.stdout + r.stderr };
}
describe("GH#1167 離線的第三個狀態", () => {
  it("★ 離線預覽：有玩家面向 commit、沒查票 ⇒ exit 0 且印「待補」（⛔ 舊寫法 exit 1）", () => {
    const r = run(repo());
    expect(r.out).toContain("待補");
    expect(r.code).toBe(0);
  });
  it("離線 --post ⇒ 拒絕發（exit 4），⛔ 不是靜靜地成功", () => {
    const r = run(repo(), "--post");
    expect(r.code).toBe(4);
    expect(r.out).toContain("拒絕 --post");
  });
});
