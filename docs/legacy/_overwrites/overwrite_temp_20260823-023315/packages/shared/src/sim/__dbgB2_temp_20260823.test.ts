import { describe, it, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "/Users/Takuro/GGD/packages/shared/src/content/loader";
import { FsContentSource } from "/Users/Takuro/GGD/packages/shared/src/content/node/FsContentSource";
import { registerAll, Arenas, Configs, Models, StatusEffects, VfxDefs } from "/Users/Takuro/GGD/packages/shared/src/content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "/Users/Takuro/GGD/packages/shared/src/sim/content/registry";
import { SimWorld } from "/Users/Takuro/GGD/packages/shared/src/sim/SimWorld";
import { SKELETON_ARENA } from "/Users/Takuro/GGD/packages/shared/src/sim/world/ArenaDef";
import { spawnChampion } from "/Users/Takuro/GGD/packages/shared/src/sim/spawnChampion";
import { isBerserk } from "/Users/Takuro/GGD/packages/shared/src/sim/berserk";
import { statCapsFromDoc } from "/Users/Takuro/GGD/packages/shared/src/sim/statCaps";
import { asSeatId, asTeamId } from "/Users/Takuro/GGD/packages/shared/src/ids";

const CONTENT_DIR = "/Users/Takuro/GGD/content";
const Z0 = SKELETON_ARENA.zones[0]!;
const EVA = "godie-e00r" as never;
beforeAll(async () => {
  const r = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  registerAll(r.store);
});
describe("dbg", () => {
  it("dbg", () => {
    const world = new SimWorld(SKELETON_ARENA, 4242);
    world.combatActive = true;
    world.statCaps = statCapsFromDoc(Configs.tryGet("stat-caps"));
    const seat = asSeatId(0);
    const id = spawnChampion(world, { championId: EVA, seatId: seat, teamId: asTeamId(0), pos: { x: Z0.center.x, z: Z0.center.z }, zone: 0 });
    const foe = spawnChampion(world, { championId: EVA, seatId: asSeatId(1), teamId: asTeamId(1), pos: { x: Z0.center.x - 2.5, z: Z0.center.z - 2.5 }, zone: 0 });
    const WP = { x: Z0.center.x + 6, z: Z0.center.z + 6 };
    const frame = { order: { kind: "move" as const, point: WP }, commands: [] };
    world.step(new Map([[seat, frame]]));
    const hp = world.health.get(id)!; hp.hp = hp.maxHp * 0.09;
    world.damageQueue.push({ source: id, target: id, amount: 0.0001, type: "true", crit: false, origin: "t" } as never);
    world.step(new Map()); world.step(new Map());
    console.log("berserk?", isBerserk(world, id));
    for (let i = 0; i < 30; i++) {
      world.step(new Map([[seat, frame]]));
      if (i % 6 === 0) {
        const n = world.nav.get(id)!;
        console.log(i, "pos", JSON.stringify(world.transform.get(id)!.pos), "order", JSON.stringify(n.order), "mt", JSON.stringify(n.moveTarget), "at", n.attackTarget, "auto", (n as never as {attackTargetAuto:boolean}).attackTargetAuto);
      }
    }
    console.log("foe pos", JSON.stringify(world.transform.get(foe)!.pos));
  });
});
