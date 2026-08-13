/**
 * ⭐【舊規格隔離區】—— owner 2026-08-13：
 *
 *   「請你把**舊規格**的相關資料都移到 legacy 資料夾 **不要再發生了**」
 *
 * 「再發生」的是這件事：owner 給了 70-002 樹海降臨的裁決，我把它套到了
 * 70-00 的芬多精光環 —— 因為我讀的是那支技能 JSON 裡 **w3x 時代的**
 * description，而不是新規格。owner 的話是
 * 「你不是有做一個最新版本的英雄的技能列表及說明(JSON & MD)? **怎麼會搞混呢?**」
 *
 * ⛔ 根因不是我不小心，是**新舊規格住在同一層目錄**，兩份都長得像權威文件。
 * 第〇·六守則那條階梯（新版說明 > 編輯器 JSON > JASS > w3x 說明 > w3x 設定）
 * 只在「我記得去查階梯」的時候有用 —— 而出事的當下沒有人在讀散文。
 *
 * ⭐ 所以這一份**不是判準，是閘**（元規則：判準 0/4 全破，只有閘有用）。
 * 它讀磁碟，⛔ 不掃原始碼字串。
 *
 * 突變紀錄：把 `docs/legacy/_w3x-fidelity-superseded.md` 複製回 `docs/` → 紅。
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const DOCS = join(REPO, "docs");
const LEGACY = join(DOCS, "legacy");

describe("舊規格隔離區（owner 2026-08-13「不要再發生了」）", () => {
  it("⭐ legacy 裡的每一份，都**不可以**同時出現在 docs/ 第一層", () => {
    // 母體是**磁碟上真的有什麼**，⛔ 不是一張手寫清單 —— 手寫清單會漏掉
    // 下一份被歸檔的文件，而漏掉的那一份正是下次會被讀錯的那一份。
    expect(existsSync(LEGACY), "docs/legacy/ 要存在（見它的 README）").toBe(true);
    const archived = readdirSync(LEGACY).filter((f) => f !== "README.md");
    expect(archived.length, "隔離區不是空的").toBeGreaterThan(0);
    const escaped = archived.filter((f) => existsSync(join(DOCS, f)));
    expect(
      escaped,
      "這些檔名同時活在 docs/ 與 docs/legacy/ —— 一份舊規格重新出現在現役目錄，\n" +
        "而它跟新規格長得一樣權威。⛔ 不要改這條測試：刪掉 docs/ 那一份，\n" +
        "或者如果它真的復活了，就把它從 docs/legacy/ 移出來（兩邊留一份）。",
    ).toEqual([]);
  });

  it("⭐ 90 支重製技能的規格**只有一個出處** —— 產生器那張表", () => {
    // 這一條才是承重的：上面那條擋「舊檔案回來」，這一條擋「新規格長出第二個家」。
    // 兩份並排文件都必須是 `refresh_docs.py` 從 batch1.py 產出的，所以它們
    // 帶著產生器的標記；手改過或另外新開一份就沒有。
    //（新鮮度由 `skillRemakeDocsFresh.test.ts` 用 --check 真的跑腳本來守。）
    const spec = join(DOCS, "英雄技能第一批重製-90支.md");
    expect(existsSync(spec), "並排規格文件在 docs/ 第一層").toBe(true);
    expect(existsSync(join(LEGACY, "英雄技能第一批重製-90支.md")), "⛔ 不可以有第二份").toBe(
      false,
    );
  });
});
