/** ⭐⭐ 取捨迴圈的純判定（GH#920 / #1151 C）。 */
import { describe, it, expect } from "vitest";
import { shouldConvertToSpecial, pickItemToBreak } from "./round11SurvivalLoop";

describe("① 普通殭屍放滿 45 秒 ⇒ 轉特殊", () => {
  it("⭐ 剛好滿 ⇒ 轉；⛔ 差一 tick ⇒ 不轉", () => {
    expect(shouldConvertToSpecial(0, 45 * 30, 45, 30)).toBe(true);
    expect(shouldConvertToSpecial(0, 45 * 30 - 1, 45, 30)).toBe(false);
  });

  it("⭐ **長 tick 跳過門檻**也算 —— ⛔ 絕對 tick 不會漏掉那一刻", () => {
    expect(shouldConvertToSpecial(0, 999 * 30, 45, 30)).toBe(true);
  });

  it("⛔ 秒數 0 ⇒ **不轉化**（機制關著），⛔ 不是「一出生就轉」", () => {
    // ⚠️ 反過來的話,場上會瞬間**全部**是特殊怪 —— ⭐ 而那是一個關掉開關造成的災難。
    expect(shouldConvertToSpecial(0, 0, 0, 30)).toBe(false);
    expect(shouldConvertToSpecial(0, 999 * 30, 0, 30)).toBe(false);
  });
});

describe("③ 死亡損壞一件寶具 —— ⭐ 只在**有東西的格子**之間抽", () => {
  it("⛔⛔ 只帶一件 ⇒ **一定**損壞那一件（⛔ 不是 5/6 機率沒事）", () => {
    // ⚠️ owner 逐字:「**你死就一定會噴**」——⭐ 在 6 格裡抽會讓他 5/6 的機率沒損失。
    const items = [null, null, "sword", null, null, null];
    for (const roll of [0, 0.17, 0.5, 0.83, 0.999]) {
      expect(pickItemToBreak(items, roll)).toBe(2);
    }
  });

  it("⭐ 兩件 ⇒ 抽樣值把兩件都選得到", () => {
    const items = ["a", null, "b"];
    expect(pickItemToBreak(items, 0)).toBe(0);
    expect(pickItemToBreak(items, 0.99)).toBe(2);
  });

  it("⭐ 一件都沒有 ⇒ `null`（⛔ 不是 0 —— 0 是一個合法的格子）", () => {
    expect(pickItemToBreak([null, null], 0.5)).toBeNull();
    expect(pickItemToBreak([], 0.5)).toBeNull();
  });

  it("⭐ 抽樣值超出 [0,1) 也**夾得住**（⛔ 不回一個不存在的格子）", () => {
    const items = ["a", "b"];
    expect(pickItemToBreak(items, -1)).toBe(0);
    expect(pickItemToBreak(items, 1)).toBe(1);
    expect(pickItemToBreak(items, 99)).toBe(1);
  });
});
