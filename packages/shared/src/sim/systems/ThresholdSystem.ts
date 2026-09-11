/**
 * 【邊界陣】（GH#1197 瑟雷西 R）—— 每 tick 問「哪個敵人的位移線段穿過了哪一段還活著的邊」。
 *
 *   · 穿越 = 上一 tick 位置 → 本 tick 位置的線段，與邊 a→b **真相交**（兩兩跨越，⛔ 端點擦邊不算）
 *   · 一段只觸發一次（`alive:false` 即消失）；同一人穿不同段各觸發一次；⛔ 不會無限重複命中
 *   · 到期／全部段消失／該區已結算 ⇒ 整組退場（`thresholdEnd`）
 * ⛔ 零 Math.random／Date／三角函式：頂點表 `POLYGON_UNIT` 是常數（sim purity）。
 * 排在 movementSystem(5) 之後：讀的是本 tick 移動完的位置。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import type { Vec2 } from "../math/vec2";
import { runEffects } from "../effects/effectRunner";
import { fireHooks } from "../effects/hooks";
import { recordAbilityHit } from "../stats/matchStats";
export type { ThresholdSegment } from "../components";

/** 正多邊形單位頂點（逆時針，第一個在 +x）。⛔ 不在執行期算 cos/sin。 */
export const POLYGON_UNIT: Readonly<Record<3 | 4 | 5 | 6 | 8, readonly (readonly [number, number])[]>> = {
  3: [[1, 0], [-0.5, 0.866025], [-0.5, -0.866025]],
  4: [[1, 0], [0, 1], [-1, 0], [0, -1]],
  5: [[1, 0], [0.309017, 0.951057], [-0.809017, 0.587785], [-0.809017, -0.587785], [0.309017, -0.951057]],
  6: [[1, 0], [0.5, 0.866025], [-0.5, 0.866025], [-1, 0], [-0.5, -0.866025], [0.5, -0.866025]],
  8: [[1, 0], [0.707107, 0.707107], [0, 1], [-0.707107, 0.707107], [-1, 0], [-0.707107, -0.707107], [0, -1], [0.707107, -0.707107]],
};

const orient = (a: Vec2, b: Vec2, c: Vec2): number => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
/** 線段 p→q 與 a→b 真相交（共線／端點相觸不算）。 */
export function segmentsCross(p: Vec2, q: Vec2, a: Vec2, b: Vec2): boolean {
  const d1 = orient(a, b, p);
  const d2 = orient(a, b, q);
  const d3 = orient(p, q, a);
  const d4 = orient(p, q, b);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function thresholdSystem(world: SimWorld): void {
  if (world.threshold.size === 0) return;
  const ended: EntityId[] = [];
  const ids = [...world.threshold.keys()].sort((a, b) => a - b);
  for (const id of ids) {
    const th = world.threshold.get(id);
    if (!th) continue;
    if (world.tick >= th.expiresAtTick || world.settledZones.has(th.zone) || th.segments.every((s) => !s.alive)) {
      ended.push(id);
      continue;
    }
    const ownerTeam = world.team.get(th.ownerId)?.teamId;
    // 候選：中心附近、活著、同區、非己方、不是彈道／自己。用 grid 查一次，⛔ 不掃全世界。
    const near = world.grid.queryCircle(th.center, th.radius + 4).filter((cid) => {
      if (cid === th.ownerId || world.projectile.has(cid)) return false;
      const ct = world.transform.get(cid);
      const chp = world.health.get(cid);
      if (!ct || !chp?.alive || ct.zone !== th.zone) return false;
      const cteam = world.team.get(cid);
      return !(cteam && ownerTeam !== undefined && cteam.teamId === ownerTeam);
    }).sort((a, b) => a - b);
    for (const cid of near) {
      const pos = world.transform.get(cid)!.pos;
      const prev = th.lastPos.get(cid);
      th.lastPos.set(cid, { x: pos.x, z: pos.z });
      if (!prev) continue;
      for (let i = 0; i < th.segments.length; i++) {
        const s = th.segments[i]!;
        if (!s.alive || !segmentsCross(prev, pos, s.a, s.b)) continue;
        s.alive = false;
        world.emit("thresholdBreak", { id, index: i, victim: cid, owner: th.ownerId, origin: th.origin, x: pos.x, z: pos.z });
        if (th.origin.startsWith("ability:")) recordAbilityHit(world, th.ownerId, cid);
        runEffects(th.onCross, {
          castInstance: th.castInstance,
          world,
          caster: th.ownerId,
          rank: th.rank,
          targets: [cid],
          point: { x: pos.x, z: pos.z },
          origin: th.origin,
          abilitySlot: th.abilitySlot,
          rng: world.rng,
        });
        if (th.origin.startsWith("ability:")) fireHooks(world, th.ownerId, "onAbilityHit", cid, th.abilitySlot);
        break; // 一 tick 一段：⛔ 同一次位移不會一口氣穿兩段各打一次
      }
    }
  }
  for (const id of ended) {
    const th = world.threshold.get(id);
    world.emit("thresholdEnd", { id, owner: th?.ownerId, origin: th?.origin });
    world.destroy(id);
  }
}
