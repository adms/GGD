import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * ⭐⭐ GH#473 —— **「啟用當下要跑的三支稽核」今天全部叫得到**。
 *
 * ── ⛔ 為什麼這條閘存在 ────────────────────────────────────────────────────
 * owner 2026-08-18：「你應該是要**設計啟用的時候才做自動跑測試 script**」。
 * ⚠️ ⭐ 而一條**只活在 `.test.ts` 裡**的判準，在「啟用當下」**永遠不會跑** ——
 * 它在 CI 是綠的，⛔ 而 runtime 叫不到它。
 *
 * 2026-08-31 之前 `noOpModifierClaims` 就是這樣：`enable-audit` 逐字說
 * 「判準只活在 …test.ts 裡，**沒有匯出的進入點 ⇒ runtime 叫不到**」。
 *
 * ⭐ 而修法**不是複製一份到 runtime** —— 那是第〇·四守則的反面：
 * 同一個判準兩個住處，⭐ 它們一定會漂開，⛔ 且漂開時**兩邊都是綠的**。
 * ⇒ 抽成 `noOpModifierClaims.ts`，**測試 import 它**。
 *
 * ⛔ 這條閘只問「叫得到嗎」，⛔ 不問「判準對不對」（那是各自的測試在守）。
 */
const REPO = resolve(__dirname, "../../../..");

describe("GH#473 啟用當下的三支稽核", () => {
  const out = execFileSync(
    "node",
    ["tools/review/enable-audit.mjs", "--ids", "godie-e00r.e"],
    { cwd: REPO, encoding: "utf8", timeout: 60_000 },
  );

  it("量尺先自證：CLI 真的跑起來並列了三條（⛔ 空輸出會讓下面空過）", () => {
    expect(out).toContain("3 條稽核");
    expect(out.split("\n").filter((l) => /callable|not-callable/.test(l)).length).toBe(3);
  });

  it("★ ⭐ **三條全部 `callable`** —— ⛔ 一條叫不到就等於它在啟用當下不存在", () => {
    const dead = out.split("\n").filter((l) => l.includes("not-callable"));
    expect(
      dead,
      `⛔ 這幾條判準 runtime 叫不到：\n${dead.join("\n")}\n` +
        `⚠️ ⭐ 修法是把判準**抽出 .test.ts**，讓測試與 runtime import 同一個 —— ` +
        `⛔ 不是複製一份（同一個判準兩個住處一定會漂開，而漂開時兩邊都是綠的）。`,
    ).toEqual([]);
  });

  it("⭐ 判準只有**一個住處** —— 測試 import 它，⛔ 不是自己留一份", () => {
    const test = execFileSync(
      "grep", ["-c", "from \"./noOpModifierClaims\"", "packages/shared/src/content/noOpModifierClaims.test.ts"],
      { cwd: REPO, encoding: "utf8" },
    ).trim();
    expect(Number(test), "⛔ 測試沒有 import 共用模組 ⇒ 那就是第二個住處").toBeGreaterThan(0);
  });
});
