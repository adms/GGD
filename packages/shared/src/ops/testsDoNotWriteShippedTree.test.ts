/**
 * 🧪 GH#1136 —— 測試**不可以**擅自寫出貨樹。
 *
 * ## ⛔ 為什麼要它（量到的傷害，⛔ 不是原則潔癖）
 *
 * 2026-09-09：`castabilitySweep.test.ts` 無條件寫 `docs/_castability-128.md`。
 * 與 `skills:sync` 同時跑的時候，**執行期對帳把那次寫入算到當時在跑的那一步頭上**
 * （`skillforge:visual-sheets:build`），報「寫了不在自己 writes 裡的檔 —— GH#771」，
 * ⭐ 而那一支產生器**一個位元組都沒寫錯**。⇒ `skills:sync` exit 3。
 *
 * ⚠️ ⭐ 最貴的部分不是那次 exit：是我**差點把它 report 成真缺陷**。
 * 一個誤指的對帳，比沒有對帳更糟。
 *
 * ## ⭐ `genguard` 對這一族是結構性失明的
 *
 * `docs/_castability-128.md` **沒有產生器擁有者** —— 因為它的作者是一支**測試**，
 * 而測試不在任何一張戶籍上（`sync-io.json` 記的是產生器）。
 * ⇒ 它既不會被隔離區鎖住、也不會被任何鏈重生成 ⇒ **它會 stale 很久而沒有東西紅**。
 *
 * ## 這一條掃什麼
 *
 * 所有 `*.test.ts` 裡**寫入呼叫的目標路徑**，只要落在 `content/` 或 `docs/`
 * 而且**不是**明確由環境變數開啟的，就紅。
 *
 * 突變驗證（2026-09-09）：把 `castabilitySweep.test.ts` 的 REPORT 改回
 * `join(ROOT, "docs/_castability-128.md")` → 紅並指名該檔。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = join(__dirname, "..", "..", "..", "..");

/** ⭐ 只掃 git 追蹤的測試檔 —— ⛔ node_modules 與臨時檔不算。 */
function testFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "-z", "*.test.ts", "*.test.mts", "*.test.tsx"], {
    cwd: ROOT,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .toString("utf-8")
    .split("\0")
    .filter(Boolean)
    // ⭐ `docs/legacy/` 是**退休區**：覆蓋前自動留底的副本（`preserve-before-overwrite.py`）
    //   與已下架的東西。⛔ 它們**不會被跑**,掃它們只會得到一堆歷史的雜訊。
    //   ⚠️ 這一格是實測加的:第一版命中 6 筆,全部在 `_overwrites/` 底下的備份副本裡。
    .filter((f) => !f.startsWith("docs/legacy/"));
}

/**
 * ⭐ 豁免：**為什麼這一支寫出貨樹是對的**。⛔ 不是「還沒修」。
 * ⚠️ 今天是空的 —— 那是好事，⛔ 而留著這張表是因為總會有第一個合法的例外。
 */
const EXEMPT: Record<string, string> = {};

describe("測試不可以擅自寫出貨樹（GH#1136）", () => {
  it("⛔ 沒有一支測試把 content/ 或 docs/ 的路徑當成寫入目標", () => {
    const bad: string[] = [];
    for (const f of testFiles()) {
      if (f in EXEMPT) continue;
      const src = readFileSync(join(ROOT, f), "utf-8");
      // 只看**有寫入動作**的檔（⛔ 讀 docs/ 是完全正常的）
      if (!/writeFileSync|writeFile\(|mkdirSync|cpSync|rmSync|appendFileSync/.test(src)) continue;
      // ⭐⭐ 判準是「這個路徑**真的被當成寫入目標**」，⛔ 不是「這個檔提到出貨路徑」。
      //   ⚠️ 第一版沒有這一層，4 個命中裡**只有 1 個是真的**：
      //     · `acceptanceN5` 寫的是 `process.env["GGD_N5_RECEIPT"]`（已經是選擇性的）
      //     · `codeOnlyKnobs` / `glb` 寫的是 `mkdtempSync` 的暫存目錄，
      //       而它們提到的 `content/…` 是**讀**路徑
      //   ⇒ ⭐ 一把會過度報告的尺，跟一把瞎的尺一樣沒用 —— 兩者都會讓人學會忽略它。
      for (const m of src.matchAll(/const\s+([A-Z_][A-Z_0-9]*)\s*=\s*join\(\s*ROOT\s*,\s*"((?:content|docs)\/[^"]+)"/g)) {
        const [, name, target] = m;
        // ⭐ 那個常數要真的出現在**寫入呼叫的第一個引數**位置。
        if (!new RegExp(`(?:writeFileSync|appendFileSync|cpSync|rmSync|mkdirSync)\\(\\s*${name}\\b`).test(src)) continue;
        // ⭐ 由環境變數開啟的是**明確的選擇**，⛔ 不是擅自 —— 放行。
        const decl = src.slice(m.index!, m.index! + 400);
        if (/process\.env/.test(decl)) continue;
        bad.push(`${f} → ${target}`);
      }
    }
    expect(
      bad,
      `⛔ 這幾支測試把出貨樹的路徑當成寫入目標：\n  ${bad.join("\n  ")}\n` +
        `⭐ 為什麼不行：跑一次測試就改動 git 追蹤的檔 ⇒ 與 skills:sync 同時跑時，` +
        `執行期對帳會把那次寫入**算到當時在跑的產生器頭上**並誤指它（2026-09-09 實際發生）。\n` +
        `⭐ 修法：預設寫進 os.tmpdir()，要更新出貨那一份就用環境變數明說。`,
    ).toEqual([]);
  });

  it("豁免表沒有死列（⭐ 反方向）", () => {
    const files = new Set(testFiles());
    const stale = Object.keys(EXEMPT).filter((f) => !files.has(f));
    expect(stale, `⛔ 這幾列豁免的測試檔不存在了 ⇒ 刪掉：${stale.join(" · ")}`).toEqual([]);
  });
});
