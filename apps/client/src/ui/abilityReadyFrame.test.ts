/**
 * 就緒框的承重守衛（owner 2026-08-13 那一句的兩半）。
 *
 * 突變紀錄（接線類，一條）：
 *   · `isAbilityTileReady` 把 `t.pressable &&` 拿掉 → 第一條紅
 *     （被動磚開始亮框 = owner 明說不可以的那件事）
 *
 * ⛔ 這裡不驗顏色、不驗秒數、不驗 boxShadow 的 px —— 那些是**數字**，
 *    改了玩家看不出來，而且 owner 隨時會調（第二守則）。
 */
import { describe, it, expect } from "vitest";
import {
  abilityReadyFrameStyle,
  abilityTileCursor,
  isAbilityTileReady,
  READY_RGB_ACTIVE,
} from "./abilityReadyFrame";

describe("就緒框 = 「按得下去」且「現在按得動」", () => {
  it("⭐ 被動永遠不亮 —— owner「被動技的按鈕應該不能被按下，所以…不會有變色動畫框」", () => {
    // 被動磚的冷卻是 0、魔力也「夠」（它不花魔力）—— 也就是說**除了 pressable
    // 以外每一格都成立**。所以這一條就是在釘 `pressable` 那一格真的參與判斷。
    expect(isAbilityTileReady({ pressable: false, offCooldown: true, manaOk: true })).toBe(false);
    // 而且游標也不可以說謊（#166 對純被動移掉的正是 pointer）。
    expect(abilityTileCursor(false)).toBe("default");
  });

  it("⭐ 主動：四個條件缺一都不亮，全中才亮", () => {
    const ready = { pressable: true, offCooldown: true, manaOk: true, learned: true };
    expect(isAbilityTileReady(ready)).toBe(true);
    expect(isAbilityTileReady({ ...ready, offCooldown: false }), "冷卻中").toBe(false);
    expect(isAbilityTileReady({ ...ready, manaOk: false }), "魔力不夠").toBe(false);
    // ⚠️ 沒學的技能冷卻是 0、魔力也「夠」—— 漏了這一格整排未學技能會亮著框
    //    說「可以放」（失敗形態④：斷言方向跟缺陷無關的那一種缺陷本體）。
    expect(isAbilityTileReady({ ...ready, learned: false }), "還沒點").toBe(false);
    // 天生技／EX 沒有階級，省略時視為已學。
    expect(isAbilityTileReady({ pressable: true, offCooldown: true, manaOk: true })).toBe(true);
  });

  it("⭐ 框不可以吃掉點擊 —— 它蓋滿整格", () => {
    // 這一條擋的是「技能一旦就緒就再也按不下去」這種上架即死的形態：
    // 框是 inset:0 的子元素，少了 pointerEvents:none 它會攔掉 onPointerDown。
    expect(abilityReadyFrameStyle(READY_RGB_ACTIVE).pointerEvents).toBe("none");
  });
});
