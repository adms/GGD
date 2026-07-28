import { describe, it, expect, beforeAll } from "vitest";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { registerSkeletonContent } from "./content/skeleton";
import { spawnChampion } from "./spawnChampion";
import { asSeatId, asTeamId, type ChampionId } from "../ids";
import type { IntentFrame } from "./intents";

beforeAll(() => registerSkeletonContent());
const ZONE = SKELETON_ARENA.zones[0]!;
const deg = (v:{x:number;z:number}) => (Math.atan2(v.x, v.z) * 180 / Math.PI).toFixed(1);

function run(aim:{x:number;z:number}, moveDelta:{x:number;z:number}, ticks:number) {
  const w = new SimWorld(SKELETON_ARENA, 11);
  const seat = asSeatId(0);
  const id = spawnChampion(w, { championId: "thorne" as ChampionId, seatId: seat, teamId: asTeamId(1),
    pos: { x: ZONE.center.x, z: ZONE.center.z }, zone: 0 });
  for (let i = 0; i < ticks; i++) {
    const t = w.transform.get(id)!;
    const f: IntentFrame = { commands: [], aim, order: { kind: "move", point: { x: t.pos.x + moveDelta.x, z: t.pos.z + moveDelta.z } } };
    w.step(new Map([[seat, f]]));
  }
  return w.transform.get(id)!.facing;
}

describe("scratch aim vs move (NO facing lock at all)", () => {
  it("cases", () => {
    console.log("aim N(0deg), move E: facing", deg(run({x:0,z:1},{x:5,z:0},30)));
    console.log("aim N(0deg), move S: facing", deg(run({x:0,z:1},{x:0,z:-5},30)));
    console.log("aim N(0deg), move W: facing", deg(run({x:0,z:1},{x:-5,z:0},30)));
    console.log("aim N(0deg), NO move: facing", deg(run({x:0,z:1},{x:0,z:0},30)));
    expect(true).toBe(true);
  });
});
