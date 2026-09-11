import type { EffectKindSpec } from "./effectKind";
import { clampToBoundary, pushOutOfObstacle } from "../collision/resolve";
import { obstaclesFor } from "../obstacles";

/** 【暫時障礙】（GH#1190 鄂爾 Q）—— 生一根到期會消失的碰撞圓柱；碰撞邏輯在 `sim/obstacles.ts`。 */
export const spawnObstacleEffect: EffectKindSpec<"spawnObstacle"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const ct = world.transform.get(ctx.caster);
    if (!ct) return;
    const want =
      e.at === "self" || ctx.point === undefined
        ? { x: ct.pos.x, z: ct.pos.z }
        : { x: ctx.point.x, z: ctx.point.z };
    // ⭐ GH#1190 驗收②「重疊／非法位置不殘留障礙」—— ⛔ 不是「不生」（那會靜默吞掉一次施放），
    //   ⭐ 而是**推到合法位置**：先推出既有的靜態／暫時障礙，再夾回場地邊界。
    //   ⚠️ 重用 `pushOutOfObstacle` / `clampToBoundary`，⛔ 不自己寫第二套碰撞。
    const zone = world.arena.zones[ct.zone] ?? world.arena.zones[0];
    const body = { pos: want, radius: e.radius };
    if (zone !== undefined) {
      for (const ob of obstaclesFor(world, ct.zone, zone.obstacles)) pushOutOfObstacle(body, ob);
      clampToBoundary(body, zone);
    }
    const center = { x: body.pos.x, z: body.pos.z };
    const id = world.spawn();
    world.obstacle.set(id, {
      castInstance: ctx.castInstance,
      ownerId: ctx.caster,
      zone: ct.zone,
      center,
      radius: e.radius,
      expiresAtTick: world.tick + Math.max(1, Math.round(e.durationSec / world.dt)),
      shatterable: e.shatterable ?? true,
      origin: ctx.origin,
    });
    world.emit("obstacleSpawn", {
      id,
      owner: ctx.caster,
      origin: ctx.origin,
      x: center.x,
      z: center.z,
      radius: e.radius,
      durationSec: e.durationSec,
    });
  },
};
