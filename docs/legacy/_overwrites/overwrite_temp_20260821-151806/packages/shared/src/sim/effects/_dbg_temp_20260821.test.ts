import { describe, it, expect, beforeAll } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "/Users/Takuro/GGD/packages/shared/src/content/loader";
import { FsContentSource } from "/Users/Takuro/GGD/packages/shared/src/content/node/FsContentSource";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "/Users/Takuro/GGD/packages/shared/src/content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "/Users/Takuro/GGD/packages/shared/src/sim/content/registry";
import { SimWorld } from "/Users/Takuro/GGD/packages/shared/src/sim/SimWorld";
import { SKELETON_ARENA } from "/Users/Takuro/GGD/packages/shared/src/sim/world/ArenaDef";
import { spawnChampion } from "/Users/Takuro/GGD/packages/shared/src/sim/spawnChampion";
import { asSeatId, asTeamId } from "/Users/Takuro/GGD/packages/shared/src/ids";
import { fireHooks } from "/Users/Takuro/GGD/packages/shared/src/sim/effects/hooks";
import { enemiesInCircle, resolveAbilityRadius } from "/Users/Takuro/GGD/packages/shared/src/sim/abilities/abilitySystem";
import { queryOverlap } from "/Users/Takuro/GGD/packages/shared/src/sim/collision/queries";
import { circle } from "/Users/Takuro/GGD/packages/shared/src/sim/collision/shapes";

const CONTENT = "/Users/Takuro/GGD/content";
beforeAll(async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
});
describe("dbg", () => {
  it("dbg", () => {
    const w = new SimWorld(SKELETON_ARENA, 1);
    w.combatActive = true;
    const mk = (s:number,t:number,x:number)=>spawnChampion(w,{championId:"godie-e00r" as never,seatId:asSeatId(s),teamId:asTeamId(t),pos:{x,z:0},zone:0});
    const me = mk(0,0,0); const a = mk(1,1,1.5); const b = mk(2,1,2.5);
    console.log("Q rank", w.abilities.get(me)!.slots.Q.rank, w.abilities.get(me)!.slots.Q.abilityId);
    console.log("sources", w.stats.get(me)!.sources.map(s=>s.id));
    const ha = w.health.get(a)!;
    console.log("a maxHp", ha.maxHp, "hp", ha.hp);
    w.step(new Map());
    const ha2 = w.health.get(a)!; ha2.hp = ha2.maxHp*0.015;
    console.log("abilityRange", w.combatEnv.abilityRange, "radius", resolveAbilityRadius(w, 12));
    console.log("grid", w.grid.queryAABB({x:-20,z:-20},{x:20,z:20}));
    console.log("transforms", [...w.transform.entries()].map(([k,v])=>[k,v.pos,v.zone,v.radius]));
    console.log("teams", [...w.team.entries()].map(([k,v])=>[k,v.teamId]));
    for (const r of [1,3,5,8,10,11,12,13,20]) {
      console.log("r",r,"overlap",queryOverlap(w, circle(w.transform.get(me)!.pos, r), {zone:0, exclude:new Set([me]), aliveOnly:true}), "aabb", w.grid.queryAABB({x:-16.6-r,z:-r},{x:-16.6+r,z:r}));
    }
    console.log("queryOverlap", queryOverlap(w, circle(w.transform.get(me)!.pos, 12), {zone:0, exclude:new Set([me]), aliveOnly:true}));
    console.log("healthAlive", [...w.health.entries()].map(([k,v])=>[k,v.alive,v.hp]));
    console.log("stealth", w.stealthRules);
    console.log("enemiesInCircle", enemiesInCircle(w, me, w.transform.get(me)!.pos, resolveAbilityRadius(w,12)));
    const n = fireHooks(w, me, "onInterval" as never);
    console.log("fired", n, "queue", w.damageQueue.length);
    for (let i=0;i<5;i++){
      const h = w.health.get(a)!; if (h.alive) h.hp = h.maxHp*0.015;
      const h2 = w.health.get(b)!; if (h2.alive) h2.hp = h2.maxHp*0.015;
      w.step(new Map());
      console.log("tick",w.tick,"a.alive",w.health.get(a)!.alive,"a.hp",w.health.get(a)!.hp,"queue",w.damageQueue.length);
    }
    expect(1).toBe(1);
  });
});
