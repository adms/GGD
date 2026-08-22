/**
 * per-spell JASS 抽取的**反向守衛**（GH#542）。
 *
 * ⚠️ 量到的事故形狀：`tools/w3x-import/out/GoDieEX22s/jass-spells/` 只有 **67** 個 `.j`，
 * 而地圖腳本真的派送 **317** 個技能 rawcode —— 少了 79%，而它**看起來完全正常**
 * （有檔案、查得到、`INDEX.json` 也在）。根因是那份產物是 **content 驅動**的：
 * 它拿 178 個 `content/champions/**` 的 TODO 佔位去 JASS 裡查，
 * 於是**只考慮了 128 個 rawcode**，另外 220 個從頭到尾沒被看過。
 * 而且產生它的腳本**從來沒有進版控** —— 所以既跑不了也審不了，更不可能有 `--check`。
 *
 * CLAUDE.md 第〇·六守則把 JASS 排在第 3 層（「程式不會說謊」）。
 * ⇒ 涵蓋不足的抽取會讓**每一次**「照 JASS 修正」都建立在不完整的證據上。
 * 這條守衛就是防止它再靜靜低估的東西。
 *
 * ⛔ 兩邊都**現算**，⛔ 不寫死 67 / 317 / 442 這種數字（第二守則：驗機制不驗數字）——
 * 地圖換一版、技能加一支，這條照樣有意義。
 *
 * 它紅了⛔不要改這條測試，跑：
 *     python3 tools/w3x-import/extract_jass_spells.py
 *
 * 突變紀錄：
 *   · 把 `group_families()` 的 `fn.startswith("Trig_" + b + "_")` 拿掉
 *     （＝退回「只認直接寫著 rawcode 的那個函式」的舊行為）→ 紅，
 *     訊息列出掉出來的 rawcode。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = join(ROOT, "tools/w3x-import/extract_jass_spells.py");
const SHIPPED = join(ROOT, "tools/w3x-import/out/GoDieEX22s/jass-spells/INDEX.json");

/**
 * 出貨產物允許落後抽取器多少。⭐ 這是一個**棘輪**，不是一個目標值：
 * 它釘住的是 #542 當下**量到的**缺口（67/317 ≈ 0.21），意思是「⛔ 不准更糟」。
 * 主 session 用 `extract_jass_spells.py` 重生成之後，`INDEX.json` 會帶上 `generator`
 * 戳記，這條就自動升級成**逐位元組** `--check`（見下），這個容差也就退場了。
 */
const SHIPPED_COVERAGE_RATCHET = 0.2;

function readStats(): Record<string, unknown> {
  return JSON.parse(execFileSync("python3", [SCRIPT, "--stats"], { cwd: ROOT, encoding: "utf8" }));
}

describe("JASS 抽取涵蓋率", () => {
  it("⭐ 地圖派送的每一個技能 rawcode 都被歸到某個觸發器家族 —— 漏一個就紅", () => {
    cover("jass-extraction-coverage");
    expect(existsSync(SCRIPT), "抽取器不見了 —— 這條守衛在測空氣").toBe(true);

    const s = readStats();
    // 兩邊都現算：dispatchedRawcodes 直接數地圖腳本，coveredRawcodes 數家族歸屬的結果。
    expect(s.dispatchedRawcodes as number).toBeGreaterThan(0);
    expect(
      s.unexplainedRawcodes,
      `這些 rawcode 地圖真的派送了，卻沒有任何觸發器家族認領，也不在 ` +
        `extract_jass_spells.py 的 UNATTRIBUTABLE 豁免表裡（豁免要帶一個能被反駁的理由）。`,
    ).toEqual([]);
    // 家族驅動的證據：一個 rawcode 平均要拉進不只一個函式，content 驅動的舊做法做不到。
    expect(s.coveredRawcodes as number).toBe(s.dispatchedRawcodes as number);
    expect(s.reachableFamilies as number).toBeGreaterThan(s.abilityTriggerFamilies as number);
  });

  it("⛔ 出貨的 jass-spells/ 不可以比抽取器少太多（帶戳記後升級成逐位元組比對）", () => {
    const s = readStats();
    const shipped = JSON.parse(readFileSync(SHIPPED, "utf8"));

    if (shipped.generator === s.generator) {
      let code = 0;
      let out = "";
      try {
        out = execFileSync("python3", [SCRIPT, "--check"], { cwd: ROOT, encoding: "utf8" });
      } catch (e) {
        const err = e as { status?: number; stdout?: string };
        code = err.status ?? 1;
        out = err.stdout ?? "";
      }
      expect(code, `出貨產物過期。跑 python3 tools/w3x-import/extract_jass_spells.py\n${out}`).toBe(
        0,
      );
      return;
    }

    // 還沒重生成：那份產物是 #542 之前的遺物（`generator` 欄位不存在＝產生它的腳本沒進版控）。
    const covered = new Set<string>(
      Object.keys(shipped.byRawcode ?? {}).concat(
        (shipped.spells ?? []).map((x: { rawcode: string }) => x.rawcode),
      ),
    ).size;
    const ratio = covered / (s.coveredRawcodes as number);
    expect(
      ratio,
      `出貨的 jass-spells/ 涵蓋 ${covered}/${s.coveredRawcodes} 個 rawcode，比 #542 量到的缺口更糟。\n` +
        `⛔ 不要調降 SHIPPED_COVERAGE_RATCHET —— 跑 python3 tools/w3x-import/extract_jass_spells.py`,
    ).toBeGreaterThanOrEqual(SHIPPED_COVERAGE_RATCHET);
  });
});
