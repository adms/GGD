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
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const TRACE = join(REPO, "tools/parallel-gates/trace.mjs");
const py = (s: string) => `python3 -c "${s}"`;

/** 假 repo：a 寫 in.md ＋ 當日帳本；b 讀 in.md 與 `docs/_daily/2026-01-01.md` 再寫 out.md；z:blind 是純 shell（探針結構上看不見）。 */
function fixture() {
  const tmp = mkdtempSync(join(tmpdir(), "ggd-trace-1034-"));
  const repo = join(tmp, "repo");
  mkdirSync(join(repo, "docs/_daily"), { recursive: true });
  cpSync(join(REPO, "tools/parallel-gates/hooks"), join(repo, "tools/parallel-gates/hooks"), { recursive: true });
  writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "fake", scripts: {
    "fake:sync": "pnpm a:step && pnpm b:step && pnpm c:step",
    "a:step": py("open('docs/in.md','w').write('x')"),
    "b:step": py("open('docs/in.md').read();open('docs/_daily/2026-01-01.md').read();open('docs/out.md','w').write('y')"),
    "c:step": py("pass"),
    "z:blind": "cp docs/in.md docs/blind.md && true",
  } }));
  writeFileSync(join(repo, "docs/in.md"), "x");
  writeFileSync(join(repo, "docs/_daily/2026-01-01.md"), "d");
  const io = join(tmp, "io.json");
  writeFileSync(io, `${JSON.stringify({ script: "fake:sync", chain: "pnpm a:step && pnpm b:step && pnpm c:step", passes: 2, steps: [
    { name: "a:step", ok: true, ms: 1, readCount: 1, writeCount: 2, reads: [], writes: ["docs/_daily/????-??-??.md", "docs/in.md"] },
    { name: "b:step", ok: true, ms: 1, readCount: 1, writeCount: 1, reads: ["docs/c.md"], writes: ["docs/out.md"] },
    { name: "c:step", ok: true, ms: 1, readCount: 1, writeCount: 1, reads: ["docs/in.md"], writes: ["docs/c.md"] },
  ], mergeNote: "留著" }, null, 2)}\n`);
  const run = (...args: string[]) =>
    spawnSync("node", [TRACE, "--repo", repo, "--sandbox", join(tmp, "sb"), "--out", io, ...args], { encoding: "utf8" });
  return { io, run };
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
