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
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { cover } from "../../testkit/cover";

const ROOT = resolve(__dirname, "../../../..");
const SCRIPT = resolve(ROOT, "tools/reference/gen_readme_lists.py");

describe("README 的產生區塊", () => {
  it("★ `--check` 是綠的（紅了不要改 README：跑 `pnpm docs:readme` 然後 git add）", () => {
    cover("readme-lists-fresh");
    expect(existsSync(SCRIPT), `產生器不見了：${SCRIPT}`).toBe(true);
    // 非零離開碼會讓 execFileSync 丟例外，訊息裡帶著腳本自己印的「哪一塊過期」。
    const out = execFileSync("python3", [SCRIPT, "--check"], { cwd: ROOT, encoding: "utf8" });
    expect(out).toContain("up to date");
  });
});
