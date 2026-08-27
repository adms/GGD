/**
 * 🗂️ GH#686 Scope ③ —— `scripts/lane-plan.sh` 的守衛。
 *
 * ⭐ 真的把腳本跑起來（⛔ 不是掃字串 —— 第三守則），只有「issue 從哪來」被換成夾具
 * （`GGD_LANE_PLAN_JSON`）⇒ ⛔ 不碰網路、⛔ 不是「測試自己造一個虛構通道」（失敗形態⑤）。
 *
 * 驗的是**互斥判斷**這個機制，⛔ 不是任何一個數字（第二守則：驗機制不驗數字）。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const dir = mkdtempSync(join(tmpdir(), "lp-"));

const plan = (issues: unknown, args: string[] = []): string => {
  const f = join(dir, "issues.json");
  writeFileSync(f, JSON.stringify(issues));
  return execFileSync("bash", ["scripts/lane-plan.sh", ...args], {
    cwd: REPO,
    encoding: "utf8",
    env: { ...process.env, GGD_LANE_PLAN_JSON: f },
  });
};

const tk = (n: number, files: string, extra = ""): unknown => ({
  number: n,
  title: `[重要][fix] 票 ${n}`,
  body: `## Files / modules likely affected\n${files}\n${extra}`,
});

describe("GH#686 lane-plan 排得出無撞車的分批", () => {
  it("⭐ 歷史撞車案例：兩張都動 configForms.ts ⇒ **同一條 lane**（⛔ 不可並行）", () => {
    // ⚠️ 這正是 CLAUDE.md 第〇·七守則點名的重災區。互斥判斷壞掉 ⇒ 它們變成兩條
    //   lane、被排進同一批 ⇒ 兩條 agent 同時改同一個檔（實際發生過三次）。
    const out = plan([
      tk(901, "`apps/admin/src/configForms.ts`"),
      tk(902, "`apps/admin/src/configForms.ts` · `apps/admin/src/store.ts`"),
      tk(903, "`apps/client/src/vfx/beamAudition.ts`"),
    ]);
    expect(out).toMatch(/算出 \*\*2 條 lane\*\*/);
    expect(out, "兩張同檔票沒有被收進同一條 lane").toMatch(/lane #901 → #902|lane #902 → #901/);
  });

  it("🔒 全域鎖：兩張都碰產生器產物 ⇒ **排進不同批**（同時間只能有一條跑 skills:sync）", () => {
    const out = plan([
      tk(911, "`content/config/damage-tiers.json`"),
      tk(912, "`content/config/stat-caps.json`"),
    ]);
    expect(out).toMatch(/🔒/);
    expect(out).toMatch(/排成 \*\*2 批\*\*/);
  });

  it("⛔ 沒有 Files 區的票列進「排不進來」，⛔ 不是靜靜地放進批次 1", () => {
    const out = plan([{ number: 921, title: "[一般][docs] 沒寫", body: "## Objective\nx" }]);
    expect(out).toMatch(/沒有 Files 區/);
    expect(out).toContain("#921");
  });

  it("跨 lane 相依 ⇒ 後面那張排在後一批（順序性，⛔ 不只是撞檔）", () => {
    const out = plan([
      tk(931, "`apps/a/x.ts`"),
      tk(932, "`apps/b/y.ts`", "## Dependencies\n#931"),
    ]);
    expect(out).toMatch(/排成 \*\*2 批\*\*/);
    expect(out).toMatch(/跨 lane 相依/);
  });
});
