/**
 * ⭐【躲在牆後的敵人不畫，隊友與自己永遠畫】—— GH#324 視野遮蔽的守衛。
 *
 * ⚠️ **這是純視覺的遮蔽，⛔ 不是權威視野。** 伺服器照樣把每個人的位置送給每個人
 * （快照是一份共用 state；per-client 過濾要 `@filter`／StateView，那會讓編碼從
 * O(1) 變成 O(玩家數)，而那條路的成本在 `docs/_新場地計畫.md` 7.6 記著）。
 * ⇒ 一個改過的客戶端仍然看得到。這個部署是 friends-only 的私人站，那個取捨划算，
 * ⛔ 但不可以對外說成「有視野系統」。
 *
 * ⚠️ 兩個方向一起讀（失敗形態④）：只驗「敵人被遮住」的話，一個把**所有人**都
 * 遮掉的實作也會過。
 */
import { describe, it, expect } from "vitest";
import { hasLineOfSight } from "@ggd/shared/sim/map/lineOfSight";
import type { Obstacle } from "@ggd/shared/sim/world/ArenaDef";

const WALL: Obstacle = { kind: "box", center: { x: 0, z: 0 }, halfW: 6, halfD: 0.5 };
const ME = { x: 0, z: -4 };

/** 遮蔽判斷的純函式版本 —— 與 `GameApp.occludeArgs` 的 `blocked` 同一條規則。 */
const occluded = (p: { x: number; z: number }, friendly: boolean, isLocal: boolean): boolean =>
  !friendly && !isLocal && !hasLineOfSight(ME, p, [WALL]);

describe("視野遮蔽（GH#324）", () => {
  it("⭐ 牆後的**敵人**被遮住", () => {
    expect(occluded({ x: 0, z: 4 }, false, false)).toBe(true);
  });

  it("⭐ 同一個位置的**隊友**照樣看得見 —— 隊伍視野", () => {
    expect(occluded({ x: 0, z: 4 }, true, false)).toBe(false);
  });

  it("⭐ 自己永遠看得見", () => {
    expect(occluded({ x: 0, z: 4 }, false, true)).toBe(false);
  });

  it("⛔ 沒有牆擋住的敵人不會被遮 —— 證明上面那條不是「一律遮敵人」", () => {
    // 牆的兩端之外，連線不穿牆
    expect(occluded({ x: 10, z: -4 }, false, false)).toBe(false);
  });
});
