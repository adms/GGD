/**
 * GH#1264 —— 英靈殿 hover 放大的**幾何**（純函式；接線那一層由
 * `ValhallaPanelMount.test.ts` 讀真的 DOM 釘住，⛔ 這裡不假裝驗得到它）。
 *
 * 這一支只問三件會讓玩家看得出來的事：
 *  ① 放大後**蓋不到「⚔️ 一鍵開打」** —— 底邊永遠不超過原本舞台的底邊
 *  ② 放大後**包住原框** —— 否則滑鼠當場 leave ⇒ 收回 ⇒ 再 enter ⇒ 無限閃爍
 *  ③ 長寬比不變 —— 模型不會被拉扁
 *
 * ⭐ 量尺自證兩個方向（CLAUDE.md「一把只驗過單邊的尺，不算自證過」）：
 * 已知**放得下**的量得到放大、已知**放不下**的量得到 `null`。
 */
import { describe, expect, it } from "vitest";
import {
  clampHoverRules,
  DEFAULT_VALHALLA_HOVER,
  valhallaPopRect,
  VALHALLA_HOVER_BOUNDS,
  VALHALLA_POP_MIN_SCALE,
  type ValhallaRect,
} from "./valhallaHoverPop";

const VIEWPORT = { width: 1440, height: 900 };
/** 大廳實測的量級：舞台 240×168，上緣距視窗頂 ~150px（`valhallaLayout` 的 ≥860 那一階）。 */
const SLOT: ValhallaRect = { x: 56, y: 150, width: 240, height: 168 };

const pop = (slot: ValhallaRect, viewport = VIEWPORT, rules = DEFAULT_VALHALLA_HOVER): ValhallaRect | null =>
  valhallaPopRect({ slot, viewport, rules });

describe("GH#1264 hover 放大的框", () => {
  it("量尺自證兩個方向：放得下 ⇒ 真的變大；上方沒空間 ⇒ null（⛔ 不硬擠一個看不出來的放大）", () => {
    const big = pop(SLOT);
    expect(big, "⛔ 大廳這個量級放不出來 ⇒ 這支測試在量空氣").not.toBeNull();
    expect(big!.width).toBeGreaterThan(SLOT.width);
    expect(big!.height).toBeGreaterThan(SLOT.height);
    // 上緣貼著視窗頂 ⇒ 只長得出 < 1.05 倍 ⇒ 不放大
    expect(pop({ ...SLOT, y: 14 })).toBeNull();
    // 關掉就是關掉
    expect(pop(SLOT, VIEWPORT, { ...DEFAULT_VALHALLA_HOVER, enabled: false })).toBeNull();
    // 量不到框（jsdom 沒排版 / 還沒掛上）⇒ ⛔ 不猜一個尺寸
    expect(pop({ ...SLOT, width: 0, height: 0 })).toBeNull();
  });

  it("★ 底邊永遠不動、永遠包住原框、長寬比不變、留在視窗內", () => {
    const cases: ValhallaRect[] = [
      SLOT,
      { ...SLOT, y: 60 }, // 上方空間不足 ⇒ 倍率被夾小，但仍然要放大
      { ...SLOT, x: 4 }, // 貼著視窗左緣 ⇒ 「包住原框」贏過「邊界留白」
      { ...SLOT, x: VIEWPORT.width - 244 }, // 貼著右緣
      { x: 56, y: 150, width: 700, height: 168 }, // 很寬的舞台 ⇒ 差點撞到視窗左右緣
    ];
    for (const slot of cases) {
      const r = pop(slot);
      if (r === null) continue; // 放不下是合法結果（上一條已經釘住它會發生）
      const where = JSON.stringify(slot);
      // ① 底邊不動 ⇒ 結構上蓋不到舞台下方的「⚔️ 一鍵開打」
      expect(r.y + r.height, `底邊跑掉了 ${where}`).toBeCloseTo(slot.y + slot.height, 6);
      // ② 包住原框 ⇒ 滑鼠不會掉出去（⛔ 無限閃爍）
      expect(r.x, `左邊沒包住 ${where}`).toBeLessThanOrEqual(slot.x + 1e-6);
      expect(r.x + r.width, `右邊沒包住 ${where}`).toBeGreaterThanOrEqual(slot.x + slot.width - 1e-6);
      expect(r.y, `上面沒包住 ${where}`).toBeLessThanOrEqual(slot.y + 1e-6);
      // ③ 長寬比不變、而且真的變大
      expect(r.width / r.height, `被拉扁了 ${where}`).toBeCloseTo(slot.width / slot.height, 6);
      expect(r.width / slot.width, `倍率沒意義 ${where}`).toBeGreaterThanOrEqual(VALHALLA_POP_MIN_SCALE);
      // ④ 上緣不越過視窗留白（下緣由①釘住，左右由②的夾擠刻意讓步）
      expect(r.y, `越過視窗上緣 ${where}`).toBeGreaterThanOrEqual(DEFAULT_VALHALLA_HOVER.edgeMargin - 1e-6);
    }
  });

  it("上下界兩邊都夾（⛔ 只檢查 min 的欄位會讓 1.8 打成 18 過關）", () => {
    const wild = clampHoverRules({ enabled: true, scale: 18, hoverDelayMs: -5, transitionMs: 99_999, edgeMargin: 999 });
    expect(wild.scale).toBe(VALHALLA_HOVER_BOUNDS.scale.max);
    expect(wild.hoverDelayMs).toBe(VALHALLA_HOVER_BOUNDS.hoverDelayMs.min);
    expect(wild.transitionMs).toBe(VALHALLA_HOVER_BOUNDS.transitionMs.max);
    expect(wild.edgeMargin).toBe(VALHALLA_HOVER_BOUNDS.edgeMargin.max);
  });
});
