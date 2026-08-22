/**
 * GH#502/K2 —— 虛擬游標的**一條**薄守衛（體驗層：⛔ 不開對抗輪）。
 *
 * 驗**機制會不會發生**，⛔ 不驗「速度是 1100」（出貨數值住 config）。承重那一行
 * 是 `menuOwnsPad`：拿掉它，游標會在戰鬥中跟著左搖桿亂跑 —— 而那支搖桿同時
 * 還在指揮英雄走路。
 */
import { describe, expect, it } from "vitest";
import { SHIPPED_PAD_CURSOR as T, padCursorNextMode, resolvePadCursorTuning, stepPadCursor } from "./padCursor";

const VIEW = { w: 1920, h: 1080 };
const MID = { x: 960, y: 540 };

describe("pad cursor", () => {
  it("戰鬥中一律關掉 —— ⛔ 切換鍵打不開它,已經開著的也會被收掉", () => {
    const inCombat = { enabled: true, menuOwnsPad: false, backPressed: false };
    expect(padCursorNextMode(false, { ...inCombat, togglePressed: true })).toBe(false);
    expect(padCursorNextMode(true, { ...inCombat, togglePressed: false })).toBe(false);
    // 而同一顆鍵在選單裡（modal 蓋在戰鬥上也算）打得開,否則上面那條是空的
    const inMenu = { ...inCombat, menuOwnsPad: true, togglePressed: true };
    expect(padCursorNextMode(false, inMenu)).toBe(true);
    // …除非後台把它關掉,那時同一顆鍵什麼都不會發生
    expect(padCursorNextMode(false, { ...inMenu, enabled: false })).toBe(false);
  });

  it("推搖桿會移動游標,死區之內不會,而且走不出畫面", () => {
    expect(stepPadCursor(MID, { x: T.deadzone / 2, y: 0 }, 16, T, VIEW)).toEqual(MID);
    const moved = stepPadCursor(MID, { x: 1, y: 0 }, 16, T, VIEW);
    expect(moved.x).toBeGreaterThan(MID.x);
    expect(moved.y).toBe(MID.y);
    // 一次很長的幀（分頁切回前景）不可以把游標甩出畫面
    const far = stepPadCursor(MID, { x: 1, y: 1 }, 9_000, T, VIEW);
    expect(far.x).toBeLessThan(VIEW.w);
    expect(far.y).toBeLessThan(VIEW.h);
  });

  it("超界的設定被夾回來並且**回報**,⛔ 不是靜默吞掉", () => {
    const { tuning, problems } = resolvePadCursorTuning({ cursorSpeed: 99_999 });
    expect(tuning.cursorSpeed).toBeLessThan(99_999);
    expect(problems.map((p) => p.key)).toContain("cursorSpeed");
  });
});
