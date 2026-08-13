/**
 * ⭐【那 90 支的 JSON 必須等於產生器的輸出】—— GH#319 的閘。
 *
 * 症狀（issue 逐字）：在後台／Codex 編輯器改一支「90 支重製」裡的技能，存檔成功；
 * 任何人下次跑 `python3 tools/skill-remake/batch1.py`，**那筆編輯被無聲覆寫** ——
 * 沒有紅燈、沒有 log、跟正常一模一樣。
 *
 * ⛔ 問題不是「誰該贏」—— 第〇·五守則早就回答了（那 90 支是**產生器的輸出**）。
 *    問題是**沒有人宣告誰該贏**，所以它變成「誰最後跑誰贏」。
 *
 * ⭐ 這一條把覆寫變成**看得見的**：手改之後當場紅並指名檔案，
 *    而不是等下一次重生成才無聲消失。
 *
 * ⚠️ 它跟 `abilityProvenance.test.ts` 是**兩件事**，⛔ 不要合併：
 *      · provenance —— 這份文件是**哪一層**（owner 新版規格 vs w3x 匯入）
 *      · 這一條     —— 這份文件的**內容**還等不等於產生器現在會產出的東西
 *    第一條紅代表分類錯了，第二條紅代表有人繞過產生器改了東西。
 *
 * ⚠️ `castTimeSec` 不在比對範圍內（產生器自己也不比）——它由後處理器
 *    `deriveCastTimes.ts --write` 在產生器寫完之後才蓋上去。把它算進去的話
 *    這條閘會在**每一次乾淨的重跑**都紅（實測 50/90 份），而一個永遠紅的守衛
 *    就是一個沒有人會看的守衛。
 *
 * 突變紀錄：手改任何一份 `content/abilities/<那 90 支之一>.json`（例如把 name 改一個字）
 * → 這一條紅並指名那個檔案。
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const GEN = join(REPO, "tools/skill-remake/batch1.py");

describe("90 支重製技能的 JSON 沒有被繞過產生器改動（GH#319）", () => {
  it("⭐ 產生器 --check 必須是 0 —— ⛔ 手改會在這裡紅，不是在下次重生成時無聲消失", () => {
    expect(existsSync(GEN), "產生器存在").toBe(true);
    // ⚠️ 讀**離開碼**，⛔ 不是 `expect(() => execFileSync(...)).not.toThrow("訊息")`
    //    —— vitest 的 `toThrow(string)` 語意是「訊息含這一串」，那種寫法在腳本
    //    真的非零離開時**照樣綠**（同一個坑在 `legacyIndexFresh.test.ts` 踩過一次）。
    const r = spawnSync("python3", [GEN, "--check"], {
      cwd: REPO,
      encoding: "utf8",
      timeout: 120_000,
    });
    expect(
      r.status,
      "有人繞過產生器改了那 90 支的 JSON。⛔ 不要改這條測試，也不要改 content/：\n" +
        "  要改技能請改 tools/skill-remake/batch1.py，然後跑\n" +
        "    python3 tools/skill-remake/batch1.py && python3 tools/skill-remake/refresh_docs.py\n" +
        `腳本輸出：\n${(r.stderr ?? "") || (r.stdout ?? "").slice(-1200)}`,
    ).toBe(0);
  });
});
