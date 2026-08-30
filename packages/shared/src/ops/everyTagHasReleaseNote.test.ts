import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * ⛔⛔ **一個沒有 release note 的 tag，等於一個答不出「這一版做了什麼」的版本。**
 *
 * CLAUDE.md 逐字：「每一次 `git push` 都要帶 GitHub release note」。
 *
 * ⭐ 2026-08-30 owner 一句話揪到：**v0.32.0–v0.32.5 六個 tag 一個 note 都沒有**
 *   （而 v0.32.6 / v0.32.7 有 —— ⇒ ⭐ 「有些有、有些沒有」比全部沒有更難發現）。
 *
 * ⚠️⚠️ ⭐ **我第一版寫的根因是錯的，當場更正**（第三守則也管我自己的註解）：
 *   我寫「`ship-it.sh` 的 N 步只印出『下一步：gh release create …』⇒ 它看起來跑過了」。
 *   ⛔ **那不成立** —— 讀 `scripts/ship-it.sh:36-38`，它逐字印
 *   「⚠️ $TAG **還沒有 release note**」**並且** `FAIL="${FAIL}note "`，
 *   而收尾那一段會把沒過的步驟逐個列出來。
 *   ⇒ ⭐ **腳本每一次都正確地喊了，⛔ 而沒有處理它的是我。**
 *
 * ⭐ 所以這條閘要擋的**不是**「腳本會不會說」，是「**說了之後有沒有人做**」——
 *   ⇒ 它必須是一條**會紅的測試**（跑 `pnpm test` 就會看到），
 *   ⛔ 而不是部署流程裡的第 N 行警告（那一行會被下一頁輸出捲走）。
 *
 * ⚠️ 這與 CLAUDE.md 的元規則同一句：**判準 0/4 全破，只有閘有用。**
 *
 * ⭐ 這條閘問的是**兩個名詞的關係**（⛔ 不是「有沒有 tag」）：
 *   「**每一個 tag，GitHub 上有沒有一份對應的 release？**」
 *
 * ⚠️ 它需要 `gh` 且要連得上網。⭐ 連不上時它**明說「沒驗到」再跳過**，
 *   ⛔ 不是安靜地綠 —— 安靜的跳過與全過長得一樣（CLAUDE.md：fail-open 沒錯，靜默才是缺陷）。
 */

const REPO = new URL("../../../..", import.meta.url).pathname;

const sh = (cmd: string, args: string[]): string | null => {
  try {
    return execFileSync(cmd, args, { cwd: REPO, encoding: "utf8", timeout: 60_000 }).trim();
  } catch {
    return null;
  }
};

/** ⭐ 只管**最近**的 —— 一個半年前的 tag 現在補 note 沒有人受益。 */
const RECENT = 12;

describe("每一個 tag 都要有 release note（owner 2026-08-30 揪到 6 個沒有）", () => {
  it("⭐ 量尺先自證：真的看得到 tag，⛔ 不是掃到 0 在空轉", () => {
    const tags = sh("git", ["tag", "-l", "v*"])?.split("\n").filter(Boolean) ?? [];
    expect(tags.length, "一個 v* tag 都沒有 ⇒ 樣式過期了，⛔ 不是「還沒發過版」").toBeGreaterThan(0);
  });

  it("★ 最近的每一個 tag，GitHub 上都要有 release", () => {
    const tags = (sh("git", ["tag", "-l", "v*", "--sort=-creatordate"]) ?? "")
      .split("\n")
      .filter(Boolean)
      .slice(0, RECENT);
    if (tags.length === 0) return;

    // ⭐ 一次撈完（⛔ 不是每個 tag 打一次 API）
    const listed = sh("gh", ["release", "list", "--limit", "200", "--json", "tagName", "-q", ".[].tagName"]);
    if (listed === null) {
      // ⭐ 連不上就**說出來**，⛔ 不是安靜地綠
      console.warn(
        "⚠️ 這條閘**沒有驗到** —— `gh release list` 跑不起來（沒登入／沒網路）。\n" +
          "   ⛔ 這不是「全部都有 note」。要驗：`gh auth status` 然後重跑。",
      );
      return;
    }
    const have = new Set(listed.split("\n").filter(Boolean));
    const missing = tags.filter((t) => !have.has(t));

    expect(
      missing,
      [
        "⛔⛔ 這些 tag **沒有 release note** —— 而 CLAUDE.md 逐字：",
        "   「每一次 `git push` 都要帶 GitHub release note」。",
        ...missing.map((t) => `   · ${t}`),
        "",
        "⭐ 補法（⛔ 不要憑印象寫 —— 從**真的 commit** 生成）：",
        "   git log --format='%s' <上一個 tag>..<這個 tag>",
        "   gh release create <tag> --title ... --notes-file <檔>",
        "",
        "⚠️ ⭐ 而**回補不是修法** —— 要問的是「那一版當時為什麼沒發出來」。",
        "   2026-08-30 的答案：`ship-it.sh` 的 N 步只**印出**「下一步：gh release create …」",
        "   ⇒ 它看起來跑過了。⛔ 一句「下一步是⋯」與「我做了⋯」在終端上長得一模一樣。",
      ].join("\n"),
    ).toEqual([]);
  });
});
