import type { EffectKindSpec } from "./effectKind";
import { POLYGON_UNIT, type ThresholdSegment } from "../systems/ThresholdSystem";

/**
 * 【邊界陣】（GH#1197 瑟雷西 R）—— 生一個 threshold 實體（⛔ 沒有 transform／health：它不是單位，
 * 索敵與碰撞都看不到它），每 tick 的穿越判定在 `systems/ThresholdSystem.ts`。
 */
export const spawnThresholdsEffect: EffectKindSpec<"spawnThresholds"> = {
  apply(e, ctx, bakeList) {
    const { world } = ctx;
    const ct = world.transform.get(ctx.caster);
    if (!ct) return;
    const center = ctx.point ?? { x: ct.pos.x, z: ct.pos.z };
    const unit = POLYGON_UNIT[e.sides];
    const verts = unit.map(([ux, uz]) => ({ x: center.x + ux * e.radius, z: center.z + uz * e.radius }));
    const segments: ThresholdSegment[] = verts.map((a, i) => ({ a, b: verts[(i + 1) % verts.length]!, alive: true }));
    const id = world.spawn();
    world.threshold.set(id, {
      castInstance: ctx.castInstance,
      ownerId: ctx.caster,
      zone: ct.zone,
      center: { x: center.x, z: center.z },
      radius: e.radius,
      segments,
      onCross: bakeList(e.onCross, ctx),
      expiresAtTick: world.tick + Math.max(1, Math.round(e.durationSec / world.dt)),
      rank: ctx.rank,
      origin: ctx.origin,
      abilitySlot: ctx.abilitySlot,
      lastPos: new Map(),
    });
    world.emit("thresholdSpawn", {
      id,
      owner: ctx.caster,
      origin: ctx.origin,
      x: center.x,
      z: center.z,
      radius: e.radius,
      segments: segments.map((s) => ({ ax: s.a.x, az: s.a.z, bx: s.b.x, bz: s.b.z })),
      durationSec: e.durationSec,
    });
  },
  bake(e, ctx, bakeList) {
    return { ...e, onCross: bakeList(e.onCross, ctx) };
  },
};
