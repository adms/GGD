/**
 * `.gitignore` 不可以吃掉原始碼（GH#1038）。
 *
 * ⭐ 被踩出來的：`.gitignore:20 build/` 不帶錨 ⇒ 任何深度都吃 ⇒ 原始碼目錄
 *   `apps/client/src/build/`（task #66 的守衛 `buildStamp.test.ts`）**六週沒進過 git** ——
 *   本機一切綠（檔在磁碟上），CI 紅（檔不在 git）。與 #1013 的 `coverage/` 規則同形
 *   （⚠️ 那條原本的寫法是「兩顆星＋斜線」—— 這裡刻意不逐字寫，它會把這段註解提早關掉）：
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
  { where: /^apps\/editor\/dist-player\//, why: "GH#1270 編輯器玩家版 bundle（`vite build --mode player` 的 outDir，vite.config.ts 指定）—— 與 dist/ 同為 Vite 產物，沒有手寫原始碼住在這裡" },
  { where: /^(build|(apps|packages|tools)\/[^/]+\/build)\//, why: "產物住的深度（與 .gitignore 四條錨定規則同一組）—— ⚠️ src/ 底下的 build 刻意不在這裡" },
  { where: /(^|\/)\.venv\//, why: "python venv（tools/**/.venv · voice-reference-pipeline/.venv）—— requirements 重建得出來" },
  { where: /(^|\/)__pycache__\//, why: "python 位元組碼 —— 純產物" },
  { where: /^scratchpad\//, why: "agent 誤寫到 repo 根的暫存（真的暫存在 session dir）" },
  { where: /(^|\/)(\.backup[^/]*|backup-[^/]*)\//, why: "整樹快照（vitest.config.ts）—— 每一份都是某個 commit 的副本" },
  { where: /^docs\/legacy\/_overwrites\/.*\/\.claude\/worktrees\//, why: "覆蓋前留底裡夾帶的 worktree 副本 —— 本體在各自的分支上" },
  { where: /(^|\/)vite\.config\.[^/]*\.timestamp-[^/]*\.mjs$/, why: "被殺掉的 vite／vitest 行程留下的**孤兒**暫存 bundle（與 .gitignore 的 vite.config.*.timestamp-*.mjs 同一個樣式）：Vite 載設定檔時把它寫在旁邊，正常載完就自刪；行程在載入途中被 SIGTERM／SIGKILL ⇒ 刪檔的 finally 沒跑到 ⇒ 永久留下。它是產物，⛔ 不是原始碼（GH#1211 H，CI run 34867941830；洩漏的來源見 VITE_TEMP 註解）" },
];
/**
 * CI 上真的撞見過的那一顆（GH#1211 H，CI run 34867941830）。
 *
 * ⚠️ 更正 `0166bcd26`（commit 訊息與本檔當時的註解）的兩句話，兩句都是錯的：
 *   ✗「`pnpm -r` 併行的 vitest 正在載 apps/editor 的設定，撞見一閃即逝的暫存檔」
 *   ✗「暫存檔一閃即逝，反方向那條無法穩定重現它」
 * 審查者（lane small 的 review，2026-09-15）量到的三條證據：
 *   ① CI log 開頭寫 `workspace-concurrency=1` ⇒ 16:29:42 之後只有 packages/shared 一包在跑，⛔ 沒有別的包併行
 *   ② 檔名時間戳 1789403554233 ＝ 2026-09-14T16:32:34.233Z，反方向那條到 16:39:53 才撞見
 *      ⇒ 它**至少活了 7 分 19 秒** ⇒ 是**孤兒**，⛔ 不是一閃即逝
 *   ③ 時間窗落在 `shipScriptWatchdog.test.ts`（16:32:31–45，14.3 秒）裡：那支真的跑 `ship.mjs`，
 *      看門狗地板 4 秒，並行段的 `skills:check` 按 LPT 第一支是 `formreceipts:check`，
 *      而它會跑 `pnpm --filter @ggd/editor exec vitest` ⇒ Vite 寫下暫存 bundle ⇒ 看門狗殺整組 ⇒ 沒刪到
 *   ⚠️ ③ 是**推論**（時間窗＋LPT＋本機重現機制），審查者 ⛔ 沒有實跑 ship.mjs。
 * 本機量到的兩個方向：不殺 ⇒ 169ms 自刪；載設定途中送 SIGTERM ⇒ 永久留下，
 *   ⭐ 而且只要有一顆孤兒，反方向那條**每次都紅**（訊息與 CI 同形）⇒ 它重現得了，只是要先有孤兒。
 * ⛔ 豁免列只管「它不是原始碼」；**洩漏本身沒有修**（守衛每跑一次都可能在 apps/editor 留一顆），
 *   ⚠️ 而這一列關掉了唯一會指到它的紅燈 ⇒ 要另開票追（第零守則⑧，⛔ 不在這條 lane 修）。
 * 這裡釘住那一顆，讓「豁免表認得它」是一條不依賴本機有沒有孤兒的斷言。
 */
const VITE_TEMP = "apps/editor/vite.config.ts.timestamp-1789403554233-caed338cfbfdb.mjs";

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

  it("豁免表認得 Vite 設定的暫存 bundle，⛔ 不認得設定檔本身（GH#1211 H）", () => {
    const exempt = (p: string): boolean => EXEMPT.some((e) => e.where.test(p));
    expect(ignored(VITE_TEMP), `${VITE_TEMP} 沒被 .gitignore 吃 —— 那條規則被改掉了`).toBe(true);
    expect(exempt(VITE_TEMP), "Vite 暫存 bundle 不在豁免表 ⇒ 任何一顆被殺行程留下的孤兒都會讓反方向那條紅").toBe(true);
    for (const p of ["apps/editor/vite.config.ts", "apps/client/src/timestamp-x.mjs"])
      expect(exempt(p), `${p} 是原始碼 —— 豁免表放行過寬`).toBe(false);
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
