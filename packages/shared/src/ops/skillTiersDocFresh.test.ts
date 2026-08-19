/**
 * 《GGD 技能級距規範》不可以無聲過期（GH#414）。
 *
 * owner 2026-08-19 要的兩件事：
 * > 「請你將**詳細規範及對應自 w3x 的關係**詳細寫成一個 md 檔給我參考，
 * >  並且這也應該是**給 codex 技能編輯器的參考契約及文件之一**」
 * > 「並且將相關**文件 JSON 編輯器 後台設定 都統一**」
 *
 * ⚠️ 「都統一」如果只靠人記得跑產生器，它就會在第一次改級距表的時候破 ——
 * 而**外部編輯器看不到我們的 config**，沒有辦法發現那份契約在說謊
 * （第〇·五守則對外契約那條紅線）。所以閘長這樣：
 *
 *   級距表／出貨內容／決鬥區半徑一動 → 文件內容就該變 → 沒重跑 → 這條紅
 *
 * 做法與 `skillSpecFresh.test.ts` 完全相同：**真的把產生器用 `--check` 跑起來**
 * （唯讀，過期回非零），⛔ 不是掃原始碼字串（失敗形態⑥）。
 *
 * ⚠️ 它紅了**不要改這條測試**，跑：
 *     pnpm tiers:build
 * 然後 `git add docs/`。
 *
 * 突變紀錄（2026-08-19）：
 *   · `content/config/aoe-tiers.json` 的「極大」12 → 13 → 紅（`--check` 回 1）✅
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = join(ROOT, "tools/skill-tiers/gen_tiers.ts");
const DOC = join(ROOT, "docs/editor-contract/ggd-skill-tiers.md");

describe("技能級距規範與出貨設定同步", () => {
  it("⭐ 那份 md 是從現在這張級距表與註冊表生出來的 —— 過期就紅", () => {
    cover("skill-tiers-doc-fresh");
    // 夾具前提：任何一個不在，下面的 try 就會把一切吞掉，這條守衛變成永遠綠。
    expect(existsSync(SCRIPT), "gen_tiers.ts 不見了 —— 這條守衛在測空氣").toBe(true);
    expect(existsSync(DOC), "級距規範還沒產生 —— 跑 `pnpm tiers:build`").toBe(true);

    let code = 0;
    let out: string;
    try {
      out = execFileSync("npx", ["tsx", SCRIPT, "--check"], {
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
      "級距規範與出貨設定不同步了。⛔ 不要改這條測試 —— 跑：\n" +
        "    pnpm tiers:build\n" +
        `再 \`git add docs/\`。產生器說：${out.trim()}`,
    ).toBe(0);
  });
});
