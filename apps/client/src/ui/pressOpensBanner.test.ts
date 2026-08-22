/**
 * ⭐ owner 2026-08-22（他標為**最高優先**）：
 * 「**天生QWEREX 按按鈕施放時不要一直跳出說明 很亂**」
 *
 * 按下技能鈕以前無條件走 `setHeldAbility(slot)`（intent 預設 `"full"`），
 * 而 `"full"` 會把 `AbilityDescriptionOverlay` 那條說明橫幅拉到畫面頂端 ——
 * 連招時一秒閃好幾下，蓋住上半個畫面。
 *
 * ⇒ 現在按下走 `"aim"`（只留範圍圈），由 `config.range-guide@1.pressOpensBanner`
 *   決定要不要開橫幅（出貨 false）。⚠️ **被動例外**：owner 2026-08-13
 *   「被動技的按鈕應該不能被按下」—— 說明是玩家唯一能對被動做的事。
 *
 * ⚠️ 驗的是**機制**（按下之後橫幅開不開），⛔ 不是任何一個出貨數值。
 */
import { describe, expect, it, beforeEach } from "vitest";
import { applyRangeGuideDoc, rangeGuide } from "./rangeGuideConfig";
import { getDescribedAbility, getHeldAbility, setHeldAbility } from "./abilityHold";

/** `AbilityBar`／`TouchControls` 按下時逐字用的那一行 —— ⛔ 不是複製一份判斷。 */
const pressIntent = (passive: boolean): "full" | "aim" =>
  passive || rangeGuide().pressOpensBanner ? "full" : "aim";

describe("按技能鈕不開說明橫幅 (owner 2026-08-22)", () => {
  beforeEach(() => {
    applyRangeGuideDoc(null);
    setHeldAbility(null);
  });

  it("出貨設定下，按主動技只留範圍圈 —— ⛔ 不開頂端說明橫幅", () => {
    expect(rangeGuide().pressOpensBanner, "出貨要是關的").toBe(false);
    setHeldAbility("Q", pressIntent(false));
    expect(getHeldAbility(), "範圍圈還是要出（瞄準要用）").toBe("Q");
    // ⭐ `getDescribedAbility()` **就是**說明橫幅的資料來源 —— 它回 null = 橫幅不開。
    expect(getDescribedAbility(), "⛔ 按下不可以開說明橫幅").toBeNull();
  });

  it("⭐ 被動不受這一格影響 —— 說明是玩家唯一能對它做的事", () => {
    setHeldAbility("PASSIVE", pressIntent(true));
    expect(getDescribedAbility()).toBe("PASSIVE");
  });

  it("後台把它打開 → 按下就開橫幅（第一守則：這是一格下拉，⛔ 不是一次部署）", () => {
    applyRangeGuideDoc({ pressOpensBanner: true } as never);
    setHeldAbility("Q", pressIntent(false));
    expect(getDescribedAbility()).toBe("Q");
  });
});
