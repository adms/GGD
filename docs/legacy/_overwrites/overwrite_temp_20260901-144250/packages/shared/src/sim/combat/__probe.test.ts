import { describe, it, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { Stat } from "../stats/statTypes";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";
beforeAll(() => registerSkeletonContent());
const ZC = SKELETON_ARENA.zones[0]!.center;
describe("probe", () => { it("types", () => {
  const world = new SimWorld(SKELETON_ARENA, 11); world.combatActive = true;
  const victim: EntityId = spawnChampion(world, { championId: "thorne" as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: ZC.x, z: ZC.z }, zone: 0 });
  const attacker: EntityId = spawnChampion(world, { championId: "sela" as ChampionId, seatId: asSeatId(1), teamId: asTeamId(1), pos: { x: ZC.x + 1.2, z: ZC.z }, zone: 0 });
  world.stats.get(attacker)!.final[Stat.AttackSpeed] = 4;
  const seen = new Map<string, number>();
  let sample = "";
  for (let i = 0; i < 90; i++) {
    for (const id of [victim, attacker]) { const hp = world.health.get(id)!; hp.hp = hp.maxHp; }
    world.step(new Map());
    for (const e of world.events) {
      seen.set(e.type, (seen.get(e.type) ?? 0) + 1);
      if (e.type === "hitImpact" && !sample) sample = JSON.stringify(e.data).slice(0, 400);
    }
  }
  console.log("EVENTS:", [...seen].map(([k,v])=>`${k}=${v}`).join(" "));
  console.log("SAMPLE:", sample);
}); });
