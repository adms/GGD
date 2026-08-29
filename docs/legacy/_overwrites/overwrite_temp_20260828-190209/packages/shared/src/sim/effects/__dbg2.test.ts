import { describe, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "../../content/loader";
import { shippedContentSource } from "../../content/__fixtures__/shippedContent";
import { Arenas, Configs, Models, StatusEffects, VfxDefs, registerAll } from "../../content/registries";
import { Abilities, Augments, Champions, Items, LootTables, Projectiles } from "../content/registry";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { spawnChampion } from "../spawnChampion";
import { runEffects } from "./effectRunner";
import type { EffectContext, EffectDef } from "./effect";
import { asSeatId, asTeamId, type AbilityId, type ChampionId } from "../../ids";
const CONTENT = join(dirname(fileURLToPath(import.meta.url)), "../../../../../content");
const C = SKELETON_ARENA.zones[0]!.center;
describe("dbg", () => { it("d", async () => {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, StatusEffects]) r.clear();
  registerAll((await new ContentLoader(shippedContentSource(CONTENT)).load()).store);
  const w = new SimWorld(SKELETON_ARENA, 5);
  const P = (dx:number,dz:number,s:number,t:number)=>spawnChampion(w,{championId:"godie-n01c" as ChampionId,seatId:asSeatId(s),teamId:asTeamId(t),pos:{x:C.x+dx,z:C.z+dz},zone:0});
  const caster=P(0,0,0,0), a=P(8,0,1,1), b=P(8,3.0,2,1);
  w.step(new Map());
  w.transform.get(caster)!.facing={x:1,z:0};
  const hp=(id:number)=>w.health.get(id as never)!.hp;
  const b0={a:hp(a),b:hp(b)};
  const def=Abilities.get("godie-n01c.r" as AbilityId);
  runEffects((def.effects??[]) as EffectDef[],{world:w,caster,rank:1,targets:[],point:{x:C.x+12,z:C.z},origin:"ability:x",rng:w.rng} as EffectContext);
  const eff=(Abilities.get("godie-n01c.r" as AbilityId).effects??[]) as never as {kind:string;effects?:unknown[]}[];
  const dl=eff.find(e=>e.kind==="delayed") as never as {effects:{onArrive?:unknown[]}[]};
  console.log("RESOLVED_ONARRIVE", JSON.stringify(dl?.effects?.[0]?.onArrive));
  {
    const { resolveScaling, NO_ATTR_LOOKUP } = await import("./effect");
    const st = w.stats.get(caster)!.final;
    const nodes = (dl?.effects?.[0]?.onArrive ?? []) as never as { kind: string; amount?: unknown }[];
    for (const n of nodes) if (n.kind === "damageArea")
      console.log("SCALE", JSON.stringify(n.amount), "=>", resolveScaling(st, n.amount as never, 1, NO_ATTR_LOOKUP));
  }
  for (let i=0;i<45;i++){ w.step(new Map());
    const m=w.status.get(a)?.effects.map(e=>e.statusId)??[];
    if(i<3||i>26&&i<34) console.log("t",w.tick,"hpA",Math.round(w.health.get(a)!.hp),"markA",JSON.stringify(m)); }
  console.log("CASTER_AT", JSON.stringify(w.transform.get(caster)!.pos), "C=", JSON.stringify(C));
  console.log("DMG a(線上)=", b0.a-hp(a), " b(線外)=", b0.b-hp(b));
  console.log("MARKS a=", JSON.stringify(w.status.get(a)?.effects.map(e=>e.statusId)), " b=", JSON.stringify(w.status.get(b)?.effects.map(e=>e.statusId)));
}); });
