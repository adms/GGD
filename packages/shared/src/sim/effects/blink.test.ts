/**
 * `blink` — 真瞬移的行為守衛（GH#301-2，owner 2026-08-09「是真的瞬移，不是平移」）。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 承重的那一條斷言是「**同一個 tick 內位置就變了**」
 * ---------------------------------------------------------------------------
 * ⛔ **不是**「最後有到 B」。那一條對 `leap` 配極短 travelSec 的舊做法**也是綠的**
 * —— 那正是失敗形態 ④（斷言方向跟缺陷無關），而舊做法就是這個 issue 要換掉的
 * 東西。所以下面量的是：`runEffects` 回來的**那一行之後**、任何 `step()` 之前，
 * `world.transform.pos` 已經在 B；而且身體**沒有**進入 `nav.override` 的積分器
 * （進去了就代表它只是換了名字的 `leap`，中間位置會存在）。
 *
 * ---------------------------------------------------------------------------
 * 突變紀錄（都真的做過）
 * ---------------------------------------------------------------------------
 *   · `movement/blink.ts` 的 `t.pos = { … }` 那一行刪掉        → blink-instant 紅
 *   · `teleportBody` 改成走 `startLeap`（平移）                 → blink-instant 紅
 *     （同一 tick 讀到的位置仍是起點）
 *   · `effects/blink.ts` 的 `runEffects(onArrive, …)` 刪掉      → blink-arrive 紅
 *   · `onArrive` 的 `point` 不換成落點（沿用 ctx.point）        → blink-arrive 紅
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../testkit/cover";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { runEffects } from "./effectRunner";
import type { EffectContext, EffectDef } from "./effect";
import { asSeatId, asTeamId, type EntityId } from "../../ids";
import * as V from "../math/vec2";

const C = SKELETON_ARENA.zones[0]!.center;

interface Rig {
  world: SimWorld;
  caster: EntityId;
  target: EntityId;
  /** 站在「施法點前 4」那個落點上的第二個敵人 —— `blink-arrive` 的探針。 */
  near: EntityId;
}

/** 施法者在中心，目標在 +x 8 —— 那條走廊沒有障礙物（同 knockback.test.ts）。 */
function rig(): Rig {
  const world = new SimWorld(SKELETON_ARENA, 77);
  const place = (x: number, seat: number, team: number): EntityId => {
    const id = world.spawn();
    world.transform.set(id, {
      pos: { x, z: C.z },
      vel: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      radius: 0.1,
      zone: 0,
    });
    world.health.set(id, { hp: 500, maxHp: 500, mana: 0, maxMana: 0, alive: true, shields: [] });
    world.team.set(id, { teamId: asTeamId(team), seatId: asSeatId(seat) });
    world.nav.set(id, {
      order: null,
      moveTarget: null,
      override: null,
      attackTarget: null,
      attackTargetAuto: false,
    });
    world.status.set(id, { effects: [] });
    return id;
  };
  const caster = place(C.x, 0, 0);
  const target = place(C.x + 8, 1, 1);
  const near = place(C.x + 4, 2, 1);
  world.rebuildGrid();
  return { world, caster, target, near };
}

function ctxOf(r: Rig): EffectContext {
  return {
    world: r.world,
    caster: r.caster,
    rank: 1,
    targets: [r.target],
    origin: "ability:test.blink",
    rng: r.world.rng,
  };
}

describe("blink — 真瞬移 (blink-instant)", () => {
  it("同一個 tick 內位置就變了，而且沒有經過位移積分器", () => {
    cover("blink-instant");
    const r = rig();
    const before = { ...r.world.transform.get(r.caster)!.pos };
    const tickBefore = r.world.tick;

    runEffects(
      [{ kind: "blink", shape: "single", to: "targetUnit" } as EffectDef],
      ctxOf(r),
    );

    // ⭐ 承重：一格 tick 都還沒跑，人已經在對方身上了。
    expect(r.world.tick).toBe(tickBefore);
    const after = r.world.transform.get(r.caster)!.pos;
    expect(V.dist(after, before)).toBeCloseTo(8, 3);
    expect(after.x).toBeCloseTo(r.world.transform.get(r.target)!.pos.x, 3);
    // ⛔ 沒有 override、沒有 airborne —— 有的話中間位置就會存在（那是 `leap`）。
    expect(r.world.nav.get(r.caster)!.override).toBeNull();
    expect(r.world.airborne.has(r.caster)).toBe(false);
  });

  it("`stopShortUnits` 落在目標前面，而且落點永遠留在決鬥區裡", () => {
    cover("blink-instant");
    const r = rig();
    runEffects(
      [{ kind: "blink", shape: "single", to: "targetUnit", stopShortUnits: 3 } as EffectDef],
      ctxOf(r),
    );
    const after = r.world.transform.get(r.caster)!.pos;
    expect(V.dist(after, r.world.transform.get(r.target)!.pos)).toBeCloseTo(3, 3);
    expect(V.dist(after, C)).toBeLessThan(SKELETON_ARENA.zones[0]!.boundaryRadius);
  });
});

describe("blink — 抵達後才打 (blink-arrive)", () => {
  it("`onArrive` 在**落點**解算，不是在起跳點、也不是在施法點", () => {
    cover("blink-arrive");
    const r = rig();
    // 地面瞬移：施法點在 +8，`stopShortUnits: 4` → 落點在 +4，也就是 `near`
    // 站的地方。`targets` 刻意留空，所以 `damageArea` 的圓心走的是 `ctx.point`
    // 那一條（`areaCentre` 先讀 targets[0]，沒有才讀 point）。
    //
    // ⛔ 三種壞法各自被這一條抓到，而且是三個不同的距離：
    //   · 根本沒跑 `onArrive`            → 0 筆傷害
    //   · 在**起跳點**（+0）解算         → 離 near 4 單位，圓打不到
    //   · 在**施法點**（+8）解算         → 離 near 4 單位，圓打不到
    runEffects(
      [
        {
          kind: "blink",
          shape: "single",
          to: "point",
          stopShortUnits: 4,
          onArrive: [{ kind: "damageArea", radius: 1.5, damageType: "magic", amount: { flat: 40 } }],
        } as EffectDef,
      ],
      { ...ctxOf(r), targets: [], point: { x: C.x + 8, z: C.z } },
    );
    expect(r.world.transform.get(r.caster)!.pos.x).toBeCloseTo(C.x + 4, 3);
    const hit = r.world.damageQueue.filter((p) => p.target === r.near);
    expect(hit).toHaveLength(1);
    expect(hit[0]!.amount).toBe(40);
  });
});
