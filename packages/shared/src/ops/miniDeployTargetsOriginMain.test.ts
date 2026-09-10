/**
 * ⭐ GH#1184 —— **mini-deploy 對到本機 HEAD，而 HEAD 是 origin/main 的較舊祖先時它靜靜部署了舊的。**
 *
 * 2026-09-10 實測：本機 HEAD = PR tip `20bb3c827`（祖先檢查 ✅ 過），origin/main = 合併 `07d90f991`
 * ⇒ mini 版本戳 `v0.43.6-13-g20bb3c827`，線上是 lane 舊的 bundle（models 288 而非 290）。
 * ⭐ 七段後置條件全綠 —— 它們驗「部署的那一個好不好」，⛔ 沒有一段驗「是不是最新」（形態⑪）。
 *
 * ⭐ 這條守衛**真的跑**腳本裡的 `resolve_deploy_target`（用 sed 把函式本體抽出來 source），
 * 在一個真的 git repo 上造出「本機落後 origin 2 個 commit」，⛔ 不是 grep 字串。
 * MUTATION LOG（落地前跑過）：預設 `${GGD_DEPLOY_SHA:-$tip}` 改成 `${GGD_DEPLOY_SHA:-$head}`
 * ⇒ 「預設部署 origin/main 的 tip」紅。
 */
import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(__dirname, "../../../../scripts/mini-deploy.sh");
const git = (cwd: string, ...a: string[]): string =>
  execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

/** 從腳本抽出函式本體 —— ⭐ 測的是出貨的那一段，⛔ 不是抄一份進測試。 */
function fnSource(): string {
  const src = readFileSync(SCRIPT, "utf8");
  const m = /^resolve_deploy_target\(\) \{[\s\S]*?^\}/m.exec(src);
  if (!m) throw new Error("scripts/mini-deploy.sh 裡找不到 resolve_deploy_target() —— GH#1184 的修法被拿掉了？");
  return m[0];
}

/** 造：bare origin ＋ 一個落後 2 個 commit 的本機 clone。回傳 { clone, head, tip }。 */
function makeRepos() {
  const root = mkdtempSync(join(tmpdir(), "mini-target-"));
  const origin = join(root, "origin.git");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  const w = join(root, "w");
  execFileSync("git", ["clone", "-q", origin, w], { stdio: "ignore" });
  git(w, "config", "user.email", "t@t"); git(w, "config", "user.name", "t");
  git(w, "commit", "-q", "--allow-empty", "-m", "base");
  git(w, "push", "-q", "origin", "HEAD:main");
  const clone = join(root, "local");
  execFileSync("git", ["clone", "-q", origin, clone], { stdio: "ignore" });
  const head = git(clone, "rev-parse", "HEAD");
  // origin 再往前走兩步（別的 session 推的）
  git(w, "commit", "-q", "--allow-empty", "-m", "ahead-1");
  git(w, "commit", "-q", "--allow-empty", "-m", "ahead-2");
  git(w, "push", "-q", "origin", "HEAD:main");
  const tip = git(w, "rev-parse", "HEAD");
  git(clone, "fetch", "-q", "origin"); // 本機 object store 有 tip，但 HEAD 沒動 —— 正是 2026-09-10 的形狀
  return { clone, head, tip };
}

function run(clone: string, env: Record<string, string> = {}) {
  const r = spawnSync("bash", ["-c", `${fnSource()}\nresolve_deploy_target "$1"`, "_", clone], {
    encoding: "utf8",
    env: { ...process.env, ...env, GGD_DEPLOY_SHA: env.GGD_DEPLOY_SHA ?? "" },
  });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr };
}

describe("GH#1184 部署目標（⭐ 真的跑腳本裡的函式）", () => {
  it("★ 本機 HEAD 落後 origin/main 時，預設部署 origin/main 的 tip，並且**喊**出落後幾個", () => {
    const { clone, head, tip } = makeRepos();
    const r = run(clone);
    expect(r.code).toBe(0);
    expect(r.out).toBe(tip);                       // ⛔ 舊寫法這裡會是 head
    expect(r.out).not.toBe(head);
    expect(r.err).toMatch(/落後 origin\/main .* 2 個 commit/);
  });

  it("GGD_DEPLOY_SHA 明說 ⇒ 部署那一個（回滾用），而且 stderr 明說它不是 tip", () => {
    const { clone, head, tip } = makeRepos();
    const r = run(clone, { GGD_DEPLOY_SHA: head });
    expect(r.code).toBe(0);
    expect(r.out).toBe(head);
    expect(r.err).toContain("GGD_DEPLOY_SHA 明說了");
    expect(r.err).toContain(tip.slice(0, 9));
  });

  it("目標不在本機 object store ⇒ 非零（⛔ 不靜靜退回 HEAD）", () => {
    const { clone } = makeRepos();
    const r = run(clone, { GGD_DEPLOY_SHA: "0123456789abcdef0123456789abcdef01234567" });
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("不在本機 object store");
  });
});
