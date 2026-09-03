/**
 * ⭐⭐ **additive 預算在出貨那條路上真的被套用了**（GH#900）。
 *
 * owner 2026-09-01（逐字）：
 * > 「太多亮光束特效 太誇張了 變成全白戰鬥 **克制一下特效使用量好嗎**」
 *
 * ⭐ 票文逐字：「預算機制**已接上**（未驗收）—— ⛔ 剩下的是『玩家看得到』的證據」。
 * ⇒ ⭐ 這一支就是那個證據的**靜態可判**那一半
 * （CLAUDE.md：「⭐ 關鍵洞見：那兩個根因都是**靜態可判**的」）。
 *
 * ⚠️⚠️ ⭐ **而既有的 `additiveBudget.test.ts` 那 5 條問不到這件事** ——
 * 它們驗的是**函式**（給 max/overflow ⇒ 回對的 gain）。
 * ⛔ 沒有一條問：
 *   ① **出貨值**真的到得了那支函式嗎（`content/config/vfx-budget.json` → `ContentDb`）
 *   ② **算繪端**真的問了它嗎（`VfxSystem` 的 `additiveGain` / `beginAdditiveFrame`）
 * ⇒ ⭐ 那是失敗形態⑪：兩條各驗一半的路，⛔ 而接縫上沒有人站。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 `content/config/vfx-budget.json` 的 `maxConcurrentAdditive` 改成 0
 *    → 🔴 ①「出貨的預算是**不限**」——⭐ 那正是 owner 抱怨的那一天的狀態
 * M2 `VfxSystem.ts` 的 `additiveGain(...)` 呼叫拿掉
 *    → 🔴 ③「算繪端沒有問預算」
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setAdditiveBudget, additiveGain, beginAdditiveFrame } from "./additiveBudget";

const REPO = join(__dirname, "../../../..");
const BUDGET = JSON.parse(
  readFileSync(join(REPO, "content/config/vfx-budget.json"), "utf8"),
) as { maxConcurrentAdditive?: number; additiveOverflowBrightness?: number };

describe("additive 預算的接縫（GH#900）", () => {
  it("★★ ⭐ **出貨值真的在夾**（⛔ `0` ＝ 不限 ＝ owner 抱怨的那一天）", () => {
    expect(
      BUDGET.maxConcurrentAdditive,
      "⛔⛔ 出貨的 additive 預算是**不限** ⇒ 團戰照樣整片白。\n" +
        "  ⭐ owner 2026-09-01：「太多亮光束特效 太誇張了 變成全白戰鬥」",
    ).toBeGreaterThan(0);
    expect(
      BUDGET.additiveOverflowBrightness,
      "⛔ 溢出亮度是 1 ＝ 完全不減光 ⇒ 上限那一格等於不存在",
    ).toBeLessThan(1);
  });

  it("★★ ⭐⭐ 用**出貨值**跑一次團戰：第 N+1 發真的變暗（兩個方向）", () => {
    const max = BUDGET.maxConcurrentAdditive!;
    const dim = BUDGET.additiveOverflowBrightness!;
    setAdditiveBudget(max, dim);
    beginAdditiveFrame();
    // ⭐ 上限之內 —— 全亮（⛔ 這一半也要驗：只驗「會暗」的尺分不出「全都暗」）
    for (let i = 0; i < max; i += 1)
      expect(additiveGain(true), `⛔ 第 ${i + 1} 發（上限之內）被減光了`).toBe(1);
    // ⭐ 超過 —— 減光
    expect(
      additiveGain(true),
      `⛔ 第 ${max + 1} 發沒有被減光 ⇒ 預算沒有生效`,
    ).toBe(dim);
  });

  it("★★ ⭐ 算繪端**真的問了**預算（⛔ 接縫上沒人站 = 形態⑪）", () => {
    const src = readFileSync(join(REPO, "apps/client/src/vfx/VfxSystem.ts"), "utf8");
    expect(
      src.includes("additiveGain("),
      "⛔⛔ 算繪端沒有問預算 —— 那格設定會存得進去、後台看得到，而畫面一點都不會變",
    ).toBe(true);
    expect(
      src.includes("beginAdditiveFrame()"),
      "⛔ 少了每 frame 歸零 ⇒ 第二場戰鬥一開始就全暗（既有守衛③講的那個）",
    ).toBe(true);
  });

  it("★★ ⭐ 設定**真的到得了**那支函式（config → ContentDb → 預算）", () => {
    const db = readFileSync(join(REPO, "apps/client/src/content/ContentDb.ts"), "utf8");
    expect(
      /setAdditiveBudget\(\s*ab\?\.maxConcurrentAdditive/.test(db),
      "⛔⛔ `ContentDb` 沒有把 `vfx-budget` 的那兩格餵給預算 ⇒\n" +
        "  ⭐ 後台改了場上沒反應（失敗形態⑧，這一輪已經中過三次）",
    ).toBe(true);
  });

  it("⭐ 反方向：非 additive 不佔預算（⛔ 否則一發 alpha 特效會把光束擠掉）", () => {
    setAdditiveBudget(1, 0);
    beginAdditiveFrame();
    expect(additiveGain(false), "⛔ 非 additive 被減光了").toBe(1);
    expect(additiveGain(false), "⛔ 非 additive 佔了預算").toBe(1);
    expect(additiveGain(true), "⛔ 第一發 additive 應該還在上限之內").toBe(1);
  });
});
