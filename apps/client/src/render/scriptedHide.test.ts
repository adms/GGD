/**
 * GH#838 N6 —— 演出用暫時隱形的守衛。
 *
 * ⭐ 承重的兩件事（⛔ 不是「有沒有藏起來」）：
 *   ① **自己會過期** —— 一個要靠第二則事件才解除的隱形，掉一則封包就是永久消失。
 *   ② **表不會長大** —— 過期的紀錄要被清掉，否則一場打完它就是一份洩漏。
 * 突變（2026-08-28）：把 `isBodyHidden` 的 `end <= nowMs` 改成 `false` ⇒ ①② 紅。
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  MAX_HIDE_MS,
  clearScriptedHides,
  hideBodyFor,
  isBodyHidden,
  scriptedHideCount,
} from "./scriptedHide";

beforeEach(() => clearScriptedHides());

describe("GH#838 N6 演出用暫時隱形", () => {
  it("① 藏起來之後**自己會過期** —— ⛔ 不需要任何人送解除", () => {
    hideBodyFor(7, 1000, 0);
    expect(isBodyHidden(7, 500)).toBe(true);
    expect(isBodyHidden(7, 1001), "時間到了還藏著 —— 那是一具永遠不回來的身體").toBe(false);
  });

  it("② 過期的紀錄被清掉（表不隨場次長大）", () => {
    hideBodyFor(1, 100, 0);
    hideBodyFor(2, 100, 0);
    expect(scriptedHideCount()).toBe(2);
    isBodyHidden(1, 999);
    isBodyHidden(2, 999);
    expect(scriptedHideCount(), "過期之後紀錄還在 —— 一場打完就是一份洩漏").toBe(0);
  });

  it("③ 同一個人再喊一次取較晚的（連段裡兩段都想藏他時不會提早現形）", () => {
    hideBodyFor(3, 500, 0);
    hideBodyFor(3, 200, 0); // 較早 —— ⛔ 不可以把他提早放出來
    expect(isBodyHidden(3, 400)).toBe(true);
  });

  it("④ 硬上限：一份寫錯的腳本不可以讓身體消失一整場", () => {
    hideBodyFor(4, 999_999, 0);
    expect(isBodyHidden(4, MAX_HIDE_MS + 1)).toBe(false);
  });

  it("⑤ 回合邊界清空（跨回合不留東西）", () => {
    hideBodyFor(5, 3000, 0);
    clearScriptedHides();
    expect(isBodyHidden(5, 1)).toBe(false);
  });

  it("⑥ 非正數時長是 no-op（⛔ 不是「藏到天荒地老」）", () => {
    hideBodyFor(6, 0, 0);
    hideBodyFor(6, -5, 0);
    expect(scriptedHideCount()).toBe(0);
  });
});
