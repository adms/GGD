/**
 * ⭐【legacy 記憶索引不可以過期】—— owner 2026-08-13：
 *
 *   「將所有搬到 legacy 資料夾的檔案都作一個檔案簡介 放在 docs/ 底下一個
 *     legacy-index.md，**以免真的需要的時候還是可以有個記憶索引**」
 *
 * ⛔ 一份**過期的**索引比沒有索引更糟：它會讓人以為查過了。
 *    而 legacy 只會越長越大（今天 318 檔），所以「記得更新」這種判準必然失效 ——
 *    元規則：判準 0/4 全破，只有閘有用。
 *
 * ⭐ 這一條真的**把產生器跑起來**（`--check`），⛔ 不是掃字串：
 *    掃字串的版本會在「有人手改索引讓它看起來對」時綠。
 *    同一個形狀已經在 `skillRemakeDocsFresh.test.ts` 用過一次。
 *
 * 突變紀錄：把一個檔案丟進 `docs/legacy/`（或從 CURATED 拿掉一列）而不重跑
 * 產生器 → 這一條紅，訊息直接給出要跑的指令。
 */
import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = join(REPO, "tools/legacy-index/build_index.py");
const INDEX = join(REPO, "docs/legacy-index.md");

describe("legacy 記憶索引（owner 2026-08-13「以免真的需要的時候」）", () => {
  it("⭐ 索引與磁碟一致 —— 產生器 --check 必須是 0", () => {
    expect(existsSync(SCRIPT), "產生器存在").toBe(true);
    expect(existsSync(INDEX), "docs/legacy-index.md 存在").toBe(true);
    // ⚠️ 讓腳本自己去掃磁碟並比對，然後**讀離開碼**。
    //
    // ⛔ 第一版寫的是 `expect(() => execFileSync(...)).not.toThrow("訊息")` ——
    //    而 vitest 的 `toThrow(string)` 語意是「拋出的錯**訊息含這一串**」，
    //    所以 `.not.toThrow("我自己寫的中文提示")` 在腳本真的非零離開時**照樣綠**。
    //    突變驗證當場抓到：丟一個檔進 legacy 不重跑產生器，它不紅。
    //    這是失敗形態④（斷言方向跟缺陷無關）在守衛自己身上發生。
    const r = spawnSync("python3", [SCRIPT, "--check"], { cwd: REPO, encoding: "utf8" });
    expect(
      r.status,
      "docs/legacy-index.md 過期了。⛔ 不要改這條測試，跑：\n" +
        "  python3 tools/legacy-index/build_index.py && git add docs/legacy-index.md\n" +
        `腳本輸出：${(r.stdout ?? "") + (r.stderr ?? "")}`,
    ).toBe(0);
  });

  it("⭐ 每一個隔離區都真的被索引到 —— ⛔ 不是只有 docs/legacy", () => {
    // owner 明說「掃描**所有** legacy 資料夾底下的檔案，不只是這次搬移計畫」。
    // 這一條擋的是「新開了一個隔離區、產生器沒跟上」——那種漏會安靜地發生，
    // 因為 --check 只比對它自己認得的那幾個根。
    const roots = ["docs/legacy", "content/_legacy"].filter((r) =>
      existsSync(join(REPO, r)),
    );
    expect(roots.length, "至少兩個隔離區存在").toBeGreaterThanOrEqual(2);
    const src = readdirSync(join(REPO, "tools/legacy-index"));
    expect(src).toContain("build_index.py");
    const body = execFileSync("cat", [SCRIPT], { cwd: REPO }).toString();
    for (const r of roots) {
      expect(body, `${r} 不在產生器的 LEGACY_ROOTS 裡`).toContain(`"${r}"`);
    }
  });
});
