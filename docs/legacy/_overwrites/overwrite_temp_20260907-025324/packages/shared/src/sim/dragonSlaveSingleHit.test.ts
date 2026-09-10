/**
 * 量測用的暫版（GH#1092）—— 之後會改寫成承重守衛。
 */
import { describe, it, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../content/loader";
import { shippedContentSource } from "../content/__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "./content/registry";
import { SimWorld } from "./SimWorld";
import { SKELETON_ARENA } from "./world/ArenaDef";
import { spawnChampion } from "./spawnChampion";
import { normalizeCombatEnv } from "./combatEnv";
import { runEffects } from "./effects/effectRunner";
import { DEFAULT_AUTO_ENGAGE } from "./combatFeel";
import type { EffectContext, EffectDef } from "./effects/effect";
import { asSeatId, asTeamId, type AbilityId, type ChampionId } from "../ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;

beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

describe("量測", () => {
  it("04-03 龍破斬 對站在落點的人打幾發", () => {
    const world = new SimWorld(SKELETON_ARENA, 1);
    world.combatEnv = normalizeCombatEnv({ damageDealt: 1, healing: 1 });
    world.combatFeel = { ...world.combatFeel, autoEngage: { ...DEFAULT_AUTO_ENGAGE, enabled: false } };
    const caster = spawnChampion(world, {
      championId: "godie-hjai" as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0),
      pos: { x: C.x, z: C.z }, zone: 0,
    });
    const spots = [
      { tag: "落點(12,0)", x: 12, z: 0 },
      { tag: "路徑上(3,0)", x: 3, z: 0 },
      { tag: "只有爆炸(12,5)", x: 12, z: 5 },
    ];
    const bodies = spots.map((s, i) =>
      spawnChampion(world, {
        championId: "godie-hjai" as ChampionId, seatId: asSeatId(i + 1), teamId: asTeamId(1),
        pos: { x: C.x + s.x, z: C.z + s.z }, zone: 0,
      }),
    );
    world.step(new Map());
    world.transform.get(caster)!.facing = { x: 1, z: 0 };
    const hp0 = bodies.map((b) => world.health.get(b)!.hp);
    const id = "godie-hjai.e";
    const ctx: EffectContext = {
      world, caster, rank: 1, targets: bodies, origin: `ability:${id}`, rng: world.rng,
    };
    runEffects((Abilities.get(id as AbilityId).effects ?? []) as EffectDef[], ctx);
    const hits: string[] = [];
    for (let t = 0; t < 90; t++) {
      world.step(new Map());
      for (const e of world.events) {
        if (e.type !== "damage") continue;
        const d = e.data as { target: unknown; amount: number; origin: string };
        const i = bodies.indexOf(d.target as never);
        if (i < 0) continue;
        hits.push(`t=${t} ${spots[i]!.tag} amount=${d.amount.toFixed(0)} origin=${d.origin}`);
      }
    }
    // eslint-disable-next-line no-console
    console.log("maxHp=", bodies.map((b) => world.health.get(b)!.maxHp.toFixed(0)).join("/"));
    // eslint-disable-next-line no-console
    console.log("hp0=", hp0.map((h) => h.toFixed(0)).join("/"));
    // eslint-disable-next-line no-console
    console.log(hits.join("\n"));
  });
});
