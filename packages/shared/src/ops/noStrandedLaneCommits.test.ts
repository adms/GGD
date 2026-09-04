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

/**
 * ⭐⭐ **前提：這棵樹裡有本地分支的命名空間。**
 *
 * lane 分支是 `Workflow` 的 worktree 在**本機**開的（`worktree-wf_*`），
 * ⛔ 它們從來沒有被 push ⇒ ⭐ **在 CI 的 checkout 上結構性地不存在**：
 *   · push 事件 ⇒ `actions/checkout` 只建**一條**本地分支（`main`）
 *   · pull_request 事件 ⇒ **detached HEAD，一條本地分支都沒有**
 *     （而那會讓下面 `git log … main` 直接擲出來 —— ⛔ 不是紅，是崩）
 *
 * ⇒ 在那種樹上這條守衛**量不到任何東西**。而「掃到 0 條」在這裡 ⛔ 不代表
 *   「都合乾淨了」，也 ⛔ 不代表「`LANE_BRANCH` 過期了」—— 它代表**沒驗到**。
 *
 * ⭐ 照 `tools/model-budget/report.test.ts` 的 `HAS_OVERLAY` 先例：偵測到前提
 *   缺席就**大聲說出來**再 `it.skip`，⛔ 不是靜默跳過 ——
 *   CLAUDE.md 逐字：「安靜的跳過與全過長得一樣」。
 * ⚠️ ⛔ 而**不可以**改成「0 條也算過」：那會讓 `LANE_BRANCH` 樣式過期時
 *   在**開發者的機器上**也安靜下來，而那正是這條守衛唯一會響的地方。
 */
const LOCAL_BRANCHES = git("branch", "--format=%(refname:short)")
  .split("\n")
  .map((b) => b.trim())
  // ⚠️ detached HEAD 時 `git branch` 會多印一個**偽項** `(HEAD detached at 1234abc)`
  //   —— 實測 `%(refname:short)` 逐字就是那個字串。⛔ 不濾掉它,一棵**一條本地分支
  //   都沒有**的樹會被數成 1 條而看起來像「有命名空間」。
  .filter((b) => b && !b.startsWith("("));
// ⭐ 兩個條件都要:`main` 在（下面那條要 `git log … main`,不在就是**崩**不是紅）
//   ＋ 除了它以外還有別的本地分支（＝這棵樹真的有 lane 的命名空間）。
const HAS_BRANCH_NS = LOCAL_BRANCHES.includes("main") && LOCAL_BRANCHES.length > 1;
if (!HAS_BRANCH_NS) {
  console.warn(
    "⚠️ noStrandedLaneCommits：這棵樹的本地分支是 " +
      `[${LOCAL_BRANCHES.join(", ") || "（一條都沒有 —— detached HEAD）"}]` +
      " ⇒ lane 分支**不可能**在這裡 ⇒ ⭐ **沒驗到**（⛔ 不是「沒有擱置的 commit」）。" +
      " 要驗它請在**跑過平行 lane 的工作樹**上跑。",
  );
}
const itWithLanes = HAS_BRANCH_NS ? it : it.skip;

describe("平行 lane 的 commit 不可以擱在 worktree 分支上（owner 2026-08-30）", () => {
  itWithLanes("⭐ 量尺先自證：真的看得到 lane 分支，⛔ 不是掃到 0 條在空轉", () => {
    const lanes = LOCAL_BRANCHES.filter((b) => LANE_BRANCH.test(b));
    // ⛔ 掃到 0 條 ⇒ 這條守衛什麼都沒在守（分支命名規則改了，要更新 LANE_BRANCH）
    expect(
      lanes.length,
      "一條 lane 分支都沒掃到 ⇒ LANE_BRANCH 的樣式過期了，⛔ 不是「都合乾淨了」",
    ).toBeGreaterThan(0);

    // ⭐ 反方向：main 自己⛔不可以被當成 lane 分支
    expect(LANE_BRANCH.test("main")).toBe(false);
  });

  itWithLanes("★ 每一條**新鮮的** lane 分支，它的 commit 標題 main 都要有", () => {
    const mainSubjects = new Set(git("log", "--format=%s", "main").split("\n"));
    const cutoff = Date.now() - FRESH_DAYS * 86_400_000;
    const stranded: string[] = [];

    for (const b of LOCAL_BRANCHES) {
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
