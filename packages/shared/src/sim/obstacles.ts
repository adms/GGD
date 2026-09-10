/**
 * 【暫時障礙】（GH#1190 鄂爾 Q→E）—— 技能生出來、到期／撞碎就消失的**真碰撞**圓柱。
 *
 *   · `obstaclesFor(world, zone, base)`：該區靜態障礙 ＋ 活著的暫時障礙（依 id 排序，決定性）——
 *     MovementSystem（走路／衝刺／擊退）與 `movement/leap.ts`（跳躍落點的牆體 clamp）都改讀這一份，
 *     ⛔ 不改全域 `pillarsBlock`、⛔ 不動任何既有場地的靜態柱。
 *   · `obstacleSystem`：到期清掉（`obstacleEnd`）。
 *   · `shatterObstaclesAt`：衝刺撞停那一 tick，把身體碰到的可碎障礙撞碎（`obstacleShatter`）。
 *
 * ⛔ 零 Math.random／Date／三角（sim purity）。
 * ⭐ 沒有暫時障礙時 `obstaclesFor` **回傳原陣列** ⇒ 既有場地零成本、逐位元不變。
 */
import type { EntityId } from "../ids";
import type { SimWorld } from "./SimWorld";
import type { Obstacle, ZoneDef } from "./world/ArenaDef";
import type { Vec2 } from "./math/vec2";

export function dynamicObstaclesFor(world: SimWorld, zone: number): Obstacle[] {
  if (world.obstacle.size === 0) return [];
  const out: Obstacle[] = [];
  for (const id of [...world.obstacle.keys()].sort((a, b) => a - b)) {
    const o = world.obstacle.get(id);
    if (!o || o.zone !== zone) continue;
    out.push({ kind: "circle", center: { x: o.center.x, z: o.center.z }, radius: o.radius });
  }
  return out;
}

/** 靜態 ＋ 暫時。⭐ 沒有暫時障礙時回傳 `base` 本身（⛔ 不配置新陣列）。 */
export function obstaclesFor(world: SimWorld, zone: number, base: readonly Obstacle[]): readonly Obstacle[] {
  const dyn = dynamicObstaclesFor(world, zone);
  return dyn.length === 0 ? base : [...base, ...dyn];
}

/** 給只收 `ZoneDef` 的 API（wallBlock）：同一個 zone，障礙物換成含暫時障礙的那一份。 */
export function zoneWithObstacles(world: SimWorld, zoneIdx: number, zone: ZoneDef): ZoneDef {
  const dyn = dynamicObstaclesFor(world, zoneIdx);
  return dyn.length === 0 ? zone : { ...zone, obstacles: [...zone.obstacles, ...dyn] };
}

export function obstacleSystem(world: SimWorld): void {
  if (world.obstacle.size === 0) return;
  const ended: EntityId[] = [];
  for (const id of [...world.obstacle.keys()].sort((a, b) => a - b)) {
    const o = world.obstacle.get(id)!;
    // ⭐ 三個結束條件（GH#1190 驗收②「柱到期、施法者死亡、回合重置不殘留」）——
    //   ⛔ 少任何一個都會留下一根沒有主人、走不過去的柱子。
    const ownerGone = world.health.get(o.ownerId)?.alive !== true;
    if (world.tick >= o.expiresAtTick || world.settledZones.has(o.zone) || ownerGone) ended.push(id);
  }
  for (const id of ended) {
    const o = world.obstacle.get(id);
    const reason =
      o === undefined ? "expired" : world.settledZones.has(o.zone) ? "roundReset" : world.tick >= o.expiresAtTick ? "expired" : "ownerDead";
    world.emit("obstacleEnd", { id, owner: o?.ownerId, origin: o?.origin, reason });
    world.destroy(id);
  }
}

/** 身體（pos, radius）碰到的可碎障礙全部撞碎；回傳碎了幾根。 */
export function shatterObstaclesAt(world: SimWorld, zone: number, pos: Vec2, radius: number, by: EntityId): number {
  if (world.obstacle.size === 0) return 0;
  const hit: EntityId[] = [];
  for (const id of [...world.obstacle.keys()].sort((a, b) => a - b)) {
    const o = world.obstacle.get(id)!;
    if (o.zone !== zone || !o.shatterable) continue;
    const dx = o.center.x - pos.x;
    const dz = o.center.z - pos.z;
    // ⭐ 撞停時身體已經被推出到表面外一點點 ⇒ 留一格容差，⛔ 否則永遠碰不到。
    const r = o.radius + radius + 0.35;
    if (dx * dx + dz * dz <= r * r) hit.push(id);
  }
  for (const id of hit) {
    const o = world.obstacle.get(id)!;
    world.emit("obstacleShatter", { id, owner: o.ownerId, by, origin: o.origin, x: o.center.x, z: o.center.z });
    world.destroy(id);
  }
  return hit.length;
}
