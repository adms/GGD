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
import { ContentLoader } from "./loader";
import { shippedContentSource } from "./__fixtures__/shippedContent";
import { registerAll } from "./registries";
import { Abilities } from "../sim/content/registry";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "content");

/**
 * ⭐ 2026-09-12 量到的遷移進度：**185 / 907**。
 * ⛔ 這個數字**只能往上**。⚠️ 它不是目標，是**地板**。
 */
const MIGRATED_FLOOR = 185;

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
  it("⭐ 量尺自證：真的掃到技能，而且**不是**全部都遷移了（⛔ 否則這條閘沒在問任何事）", () => {
    expect(total, "⛔ 一支技能都沒掃到 —— 偵測壞了").toBeGreaterThan(500);
    expect(tiered, "⛔ 零支有 castTimeTier ⇒ 欄位名或載入路徑錯了").toBeGreaterThan(0);
    expect(
      tiered,
      "⭐ 全部都遷移完了 —— ⭐ 那是好事！⇒ 把這條改成「全部都要有」，" +
        "並把 `castTimeFormula.ts` 那條 20 階階梯**退場**（GH#1243 第 4 步）。",
    ).toBeLessThan(total);
  });

  it("⛔ 已經遷移的不可以退回手寫秒數", () => {
    expect(
      tiered,
      `⛔⛔ 帶 \`castTimeTier\` 的技能從 ${MIGRATED_FLOOR} 掉到 ${tiered} ——\n` +
        "⭐ 有人把級別拿掉換回了手寫的 `castTimeSec`。\n" +
        "⚠️ 而那會讓它回到**被取代的 20 階階梯**那個空間（`castTimeFormula.ts`），\n" +
        "⛔ 也就是 2026-09-12 誤導出兩個假缺陷的那條路。\n" +
        "⇒ 填回 `castTimeTier`，⛔ 不要改這個地板。",
    ).toBeGreaterThanOrEqual(MIGRATED_FLOOR);
  });

  it("⭐ 遷移前進了就要把地板跟上（⛔ 否則棘輪會與世界脫節）", () => {
    expect(
      tiered,
      `⭐ 已經遷移 ${tiered} 支（地板還寫著 ${MIGRATED_FLOOR}）—— 把 \`MIGRATED_FLOOR\` 調到 ${tiered}。\n` +
        "⛔ 不調的話，這張棘輪會慢慢放行真的退步。",
    ).toBeLessThanOrEqual(MIGRATED_FLOOR);
  });
});
