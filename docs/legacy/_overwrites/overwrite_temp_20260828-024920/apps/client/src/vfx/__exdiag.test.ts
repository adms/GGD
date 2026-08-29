import { describe, it, expect, beforeAll } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SimWorld } from "@ggd/shared/sim/SimWorld";
import { SKELETON_ARENA } from "@ggd/shared/sim/world/ArenaDef";
import { spawnChampion } from "@ggd/shared/sim/spawnChampion";
import { castAbility } from "@ggd/shared/sim/abilities/abilitySystem";
import { syncAbilityPassives } from "@ggd/shared/sim/abilities/abilityPassives";
import { asSeatId, asTeamId, type ChampionId } from "@ggd/shared/ids";
import { ContentLoader } from "@ggd/shared/content/loader";
import { shippedContentSource } from "@ggd/shared/content/__fixtures__/shippedContent";
import { registerAll, Arenas, Configs, Models, VfxDefs, StatusEffects } from "@ggd/shared/content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "@ggd/shared/sim/content/registry";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");
beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
});

describe("EX diag", () => {
  it("dumps", () => {
    const world = new SimWorld(SKELETON_ARENA, 1);
    world.combatActive = true;
    const c = SKELETON_ARENA.zones[0]!.center;
    const saber = spawnChampion(world, { championId: "godie-e002" as ChampionId, seatId: asSeatId(0), teamId: asTeamId(0), pos: { x: c.x, z: c.z }, zone: 0 });
    const foe = spawnChampion(world, { championId: "godie-e002" as ChampionId, seatId: asSeatId(1), teamId: asTeamId(1), pos: { x: c.x + 4, z: c.z }, zone: 0 });
    world.step(new Map());
    const ab0 = world.abilities.get(saber)!;
    if (ab0.exSlot) (ab0.exSlot as any).rank = 1;
    syncAbilityPassives(world, saber);
    const sc = world.stats.get(saber)!;
    sc.dirty = true;
    world.step(new Map());
    const sc2 = world.stats.get(saber)!;
    console.log("sources:", sc2.sources.length, "hooks per source:", sc2.sources.map((s: any) => (s.hooks ?? []).map((h: any) => h.on)));
    const ab = world.abilities.get(saber)!;
    console.log("slots:", Object.entries(ab.slots).map(([k, v]: any) => `${k}=${v.abilityId}@${v.rank}`).join(" "), "ex:", JSON.stringify(ab.exSlot));
    (ab.slots as any).R.rank = 1;
    const hp = world.health.get(saber)!; hp.mana = hp.maxMana;
    console.log("cast R:", castAbility(world, saber, "R", { type: "self" }));
    const hist: Record<string, number> = {};
    for (let t = 0; t < 220; t++) {
      if (t === 45 || t === 50) (world.damageQueue as any).push({ source: foe, target: saber, amount: 400, type: world.damageRules.defaultAbilityDamageType, crit: false, origin: "test:hit" });
      world.step(new Map());
      for (const e of world.events) hist[e.type] = (hist[e.type] ?? 0) + 1;
    }
    console.log("events:", JSON.stringify(hist));
    expect(true).toBe(true);
  });
});
