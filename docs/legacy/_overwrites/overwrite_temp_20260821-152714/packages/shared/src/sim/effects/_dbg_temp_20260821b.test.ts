import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../../content/loader";
import { FsContentSource } from "../../content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../content/registry";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { asSeatId, asTeamId, type ChampionId } from "../../ids";
const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const EVA = "godie-e00r" as ChampionId;
beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
});
describe("dbg2", () => {
  it("dbg2", () => {
    const w = new SimWorld(SKELETON_ARENA, 1);
    w.combatActive = true;
    w.combatFeel = { ...w.combatFeel, autoEngage: { ...w.combatFeel.autoEngage, enabled: false } };
    const mk = (s:number,t:number)=>spawnChampion(w,{championId:EVA,seatId:asSeatId(s),teamId:asTeamId(t),pos:{x:0,z:0},zone:0});
    const me = mk(0,0); const a = mk(1,1); const b = mk(2,1);
    w.step(new Map());
    for (let i=0;i<420;i++){
      const at = w.transform.get(me)!.pos;
      [a,b].forEach((id,k)=>{ const h=w.health.get(id); if (h?.alive) h.hp=h.maxHp*0.015;
        const t=w.transform.get(id); if(t) t.pos={x:at.x, z: k===0?9:-9}; });
      const before = w.events.length;
      w.step(new Map());
      const evs = w.events.slice(before).filter(e=>["damage","death"].includes(e.type));
      if (evs.length) console.log("t",w.tick,JSON.stringify(evs.map(e=>({t:e.type,...e.data}))).slice(0,400));
      if (false) {
        const src = w.stats.get(me)!.sources.find(s=>s.id==="abilityPassive:godie-e00r.q");
        console.log("t",w.tick,"bAlive",w.health.get(b)!.alive,"combat",w.combatActive,
          "st1",JSON.stringify(w.status.get(me)),"lastFired",JSON.stringify(src?.hookLastFired),
          "bpos",JSON.stringify(w.transform.get(b)!.pos),"bhp",w.health.get(b)!.hp);
      }
    }
    expect(1).toBe(1);
  });
});
