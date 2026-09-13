/**
 * ⭐⭐【吟唱五級距的遷移進度 —— 一條**只能往前**的棘輪】（GH#943 / GH#1243）
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⛔ 為什麼要有這條：一條**被取代卻沒退場**的公式誤導了人
 * ═══════════════════════════════════════════════════════════════════════════
 * owner 2026-09-02（逐字）：
 * > 「吟唱⋯其實這個也可以五級距 **0, 0.1, 0.3, 0.5, 1** 建議也改成這個」
 *
 * ⇒ 五級距落地了（`content/config/cast-time-tiers.json`），
 * ⛔ **而 `castTimeFormula.ts` 的 20 階階梯沒有退場**，`castTimeCoverage` 還在拿它當標準。
 *
 * ⚠️ 2026-09-12 的代價：那條閘報出 **182 支「內容與公式不一致」**，
 * ⭐ 而逐項對照之後內容是 `0.1`（＝小）、`0.5`（＝大）—— **內容一直是對的**。
 * ⇒ 我因此在 GH#1243 上連開**兩個不存在的缺陷**。
 *
 * ⭐ owner 2026-09-12：「請你更正讓你誤會的 吟唱冷卻公式 **以後不要再發生**」
 *
 * ⚠️ ⭐ 而「在檔頭寫一段警告」**不算修好** —— 第三守則：註解會說謊，
 *   而這個專案的元規則是**只有閘有用**。⇒ 這一條就是那個閘。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  ⭐ 它問的是**進度**，⛔ 不是「全部都要遷移」
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ 「907 支全部要有 `castTimeTier`」會是一條永遠不會綠的閘（假綠燈⑨）。
 * ⭐ 它問的是：**已經遷移的那些，不可以退回去。**
 * ⇒ 有人把一支技能的 `castTimeTier` 拿掉換回手寫秒數 ⇒ 這裡紅。
 */
import { describe, expect, it, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { ContentLoader } from "./loader";
import { shippedContentSource } from "./__fixtures__/shippedContent";
import { registerAll } from "./registries";
import { Abilities } from "../sim/content/registry";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "content");

/**
 * ⭐ 2026-09-12 完成值：**907 / 907**。
 * 這裡從遷移棘輪升級成完成閘：任何一支退回自由秒數都必須失敗。
 */
const COMPLETED_COUNT = 907;

let tiered = 0;
let total = 0;

beforeAll(async () => {
  const r = await new ContentLoader(shippedContentSource(CONTENT)).load();
  registerAll(r.store);
  for (const a of Abilities.all()) {
    total++;
    if ((a as { castTimeTier?: string }).castTimeTier !== undefined) tiered++;
  }
});

describe("吟唱五級距的遷移只能往前（GH#943 / GH#1243）", () => {
  it("⭐ 每一支出貨技能都已遷移", () => {
    expect(total, "⛔ 一支技能都沒掃到 —— 偵測壞了").toBeGreaterThan(500);
    expect(tiered, "⛔ 零支有 castTimeTier ⇒ 欄位名或載入路徑錯了").toBeGreaterThan(0);
    expect(total, "出貨技能數意外改變；先確認索引與載入範圍").toBe(COMPLETED_COUNT);
    expect(tiered, "有技能退回自由 castTimeSec；補回 castTimeTier").toBe(total);
  });

  it("⛔ 執行中的工具不可重新匯入舊公式", () => {
    const active = [
      join(CONTENT, "..", "packages/shared/scripts/deriveCastTimes.ts"),
      join(CONTENT, "..", "packages/shared/scripts/contentValidate.ts"),
      join(CONTENT, "..", "packages/shared/scripts/probeCastTelegraph.ts"),
      join(CONTENT, "..", "packages/shared/scripts/probePassiveSlot.ts"),
    ];
    const offenders = active
      .filter((path) => /from\s+["'][^"']*castTimeFormula["']/.test(readFileSync(path, "utf8")))
      .map((path) => path.slice(CONTENT.length + 1));
    expect(
      offenders,
      "五級距已是唯一作者來源；不要再由傷害、冷卻、半徑反推吟唱秒數",
    ).toEqual([]);
  });
});
