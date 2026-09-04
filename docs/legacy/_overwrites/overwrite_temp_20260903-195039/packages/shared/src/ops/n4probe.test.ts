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

describe("probe4", () => {
  beforeAll(async () => {
    for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
    for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
    registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
  });

  const runIt = (id: string, cid: string, steps: number): void => {
    const w = new SimWorld(SKELETON_ARENA, 1234);
    const a = spawnChampion(w, { championId: cid as ChampionId, seatId: asSeatId(1), teamId: asTeamId(1), pos: { x: 0, z: 0 }, zone: 0 });
    const b = spawnChampion(w, { championId: "godie-emns" as ChampionId, seatId: asSeatId(2), teamId: asTeamId(2), pos: { x: 4, z: 0 }, zone: 0 });
    const hb = w.health.get(b)!; hb.maxHp = 1e9; hb.hp = 1e9;
    const ha = w.health.get(a)!; ha.maxHp = 1e9; ha.hp = 1e9;
    w.transform.get(a)!.pos = { x: 0, z: 0 };
    w.transform.get(b)!.pos = { x: 2, z: 0 };
    for (let k = 0; k < 3; k++) { w.transform.get(a)!.pos = { x: 0, z: 0 }; w.transform.get(b)!.pos = { x: 2, z: 0 }; w.step(new Map()); }
    const def = Abilities.get(id as never) as unknown as { effects: unknown[] };
    runEffects(def.effects as never, { world: w, caster: a, rank: 1, targets: [b], point: { x: 2, z: 0 }, origin: `ability:${id}`, rng: w.rng } as never);
    console.log(`  ${id}: delayedQ=${w.delayed.length} settled=${JSON.stringify([...w.settledZones])} wave=${JSON.stringify(w.delayed[0]?.strikes?.map(s=>s.atTick))} frozen=${JSON.stringify(w.delayed[0]?.frozen)} reres=${JSON.stringify(w.delayed[0]?.reresolve)} pt=${JSON.stringify(w.delayed[0]?.point)}`);
    const hits: number[] = [];
    const seen = new Map<string, number>();
    for (let i = 0; i < steps; i++) {
      w.events.length = 0;
      hb.hp = 1e9; ha.hp = 1e9;
      w.transform.get(a)!.pos = { x: 0, z: 0 };
      w.transform.get(b)!.pos = { x: 2, z: 0 };
      w.step(new Map());
      if (i === 40 || i === 45) console.log(`   @${i} settled=${JSON.stringify([...w.settledZones])} qlen=${w.delayed.length} next=${w.delayed[0]?.next} evTypes=${JSON.stringify(w.events.map(e=>e.type))}`);
      for (const e of w.events) {
        const d = e.data as { origin?: string; target?: unknown; amount?: number };
        if (e.type === "damage") seen.set(String(d.origin), (seen.get(String(d.origin)) ?? 0) + 1);
        if ((e.type === "damage") && typeof d.origin === "string" && d.origin.includes(id)) { hits.push(w.tick); break; }
      }
    }
    console.log(`HITS ${id}: n=${hits.length} @ ${JSON.stringify(hits.slice(0, 24))} allOrigins=${JSON.stringify([...seen])}`);
  };

  it("periodic counts", () => {
    runIt("godie-hjai.w", "godie-hjai", 300);
    runIt("godie-hvsh.e", "godie-hvsh", 420);
    runIt("godie-edem.ex", "godie-edem", 420);
    runIt("godie-emns.ex", "godie-emns", 200);
    runIt("godie-hart.r", "godie-hart", 200);
    expect(true).toBe(true);
  });
});
