/**
 * `.gitignore` 不可以吃掉原始碼（GH#1038）。
 *
 * ⭐ 被踩出來的：`.gitignore:20 build/` 不帶錨 ⇒ 任何深度都吃 ⇒ 原始碼目錄
 *   `apps/client/src/build/`（task #66 的守衛 `buildStamp.test.ts`）**六週沒進過 git** ——
 *   本機一切綠（檔在磁碟上），CI 紅（檔不在 git）。與 #1013 的 `**/coverage` 同形：
 *   一條為產物寫的 ignore 規則吃掉同名的原始碼，⛔ 而本機沒有任何東西會紅。
 *
 * 兩個方向（一把只驗過單邊的尺不算自證過）：
 *   ① 正方向：`src/` 底下的 build/ 探針**不**被吃、真的產物位置**仍**被吃（放行過寬 ⇒ 產物進 git）
 *   ② 反方向：從**實體**走 —— `git ls-files --others --ignored` 列出的原始碼檔要嘛 0 個、
 *      要嘛在豁免表（每列一個能被反駁的理由）；其餘 ⇒ 紅並指名**哪一條規則**吃了它。
 *   ⚠️ 反方向看的是「本機有、git 沒有」—— 在 CI 的乾淨 checkout 上它多半是空的，
 *      所以真正會叫的是**開發機**上的這條（正是缺陷長出來的地方）。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const git = (args: string[], input?: string): string =>
  execFileSync("git", args, { cwd: REPO, stdio: ["pipe", "pipe", "pipe"], input, maxBuffer: 1 << 28 }).toString();
const SOURCE = /\.(ts|tsx|mts|cts|js|mjs|cjs|go|py)$/;
/** 豁免表：被 ignore 是**對的**的原始碼。⛔ 加一列要帶一個能被反駁的理由。 */
const EXEMPT: { where: RegExp; why: string }[] = [
  { where: /(^|\/)node_modules\//, why: "第三方相依 —— lockfile 重建得出來，⛔ 不是我們的原始碼" },
  { where: /(^|\/)dist\//, why: "Vite／tsc 產物（apps/*/dist 的 .js chunk）—— 這個 repo 沒有手寫原始碼住在 dist/ 底下" },
  { where: /^(build|(apps|packages|tools)\/[^/]+\/build)\//, why: "產物住的深度（與 .gitignore 四條錨定規則同一組）—— ⚠️ src/ 底下的 build 刻意不在這裡" },
  { where: /(^|\/)\.venv\//, why: "python venv（tools/**/.venv · voice-reference-pipeline/.venv）—— requirements 重建得出來" },
  { where: /(^|\/)__pycache__\//, why: "python 位元組碼 —— 純產物" },
  { where: /^scratchpad\//, why: "agent 誤寫到 repo 根的暫存（真的暫存在 session dir）" },
  { where: /(^|\/)(\.backup[^/]*|backup-[^/]*)\//, why: "整樹快照（vitest.config.ts）—— 每一份都是某個 commit 的副本" },
  { where: /^docs\/legacy\/_overwrites\/.*\/\.claude\/worktrees\//, why: "覆蓋前留底裡夾帶的 worktree 副本 —— 本體在各自的分支上" },
];

/** `git check-ignore -q`：離開碼 0 = 被吃、1 = 沒被吃；其他 ⇒ 擲出（⛔ 不要讓錯誤長得像「沒被吃」）。 */
function ignored(p: string): boolean {
  try { git(["check-ignore", "-q", "--", p]); return true; }
  catch (e) { if ((e as { status?: number }).status === 1) return false; throw e; }
}

describe("`.gitignore` 不可以吃掉原始碼（GH#1038）", () => {
  it("正方向：src/ 底下的 build/ 是原始碼；產物位置的 build/ dist/ 仍被吃", () => {
    for (const p of ["apps/client/src/build/buildStamp.test.ts", "packages/shared/src/build/x.ts", "tools/x/src/deep/build/y.go"])
      expect(ignored(p), `${p} 被 .gitignore 吃掉了 —— 那是原始碼（本機綠、CI 紅的形狀）`).toBe(false);
    for (const p of ["build/x.js", "apps/client/build/x.js", "apps/client/dist/x.js", "tools/bgm-gen/build/x.wav"])
      expect(ignored(p), `${p} 沒被吃 —— 放行過寬，產物會進 git`).toBe(true);
  });

  it("反方向：從實體走 —— 被 ignore 的原始碼檔 ⇒ 0 個，或在帶理由的豁免表", () => {
    const eaten = git(["ls-files", "--others", "--ignored", "--exclude-standard", "-z"])
      .split("\0").filter((p) => p && SOURCE.test(p));
    const stray = eaten.filter((p) => !EXEMPT.some((e) => e.where.test(p)));
    // `check-ignore -v -z --stdin` 每一條路徑回四段：<來源檔> <行號> <樣式> <路徑>
    const blame = stray.length ? git(["check-ignore", "-v", "-z", "--stdin"], stray.join("\0") + "\0").split("\0") : [];
    const rows = stray.map((p, i) => `${p}  ← ${blame[i * 4] ?? "?"}:${blame[i * 4 + 1] ?? "?"} 「${blame[i * 4 + 2] ?? "?"}」`);
    expect(rows, `被 .gitignore 吃掉的原始碼（本機有、git 沒有 ⇒ CI 上不存在）：\n  ${rows.join("\n  ")}`).toEqual([]);
  });
});
