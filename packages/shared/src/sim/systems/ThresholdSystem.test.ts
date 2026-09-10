/** GH#1197 瑟雷西 R 【邊界陣】：穿越才觸發、那一段獨立消失、到期整組清掉（跑出貨 runEffects／movement／ThresholdSystem）。 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { runEffects } from "../effects/effectRunner";
import { asSeatId, asTeamId, type SeatId } from "../../ids";
import type { IntentFrame } from "../intents";
import { segmentsCross } from "./ThresholdSystem";

beforeAll(() => registerSkeletonContent());
const Z0 = SKELETON_ARENA.zones[0]!;
const NO_INTENTS = new Map<SeatId, IntentFrame>();

describe("spawnThresholds（GH#1197）", () => {
  it("segmentsCross：跨越算、擦邊不算", () => {
    expect(segmentsCross({ x: 0, z: -1 }, { x: 0, z: 1 }, { x: -1, z: 0 }, { x: 1, z: 0 })).toBe(true);
    expect(segmentsCross({ x: 2, z: -1 }, { x: 2, z: 1 }, { x: -1, z: 0 }, { x: 1, z: 0 })).toBe(false);
  });

  it("敵人走出邊界 ⇒ 打一次、那一段消失、其餘四段還在；到期整組清掉", () => {
    const world = new SimWorld(SKELETON_ARENA, 5);
    const c = { x: Z0.center.x, z: Z0.center.z };
    const owner = spawnChampion(world, { championId: SELA.id, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: c.x - 12, z: c.z }, zone: 0 });
    const foe = spawnChampion(world, { championId: SELA.id, seatId: asSeatId(1), teamId: asTeamId(1), pos: { x: c.x, z: c.z }, zone: 0 });
    world.step(NO_INTENTS);
    runEffects([{ kind: "spawnThresholds", sides: 5, radius: 3, durationSec: 3, onCross: [{ kind: "damage", damageType: "true", amount: { flat: 40 } }] }], {
      world, caster: owner, rank: 1, targets: [], point: c, origin: "ability:test.box", rng: world.rng,
    });
    const th = [...world.threshold.values()][0]!;
    expect(th.segments.filter((s) => s.alive)).toHaveLength(5);
    const hp0 = world.health.get(foe)!.hp;
    // 敵人往 +x 走出去（第一個頂點在 +x 軸上 ⇒ 會穿過第 0 或第 4 段）
    const out = new Map<SeatId, IntentFrame>([[asSeatId(1), { order: { kind: "move" as const, point: { x: c.x + 9, z: c.z + 0.7 } }, commands: [] }]]);
    for (let i = 0; i < 40; i++) world.step(out);
    expect(world.health.get(foe)!.hp).toBeLessThan(hp0); // ⭐ 承重：沒有穿越判定，站在圈裡走出去什麼都不發生
    expect(th.segments.filter((s) => s.alive)).toHaveLength(4);
    const hp1 = world.health.get(foe)!.hp;
    // 走回來再穿同一段：那一段已經沒了 ⇒ 不再觸發（穿別段才會）
    const back = new Map<SeatId, IntentFrame>([[asSeatId(1), { order: { kind: "move" as const, point: { x: c.x, z: c.z + 0.7 } }, commands: [] }]]);
    for (let i = 0; i < 40; i++) world.step(back);
    expect(world.health.get(foe)!.hp).toBeGreaterThanOrEqual(hp1); // 沒再被打（回血只會往上）
    expect(th.segments.filter((s) => s.alive)).toHaveLength(4);
    // 到期
    while (world.threshold.size > 0 && world.tick < th.expiresAtTick + 2) world.step(NO_INTENTS);
    expect(world.threshold.size).toBe(0);
  });
});
