/**
 * README 的產生區塊與 `docs/reference/*.md` 沒有過期 —— 一條**薄**守衛
 * （第零守則③：工具腳本層一條就好，⛔ 不做突變、⛔ 不開對抗輪）。
 *
 * owner 2026-08-17 要求願望清單、機制詞彙「詳細列表在 release note & github
 * 首頁說明、readme」，而那五個區塊全部是產生的。⛔ 但在這條守衛之前，
 * `pnpm docs:readme:check` 這個指令**沒有任何東西在跑它** —— 也就是說改了
 * `content/` 而忘了重新產生，README 上那份清單會安靜地變成上一版的樣子，
 * 而 GitHub 首頁正是給人看「現在有什麼」的地方。
 *
 * ⚠️ 真的把腳本跑起來，⛔ 不是掃原始碼字串（七種失敗形態的第 ⑥ 種）。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cover } from "../../testkit/cover";

const ROOT = resolve(__dirname, "../../../..");
const SCRIPT = resolve(ROOT, "tools/reference/gen_readme_lists.py");
const README = resolve(ROOT, "README.md");

describe("README 的產生區塊", () => {
  it("★ `--check` 是綠的（紅了不要改 README：跑 `pnpm docs:readme` 然後 git add）", () => {
    cover("readme-lists-fresh");
    expect(existsSync(SCRIPT), `產生器不見了：${SCRIPT}`).toBe(true);
    // 非零離開碼會讓 execFileSync 丟例外，訊息裡帶著腳本自己印的「哪一塊過期」。
    const out = execFileSync("python3", [SCRIPT, "--check"], { cwd: ROOT, encoding: "utf8" });

    /**
     * ⭐ `--check` 有**兩條合法的路**（GH#995 · #979），⛔ 而它們不是同一件事：
     *   ① `data/curation/whitelist.json` 在 ⇒ 真的逐位元組比對過 ⇒ `up to date`
     *   ② 它不在（全新 clone / CI）⇒ 產生器的輸出**取決於**這份 git-ignored 的
     *      營運狀態 ⇒ 在那台機器上「過期」與「沒過期」量起來一模一樣
     *      ⇒ 它刻意 exit 0 並印「⚠️ **沒驗到**」。
     *
     * ⛔ 走②的時候這條測試**不可以只是放行**（那就退化成 `expect(true)`）——
     *   ⭐ 要斷言它**真的說了為什麼**：哪一個檔不見了、以及去哪裡追（票號）。
     *   一個沒有說出理由的 fail-open 與一個靜默跳過沒有差別
     *   （CLAUDE.md：「fail-open 沒錯，**靜默**才是缺陷」）。
     * ⛔ 也不可以讓②在**有白名單**的機器上被走到 —— 下面第一條就是那道反向閘。
     */
    if (out.includes("沒驗到")) {
      expect(
        existsSync(resolve(ROOT, "data/curation/whitelist.json")),
        "⛔ 白名單明明在，產生器卻說「沒驗到」—— 走錯路了，這條閘等於被關掉",
      ).toBe(false);
      expect(out, "說了沒驗到，卻沒指名是**哪一個檔**不見了").toContain("data/curation/whitelist.json");
      expect(out, "說了沒驗到，卻沒留下追下去的線索（票號）").toContain("GH#995");
    } else {
      expect(out).toContain("up to date");
    }
  });

  /**
   * ⭐ GH#449 —— 上面那條**擋不住把標記刪掉**。
   *
   * `splice()` 找不到標記時是把區塊**附加在檔尾**（那是第一次 run 的 bootstrap
   * 路徑），而 `--check` 只問「產生器的輸出 == 檔案現況」。所以「刪掉一對標記 +
   * 在原地手打一份清單」之後，重新產生會讓兩者一致 —— 於是 README 中段那份
   * 手寫的清單沒有任何人在看，而全套測試是綠的（失敗形態③）。
   *
   * 這正是 GH#449 的病灶本身：README 的場地清單就是那樣手寫著「五份文件…
   * manifest 也記 `arenas: 5`」，而實際上有 13 張。
   */
  it("⛔ 產生器的每一個 BLOCKS 名字，README 裡都有一對標記（刪掉＝那份清單變回手打的）", () => {
    cover("readme-lists-fresh");
    const src = readFileSync(SCRIPT, "utf8");
    const decl = /^BLOCKS = \(([^)]*)\)/m.exec(src);
    expect(decl, "產生器裡找不到 `BLOCKS = (...)` —— 這條守衛靠它推導，⛔ 不抄一份清單").toBeTruthy();
    const blocks = [...(decl?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");
    expect(blocks.length, "BLOCKS 解析出 0 個名字").toBeGreaterThan(0);

    const readme = readFileSync(README, "utf8");
    for (const name of blocks) {
      const begin = readme.split(`<!-- BEGIN GENERATED:${name} -->`).length - 1;
      const end = readme.split(`<!-- END GENERATED:${name} -->`).length - 1;
      expect(`${name}:${begin}/${end}`, `README 少了 \`${name}\` 的標記對（或有重複）`).toBe(`${name}:1/1`);
    }
  });
});
