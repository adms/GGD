import { describe, it, beforeAll, expect } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../content/loader";
import { FsContentSource } from "../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../sim/content/registry";
import { SimWorld } from "../sim/SimWorld";
import { SKELETON_ARENA } from "../sim/world/ArenaDef";
import { spawnChampion } from "../sim/spawnChampion";
import { runEffects } from "../sim/effects/effectRunner";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../ids";

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

describe("probe3", () => {
  beforeAll(async () => {
    for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
    for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
    registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
  });

  const mk = (cid: string): { w: SimWorld; a: EntityId; b: EntityId } => {
    const w = new SimWorld(SKELETON_ARENA, 1234);
    const a = spawnChampion(w, { championId: cid as ChampionId, seatId: asSeatId(1), teamId: asTeamId(1), pos: { x: 0, z: 0 }, zone: 0 });
    const b = spawnChampion(w, { championId: "godie-emns" as ChampionId, seatId: asSeatId(2), teamId: asTeamId(2), pos: { x: 1.5, z: 0 }, zone: 0 });
    const hb = w.health.get(b)!; hb.maxHp = 1e9; hb.hp = 1e9;
    return { w, a, b };
  };

  const runIt = (id: string, cid: string, victimAsTarget: boolean, steps: number): void => {
    const def = Abilities.get(id as never) as unknown as { effects: unknown[] };
    const { w, a, b } = mk(cid);
    runEffects(def.effects as never, { world: w, caster: a, rank: 0, targets: victimAsTarget ? [b] : [a], point: { x: 1.5, z: 0 }, origin: `ability:${id}`, rng: w.rng } as never);
    const hb = w.health.get(b)!;
    let last = hb.hp;
    const hits: number[] = [];
    for (let i = 0; i < steps; i++) {
      hb.hp = 1e9; last = 1e9;
      w.step(new Map());
      if (hb.hp !== last) hits.push(w.tick);
    }
    console.log(`HITS ${id}: ${hits.length} @ ${JSON.stringify(hits.slice(0, 20))}`);
  };

  it("periodic counts", () => {
    runIt("godie-hjai.w", "godie-hjai", false, 300);      // delayed count 5 interval 1
    runIt("godie-hvsh.e", "godie-hvsh", false, 420);      // applyBuff duration 10, onInterval icd 1
    runIt("godie-edem.ex", "godie-edem", false, 420);     // damageArea + dot interval 1 dur 10
    runIt("godie-emns.ex", "godie-emns", true, 300);      // NEG: swapResource, no periodic
    expect(true).toBe(true);
  });
});
