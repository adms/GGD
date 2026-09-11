/**
 * ⭐⭐【技能生的地形**畫得出來**】（GH#1223 柱子 · GH#1209 牆段）
 *
 * ⛔ 在此之前 `grep -rn "obstacleSpawn\|thresholdSpawn" apps/client/src` 回 **0 行** ——
 * ⭐ 而兩族的碰撞都是真的 ⇒ 玩家會**撞到看不見的東西**。
 *
 * ⭐ 這條守衛跑的是**出貨的整條路**（⛔ 不是手搭的 payload —— 失敗形態⑤）：
 *   真的 `runEffects` → 真的 `world.events` → 真的 `VfxSystem.handleEvent`
 *   → 真的 Babylon 網格。
 *
 * ⭐ **兩個方向**：生得出來，而且**退場收得乾淨**（⛔ 不留孤兒網格）。
 */
import { beforeAll, describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { registerSkeletonContent, SELA } from "@ggd/shared/sim/content/skeleton";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { runEffects } from "@ggd/shared/sim/effects/effectRunner";
import { asSeatId, asTeamId, type ChampionId } from "@ggd/shared/ids";
import type { EffectDef } from "@ggd/shared/sim/effects/effect";
import { VfxSystem } from "./VfxSystem";

beforeAll(() => registerSkeletonContent());

const Z = SKELETON_ARENA.zones[0]!;
const NO_INTENTS = new Map();

/** 跑一次效果，把**真的**事件餵給**真的** VfxSystem，回傳它與世界。 */
function rig(effects: EffectDef[]): { vfx: VfxSystem; world: SimWorld; drain: () => void } {
  const scene = new Scene(new NullEngine());
  const world = new SimWorld(SKELETON_ARENA, 4242);
  const caster = spawnChampion(world, {
    championId: SELA.id as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: Z.center.x, z: Z.center.z },
    zone: 0,
  });
  world.step(NO_INTENTS);
  const vfx = new VfxSystem(scene, { entityPos: (): null => null });
  const drain = (): void => {
    for (const ev of world.events) vfx.handleEvent({ type: ev.type, tick: world.tick, data: ev.data }, 0);
  };
  runEffects(effects, {
    world,
    caster,
    rank: 1,
    targets: [],
    point: { x: Z.center.x + 4, z: Z.center.z },
    origin: "ability:test.terrain",
    rng: world.rng,
  } as never);
  drain();
  return { vfx, world, drain };
}

describe("技能生的地形畫得出來（GH#1223／#1209）", () => {
  it("⭐ 柱子：生出來看得到，到期之後**收乾淨**", () => {
    const a = rig([{ kind: "spawnObstacle", radius: 1.5, durationSec: 0.2, at: "point" } as EffectDef]);
    expect(a.vfx.abilityTerrain.liveCount(), "⛔ 柱子沒畫出來 —— 玩家會撞到看不見的東西").toBe(1);

    // ⭐ 反方向：跑到到期，`obstacleEnd` 必須把網格收掉（⛔ 不留孤兒）
    for (let i = 0; i < 20; i++) {
      a.world.step(NO_INTENTS);
      a.drain();
    }
    expect(a.world.obstacle.size, "儀器：sim 那邊真的到期了").toBe(0);
    expect(a.vfx.abilityTerrain.liveCount(), "⛔ 柱子消失了而網格還在（孤兒）").toBe(0);
  });

  it("⭐ 牆段：整組生出來，退場一起收", () => {
    const b = rig([
      { kind: "spawnThresholds", radius: 5, sides: 5, durationSec: 0.2, onCross: [] } as unknown as EffectDef,
    ]);
    expect(b.vfx.abilityTerrain.liveCount(), "⛔ 牆沒畫出來").toBe(1);
    for (let i = 0; i < 20; i++) {
      b.world.step(NO_INTENTS);
      b.drain();
    }
    expect(b.vfx.abilityTerrain.liveCount(), "⛔ 牆到期了而網格還在（孤兒）").toBe(0);
  });
});
