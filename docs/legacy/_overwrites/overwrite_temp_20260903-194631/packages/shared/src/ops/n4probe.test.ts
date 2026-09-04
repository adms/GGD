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

describe("probe2", () => {
  beforeAll(async () => {
    for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
    for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
    registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
  });

  const mk = (): { w: SimWorld; a: EntityId; b: EntityId } => {
    const w = new SimWorld(SKELETON_ARENA, 1234);
    const a = spawnChampion(w, { championId: "godie-h02u" as ChampionId, seatId: asSeatId(1), teamId: asTeamId(1), pos: { x: 0, z: 0 }, zone: 0 });
    const b = spawnChampion(w, { championId: "godie-emns" as ChampionId, seatId: asSeatId(2), teamId: asTeamId(2), pos: { x: 3, z: 0 }, zone: 0 });
    return { w, a, b };
  };

  const xpOf = (w: SimWorld, id: EntityId): number => {
    const c = w.champion.get(id)!;
    return c.level * 100000 + c.xp;
  };

  it("h02u.ex delayed profile", () => {
    const def = Abilities.get("godie-h02u.ex" as never) as unknown as { effects: unknown[] };
    // (a) normal
    {
      const { w, a, b } = mk();
      const before = xpOf(w, a);
      runEffects(def.effects as never, { world: w, caster: a, rank: 0, targets: [a], origin: "ability:godie-h02u.ex", rng: w.rng } as never);
      const marks: number[] = [];
      let last = before;
      for (let i = 0; i < 400; i++) {
        w.step(new Map());
        const now = xpOf(w, a);
        if (now !== last) { marks.push(w.tick); last = now; }
      }
      console.log("NORMAL payouts:", marks.length, "ticks:", JSON.stringify(marks), "dt", w.dt);
    }
    // (b) lag spike: hand-drive delayedSystem is internal; instead simulate by NOT stepping evenly is impossible.
    // (c) caster death mid-wave
    {
      const { w, a } = mk();
      runEffects(def.effects as never, { world: w, caster: a, rank: 0, targets: [a], origin: "ability:godie-h02u.ex", rng: w.rng } as never);
      const marks: number[] = [];
      let last = xpOf(w, a);
      for (let i = 0; i < 400; i++) {
        if (i === 70) { const h = w.health.get(a)!; h.hp = 0; h.alive = false; }
        w.step(new Map());
        const now = xpOf(w, a);
        if (now !== last) { marks.push(w.tick); last = now; }
      }
      console.log("DEATH@tick70 payouts:", marks.length, "ticks:", JSON.stringify(marks));
    }
    // (d) negative calibration: emns.ex (swapResource) — no periodic node
    {
      const { w, a, b } = mk();
      const sd = Abilities.get("godie-emns.ex" as never) as unknown as { effects: unknown[] };
      runEffects(sd.effects as never, { world: w, caster: a, rank: 0, targets: [b], origin: "ability:godie-emns.ex", rng: w.rng } as never);
      const marks: number[] = [];
      let last = xpOf(w, a);
      for (let i = 0; i < 400; i++) { w.step(new Map()); const now = xpOf(w, a); if (now !== last) { marks.push(w.tick); last = now; } }
      console.log("NEG emns.ex payouts:", marks.length, "delayedQueue:", w.delayed.length);
    }
    expect(true).toBe(true);
  });
});
