/**
 * 那 7 條屬性上限不可以無聲過期。
 *
 * owner 2026-08-20：「use LV30/50/99 rules」+「後台設定及說明、JSON 及 script⋯
 * 都要一起更新喔（**全部都是推導動態即時產生**）」。
 *
 * ⚠️ 在此之前它們是**烘死的字面值**，而那正是漂移的入口：`combat-env` 的三圍係數
 * 被調過三次（`intToManaRegen` 0.07→0.21 · `strToAttackDamage` 1→0.4 ·
 * `intToMagicResist` 0.6→0），而柵欄一動也沒動 —— 量到的落差
 * manaRegen 926 vs 3,276 · ad 21,200 vs 20,948 · mr 15,344 vs 12,560，
 * ⛔ 而且沒有任何東西會紅。
 *
 * 做法與 `skillSpecFresh.test.ts` 相同：**真的把產生器跑起來**（`--check` 唯讀、
 * 過期回非零），⛔ 不是掃原始碼字串（失敗形態⑥）。
 *
 * ⚠️ 它紅了**不要改這條測試**，跑：
 *     pnpm statcaps:build
 * 然後 `git add packages/shared/src/sim/statCapsDerived.ts content/config/stat-caps.json docs/`。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = join(ROOT, "tools/stat-caps/gen_stat_caps.ts");

describe("屬性上限與出貨內容同步", () => {
  it("⭐ 那 7 條是從現在這批英雄卡與 combat-env 推導的 —— 過期就紅", () => {
    cover("statcaps-fresh");
    expect(existsSync(SCRIPT), "產生器不見了 —— 這條守衛在測空氣").toBe(true);

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
      "屬性上限與出貨內容不同步了。⛔ 不要改這條測試 —— 跑：\n" +
        "    pnpm statcaps:build\n" +
        `然後 git add。產生器說：\n${out}`,
    ).toBe(0);
  });
});
