import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⛔⛔ **「你又沒記錄下來了 對話開票超級重要！」** —— owner 2026-09-09（同一天**第三次**）。
 *
 * ⭐ 已有的那條（問之前先查 `asked-before.sh`）只擋「**重複問**」，
 *   ⛔ 它擋不住另一半：**他講了，而我沒記**。
 *
 * ⚠️ hook 看不到對話 —— ⭐ 而它看得到**我照著裁決去動手的那一刻**：
 *   改一格 `content/config/*.json` 就是第一守則說的「出貨值改動」。
 *   ⇒ 在那一刻問兩件事：**引用得到他的哪一句？記進帳本了沒？**
 *
 * ⚠️ ⭐ 警告不擋是刻意的：出貨值也有純技術修（欄位改名、產物重生成），
 *   ⛔ 擋掉會讓人繞過整個 hook —— 而被繞過的閘等於沒有閘。
 */

const REPO = join(import.meta.dirname, "../../../..");
const HOOK = join(REPO, "scripts/preserve-before-overwrite.py");

function run(ev: Record<string, unknown>): { code: number; err: string } {
  const r = spawnSync("python3", [HOOK], {
    cwd: REPO, input: JSON.stringify(ev), encoding: "utf8", timeout: 60_000,
  });
  return { code: r.status ?? -1, err: `${r.stderr ?? ""}${r.stdout ?? ""}` };
}

describe("改出貨值時要被問「他的哪一句？記了沒？」（owner 2026-09-09）", () => {
  it("① 改 content/config/*.json ⇒ ⭐ 提醒，⛔ 而不擋", () => {
    const { code, err } = run({ tool_name: "Edit", tool_input: { file_path: "content/config/ugc.json" } });
    expect(code, "⛔ 擋掉了 —— 純技術修也會被卡，而被繞過的閘等於沒有閘").toBe(0);
    expect(err, "⛔ 沒引用第一守則的判準").toContain("引用到他的一句原話");
    expect(err, "⛔ 沒告訴人下一步是什麼").toContain("ruling.sh");
    expect(err, "⛔ 沒說出今天記了幾則 —— 那是「記了沒」的答案").toMatch(/有 \d+ 則紀錄/);
  });

  it("② Bash 裡改到 config 也算（⭐ 我最常用的是 python 寫檔）", () => {
    const { err } = run({
      tool_name: "Bash",
      tool_input: { command: "python3 -c \"import json;json.dump(d,open('content/config/arena-rules.json','w'))\"" },
    });
    expect(err).toContain("arena-rules.json");
  });

  it("③ 不是出貨值的檔 ⇒ ⛔ 不吵（⭐ 證明①不是對每個編輯都喊）", () => {
    const { err } = run({ tool_name: "Edit", tool_input: { file_path: "packages/shared/src/sim/SimWorld.ts" } });
    expect(err).not.toContain("引用到他的一句原話");
  });
});
