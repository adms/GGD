/**
 * 出貨的 `content/assets/models/scenery/*.glb` 不可以無聲過期。
 *
 * ⚠️ 這一條的存在理由是**它跑得到**：`tools/scenery-gen/` 刻意不是一個
 * workspace package（同 `tools/skill-spec/`，避免動 `pnpm-lock.yaml`），所以
 * `pnpm -r --if-present test` 看不到它自己那一支 `gen.test.ts`。
 * ⛔ 一條沒有人跑的守衛就是失敗形態③（可以整個刪掉而測試全綠）。
 *
 * 做法與 `skillSpecFresh.test.ts` 完全相同：**真的把產生器用 `--check` 跑起來**
 * （唯讀，過期回非零），⛔ 不是掃原始碼字串（失敗形態⑥）。
 *
 * ⚠️ 它紅了不要改這條測試，跑：
 *     pnpm scenery:gen
 * 然後把新的 sha256 貼回 `tools/scenery-gen/gen.test.ts` 的 PINS，一起 commit。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = join(ROOT, "tools/scenery-gen/gen.ts");

describe("場景裝飾模型與產生器同步", () => {
  it("⭐ 出貨的 scenery .glb 是現在這張參數表生出來的 —— 過期就紅", () => {
    expect(existsSync(SCRIPT), "scenery-gen/gen.ts 不見了 —— 這條守衛在測空氣").toBe(true);
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
      "場景裝飾模型過期了。⛔ 不要改這條測試 —— 跑 `pnpm scenery:gen`。產生器說：" + out.trim(),
    ).toBe(0);
  });
});
