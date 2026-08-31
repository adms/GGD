/**
 * ⛔⛔ GH#760 / GH#614 —— **選人畫面的快照不可以被整份丟掉**。
 *
 * ⚠️ 這條**不是**驗「有一個叫 `entitiesOf` 的函式」（失敗形態⑥：掃字串代替行為）。
 * 它把**出貨的** `GameApp.prototype.onStatePatch` 拿真的 `MatchState` 跑一次，
 * 問一個行為問題：**`entities` 那一格還沒上線時，HUD 收不收得到這份快照。**
 *
 * ---------------------------------------------------------------------------
 * 承重的那一行
 * ---------------------------------------------------------------------------
 * `onStatePatch` 的閘 `if (!state?.seats) return;`。
 * 把它改回 2026-08-27 之前的 `if (!state?.seats || !state.entities) return;`
 * ⇒ 第一條紅（實測：`connected` 停在 false）。
 *
 * 那一行為什麼會咬人：`view()(MatchState.prototype, "entities")` 之後，
 * 「view 裡還沒有實體」時 Colyseus **根本不送這一格** ⇒ 客戶端讀到 `undefined`
 * （⛔ 不是 `size === 0` 的空 map）。而那正好就是 `champSelect` 的每一份快照
 * —— 實測 183 份連續快照全部 `champSelect / noEntities`。
 * ⇒ 舊的閘把它們全部丟掉 ⇒ `syncHudFromState` 一次都沒跑 ⇒ HUD 永遠停在
 * 「Connecting to match…」⇒ **進不了選人畫面**（真瀏覽器實測，2026-08-27）。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { MatchState } from "@ggd/shared/protocol/schema";
import { GameApp } from "../GameApp";
import { hudStore, resetHudStore } from "./RoomStore";
import { entitiesOf, entitiesDelivered } from "./viewGatedEntities";

/** 線上那一份的樣子：`seats` 有、而 view-gated 的 `entities` **整格沒送**。 */
function champSelectSnapshot(): MatchState {
  const state = new MatchState();
  state.phase = "champSelect";
  delete (state as unknown as { entities?: unknown }).entities;
  return state;
}

/** `onStatePatch` 在 `syncHudFromState` 前後真的會碰到的那幾格，⛔ 不多不少。 */
function patchHost(): Record<string, unknown> {
  return {
    disposed: false,
    applyArena: () => {},
    warmGroundForNextRound: () => {},
    connStats: { noteSnapshot: () => {}, noteAck: () => {} },
    timeSync: { noteServerTick: () => {} },
    teamBySeat: new Map<number, number>(),
    // GH#737/#743 —— 這個夾具是**手寫的 `this`**，所以每加一個 GameApp 欄位都要補一格。
    statusVoice: { tickSeats: () => 0 },
    conn: { accountId: "lane-lag" },
    refreshVisibleZones: () => {},
    visibleZones: { has: () => true },
    interp: { push: () => {}, prune: () => {} },
    interpSeen: new Set<number>(),
  };
}

beforeEach(() => resetHudStore());

describe("view-gated entities 缺席時客戶端仍然活著 (GH#760)", () => {
  it("★ 選人畫面的快照（entities 未上線）必須餵到 HUD，⛔ 不是被閘丟掉", () => {
    const proto = GameApp.prototype as unknown as { onStatePatch: (s: MatchState) => void };
    expect(hudStore.getState().connected, "前置條件壞了：一開始就已經 connected").toBe(false);

    proto.onStatePatch.call(patchHost(), champSelectSnapshot());

    expect(
      hudStore.getState().connected,
      "entities 沒上線的快照被整份丟掉 ⇒ HUD 永遠停在「Connecting to match…」",
    ).toBe(true);
  });

  it("★ 兩個方向都要對：缺席回空集合、在的時候回**原本那一份**", () => {
    const absent = champSelectSnapshot();
    expect(entitiesDelivered(absent), "缺席卻被當成已上線").toBe(false);
    expect(entitiesOf(absent).size, "缺席時應該是一個空集合").toBe(0);
    expect(() => entitiesOf(absent).forEach(() => {}), "缺席時走訪不可以擲例外").not.toThrow();

    // ⛔ 只驗「缺席那一邊」抓不到一把「永遠回空集合」的壞尺（CLAUDE.md：
    //    一把只驗過單邊的尺不算自證過）。
    const present = new MatchState();
    expect(entitiesDelivered(present), "在的時候卻被當成缺席").toBe(true);
    expect(entitiesOf(present), "在的時候必須回**原本那一份**，⛔ 不是替身").toBe(present.entities);
  });
});
