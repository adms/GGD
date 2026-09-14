/**
 * noNodeModulesSymlinks.test.ts —— 版控裡不可以有 `node_modules` 符號連結、也不可以有指到 repo 外的連結（GH#1254）。
 *
 * ⚠️ 量到的形狀：`tools/lod-gen/node_modules -> ../w3x-import/node_modules` 從初始 commit 起被追蹤（純 Python 工具，沒有人用）；
 * worktree 裡還有兩條 `-> /Users/Takuro/GGD/...` 的**絕對**連結，而 `.gitignore:2` 的 `node_modules/`（尾斜線）
 * **只擋目錄、不擋連結** ⇒ 一次 `git add` 就把作者機器的路徑送進 public repo；而且它們讓
 * `syncPlan.mjs` 的 unknown 永遠非空 ⇒ `sync.mjs --since` 裁剪永遠退化成全跑。
 * ⭐ `worktree.mjs` 自己記著：連結過去的 node_modules 會讓 lane **測到別棵樹**（node 走 realpath）。
 *
 * ⭐ 兩個方向（一把只驗單邊的尺不算自證）：出貨樹 0 條違規 **且** 一份造出來的違規樹掃得到。
 * 突變（跑過，commit 訊息記）：`violations()` 的 `node_modules` 條件拿掉 ⇒ 哨兵那條紅。
 */
import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, posix } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, encoding: "utf8", maxBuffer: 1 << 28 });

/** 版控裡的每一條符號連結 → 違規理由（沒有違規就不列）。從 **index** 讀，⛔ 不是掃資料夾。 */
function violations(repo: string): string[] {
  const out: string[] = [];
  for (const rec of git(repo, "ls-files", "-s", "-z").split("\0")) {
    const m = /^120000 ([0-9a-f]+) \d\t(.+)$/.exec(rec);
    if (!m) continue;
    const [, sha, path] = m as unknown as [string, string, string];
    const target = git(repo, "cat-file", "-p", sha);
    if (path.split("/").includes("node_modules")) out.push(`${path} 是 node_modules 連結（→ ${target}）`);
    else if (target.startsWith("/")) out.push(`${path} 指到絕對路徑 ${target}`);
    else if (posix.normalize(posix.join(posix.dirname(path), target)).startsWith("..")) out.push(`${path} 指到 repo 外 ${target}`);
  }
  return out;
}

describe("版控內的符號連結衛生（GH#1254）", () => {
  it("出貨樹 0 條違規；造一份違規樹掃得到（⛔ 尺不是瞎的）", () => {
    expect(violations(REPO), "版控裡有不該有的符號連結 —— `git rm --cached <路徑>`（⛔ 不刪檔）").toEqual([]);

    const box = mkdtempSync(join(tmpdir(), "ggd-1254-links-"));
    git(box, "init", "-q");
    mkdirSync(join(box, "tools/x"), { recursive: true });
    symlinkSync("../w3x-import/node_modules", join(box, "tools/x/node_modules"));
    symlinkSync("/opt/elsewhere/tools/y", join(box, "tools/abs"));
    symlinkSync("docs/inside.md", join(box, "entry.md"));
    git(box, "add", "-f", "tools/x/node_modules", "tools/abs", "entry.md");
    const v = violations(box);
    expect(v.some((s) => s.startsWith("tools/x/node_modules")), `node_modules 連結沒被抓到：${v}`).toBe(true);
    expect(v.some((s) => s.startsWith("tools/abs")), `絕對路徑連結沒被抓到：${v}`).toBe(true);
    expect(v.some((s) => s.startsWith("entry.md")), "repo 內的相對連結被誤報").toBe(false);
  });

  it("未追蹤的 node_modules **連結**也被 .gitignore 擋住（⛔ `node_modules/` 只擋目錄）", () => {
    // 不存在的路徑 ⇒ git 當成非目錄 ⇒ 正好是「連結」的情況；⛔ 不在真 repo 裡造檔
    const r = spawnSync("git", ["check-ignore", "-q", "tools/__probe_1254__/node_modules"], { cwd: REPO });
    expect(r.status, ".gitignore 擋不住名為 node_modules 的連結 —— 補一行不帶尾斜線的 `node_modules`").toBe(0);
  });
});
