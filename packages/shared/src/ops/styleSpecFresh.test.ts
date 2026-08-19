/**
 * 出貨的 `content/assets/icon-console/style-spec.json` 不可以無聲過期。
 *
 * ⚠️ **這一條存在的理由，就是它以前不存在**（GH#426）。那支產生器一直都有
 * `--check`，而且 GH#395 已經把它從「除了時間之外都比一比」收回成整份比對 ——
 * **但沒有任何東西跑它**。一條沒有人呼叫的 `--check` 是判準不是閘，
 * 而 CLAUDE.md 的元規則說得很清楚：**判準治不了，只有閘有用。**
 * 量到的代價：`bc695daa` 出貨的那份 contact sheet 是 16/16，而當時真正的
 * 計畫早就 0 件待產（681/681 都有圖示）—— 出貨的那份是舊的，
 * 而**從 issue 被開出來到它被修掉，沒有任何一次測試紅過**。
 *
 * 它守的是一個對外的東西：icon console 那一頁把這份快照當成「現在的美術指示」
 * 顯示。`tools/icon-gen/src/prompt.py` 一動而沒重跑 → 頁面繼續自信地印舊的
 * PREFIX / NEGATIVE，⛔ 而看的人沒有辦法自己發現。
 *
 * ⚠️ 它紅了**不要改這條測試**，也不要放寬 `--check`（那正是 GH#426 的病），跑：
 *     python3 tools/icon-console/emit_style_spec.py
 * 然後 `git add content/assets/icon-console/`。
 *
 * ⭐ 做法與 `skillSpecFresh.test.ts` 相同：**真的把產生器跑起來**（`--check`
 * 唯讀、過期回非零），⛔ 不是掃原始碼字串（失敗形態⑥：用掃字串代替行為）。
 * 工具腳本層 ⇒ 一條薄守衛，⛔ 不做突變（第零守則③）。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = join(ROOT, "tools/icon-console/emit_style_spec.py");
const SPEC = join(ROOT, "content/assets/icon-console/style-spec.json");

describe("icon console 的美術指示快照沒有過期", () => {
  it("⭐ 出貨的 style-spec.json 逐位元組等於現在重產的 —— 來源一動就紅", () => {
    cover("icon-style-spec-fresh");
    // 夾具前提：任何一個不在，下面的 try 就會把一切吞掉，這條守衛變成永遠綠。
    expect(existsSync(SCRIPT), "emit_style_spec.py 不見了 —— 這條守衛在測空氣").toBe(true);
    expect(existsSync(SPEC), "style-spec.json 還沒產生 —— 跑那支腳本").toBe(true);

    let code = 0;
    let out: string;
    try {
      out = execFileSync("python3", [SCRIPT, "--check"], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      code = err.status ?? 1;
      out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    }
    expect(
      code,
      "icon console 的美術指示快照過期了。⛔ 不要改這條測試、⛔ 不要放寬 `--check` —— 跑：\n" +
        "    python3 tools/icon-console/emit_style_spec.py\n" +
        `再 \`git add content/assets/icon-console/\`。產生器說：\n${out.trim()}`,
    ).toBe(0);
  }, 60_000);
});
