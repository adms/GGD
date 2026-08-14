/**
 * ⭐【玩家站著就把門撐開】—— GH#324 玩家觸發 gate 的守衛。
 *
 * ⛔ **為什麼不是「按一下切換」**：切換是**有記憶**的狀態，必須複寫 ——
 * 而 `MatchState` 的 `defineTypes` 是 **append-only**（加錯回不去），
 * `ENTITY_FLAG` 的 16 顆 bit 也**已經用光**（`ENTITY_FLAG_FREE_BITS` 是空陣列，
 * 而重用看起來閒置的 bit 會讓線上舊客戶端**靜默 desync**）。
 *
 * ⭐ 「站著才有效」是**當下位置的純函式** ⇒ 伺服器與客戶端各自從已經拿到的快照
 * 算出同一個答案，**wire 成本 0、沒有 desync 通道**。而且它本身是更好的機制：
 * 要**留人守著**，而不是按一下就走。
 *
 * ⚠️ 兩個方向一起讀：沒人站的時候門要**照排程**，否則這條對「玩家覆寫永遠贏」
 * 與「玩家覆寫從來沒生效」兩種實作都會過。
 */
import { describe, it, expect } from "vitest";
import { activeObstacles, heldGates, type GateSchedule } from "./gates";
import type { GateHold, Obstacle } from "../world/ArenaDef";

const DOOR: Obstacle = { kind: "box", center: { x: 0, z: 0 }, halfW: 1, halfD: 1, gateGroup: "d" };
const PLAIN: Obstacle = { kind: "box", center: { x: 9, z: 9 }, halfW: 1, halfD: 1 };
const HOLD: GateHold = { at: { x: 5, z: 0 }, radius: 2, gateGroup: "d", mode: "open" };
// 排程：組態 0 把 "d" 關上（所以預設是擋路的）
const SCHED: GateSchedule = {
  kind: "periodic",
  periodTicks: 100,
  telegraphTicks: 10,
  configurations: [["d"], []],
};

describe("玩家站著撐開的門（GH#324）", () => {
  it("⭐ 沒人站 → 門照排程關著（擋路）", () => {
    const held = heldGates([HOLD], []);
    const live = activeObstacles([DOOR, PLAIN], SCHED, 0, held);
    expect(live).toHaveLength(2);
  });

  it("⭐ 有人站在觸發半徑內 → 門開了（不擋路）", () => {
    const held = heldGates([HOLD], [{ x: 5.5, z: 0 }]);
    const live = activeObstacles([DOOR, PLAIN], SCHED, 0, held);
    expect(live).toHaveLength(1);
    expect(live[0]).toBe(PLAIN);
  });

  it("⛔ 站在半徑外沒有用 —— 證明上一條不是「有 hold 就開」", () => {
    const held = heldGates([HOLD], [{ x: 20, z: 0 }]);
    expect(activeObstacles([DOOR, PLAIN], SCHED, 0, held)).toHaveLength(2);
  });

  it("⛔ 沒有 gateGroup 的障礙物永遠擋路 —— 既有場地的行為不可以被改到", () => {
    const held = heldGates([HOLD], [{ x: 5, z: 0 }]);
    expect(activeObstacles([PLAIN], SCHED, 0, held)).toEqual([PLAIN]);
  });

  it("⭐ 玩家的覆寫**贏過**排程 —— 站著卻看到門關上比沒有這個機制更糟", () => {
    // tick 0 的組態是 ["d"]（關），但有人站著 ⇒ 開
    const held = heldGates([HOLD], [{ x: 5, z: 0 }]);
    expect(activeObstacles([DOOR], SCHED, 0, held)).toHaveLength(0);
  });
});
