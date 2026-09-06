/**
 * 🧾 `trace.mjs --script <一步>` 單步量測 —— GH#1034。
 *
 * 2026-09-06 量到：`--script board:roll` 把 29,544 行的 `sync-io.json` 換成 7 行（61 支戶籍一次清空），
 * 而且讀 0 —— 探針瞎了（`os.tmpdir()` 是 symlink，子行程 cwd 是真身 ⇒ `startsWith(root)` 全空）。
 * ⭐ 這條閘**真的跑 `trace.mjs`**，在一個假的小 repo 上（`--repo`／`--sandbox` 都是 temp），
 * ⛔ 永遠不碰真的 `tools/parallel-gates/sync-io.json`。
 *
 * 突變（一批一條）：trace.mjs 的 `if (refused.length && ALLOW_EMPTY === null)` → `if (false && …)`
 * ⇒ ② 的「exit ≠ 0 且檔案不動」紅（實測 exit 0、io.json 多出兩步）。
 *
 * ⭐ GH#1056（③④）：沙盒陳舊判準改成**依賴指紋**（只改 script ⇒ 重用；改依賴 ⇒ 重建）；
 * genrun 的對帳快照對探針隱形（走 genrun 的步驟 reads 只含它真的讀的）。兩條各校準**兩個方向**。
 * 突變：genrun.sh 的 `env -u GGD_TRACE_LOG -u GGD_TRACE_ROOT` 拿掉 ⇒ ④ 紅（reads 多出 docs/other.md）。
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const TRACE = join(REPO, "tools/parallel-gates/trace.mjs");
const py = (s: string) => `python3 -c "${s}"`;

/**
 * 假 repo：a 寫 in.md ＋ 當日帳本；b 讀 in.md 與 `docs/_daily/2026-01-01.md` 再寫 out.md；z:blind 是純 shell（探針結構上看不見）；
 * g 走**真的 genrun.sh**（含 content-tree-lock ＋ reconcile 快照）讀 in.md 寫 out2.md。
 * ⭐ 它是一個 git repo（沙盒重用的增量同步要有 git 基準），戶籍住在 `tools/parallel-gates/sync-io.json`（reconcile 的預設路徑）。
 */
function fixture() {
  const tmp = mkdtempSync(join(tmpdir(), "ggd-trace-1034-"));
  const repo = join(tmp, "repo");
  mkdirSync(join(repo, "docs/_daily"), { recursive: true });
  cpSync(join(REPO, "tools/parallel-gates/hooks"), join(repo, "tools/parallel-gates/hooks"), { recursive: true });
  for (const f of ["tools/parallel-gates/reconcile.mjs", "scripts/genrun.sh", "scripts/content-tree-lock.py", "scripts/product-quarantine.sh"])
    cpSync(join(REPO, f), join(repo, f));
  const pkg = { name: "fake", devDependencies: {} as Record<string, string>, scripts: {
    "fake:sync": "pnpm a:step && pnpm b:step && pnpm c:step",
    "a:step": py("open('docs/in.md','w').write('x')"),
    "b:step": py("open('docs/in.md').read();open('docs/_daily/2026-01-01.md').read();open('docs/out.md','w').write('y')"),
    "c:step": py("pass"),
    "z:blind": "cp docs/in.md docs/blind.md && true",
    "g:step": "bash scripts/genrun.sh g:step g:step:raw",
    "g:step:raw": py("open('docs/in.md').read();open('docs/out2.md','w').write('y')"),
  } };
  const writePkg = () => writeFileSync(join(repo, "package.json"), JSON.stringify(pkg));
  writePkg();
  writeFileSync(join(repo, "docs/in.md"), "x");
  writeFileSync(join(repo, "docs/other.md"), "o"); // c:step 的產物，在磁碟上 ⇒ 對帳快照會 statSync 它
  writeFileSync(join(repo, "docs/_daily/2026-01-01.md"), "d");
  const io = join(repo, "tools/parallel-gates/sync-io.json");
  writeFileSync(io, `${JSON.stringify({ script: "fake:sync", chain: "pnpm a:step && pnpm b:step && pnpm c:step", passes: 2, steps: [
    { name: "a:step", ok: true, ms: 1, readCount: 1, writeCount: 2, reads: [], writes: ["docs/_daily/????-??-??.md", "docs/in.md"] },
    { name: "b:step", ok: true, ms: 1, readCount: 1, writeCount: 1, reads: ["docs/c.md"], writes: ["docs/out.md"] },
    { name: "c:step", ok: true, ms: 1, readCount: 1, writeCount: 2, reads: ["docs/in.md"], writes: ["docs/c.md", "docs/other.md"] },
  ], mergeNote: "留著" }, null, 2)}\n`);
  const git = (...a: string[]) => spawnSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...a], { encoding: "utf8" });
  git("init", "-q"); git("add", "-A"); git("commit", "-qm", "init");
  const run = (...args: string[]) =>
    spawnSync("node", [TRACE, "--repo", repo, "--sandbox", join(tmp, "sb"), "--out", io, ...args], { encoding: "utf8" });
  return { io, run, repo, pkg, writePkg, sb: join(tmp, "sb") };
}

describe("trace.mjs --script <一步> (trace-single-step, GH#1034)", () => {
  it("① 單步 ⇒ 只動那一步（聯集 ＋ 日期戳→glob），其餘步驟逐位元組不變", () => {
    const { io, run } = fixture();
    const before = JSON.parse(readFileSync(io, "utf8"));
    const r = run("--script", "b:step");
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const after = JSON.parse(readFileSync(io, "utf8"));
    expect(after.steps.map((s: { name: string }) => s.name)).toEqual(["a:step", "b:step", "c:step"]);
    for (const i of [0, 2]) expect(JSON.stringify(after.steps[i]), "別的步驟被動了").toBe(JSON.stringify(before.steps[i]));
    expect(after.steps[1].reads, "舊 reads ∪ 新 reads，且當日帳本已正規化成 glob").toEqual(["docs/_daily/????-??-??.md", "docs/c.md", "docs/in.md"]);
    expect(after.steps[1].writes).toEqual(["docs/out.md"]);
    expect(after.mergeNote, "頂層其他欄位要留著").toBe("留著");
  });

  it("② 量到 0 讀 ⇒ 非零離開、檔案一個位元組不動、訊息指名；--allow-empty-reads 帶理由才放行", () => {
    const { io, run } = fixture();
    const before = readFileSync(io, "utf8");
    const r = run("--script", "z:blind");
    expect(r.status, "空量測寫進去了").not.toBe(0);
    expect(r.stderr).toContain("探針沒抓到");
    expect(r.stderr).toContain("cp docs/in.md docs/blind.md");
    expect(readFileSync(io, "utf8")).toBe(before);
    expect(run("--script", "z:blind", "--allow-empty-reads").status, "沒帶理由也放行了").toBe(2);
    expect(run("--script", "z:blind", "--allow-empty-reads", "純 shell").status).toBe(0);
    expect(JSON.parse(readFileSync(io, "utf8")).steps.length, "帶理由 ⇒ 併入（接在最後）").toBe(5);
  });
});
