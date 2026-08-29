/**
 * **每一個** live 資料集都要 `build()` 得起來 —— ⭐ 而且是在**出貨容器跑得到的**條件下。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 為什麼（GH#867，2026-08-29）
 * ---------------------------------------------------------------------------
 * owner：「後台一堆服務都壞了 請你檢查」⇒ 量到 **15 個資料集全部 HTTP 500**，
 * 兩個相依缺席：`python3`（`skill90` 等）與 `git`（`tools/skill-remake/common.py:50`
 * 的 `_git("ls-tree", …)`）。
 *
 * ⚠️ ⭐ **而 GCP 上也缺** —— ⛔ 這不是搬遷造成的回歸，是一個**存在很久而沒有人知道**的缺口。
 *
 * ⇒ 根因：**沒有任何閘會跑這 15 支**。它們只在「owner 剛好點開那一頁」時才執行，
 * 而失敗長成一個 500 —— ⛔ 沒有任何東西會紅。
 * 這正是 CLAUDE.md 的失敗形態⑨：**一個從來沒人看它綠過的閘，與不存在的閘沒有差別。**
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 它管得到什麼、管不到什麼（誠實）
 * ---------------------------------------------------------------------------
 * ✅ 管得到：`build()` 擲例外 · 簽章用錯 · 相依的檔案不在 · **本機**缺 python3/git
 * ⛔ 管不到：**容器裡**缺 python3/git —— 那是映像的事，
 *    ⇒ 由 `docker/review.Dockerfile` 的 `apk add --no-cache tini python3 git` 守，
 *    而**這一條會在本機先紅**，讓缺口不會第一次就長在 owner 眼前。
 *
 * ⚠️ ⭐ **簽章是位置參數**：`build(repoRoot: string)`，⛔ 不是 `build({repoRoot})`。
 * （傳物件給它會造出一片假的失敗 —— 這個 repo 已經犯過**三次**同型。）
 */
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DIR = join(REPO, "tools/admin-live/datasets");

const names = (): string[] =>
  readdirSync(DIR)
    .filter((f) => f.endsWith(".mjs") && !f.startsWith("_"))
    .map((f) => f.replace(/\.mjs$/, ""))
    .sort();

describe("live 資料集全部 build 得起來（GH#867）", () => {
  it("GUARD THE GUARD：真的看到一整批資料集", () => {
    expect(names().length, "⛔ 一個資料集都沒掃到 —— 目錄搬了？").toBeGreaterThan(10);
  });

  it(
    "每一支都跑得完，⛔ 沒有一支擲例外",
    async () => {
      const failed: string[] = [];
      for (const n of names()) {
        try {
          const mod = await import(join(DIR, `${n}.mjs`));
          if (typeof mod.build !== "function") {
            failed.push(`${n}: ⛔ 沒有 export build()`);
            continue;
          }
          // ⭐ **位置參數**（⛔ 不是物件）—— 見檔頭。
          const out = await mod.build(REPO);
          if (out === undefined || out === null) failed.push(`${n}: build() 回了 ${String(out)}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const hint = /ENOENT.*python3|spawn python3/.test(msg)
            ? "  ⇒ ⭐ 缺 **python3**（出貨要靠 `docker/review.Dockerfile` 的 apk add）"
            : /'git'|spawn git|FileNotFoundError.*git/.test(msg)
              ? "  ⇒ ⭐ 缺 **git**（同上）"
              : "";
          failed.push(`${n}: ${msg.split("\n").slice(0, 2).join(" ").slice(0, 200)}${hint}`);
        }
      }
      expect(
        failed,
        "⛔ 這些 live 資料集跑不起來 —— 後台那一頁會是 HTTP 500，\n" +
          "⚠️ 而在此之前**沒有任何東西會紅**（它們只在 owner 點開那一頁時才執行）。\n" +
          failed.map((f) => `  · ${f}`).join("\n"),
      ).toEqual([]);
    },
    180_000,
  );
});
