import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * ⛔⛔ **平行 lane 的 commit 擱在 worktree 分支上，而 main 從來沒收到它們。**
 *
 * owner 2026-08-30（逐字，⭐ 這條守衛因它而存在）：
 *
 * > 「你的工作流程常常會**重複做已經做好的**，甚至**後來做的更糟還覆蓋掉**」
 *
 * ⭐ 2026-08-30 量到**根因**：`Workflow` 的 `isolation: "worktree"` 會給每條 lane
 *   一個自己的 git worktree ＋ 一條 `worktree-wf_*` 分支。lane 在裡面 commit ——
 *   ⛔ **而沒有任何一步把那條分支合回 main**。
 *
 *   量到的：**85 個 commit · 69 條分支**（其中 7 個是當天剛跑完、剛複驗過的第八批）。
 *
 * ⇒ ⭐ 這就是 owner 點名那個病的**機制**，⛔ 不是比喻：
 *   ① lane 做完 → commit 進 worktree 分支
 *   ② 我讀 lane 的回報，以為它落地了 → 關票／寫進戰情版
 *   ③ 下一輪讀 main → **那個檔還是原樣** → ⭐ **再做一次**
 *   ⚠️ 而每一步看起來都是對的：lane 真的做了、回報真的誠實、main 真的沒有。
 *
 * ⭐ 這條守衛問的是**兩個名詞的關係**（⛔ 不是「有沒有 worktree」）：
 *   「**每一條 lane 分支上的每一個 commit，main 是不是都有了？**」
 *
 * ⚠️ ⭐ 判準用的是 **commit 標題**，⛔ 不是 sha —— 因為 `cherry-pick` 會產生新的 sha。
 *   （`git cherry` 用 patch-id，遇到帳本類的衝突解法會誤判。）
 */

const git = (...a: string[]): string =>
  execFileSync("git", a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();

/** ⭐ 棘輪：⛔ 只能變短。每一格要寫得出一個**可以被反駁的**理由。 */
const EXEMPT: Record<string, string> = {
  // 早於 2026-08-25 的實驗分支：內容已被後續版本取代或改寫，
  // ⛔ 而「取代」是量得到的 —— 它們的檔案今天在 main 上都有更新的版本。
  // ⇒ 這一格會在下面用**日期**判定，⛔ 不是逐條列名（逐條列名的表會過期）。
};

/** 分支名長得像一條 lane 的產出。 */
const LANE_BRANCH = /^(worktree-wf_|rescue\/wf_)/;

/** ⭐ 只管**新鮮的** —— 一條三天前的實驗分支不是「忘了合」，是「不要了」。 */
const FRESH_DAYS = 3;

describe("平行 lane 的 commit 不可以擱在 worktree 分支上（owner 2026-08-30）", () => {
  it("⭐ 量尺先自證：真的看得到 lane 分支，⛔ 不是掃到 0 條在空轉", () => {
    const all = git("branch", "--format=%(refname:short)").split("\n");
    const lanes = all.filter((b) => LANE_BRANCH.test(b));
    // ⛔ 掃到 0 條 ⇒ 這條守衛什麼都沒在守（分支命名規則改了，要更新 LANE_BRANCH）
    expect(
      lanes.length,
      "一條 lane 分支都沒掃到 ⇒ LANE_BRANCH 的樣式過期了，⛔ 不是「都合乾淨了」",
    ).toBeGreaterThan(0);

    // ⭐ 反方向：main 自己⛔不可以被當成 lane 分支
    expect(LANE_BRANCH.test("main")).toBe(false);
  });

  it("★ 每一條**新鮮的** lane 分支，它的 commit 標題 main 都要有", () => {
    const mainSubjects = new Set(git("log", "--format=%s", "main").split("\n"));
    const cutoff = Date.now() - FRESH_DAYS * 86_400_000;
    const stranded: string[] = [];

    for (const b of git("branch", "--format=%(refname:short)").split("\n")) {
      if (!LANE_BRANCH.test(b) || b in EXEMPT) continue;
      // 分支尖端的時間 —— ⭐ 舊的實驗分支⛔不算「忘了合」
      const tip = Number(git("log", "-1", "--format=%ct", b)) * 1000;
      if (!Number.isFinite(tip) || tip < cutoff) continue;

      for (const line of git("log", "--format=%h%x1f%s", `main..${b}`).split("\n")) {
        if (!line.trim()) continue;
        const [sha = "", subject = ""] = line.split("\x1f");
        if (!mainSubjects.has(subject)) stranded.push(`${b}  ${sha}  ${subject.slice(0, 78)}`);
      }
    }

    expect(
      stranded,
      [
        "⛔⛔ 這些 lane 的 commit **從來沒有進 main** —— 而 lane 回報的是「做完了」：",
        ...stranded.map((s) => `   ${s}`),
        "",
        "⭐ 收回來：`git cherry-pick -x <sha>`（衝突若在**追加式帳本**上，",
        "   ⛔ 不要用 --ours/--theirs —— 兩邊的新列都要留）。",
        "⭐ 真的不要了：`git branch -D <分支>`（⛔ 那才是「決定丟掉」，而不是忘記）。",
      ].join("\n"),
    ).toEqual([]);
  });
});
