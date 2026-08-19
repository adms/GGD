/**
 * GH#417 的閘：**同編號的技能，機制數值必須一致** —— 一條**棘輪**。
 *
 * 界線（哪些欄位算機制、為什麼 `slot` 不算）寫在 `abilityCodeParity.ts` 檔頭。
 *
 * ⛔ 這**不是白名單**，是一條只准降不准升的線：
 *   · 冒出不在 baseline 上的 `<編號>|<欄位>` → 紅（新的漂移被擋在門外）
 *   · baseline 上的已經修好 → 也紅（逼名單縮短，否則棘輪永遠不會轉）
 *
 * ⚠️ ⛔ **不要自己挑哪一邊是對的**（第〇·六守則：階梯上的裁決是 owner 的）。
 * 修好一組就把那幾個鍵從 baseline 拿掉，⛔ 不要為了讓它變綠而放寬界線。
 *
 * 重新產生 baseline（⛔ 不要手打）：
 *   GGD_CODE_PARITY_DUMP=1 npx vitest run packages/shared/src/content/abilityCodeParity.test.ts
 *   → $TMPDIR/ggd-ability-code-drift.tsv
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";
import { formatDrift, scanAbilityCodeDrift } from "./abilityCodeParity";
import { KNOWN_CODE_DRIFT } from "./abilityCodeParity.baseline";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content/abilities");

/** 直接讀檔，⛔ 不經 ContentLoader —— 這條守衛必須在 `content:build` 之前也能跑。 */
function loadAbilities(): Record<string, unknown>[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")) as Record<string, unknown>);
}

describe("同編號技能的機制數值", () => {
  it("★ 棘輪：⛔ 不准冒出新的漂移，也不准修好了卻留在 baseline", () => {
    cover("ability-code-parity");
    const drift = scanAbilityCodeDrift(loadAbilities());

    if (process.env.GGD_CODE_PARITY_DUMP) {
      const out = join(tmpdir(), "ggd-ability-code-drift.tsv");
      writeFileSync(out, drift.map((d) => formatDrift(d)).join("\n") + "\n", "utf8");
      console.log(`[dump] ${drift.length} 筆 → ${out}`);
    }

    const now = new Set(drift.map((d) => d.key));
    const base = new Set(KNOWN_CODE_DRIFT);
    const added = drift.filter((d) => !base.has(d.key));
    const fixed = [...base].filter((k) => !now.has(k)).sort();

    expect(
      added.map((d) => formatDrift(d)).join("\n"),
      `⛔ ${added.length} 組同編號技能新出現機制數值不一致 —— 編號是 JASS 對照的 join key，` +
        `同編號＝同一支技能＝同樣的數值。⛔ 不要把它加進 baseline 了事，` +
        `拿去給 owner 裁決哪一邊是對的（第〇·六守則）。`,
    ).toBe("");

    expect(
      fixed.join("\n"),
      `✅ 這 ${fixed.length} 組已經一致了 —— 把它們從 abilityCodeParity.baseline.ts 拿掉，` +
        `棘輪才會往下轉。`,
    ).toBe("");
  });
});
