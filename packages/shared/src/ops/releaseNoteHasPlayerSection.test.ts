import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * ⛔⛔ **Discord 公告與 GitHub release note 各自寫、各自漂。**
 *
 * ⭐ 2026-08-30 owner 揪到（逐字）：
 *
 * > 「不對阿 你 discord 都到 v0.32.10，github 卻缺了一堆沒有批配阿」
 *
 * 量到的**兩個**缺口：
 * · 229 個 tag 只有 **219 個 release**（缺 10 個，全部是舊的）
 * · ⭐ 更嚴重：**5 行我發給玩家的話，對應的 release note 裡一個字都沒有**
 *   （v0.32.3 的光束／友方技能／fist-claw · v0.32.9 的金橘色 · v0.32.10 的攻擊鈕）
 *
 * ⇒ ⭐ **根因不是誰忘了** —— 是我把兩份東西**從不同的來源各自寫了一次**
 *   （release note 從 commit 訊息、Discord 從票的 `--player` 那一行）。
 *   ⚠️ 第〇·四守則：**同一個事實有兩個住處，它們就會漂。**
 *
 * ⭐ 這條閘釘住的不變量是：
 *   **每一個 release note 裡都要有一個「玩家看得到的」段落。**
 *   ⇒ 有了它，Discord 那一則就**推導得出來**（⛔ 不必第二次手寫）。
 *
 * ⚠️ ⭐ 而「這一版沒有玩家可見的改動」**不是**跳過它的理由 ——
 *   owner 2026-08-30 另一則逐字：
 *   > 「如果沒有對玩家有差別的改版你還是要發 **系統優化更新**」
 */

const REPO = new URL("../../../..", import.meta.url).pathname;

const sh = (cmd: string, args: string[]): string | null => {
  try {
    return execFileSync(cmd, args, { cwd: REPO, encoding: "utf8", timeout: 90_000 }).trim();
  } catch {
    return null;
  }
};

/** ⭐ 棘輪：只管**最近**的。⛔ 一個半年前的 note 現在補玩家段落沒有人受益。 */
const RECENT = 10;

/** 玩家段落的樣子（⭐ 兩種寫法都收 —— 這是**現況**，⛔ 不是我發明的格式）。 */
const PLAYER_SECTION = /🎮|玩家看得到的|系統優化更新/;

describe("每一個 release note 都要有玩家段落（owner 2026-08-30）", () => {
  it("⭐ 量尺先自證：讀得到 tag，且樣式抓得到／抓不到分得開", () => {
    const tags = sh("git", ["tag", "-l", "v*"])?.split("\n").filter(Boolean) ?? [];
    expect(tags.length, "一個 v* tag 都沒有 ⇒ 樣式過期").toBeGreaterThan(0);
    expect(PLAYER_SECTION.test("## 🎮 玩家看得到的\n- 某某")).toBe(true);
    expect(PLAYER_SECTION.test("## 修法\n改了三個檔案")).toBe(false);
  });

  it("★ 最近的 release note 裡都要有一段「玩家看得到的」", () => {
    const tags = (sh("git", ["tag", "-l", "v*", "--sort=-creatordate"]) ?? "")
      .split("\n")
      .filter(Boolean)
      .slice(0, RECENT);
    if (tags.length === 0) return;

    const listed = sh("gh", ["release", "list", "--limit", "400", "--json", "tagName", "-q", ".[].tagName"]);
    if (listed === null) {
      console.warn("⚠️ 這條閘**沒有驗到** —— `gh` 跑不起來。⛔ 這不是「全部都有玩家段落」。");
      return;
    }
    const have = new Set(listed.split("\n").filter(Boolean));

    const bad: string[] = [];
    for (const t of tags) {
      if (!have.has(t)) {
        bad.push(`${t} —— ⛔ 連 release 都沒有`);
        continue;
      }
      const body = sh("gh", ["release", "view", t, "--json", "body", "-q", ".body"]);
      if (body === null) continue;
      if (!PLAYER_SECTION.test(body)) bad.push(`${t} —— 有 release，⛔ 而裡面沒有玩家段落`);
    }

    expect(
      bad,
      [
        "⛔⛔ 這些版本的 release note **沒有玩家段落**：",
        ...bad.map((b) => `   · ${b}`),
        "",
        "⭐ 為什麼這件事重要（owner 2026-08-30 揪到的）：",
        "   Discord 公告與 release note **各自寫、各自漂** ——",
        "   量到 **5 行發給玩家的話，對應的 release note 裡一個字都沒有**。",
        "",
        "⭐ 修法：release note 裡加一段 `## 🎮 玩家看得到的`。",
        "   ⚠️ 「這一版沒有玩家可見的改動」⛔ 不是跳過的理由 —— owner 逐字：",
        "   「如果沒有對玩家有差別的改版你還是要發 **系統優化更新**」",
        "   ⇒ 那就寫「- 系統優化更新：穩定性與速度的例行維護。」",
        "",
        "⭐ 有了這一段，Discord 那一則就**推導得出來** ⇒ 兩邊不可能再漂。",
      ].join("\n"),
    ).toEqual([]);
  });
});
