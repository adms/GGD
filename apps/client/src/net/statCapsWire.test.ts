/**
 * 屬性上限的**最後一哩** (GH#286 稽核) —— `MatchState` → `hudStore` → 面板.
 *
 * ⚠️ 失敗形狀 ②「算出來了但玩家沒拿到」的每一段都有守衛,**除了這一段**:
 *
 *   sim 算出表        ← sim/statCaps.test.ts
 *   MatchRoom 寫進 state + Colyseus 真的編碼得出去 ← rooms/matchRoomStatCaps.test.ts
 *   面板讀 `statCapsJson` 解出上限                ← ui/statCapsDisplay.test.ts
 *   ────────────────────────────────────────────
 *   **`syncHudFromState` 把它從 MatchState 抄進 HudState** ← 沒有人守
 *
 * 稽核時把 RoomStore 裡那一行 `patch.statCapsJson = state.statCapsJson` 刪掉,
 * 整個 client 套件(4093 條)**全綠**。症狀:伺服器算好、送出、客戶端也解出來了,
 * 但 `useHud(s => s.statCapsJson)` 永遠是 ""。每一塊面板於是退回內容檔/出貨預設,
 * 操作者為這一場調的天花板一格都到不了玩家眼前 —— 而且和「後台還沒設定」長得
 * 一模一樣。
 *
 * 所以這一支的斷言是**面板真的算得出那個上限**,不是「store 裡有一個字串」。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import type { MatchState } from "@ggd/shared/protocol/schema";
import { Stat } from "@ggd/shared/sim/stats/statTypes";
import { effectiveCap } from "@ggd/shared/sim/statCaps";
import { hudStore, resetHudStore, syncHudFromState } from "./RoomStore";
import { resolveStatCaps } from "../ui/displayStatCaps";

/** Structural stand-in for the reflected Colyseus MatchState. */
function fakeState(statCapsJson: string): MatchState {
  return {
    matchId: "m_caps",
    phase: "combat",
    round: 1,
    tick: 30,
    phaseTicksLeft: 300,
    seed: 1,
    combatEnvJson: "",
    baseBonusJson: "",
    statCapsJson,
    seats: new Map(),
    entities: new Map(),
    teams: [],
  } as unknown as MatchState;
}

const OPERATOR_TABLE = JSON.stringify({ as: { base: 5, unlocked: 12 } });

beforeEach(() => resetHudStore());

describe("statCapsJson 從 MatchState 走進 HUD store (statcaps-hud-wire)", () => {
  it("這一場的表真的抵達面板 —— 上限算出來是 5 / 12,不是出貨的 4 / 10", () => {
    cover("statcaps-hud-wire");
    syncHudFromState(fakeState(OPERATOR_TABLE), "01A");

    // 面板看到的東西,用面板自己的解析器算 —— 不是斷言字串相等。
    const table = resolveStatCaps(hudStore.getState().statCapsJson);
    expect(effectiveCap(table, Stat.AttackSpeed, 0)).toBe(5);
    expect(effectiveCap(table, Stat.AttackSpeed, 999)).toBe(12);
    // 沒接上線的實作會退回出貨預設,那正好是這兩個數字:
    expect(effectiveCap(table, Stat.AttackSpeed, 0)).not.toBe(4);
    expect(effectiveCap(table, Stat.AttackSpeed, 999)).not.toBe(10);
  });

  it("換一場、換一張表 → 面板跟著換(不是只抄第一次)", () => {
    cover("statcaps-hud-wire");
    syncHudFromState(fakeState(OPERATOR_TABLE), "01A");
    syncHudFromState(fakeState(JSON.stringify({ as: { base: 3, unlocked: 30 } })), "01A");
    const table = resolveStatCaps(hudStore.getState().statCapsJson);
    expect(effectiveCap(table, Stat.AttackSpeed, 0)).toBe(3);
    expect(effectiveCap(table, Stat.AttackSpeed, 999)).toBe(30);
  });

  it("大廳(沒有 MatchState)保持空字串,由面板退回內容/出貨預設", () => {
    cover("statcaps-hud-wire");
    expect(hudStore.getState().statCapsJson).toBe("");
    // 而且退回的**不是空表** —— 空表會讓解鎖靜默消失。
    expect(effectiveCap(resolveStatCaps(""), Stat.AttackSpeed, 999)).toBe(10);
  });
});
