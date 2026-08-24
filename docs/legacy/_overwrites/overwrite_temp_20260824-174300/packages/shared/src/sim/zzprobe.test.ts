import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { castAbility } from "./abilities/abilitySystem";
import { asSeatId, asTeamId, type ChampionId, type SeatId } from "../ids";
import type { IntentFrame } from "./intents";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, "../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;
const NO_INTENTS = (): Map<SeatId, IntentFrame> => new Map();

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT_DIR)).load()).store);
});

describe("probe", () => {
  it("cast R and dump events", () => {
    const world = new SimWorld(SKELETON_ARENA, 4242);
    world.combatActive = true;
    const caster = spawnChampion(world, {
      championId: "godie-udea" as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0),
      pos: { x: C.x, z: C.z }, zone: 0, level: 9,
    });
    for (let i = 0; i < 6; i++) {
      spawnChampion(world, {
        championId: "godie-e001" as ChampionId, seatId: asSeatId(i + 1), teamId: asTeamId(1),
        pos: { x: C.x + 1.5 + i * 1.2, z: C.z + (i % 2 ? 1 : -1) }, zone: 0, level: 9,
      });
    }
    world.rebuildGrid();
    world.abilities.get(caster)!.slots.R.rank = 1;

    const res = castAbility(world, caster, "R", { type: "dir", dir: { x: 1, z: 0 } });
    console.log("CAST RESULT:", res);
    const seen: Record<string, number> = {};
    for (let t = 0; t < 200; t++) {
      world.step(NO_INTENTS());
      for (const ev of world.events) { seen[ev.type] = (seen[ev.type] ?? 0) + 1; if (ev.type === "chainLightning" && (seen.__dumped ?? 0) < 2) { seen.__dumped = (seen.__dumped ?? 0) + 1; console.log("CL PAYLOAD:", JSON.stringify(ev)); } }
    }
    console.log("EVENTS:", JSON.stringify(seen, null, 1));
    expect(res).toBe("ok");
  });
});
