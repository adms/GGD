import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⛔⛔ **追加式帳本在 merge/cherry-pick 的時候會被靜默吃掉。**
 *
 * ⭐ 2026-08-30 同一天發生**兩次**，兩次都是 cherry-pick 衝突落在帳本上：
 *   · 第一次：`git checkout --theirs` ⇒ **我的 5 列**被吃掉（含另一條 lane 的 2 列）
 *   · 第二次：又一輪 cherry-pick ⇒ 再掉 **12 列**（131 → 119）
 *
 * ⭐ **判準：追加式檔案的合併永遠是「兩邊都留」，⛔ 不是二選一。**
 *   `--ours` 吃掉對方的列 · `--theirs` 吃掉我的列 —— ⛔ **兩個都是錯的**。
 *
 * ⚠️ ⭐ 而它**不會有任何東西紅**：統計區跟著變小，整份檔案看起來完全自洽。
 *   ⇒ 抓到它的只有**計數**（`rule-slip.sh --check` 的 123 → 119），⛔ 不是眼睛。
 *
 * ⇒ 這條閘問的是**一個跨時間的關係**：
 *   「**這份帳本的列數，有沒有比它在 git 歷史裡的任何一版都少？**」
 *   ⭐ 一份追加式帳本只會變長。變短 ＝ 有東西被吃掉了。
 */

const REPO = join(import.meta.dirname, "../../../..");

/** ⭐ 每一份都要寫得出「它為什麼只能變長」。 */
const LEDGERS: { path: string; row: RegExp; why: string }[] = [
  {
    path: "docs/守則犯錯.md",
    row: /^\| *2026-\d{2}-\d{2}/,
    why: "owner 2026-08-27 要的犯錯統計 —— 它統計的是**頻率**，少一列就是統計說謊。",
  },
  {
    path: "docs/legacy/_overwrites/_ledger.tsv",
    row: /^\d{8}-\d{6}\t/,
    why: "覆寫留底的帳本 —— 少一列 ＝ 一份備份**存在於磁碟卻查不到**。",
  },
];

const git = (...a: string[]): string =>
  execFileSync("git", a, { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();

const countRows = (text: string, row: RegExp): number =>
  text.split("\n").filter((l) => row.test(l)).length;

describe("追加式帳本只能變長（2026-08-30 一天被吃掉兩次）", () => {
  it("⭐ 量尺先自證：真的數得到列，⛔ 不是掃到 0 在空轉", () => {
    for (const L of LEDGERS) {
      const p = join(REPO, L.path);
      if (!existsSync(p)) continue;
      expect(
        countRows(readFileSync(p, "utf8"), L.row),
        `${L.path} 一列都數不到 ⇒ 列的樣式過期了，⛔ 不是「帳本空了」`,
      ).toBeGreaterThan(0);
    }
  });

  it("★ 每一份帳本今天的列數 ≥ 它在 git 歷史裡的**最大**列數", () => {
    const shrunk: string[] = [];
    for (const L of LEDGERS) {
      const p = join(REPO, L.path);
      if (!existsSync(p)) continue;
      const now = countRows(readFileSync(p, "utf8"), L.row);

      let peak = 0;
      let peakAt = "";
      // ⭐ 只看最近 60 個動到它的 commit —— 再往前的成本大於價值，
      //   而「被吃掉」這件事都是在合併的當下發生的（幾小時內）。
      for (const h of git("log", "--format=%h", "-60", "--", L.path).split("\n")) {
        if (!h.trim()) continue;
        let text: string;
        try {
          text = git("show", `${h}:${L.path}`);
        } catch {
          continue;
        }
        const n = countRows(text, L.row);
        if (n > peak) {
          peak = n;
          peakAt = h;
        }
      }
      if (now < peak) {
        shrunk.push(
          `${L.path}: 今天 ${now} 列，而 ${peakAt} 有 ${peak} 列 ⇒ 掉了 ${peak - now} 列\n` +
            `      為什麼它只能變長：${L.why}`,
        );
      }
    }

    expect(
      shrunk,
      [
        "⛔⛔ 追加式帳本**變短了** —— 多半是一次 merge/cherry-pick 的衝突解法吃掉了一邊：",
        ...shrunk.map((s) => `   ${s}`),
        "",
        "⭐ 救回來（取全歷史的聯集，⛔ 不是挑一邊）：",
        "   for h in $(git log --format=%h -40 -- <帳本>); do git show $h:<帳本>; done \\",
        "     | grep -E '<列的樣式>' | sort -u",
        "",
        "⭐ 而下一次衝突時：**兩邊的新列都要留**。",
        "   ⛔ `--ours` 吃掉對方的列，⛔ `--theirs` 吃掉我的列 —— 兩個都是錯的。",
      ].join("\n"),
    ).toEqual([]);
  });
});
