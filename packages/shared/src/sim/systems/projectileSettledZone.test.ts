/**
 * GH#593 —— `projectileSystem` 是**唯一**漏掉 `settledZones` 閘的系統。
 *
 * 斷言的是 **hp 的方向**，⛔ 不是只有 `projectile.size`：一個「留著但不判定」的
 * 錯誤實作只驗 size 會照樣過（失敗形態⑦，掃屬性代替掃行為）。
 *
 * ⭐ 突變點：把 `ProjectileSystem.ts` 裡的 `settledZones` 那一段拿掉 ⇒ 受害者
 * 的 hp 在結算之後仍然往下掉（量到的紅：1000 → 889）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "./../SimWorld";
import { SKELETON_ARENA } from "./../world/ArenaDef";
import { registerSkeletonContent } from "./../content/skeleton";
import { spawnChampion } from "./../spawnChampion";
import { runEffects } from "./../effects/effectRunner";
import { projectileSystem } from "./ProjectileSystem";
import { combatResolveSystem } from "./../combat/damage";
import { asSeatId, asTeamId, type ChampionId, type ProjectileId } from "../../ids";
import type { EffectDef } from "./../effects/effect";

beforeAll(() => registerSkeletonContent());

/**
 * 出貨的投射體 tick，⛔ 不走 `SimWorld.step`（那會把冠軍 AI 也叫醒，兩邊各自
 * 開打，量到的血就不只是這一顆飛彈的）。命中把封包排進 `world.damageQueue`，
 * 所以要跟著跑出貨的 `combatResolveSystem` 才看得到血。
 */
function step(world: SimWorld, ticks: number): void {
  for (let k = 0; k < ticks; k++) {
    projectileSystem(world);
    combatResolveSystem(world);
  }
}

/** Sela（seat 0/team 0）朝 Thorne（seat 1/team 1）射一顆出貨參數的投射體。 */
function rig(): { world: SimWorld; victimHp: () => number } {
  const world = new SimWorld(SKELETON_ARENA, 4242);
  const c = SKELETON_ARENA.zones[0]!.center;
  const caster = spawnChampion(world, {
    championId: "sela" as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: c.x - 4, z: c.z },
    zone: 0,
  });
  const victim = spawnChampion(world, {
    championId: "thorne" as ChampionId,
    seatId: asSeatId(1),
    teamId: asTeamId(1),
    pos: { x: c.x + 4, z: c.z },
    zone: 0,
  });
  runEffects(
    [
      {
        kind: "spawnProjectile",
        projectileId: "sela.q.bolt" as ProjectileId,
        onHit: [{ kind: "damage", damageType: "true", amount: { flat: 111 } }],
      } as unknown as EffectDef,
    ],
    {
      world,
      caster,
      rank: 1,
      targets: [],
      direction: { x: 1, z: 0 },
      origin: "ability:sela.q",
      rng: world.rng,
    },
  );
  // 直接跑 `projectileSystem`（⛔ 不走 `SimWorld.step`,那會把冠軍 AI 也叫醒）
  // 所以廣相位要自己刷一次 —— 平常是 `step()` 每 tick 幫它做的。
  world.rebuildGrid();
  return { world, victimHp: () => world.health.get(victim)!.hp };
}

describe("投射體 —— 已結算的分區不再判定命中 (GH#593)", () => {
  it("結算之後：飛彈當場消失，而且受害者一滴血都沒掉", () => {
    const { world, victimHp } = rig();
    expect(world.projectile.size).toBe(1);
    const before = victimHp();

    world.settledZones.add(0); // ← `concludeCombat` 對這一區做的事
    step(world, 30);

    expect(world.projectile.size).toBe(0);
    expect(victimHp()).toBe(before); // ⭐ 方向：突變之後這裡會變小
  });

  it("同一顆飛彈在**還沒**結算的分區照樣打得到（⛔ 閘不是把功能關掉）", () => {
    const { world, victimHp } = rig();
    const before = victimHp();
    step(world, 30);
    expect(victimHp()).toBeLessThan(before);
  });
});
