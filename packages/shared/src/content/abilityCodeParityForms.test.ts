/**
 * GH#479 ① 的閘：**變身對子的兩半要一起改**。
 *
 * 界線與「為什麼 `abilityCodeParity` 擋不住」寫在 `abilityCodeParityForms.ts` 檔頭。
 *
 * 重新產生基準線（⛔ 不要手打）：
 *   GGD_FORM_PAIR_DUMP=1 npx vitest run packages/shared/src/content/abilityCodeParityForms.test.ts
 *   → 直接覆寫 abilityCodeParityForms.baseline.json，然後 `git add` 它
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { splitFormPairsByShipping } from "../../testkit/formPairShipping";
import {
  diffAgainstBaseline,
  formatFinding,
  scanFormPairAbilities,
  toBaseline,
  type FormPairBaseline,
} from "./abilityCodeParityForms";

const HERE = dirname(fileURLToPath(import.meta.url));
const ABILITY_DIR = join(HERE, "../../../../content/abilities");
const BASELINE = join(HERE, "abilityCodeParityForms.baseline.json");

/** 直接讀檔，⛔ 不經 ContentLoader —— 這條要在 `content:build` 之前也能跑。 */
function abilitiesByChampion(): Map<string, Record<string, unknown>[]> {
  const out = new Map<string, Record<string, unknown>[]>();
  for (const f of readdirSync(ABILITY_DIR).sort()) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    const champ = f.slice(0, f.indexOf("."));
    const doc = JSON.parse(readFileSync(join(ABILITY_DIR, f), "utf8")) as Record<string, unknown>;
    const bucket = out.get(champ);
    if (bucket) bucket.push(doc);
    else out.set(champ, [doc]);
  }
  return out;
}

describe("變身對子的技能同步", () => {
  const { shipped, halfMigrated } = splitFormPairsByShipping();

  it("⭐ 只改到一邊就會紅（本體 ⇄ 變身態逐支對帳）", () => {
    cover("form-pair-ability-parity");
    const states = scanFormPairAbilities(shipped, abilitiesByChampion());

    if (process.env.GGD_FORM_PAIR_DUMP) {
      writeFileSync(BASELINE, JSON.stringify(toBaseline(states), null, 2) + "\n", "utf8");
      console.log(`[dump] ${states.length} 個編號 → ${BASELINE}`);
    }

    const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as FormPairBaseline;
    // ⚠️ 空基準線 = 檔案壞了或被清空，⛔ 不是「沒有對子」——那會讓這條守衛
    //    在最需要它的時候安靜地全綠（fail-open 沒錯，靜默才是缺陷）。
    expect(Object.keys(baseline).length).toBeGreaterThan(50);

    const findings = diffAgainstBaseline(states, baseline);
    expect(
      findings.map((f) => formatFinding(f)).join("\n"),
      `⛔ ${findings.length} 支技能與基準線對不上。有變身的英雄在內容樹裡是**兩份文件**，` +
        `本體改了、變身態沒改 ⇒ 玩家變身之後用的是舊的那一份（全套測試會全綠）。\n` +
        `⭐ 先照訊息去把另一邊補上；確認過是**刻意的形態差異**才重新產生基準線：\n` +
        `   GGD_FORM_PAIR_DUMP=1 npx vitest run packages/shared/src/content/abilityCodeParityForms.test.ts`,
    ).toBe("");
  });

  it("⛔ 對子不可以只搬一半（半邊進 _legacy = 變身當下房間會炸）", () => {
    expect(
      halfMigrated.join("\n"),
      "⛔ 變身對子必須**整組**搬動：本體留在 content/ 而變身態進了 _legacy（或反過來）時，" +
        "玩家按下變身，`Registry.get()` 會在每秒 30 次的 snapshot 裡丟例外，整個房間掛掉。",
    ).toBe("");
  });
});
