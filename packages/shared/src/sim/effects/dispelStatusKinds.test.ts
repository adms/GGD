/** GH#1197 蓋倫 Q：`dispel.statusKinds:["slow"]` 只清減速 —— 暈眩留著、帶暈眩的減速也留著（跑出貨 runEffects）。 */
import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { runEffects } from "./effectRunner";
import { asSeatId, asTeamId, type EntityId } from "../../ids";
import type { StatusEffect } from "../components";

beforeAll(() => registerSkeletonContent());
const put = (world: SimWorld, id: EntityId, statusId: string, extra: Partial<StatusEffect>): void => {
  const st = world.status.get(id) ?? { effects: [] };
  st.effects.push({ statusId: statusId as StatusEffect["statusId"], sourceId: `src:${statusId}`, expiresAtTick: world.tick + 300, polarity: "debuff", ...extra });
  world.status.set(id, st);
};
const ids = (world: SimWorld, id: EntityId): string[] => (world.status.get(id)?.effects ?? []).map((e) => String(e.statusId)).sort();

describe("dispel.statusKinds（GH#1197）", () => {
  it("只清減速：純減速走、暈眩留、帶暈眩的減速也留", () => {
    const world = new SimWorld(SKELETON_ARENA, 7);
    const z = SKELETON_ARENA.zones[0]!;
    const hero = spawnChampion(world, { championId: SELA.id, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: z.center.x, z: z.center.z }, zone: 0 });
    put(world, hero, "slow", { moveSpeedMult: 0.7 });
    put(world, hero, "stun", { stun: true });
    put(world, hero, "slow-stun", { moveSpeedMult: 0.5, stun: true });
    runEffects([{ kind: "dispel", shape: "single", pools: { status: true }, polarity: "debuff", statusKinds: ["slow"] }], {
      world, caster: hero, rank: 1, targets: [hero], origin: "test:dispel-kinds", rng: world.rng,
    });
    expect(ids(world, hero)).toEqual(["slow-stun", "stun"]); // ⭐ 承重：沒有 statusKinds 三筆全走
  });
});
