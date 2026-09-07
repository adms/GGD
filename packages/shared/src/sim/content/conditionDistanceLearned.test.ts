/**
 * GH#1020 —— 兩顆新條件葉，**兩個方向一起讀**（CLAUDE.md「一把只驗過單邊的尺不算自證過」）：
 *
 *   · `distance`：施法者↔目標的距離 op 門檻（小傑猜猜拳的近／中／遠三變體）
 *   · `learned`：主體某一格階級 ≥ 1（原作 `udg_EX_Mode` 那 52 處分支的翻譯）
 *
 * 跑的是**出貨的求值器**（`evaluateCondition`）與**出貨的 Zod**（`zEffectCondition`），
 * ⛔ 不是掃字串。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "./skeleton";
import { spawnChampion } from "../spawnChampion";
import { evaluateCondition, type EffectCondition } from "./condition";
import { zEffectCondition } from "../../content/schema/condition";
import { asSeatId, asTeamId, type EntityId } from "../../ids";

beforeAll(() => registerSkeletonContent());
const C = SKELETON_ARENA.zones[0]!.center;

function stage(dx: number): { world: SimWorld; hero: EntityId; other: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 1020);
  const mk = (x: number, seat: number, team: number): EntityId =>
    spawnChampion(world, {
      championId: SELA.id,
      seatId: asSeatId(seat),
      teamId: asTeamId(team),
      pos: { x: C.x + x, z: C.z },
      zone: 0,
    });
  const hero = mk(0, 0, 0);
  const other = mk(dx, 1, 1);
  world.step(new Map());
  return { world, hero, other };
}

describe("GH#1020 distance 葉 —— 施法者↔目標的距離門檻", () => {
  const near: EffectCondition = { kind: "distance", op: "<=", value: 4.58 };
  it("① 近的成立、遠的不成立；② 沒有目標一律不成立（⛔ 不是距離 0）", () => {
    const a = stage(3);
    expect(evaluateCondition(a.world, near, { self: a.hero, target: a.other })).toBe(true);
    const b = stage(7);
    expect(evaluateCondition(b.world, near, { self: b.hero, target: b.other })).toBe(false);
    expect(
      evaluateCondition(b.world, near, { self: b.hero }),
      "沒有目標時「距離 ≤ 4.58」若成立，自身效果會去擊飛一個不存在的人",
    ).toBe(false);
    // 反方向的運算子也要動：同一對身體、`>` 的答案要跟 `<=` 相反。
    const far: EffectCondition = { kind: "distance", op: ">", value: 4.58 };
    expect(evaluateCondition(b.world, far, { self: b.hero, target: b.other })).toBe(true);
    expect(evaluateCondition(a.world, far, { self: a.hero, target: a.other })).toBe(false);
  });
});

describe("GH#1020 learned 葉 —— 某一格階級 ≥ 1（EX = 原作 EX_Mode）", () => {
  const exLearned: EffectCondition = { kind: "learned", subject: "self", slot: "EX" };
  const wLearned: EffectCondition = { kind: "learned", subject: "self", slot: "W" };
  it("① 未學不成立 → 學了成立（W 與 EX 各走自己的欄位）", () => {
    const { world, hero } = stage(3);
    const ab = world.abilities.get(hero)!;
    ab.slots.W.rank = 0;
    expect(evaluateCondition(world, wLearned, { self: hero })).toBe(false);
    ab.slots.W.rank = 1;
    expect(evaluateCondition(world, wLearned, { self: hero })).toBe(true);
    // 骨架英雄沒有 EX 技 ⇒ exSlot 是 null ⇒ 「沒有」與「沒學」同一個答案
    ab.exSlot = null;
    expect(evaluateCondition(world, exLearned, { self: hero })).toBe(false);
    ab.exSlot = { abilityId: SELA.abilities.Q.id, rank: 0, cooldownRemainingTicks: 0 };
    expect(evaluateCondition(world, exLearned, { self: hero }), "解鎖前 rank 0 ⇒ 不成立").toBe(false);
    ab.exSlot.rank = 1;
    expect(evaluateCondition(world, exLearned, { self: hero }), "unlockEx 撥成 1 ⇒ 成立").toBe(true);
  });
});

describe("GH#1020 兩顆葉子的 Zod（出貨的 zEffectCondition）", () => {
  it("收合法的；拒絕沒換算的 WC3 原始值與不存在的槽位", () => {
    expect(zEffectCondition.safeParse({ kind: "distance", op: "<=", value: 4.58 }).success).toBe(true);
    expect(zEffectCondition.safeParse({ kind: "learned", subject: "self", slot: "EX" }).success).toBe(true);
    expect(
      zEffectCondition.safeParse({ kind: "distance", op: "<=", value: 250 }).success,
      "250 是 WC3 原始值（沒 ×11/600），要在載入時當場紅",
    ).toBe(false);
    expect(zEffectCondition.safeParse({ kind: "distance", subject: "self", op: "<=", value: 4 }).success, "距離沒有 subject（strict）").toBe(false);
    expect(zEffectCondition.safeParse({ kind: "learned", subject: "self", slot: "X" }).success).toBe(false);
  });
});
