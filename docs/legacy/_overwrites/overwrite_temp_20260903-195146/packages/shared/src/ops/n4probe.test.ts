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

describe("probeFinal", () => {
  beforeAll(async () => {
    for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
    for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
    registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
  });

  const mk = (cid: string): { w: SimWorld; a: EntityId; b: EntityId } => {
    const w = new SimWorld(SKELETON_ARENA, 4242);
    const a = spawnChampion(w, { championId: cid as ChampionId, seatId: asSeatId(1), teamId: asTeamId(1), pos: { x: 0, z: 0 }, zone: 0 });
    const b = spawnChampion(w, { championId: "godie-emns" as ChampionId, seatId: asSeatId(2), teamId: asTeamId(2), pos: { x: 2, z: 0 }, zone: 0 });
    for (const id of [a, b]) { const h = w.health.get(id)!; h.maxHp = 1e9; h.hp = 1e9; }
    return { w, a, b };
  };

  it("A: hart.r 七段 + 鎖定時長", () => {
    const { w, a, b } = mk("godie-hart");
    const def = Abilities.get("godie-hart.r" as never) as unknown as { effects: unknown[] };
    runEffects(def.effects as never, { world: w, caster: a, rank: 0, targets: [b], origin: "ability:godie-hart.r", rng: w.rng } as never);
    const hits: number[] = []; const cues: {i:number;f:boolean}[] = [];
    for (let i = 0; i < 200; i++) {
      w.events.length = 0; w.health.get(b)!.hp = 1e9;
      w.step(new Map());
      for (const e of w.events) {
        const d = e.data as { origin?: string; index?: number; finisher?: boolean };
        if (e.type === "damage" && d.origin === "ability:godie-hart.r") hits.push(w.tick);
        if (e.type === "comboStrike" && d.origin === "ability:godie-hart.r") cues.push({ i: d.index!, f: d.finisher! });
      }
    }
    console.log("HART hits", hits.length, JSON.stringify(hits), "cues", JSON.stringify(cues));
    expect(true).toBe(true);
  });

  it("B: h02u.ex 6 次 + 死亡後", () => {
    const def = Abilities.get("godie-h02u.ex" as never) as unknown as { effects: unknown[] };
    for (const killAt of [-1, 70]) {
      const { w, a } = mk("godie-h02u");
      runEffects(def.effects as never, { world: w, caster: a, rank: 0, targets: [a], origin: "ability:godie-h02u.ex", rng: w.rng } as never);
      const q = w.delayed.find((x) => x.origin === "ability:godie-h02u.ex")!;
      const sched = q.strikes.map((s) => s.atTick);
      const c = w.champion.get(a)!;
      let last = c.level * 1e6 + c.xp; const pay: number[] = [];
      for (let i = 0; i < 300; i++) {
        if (i === killAt) { const h = w.health.get(a)!; h.hp = 0; h.alive = false; }
        w.step(new Map());
        const now = c.level * 1e6 + c.xp;
        if (now !== last) { pay.push(w.tick); last = now; }
      }
      console.log(`H02U killAt=${killAt} sched=${JSON.stringify(sched)} stopOnCasterDeath=${q.stopOnCasterDeath} payouts=${pay.length} @${JSON.stringify(pay)} aliveAtEnd=${w.health.get(a)!.alive}`);
    }
    expect(true).toBe(true);
  });

  it("C: 反方向 emns.ex 零週期", () => {
    const { w, a, b } = mk("godie-emns");
    const def = Abilities.get("godie-emns.ex" as never) as unknown as { effects: unknown[] };
    const hb = w.health.get(b)!; hb.maxHp = 5000; hb.hp = 1200;
    const ha = w.health.get(a)!; ha.maxHp = 5000; ha.hp = 300;
    runEffects(def.effects as never, { world: w, caster: a, rank: 0, targets: [b], origin: "ability:godie-emns.ex", rng: w.rng } as never);
    console.log(`SWAP a=${ha.hp}/${ha.maxHp} b=${hb.hp}/${hb.maxHp} delayedQ=${w.delayed.length}`);
    const c = w.champion.get(a)!; let last = c.level * 1e6 + c.xp; let n = 0;
    for (let i = 0; i < 300; i++) { w.step(new Map()); const now = c.level * 1e6 + c.xp; if (now !== last) { n++; last = now; } }
    console.log(`SWAP periodicPayouts=${n} delayedQ=${w.delayed.length}`);
    expect(true).toBe(true);
  });
});
