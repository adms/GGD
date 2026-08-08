/**
 * 狀態的**層數**（GH#301-5，owner 2026-08-09：「狀態除了有無也會是數字層數」）。
 *
 * ⭐ 承重的那一條是 ③：**沒寫 `stacks` 的卡重複施加不會偷偷累加**。
 * 出貨的 28 份狀態沒有一份寫了這一格，所以少了那道閘，每一次續期的【暈眩】
 * 【減速】都會默默變成 2 層、3 層 —— 畫面上完全看不出來，而任何一顆問層數的
 * 條件葉從此對它們全部說謊（失敗形態 ②）。
 *
 * ⛔ 全部走**出貨的** `applyStatus` 與**出貨的** `statusStacks`，沒有任何一條手寫
 * 進 `StatusComp.effects`（失敗形態 ⑤：手寫的版本繞過了正在被守的那條路）。
 * ⛔ 沒有出貨數值住在這裡：上界從 `sim/markLimits.ts` 推導，不抄 999。
 *
 * ── 突變紀錄（實跑）────────────────────────────────────────────────────────
 * M1 `effects/applyStatus.ts` 的續期分支把 `if (e.stacks !== undefined)` 拿掉
 *    （改成無條件 `existing.stacks = clampMarkCount((existing.stacks ?? 1) + 1)`）
 *    → ③「沒寫就不累加」FAIL（期望 1 得到 2）；①②④ 仍綠。
 * M2 新建分支把 `stacks: …` 那一行刪掉
 *    → ①④ FAIL（層數整個消失）。②仍綠 —— 它問的是上界，而上界在續期那一支
 *      也夾了一次，所以它一個人證明不了「寫得下去」。
 * 兩個改回來 → 4/4 綠。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { runEffects } from "./effectRunner";
import { statusStacks } from "./effectCommon";
import { MARK_MAX_COUNT } from "../markLimits";
import { asSeatId, asTeamId, type EntityId, type StatusId } from "../../ids";

const TAG = "status-stacks";
const MARK = "test-layered" as StatusId;

beforeAll(() => registerSkeletonContent());

function hero(): { world: SimWorld; who: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 3);
  world.combatActive = true;
  const c = SKELETON_ARENA.zones[0]!.center;
  const who = spawnChampion(world, {
    championId: SELA.id,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x, z: c.z },
    zone: 0,
  });
  return { world, who };
}

/** 走出貨的 `applyStatus`。`stacks` 省略 = 作者沒寫這一格。 */
function apply(world: SimWorld, who: EntityId, origin: string, stacks?: number): void {
  runEffects([{ kind: "applyStatus", statusId: MARK, duration: 10, ...(stacks !== undefined ? { stacks } : {}) }], {
    world,
    caster: who,
    rank: 1,
    targets: [who],
    origin,
    rng: world.rng,
  });
}

describe("狀態層數 (status-stacks)", () => {
  it("★ ① 同一個來源重複施加會累加", () => {
    cover(TAG);
    const { world, who } = hero();
    apply(world, who, "a", 3);
    expect(statusStacks(world, who, MARK)).toBe(3);
    apply(world, who, "a", 3);
    expect(statusStacks(world, who, MARK)).toBe(6);
  });

  it("★ ② 累加有上界，而且是 markLimits 的那一個（不是第二份表）", () => {
    cover(TAG);
    const { world, who } = hero();
    apply(world, who, "a", MARK_MAX_COUNT);
    apply(world, who, "a", MARK_MAX_COUNT);
    expect(statusStacks(world, who, MARK)).toBe(MARK_MAX_COUNT);
  });

  it("★ ③ 作者沒寫 stacks 的卡重複施加**不會**偷偷變 2 層（相容性）", () => {
    cover(TAG);
    const { world, who } = hero();
    apply(world, who, "a");
    apply(world, who, "a");
    // 缺席讀成 1 —— 「他身上有這個狀態」就是一層，續期只是續期。
    expect(statusStacks(world, who, MARK)).toBe(1);
  });

  it("★ ④ 不同來源各算各的，總層數相加；到期後歸零", () => {
    cover(TAG);
    const { world, who } = hero();
    apply(world, who, "a", 2);
    apply(world, who, "b", 2);
    expect(statusStacks(world, who, MARK)).toBe(4);
    world.tick += Math.round(10 / world.dt) + 1;
    expect(statusStacks(world, who, MARK), "層數沒有跟著狀態一起到期").toBe(0);
  });
});
