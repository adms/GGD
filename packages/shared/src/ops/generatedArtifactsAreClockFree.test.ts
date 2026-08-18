/**
 * ⭐【進版控的產物：跑兩次要**逐位元組相同**】（GH#389）
 *
 * CLAUDE.md 對 `caps:export` / `spec:build` 明寫這是**刻意避開**的：
 *
 *   > 任何隨時鐘變動的欄位都會讓逐位元組比對永遠不相等，於是 `--check` 只能被放寬成
 *   > 模糊比對 —— **而一條被放寬的閘等於沒有閘。**
 *
 * 而 2026-08-18 量到有兩份產物沒照這條做，各自蓋了一格 `generatedAt`：
 *
 *   content/editor-target-profile.json        唯一 diff：generatedAt 17:30:43 → 18:06:48
 *   content/assets/model-budget/report.json    唯一 diff：generatedAt 17:30:10 → 18:06:13
 *
 * 兩個後果：① 它們的新鮮度守衛不可能是逐位元組的（editor-profile 那條當時只比
 * `profileDigest`，於是欄位順序／縮排／連 digest 本身被手改都逃得過）；
 * ② 每一次 build 都在 `git status` 製造噪音，稀釋「有沒有東西該 commit」這個訊號 ——
 * 而那正是 2026-08-02 那次生產事故（未追蹤來源被烘進產物）賴以被發現的訊號。
 *
 * ⚠️ 這條刻意**真的把產生器跑兩次**，⛔ 不是掃原始碼找 `new Date()`（失敗形態⑥）：
 * 時鐘可以從十幾個地方混進來（`Date.now()`、`mtime`、`toLocaleString`、
 * 一個帶時間的相依），而它們全部逃得過字串掃描。跑兩次逃不掉。
 *
 * 突變紀錄（跑過）：把 `generatedAt: new Date().toISOString()` 加回
 * `emit_report.ts` 的 report 物件 → 第二條紅並印出兩次的 sha 不同。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderEditorTargetProfile } from "../../scripts/buildEditorTargetProfile";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

describe("進版控的產物不可以蓋時鐘", () => {
  it("🔴 editor-target-profile：連續兩次產生逐位元組相同", () => {
    const a = renderEditorTargetProfile();
    const b = renderEditorTargetProfile();
    expect(
      sha(b),
      "editor-target-profile.json 的內容會隨執行而變 —— 它是對外契約，" +
        "⛔ 一個隨時鐘變動的欄位會讓 shippedEditorProfileIsCurrent 退化成模糊比對。",
    ).toBe(sha(a));
  });

  it("🔴 model-budget report：真的跑兩次產生器，逐位元組相同", () => {
    // ⚠️ 寫到暫存目錄，⛔ 不碰工作區（跑守衛不可以讓 `git status` 變髒）。
    const dir = mkdtempSync(join(tmpdir(), "ggd-budget-"));
    const run = (name: string): string => {
      execFileSync("pnpm", ["exec", "tsx", "tools/model-budget/emit_report.ts", "--out", join(dir, name)], {
        cwd: REPO,
        encoding: "utf8",
        stdio: "pipe",
      });
      return readFileSync(join(dir, name), "utf8");
    };
    const first = run("a.json");
    const second = run("b.json");
    expect(
      sha(second),
      "emit_report.ts 兩次輸出不同 —— 它是進版控的產物，每跑一次就髒一次會稀釋" +
        "「有沒有東西該 commit」這個訊號。⛔ 產物的身分要從輸入推導（sourcesDigest），不是從時鐘。",
    ).toBe(sha(first));
    // ⛔ 而且輸出不可以是空的：產生器整支壞掉時上面那條**也會綠**（兩個空檔相等）。
    expect(JSON.parse(first).models.length).toBeGreaterThan(0);
  }, 60_000);
});
