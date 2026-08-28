/**
 * `blink.distanceUnits` — **固定距離**瞬移（GH#838 N-新）。
 *
 * ---------------------------------------------------------------------------
 * ⭐ 承重的斷言是「**點得近也照樣飛滿**」
 * ---------------------------------------------------------------------------
 * ⛔ **不是**「有飛出去」——「飛到你點的地方」（`to:"point"` 的舊行為）對一個
 * 遠處的目標**也是綠的**，那正是失敗形態④（斷言方向跟缺陷無關）。
 * JASS 是 `PolarProjectionBJ(origin, **550**, angleTo(aim))`（08-04 阿邦快速劍X
 * j:28898，ubertip 逐字「距離550」）—— 貼身施放時原作**穿到背後**，而
 * `to:"point"` 會**原地不動**。所以這裡的夾具刻意把施法點放在**很近**的地方。
 *
 * ---------------------------------------------------------------------------
 * 突變紀錄（都真的做過）
 * ---------------------------------------------------------------------------
 *   · `effects/blink.ts` 的 `if (fixed > 0)` 整段拿掉  → 紅（落點 2.0，⛔ 不是 10.08）
 *   · `fixed` 改成 `dest` 的長度（＝退回 to:"point"）  → 紅（同上）
 *   · schema 的互斥 refine 拿掉                          → 「互斥」那條紅
 */
import { describe, it, expect } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { runEffects } from "./effectRunner";
import type { EffectContext, EffectDef } from "./effect";
import { asSeatId, asTeamId, type EntityId } from "../../ids";
import * as V from "../math/vec2";
import { validateDoc } from "../../content/loader";

const C = SKELETON_ARENA.zones[0]!.center;

function rig(): { world: SimWorld; caster: EntityId } {
  const world = new SimWorld(SKELETON_ARENA, 77);
  const id = world.spawn();
  world.transform.set(id, {
    pos: { x: C.x, z: C.z },
    vel: { x: 0, z: 0 },
    facing: { x: 1, z: 0 },
    radius: 0.1,
    zone: 0,
  });
  world.health.set(id, { hp: 500, maxHp: 500, mana: 0, maxMana: 0, alive: true, shields: [] });
  world.team.set(id, { teamId: asTeamId(0), seatId: asSeatId(0) });
  world.nav.set(id, {
    order: null,
    moveTarget: null,
    override: null,
    attackTarget: null,
    attackTargetAuto: false,
  });
  world.status.set(id, { effects: [] });
  world.rebuildGrid();
  return { world, caster: id };
}

/** 施法點只在前方 **2.0** —— 舊行為會落在那裡，原作會飛滿 10.08。 */
const NEAR_POINT = { x: C.x + 2, z: C.z };

function ctxOf(r: { world: SimWorld; caster: EntityId }): EffectContext {
  return {
    world: r.world,
    caster: r.caster,
    rank: 1,
    targets: [],
    point: NEAR_POINT,
    origin: "ability:test.blinkFixed",
    rng: r.world.rng,
  };
}

describe("blink.distanceUnits — 點得近也照樣飛滿（GH#838）", () => {
  it("⭐ 施法點在 2.0，落點仍是 10.08（⛔ 不是 2.0）", () => {
    const r = rig();
    const before = { ...r.world.transform.get(r.caster)!.pos };
    runEffects(
      [
        {
          kind: "blink",
          shape: "single",
          to: "point",
          applyTo: "self",
          distanceUnits: 10.08,
        } as EffectDef,
      ],
      ctxOf(r),
    );
    const after = r.world.transform.get(r.caster)!.pos;
    // ⛔ 這一行如果寫成 `toBeGreaterThan(2)` 就白寫了：舊行為正好是 2。
    expect(V.dist(after, before)).toBeCloseTo(10.08, 2);
    // 方向仍然是「朝施法點」，⛔ 不是某個預設方向。
    expect(after.z).toBeCloseTo(before.z, 3);
    expect(after.x).toBeGreaterThan(before.x);
  });

  it("目的地就在腳下 ⇒ 不動（⛔ 不朝任意方向飛出去）", () => {
    const r = rig();
    const before = { ...r.world.transform.get(r.caster)!.pos };
    const ctx = { ...ctxOf(r), point: { x: before.x, z: before.z } };
    runEffects(
      [{ kind: "blink", shape: "single", to: "point", distanceUnits: 10.08 } as EffectDef],
      ctx,
    );
    expect(V.dist(r.world.transform.get(r.caster)!.pos, before)).toBeCloseTo(0, 3);
  });

  it("與 `stopShortUnits` 互斥 —— 兩格都填要被 schema 擋下", () => {
    const doc = {
      id: "test-blink-both",
      schema: "ability@1",
      name: "互斥探針",
      effects: [
        { kind: "blink", shape: "single", to: "point", distanceUnits: 5, stopShortUnits: 1 },
      ],
    };
    const res = validateDoc("abilities", doc);
    expect(res.ok).toBe(false);
  });
});
