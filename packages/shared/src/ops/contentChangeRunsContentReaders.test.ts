/**
 * 🧪 **改 `content/` 時，讀 content 的那幾支 tool 測試也要跑** —— GH#809 的閘。
 *
 * ## 病灶（2026-08-27 量到，⛔ 不是假設）
 * `suitesForPaths()` 對 `content/` 的分支回 `{ suites: null, extras: [] }`。
 * ⭐ `suites: null` 是「全**包**」（`apps/*` + `packages/*`），
 * ⛔ 而 `extras` 走的是 **`tools/` 那一半** —— 回 `[]` 就是**一支 tool 測試都不跑**。
 *
 * ⇒ ⭐ **純 content 改動永遠跑不到任何 `tools/` 的測試。**
 * ⚠️ 而 GH#667 / GH#668 兩張票的觸發改動**都只碰 `content/`**：
 *   · #667 —— 英雄被搬進 `content/_legacy/` ⇒ 抽取器一個位元組沒動而輸出變了
 *   · #668 —— `attach.*` 綁定進 `content/` ⇒ `particles_checks.py` 的 `ids` 收不到
 * ⇒ **抓得到它們的那幾支守衛，在它們壞掉的那一刻結構上跑不到。**
 *
 * ## ⭐ 這一條問的是關係，⛔ 不是「有沒有那行程式」
 * 拿**真的** `suitesForPaths()`、餵一條**真的** content 路徑、看它排不排得出
 * 讀 content 的那幾支 tool。⛔ 不是 grep「有沒有 extras 這個字」。
 *
 * ⚠️ 母體是**推導**的（`sync-io.json` 量到的 reads ＋ `package.json` 的指令文字），
 * ⛔ 不是一張手寫的 tool 清單 —— 手寫的表在第 3 支 tool 加進來時不會有東西紅。
 *
 * ── 突變紀錄（一批一條）────────────────────────────────────────────────
 *  · `packages.mjs` 的 content 分支改回 `extras: []` → 這一條紅並指名它。實測過。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("content 改動要帶上讀 content 的 tool 測試 (content-change-runs-content-readers)", () => {
  it("⭐ 一條 content/ 路徑排得出讀 content 的那幾支 tool（⛔ 不是空陣列）", async () => {
    // ⚠️ 一定要用 `import.meta.url` 當 base。⛔ 用 `file://${join(REPO,"x")}` 在
    //    `ship:check` 的 vitest root 底下會解析成 `/tools/…`（絕對根）⇒
    //    `Failed to load url /tools/parallel-gates/packages.mjs`。
    //    ⭐ 而它**單獨跑是綠的** —— 今天第三次踩「只在特定跑法下紅」。
    const href = new URL("../../../../tools/parallel-gates/packages.mjs", import.meta.url).href;
    const mod = (await import(/* @vite-ignore */ href)) as {
      suitesForPaths: (paths: readonly string[], repo: string) => { suites: unknown; extras: readonly string[]; why: string };
    };
    const plan = mod.suitesForPaths(["content/abilities/godie-e002.e.json"], REPO);

    expect(
      plan.extras.length,
      "⛔ 純 content 改動排不出任何 tool 測試 ——\n" +
        "   `suites: null` 只涵蓋 apps/packages，`tools/` 走的是 `extras`。\n" +
        "   ⇒ 讀 content 的產生器壞了，而抓得到它的守衛**結構上跑不到**（GH#667/#668 就是）。\n" +
        "   修在 `tools/parallel-gates/packages.mjs` 的 content 分支。",
    ).toBeGreaterThan(0);

    // ⭐ 母體自證：戶籍表裡真的有「讀 content 且自己有測試」的 tool，
    //    否則上面那一條會在母體壞掉時變成一個永遠綠的空斷言。
    const io = JSON.parse(readFileSync(join(REPO, "tools/parallel-gates/sync-io.json"), "utf8")) as {
      steps?: readonly { name?: string; reads?: readonly string[] }[];
    };
    const contentReaders = (io.steps ?? []).filter((s) =>
      (s.reads ?? []).some((r) => String(r).startsWith("content/")),
    ).length;
    expect(contentReaders, "戶籍表裡沒有任何步驟讀 content —— 母體壞了").toBeGreaterThan(0);

    // ⛔ 反方向：非 content 的路徑**不該**平白拖進 tool 測試。
    const other = mod.suitesForPaths(["apps/admin/src/store.ts"], REPO);
    expect(other.extras, "⛔ 非 content 的改動被塞進了 tool 測試 —— 裁剪失去意義").toEqual([]);
  });
});
