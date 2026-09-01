/**
 * ⭐⭐ 「誰是我的目標」的三個決策點**變成設定**（2026-09-01）。
 *
 * ── ⭐ 為什麼是這三個 ──────────────────────────────────────────────────
 * owner 的大目標逐字：「**所有功能都要可 JSON 操作設定**」，
 * 而 CLAUDE.md 第一守則點名：「⚠️ **決策點**是這條守則最常被漏掉的一半 ——
 * 一個**數字**該不該可調大家都會想到；一個**決策**該不該可調，常常被當成
 * 『這就是設計』而寫死在程式裡。**實際上決策點才是 owner 最會改的東西。**」
 *
 * ⇒ ⭐ 這三個正是決策：**誰先**（仇恨窗）· **多遠算看得到**（近戰地板）·
 *   **追多久才放棄**（牽繩）。⛔ 而它們在此之前是 `sim/targeting.ts` 的三個常數。
 *
 * ── ⭐ 這條驗的是**行為**，⛔ 不是「欄位存在」──────────────────────────
 * （失敗形態⑦：掃屬性代替掃行為。）每一條都**兩個方向**：
 * 出貨值下拿到出貨行為 **且** 改那一格之後行為**真的跟著變**。
 *
 * MUTATION LOG（落地前跑過）：
 *   · `acquireRadius` 的 `floor` 參數改回硬用 `MELEE_ACQUIRE_FLOOR` → ② 紅
 *   · `isThreat` 改回硬用 `THREAT_WINDOW_TICKS` → ① 紅
 */
import { describe, it, expect } from "vitest";
import { DEFAULT_AUTO_ENGAGE, normalizeAutoEngageRules } from "./combatFeel";
import { acquireRadius, MELEE_ACQUIRE_FLOOR, THREAT_WINDOW_TICKS, ACQUIRE_LEASH } from "./targeting";

describe("⭐ 瞄準的三個決策點是設定，⛔ 不是常數", () => {
  it("★ ① 出貨值**逐位元等於**原本寫死的那三個（⛔ 這一輪不可以改到行為）", () => {
    expect(DEFAULT_AUTO_ENGAGE.threatWindowTicks, "仇恨窗").toBe(THREAT_WINDOW_TICKS);
    expect(DEFAULT_AUTO_ENGAGE.meleeAcquireFloor, "近戰地板").toBe(MELEE_ACQUIRE_FLOOR);
    expect(DEFAULT_AUTO_ENGAGE.acquireLeash, "牽繩").toBe(ACQUIRE_LEASH);
  });

  it("★ ② ⭐ **行為真的跟著那一格走**（⛔ 不是驗欄位存在 —— 失敗形態⑦）", () => {
    // ⭐ 方向 A：出貨值 ⇒ 出貨行為（沒有 StatsComp ⇒ 直接回地板）
    expect(acquireRadius(undefined, 0.6), "⛔ 出貨行為變了").toBe(MELEE_ACQUIRE_FLOOR);
    // ⭐ 方向 B：換一個地板 ⇒ 回傳跟著變
    expect(
      acquireRadius(undefined, 0.6, 13),
      "⛔⛔ 傳了新的地板而回傳沒變 ⇒ ⭐ 那一格是**假的可調**（第一·五守則：說了但不會發生）",
    ).toBe(13);
  });

  it("★ ③ 正規化器收得下這三格，且**夾限與 Zod 逐字相同**", () => {
    const cf = { autoEngage: normalizeAutoEngageRules({ threatWindowTicks: 999, meleeAcquireFloor: 999, acquireLeash: 999 }) };
    // ⭐ 上界：600 / 48 / 48（與 `schema/config/combatFeel.ts` 逐字相同）
    expect(cf.autoEngage.threatWindowTicks).toBe(600);
    expect(cf.autoEngage.meleeAcquireFloor).toBe(48);
    expect(cf.autoEngage.acquireLeash).toBe(48);
    // ⭐ 缺席 ⇒ 出貨值（⛔ 不是 0 —— 一個歸零的仇恨窗會讓自動索敵行為整個變樣）
    const bare = { autoEngage: normalizeAutoEngageRules({}) };
    expect(bare.autoEngage.threatWindowTicks).toBe(THREAT_WINDOW_TICKS);
    expect(bare.autoEngage.meleeAcquireFloor).toBe(MELEE_ACQUIRE_FLOOR);
    expect(bare.autoEngage.acquireLeash).toBe(ACQUIRE_LEASH);
  });
});
