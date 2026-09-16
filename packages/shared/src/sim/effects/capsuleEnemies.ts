/**
 * 膠囊（一條有寬度的線段）裡的**合法敵人** —— 一份判準、兩個讀端（第〇·四守則）：
 *   · `damageLine`（面前一條線，施放那一刻結算）
 *   · `dash.onPathHit`（GH#1190 鄂爾 E：衝刺時身體**真的掃過**的那一段，逐 tick 結算，見 `dashOnEnd.ts`）
 *
 * 判準：同區、活著、⛔ 不是自己、⛔ 不是同隊；隱形照 `stealthRules.blocksAbilityAoe`（與 AoE 同一個出貨答案）。
 * 回傳依「離起點的距離²、再比 id」排好的**全序** —— `canCrit` 逐人擲骰，名單順序就是種子流的一部分。
 * ⛔ 零三角函式、零 Map 迭代序（`queryOverlap` 回升冪 id，再排序一次）。
 */
import type { EntityId } from "../../ids";
import type { SimWorld } from "../SimWorld";
import { capsule } from "../collision/shapes";
import { queryOverlap } from "../collision/queries";
import { canSee } from "../stealth";
import { distSq, type Vec2 } from "../math/vec2";

export function enemiesInCapsule(
  world: SimWorld,
  caster: EntityId,
  zone: number,
  start: Vec2,
  end: Vec2,
  halfWidth: number,
  skip: ReadonlySet<EntityId> | null,
): { id: EntityId; d2: number }[] {
  const selfTeam = world.team.get(caster);
  const out: { id: EntityId; d2: number }[] = [];
  for (const id of queryOverlap(world, capsule(start, end, halfWidth), {
    zone,
    exclude: new Set([caster]),
    aliveOnly: true,
  })) {
    if (skip?.has(id)) continue;
    const ht = world.team.get(id);
    if (ht && selfTeam && ht.teamId === selfTeam.teamId) continue;
    if (world.stealthRules.blocksAbilityAoe && !canSee(world, caster, id)) continue;
    const vt = world.transform.get(id);
    if (!vt) continue;
    out.push({ id, d2: distSq(start, vt.pos) });
  }
  out.sort((a, b) => (a.d2 !== b.d2 ? a.d2 - b.d2 : a.id - b.id));
  return out;
}
