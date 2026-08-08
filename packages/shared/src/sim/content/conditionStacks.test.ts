/**
 * ⭐ **跨路整合**：層數（D，GH#301-5）× 效果條件（A，GH#300）× 觸發事件（B）。
 *
 * 三條路各自都綠，而它們接起來有兩個洞只有在這裡看得見：
 *   ① D 把層數**寫得進去**，A 卻**問不出來** → `stacks` 是只寫不讀（失敗形態②）。
 *      修法是 status 葉子多一格 `minStacks`，走**同一個** `evaluateCondition`。
 *   ② B 的【狀態被套用時】原本只在 `!existing` 發 → 疊到第 2 層沒有任何時刻，
 *      「疊到 N 層引爆」寫不出來。裁決：**新掛上 ∪ 層數真的長高**才發。
 *
 * ⛔ 全部走出貨的路（`runEffects` → `applyEffect` → `evaluateCondition`），
 * 沒有一條手寫進 `StatusComp` 或直接呼叫求值器（失敗形態⑤）。
 *
 * ── 突變紀錄（實跑，改壞→紅→還原→綠）──────────────────────────────────────
 * M1 `sim/content/condition.ts` 的 `minStacks` 分支拿掉（永遠走 `hasStatus`）
 *    → ①「不足不執行」FAIL（1 層也通過了）；②③ 仍綠。
 * M2 `content/schema/condition.ts` 的 `minStacks` 那一格拿掉
 *    → ① FAIL（`.strict()` 直接拒絕整棵條件樹）；②③ 仍綠 —— ② 本來就不帶這一格，
 *      這正是「缺席那條路沒被動到」的證據。
 * M3 `effects/applyStatus.ts` 的 `|| stacksGrew` 拿掉
 *    → ③「疊層算一次套用」FAIL（只收到 1 則）；①② 仍綠。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { runEffects } from "../effects/effectRunner";
import { zEffectCondition } from "../../content/schema/condition";
import type { EffectCondition } from "./condition";
import { asSeatId, asTeamId, type ChampionId, type EntityId, type StatusId } from "../../ids";

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;
const [SUNDER, BRAND] = ["sunder", "brand"] as [StatusId, StatusId];

/** 施法者 + 一個敵人。`sunder` 疊層由出貨的 `applyStatus.stacks` 寫。 */
function rig() {
  const world = new SimWorld(SKELETON_ARENA, 11);
  const at = (seat: number, dx: number): EntityId =>
    spawnChampion(world, { zone: 0, championId: SELA.id as ChampionId, seatId: asSeatId(seat),
      teamId: asTeamId(seat === 0 ? 0 : 1), pos: { x: C.x + dx, z: C.z } });
  const [hero, foe] = [at(0, 0), at(1, 2)] as [EntityId, EntityId];
  const ctx = { world, caster: hero, rank: 1, targets: [foe], origin: "probe", rng: world.rng };
  /** 疊 n 層【破甲】到敵人身上（走出貨的 applyStatus）。 */
  const stack = (n: number): void => runEffects([{ kind: "applyStatus", statusId: SUNDER, duration: 9, stacks: n }], ctx);
  /** 帶條件蓋一個印記；回傳「有沒有蓋上」。 */
  const branded = (condition?: EffectCondition): boolean => {
    runEffects([{ kind: "applyStatus", statusId: BRAND, duration: 5, ...(condition !== undefined ? { condition } : {}) }], ctx);
    const on = (world.status.get(foe)?.effects ?? []).some((e) => e.statusId === BRAND);
    world.status.get(foe)!.effects = world.status.get(foe)!.effects.filter((e) => e.statusId !== BRAND);
    return on;
  };
  const applied = (): number => world.events.filter((e) => e.type === "statusApplied" && e.data.statusId === SUNDER).length;
  return { world, stack, branded, applied };
}

/** ⛔ 一定要過出貨的 Zod：型別上寫得出來、schema 收不下的條件是假綠。 */
const gate = (minStacks?: number): EffectCondition =>
  zEffectCondition.parse({ kind: "status", subject: "target", statusId: SUNDER,
    ...(minStacks !== undefined ? { minStacks } : {}) }) as EffectCondition;

describe("層數 × 條件 × 事件（跨路整合）", () => {
  it("★ ① minStacks 兩個方向：夠了才執行，不夠不執行", () => {
    const r = rig();
    r.stack(2);
    expect(r.branded(gate(2)), "2 層應該通過 minStacks:2").toBe(true);
    expect(r.branded(gate(3)), "2 層不該通過 minStacks:3").toBe(false);
  });

  it("★ ② 沒寫 minStacks 的條件一格不變 —— 出貨那 2,030 份文件走的就是這條", () => {
    const r = rig();
    expect(r.branded(gate()), "還沒掛上狀態就不該通過").toBe(false);
    r.stack(1);
    expect(r.branded(gate()), "掛上了就通過，跟層數無關").toBe(true);
  });

  it("★ ③ 疊上第 2 層算一次「狀態被套用」，但純續期不算", () => {
    const r = rig();
    r.stack(1);
    expect(r.applied()).toBe(1);
    r.stack(1); // 層數 1→2：算
    expect(r.applied()).toBe(2);
    r.branded(); // 別的狀態，不該污染計數
    expect(r.applied()).toBe(2);
  });
});
