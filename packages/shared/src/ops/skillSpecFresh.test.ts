/**
 * 《技能標記機制與效果規則》不可以無聲過期。
 *
 * owner 2026-08-16 要的是「**每次 deploy 都會重 build 避免多檔案內容不一致**」。
 * ⚠️ 「重 build」不能靠人記得跑 `pnpm spec:build` —— CLAUDE.md 的元規則說得很清楚：
 * **判準要靠人在當下想起來，閘不用。** 所以真正的機制是這一條：
 *
 *   引擎的 schema／註冊表／`content/` 一動 → 文件內容就該變 → 沒重跑 → 這條紅
 *   → `pnpm test` 紅 → 部署協定第 1 步（commit 前跑全套）就擋下來。
 *
 * ⛔ **刻意不在 `host-deploy.sh` 產生。** 那台機器是 `git pull` 來的，在遠端產生
 * 文件只會造出一份沒有人 commit 的工作區漂移 —— 那正是 2026-08-02
 * 「未追蹤來源被烘進產物」事故的形狀（`shippedBundleHasTrackedSources.test.ts`）。
 * 閘要在**編輯發生的當下**響。
 *
 * 做法與 `skillRemakeDocsFresh.test.ts` 相同：**真的把產生器跑起來**（`--check`
 * 唯讀、過期回非零），⛔ 不是掃原始碼字串（失敗形態⑥：用掃字串代替行為）。
 *
 * ⚠️ 它紅了**不要改這條測試**，跑：
 *     pnpm spec:build
 * 然後 `git add docs/`。
 *
 * 突變紀錄（2026-08-16）：
 *   · 在 `docs/技能標記機制與效果規則.md` 插一行字 → 紅（`--check` 回 1）✅
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = join(ROOT, "tools/skill-spec/gen_spec.ts");
const DOC = join(ROOT, "docs/技能標記機制與效果規則.md");

describe("技能規則說明與引擎同步", () => {
  it("⭐ 那份 md 是從現在這個 schema／註冊表／content 生出來的 —— 過期就紅", () => {
    cover("skill-spec-fresh");
    // 夾具前提：任何一個不在，下面的 try 就會把一切吞掉，這條守衛變成永遠綠。
    expect(existsSync(SCRIPT), "gen_spec.ts 不見了 —— 這條守衛在測空氣").toBe(true);
    expect(existsSync(DOC), "技能規則說明還沒產生 —— 跑 `pnpm spec:build`").toBe(true);

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
      "技能規則說明與引擎不同步了。⛔ 不要改這條測試 —— 跑：\n" +
        "    pnpm spec:build\n" +
        `再 \`git add docs/\`。產生器說：${out.trim()}`,
    ).toBe(0);
  });
});
