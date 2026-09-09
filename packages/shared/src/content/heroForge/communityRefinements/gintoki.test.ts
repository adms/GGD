import { beforeAll, describe, expect, it } from "vitest";
import { communityCombatFixture } from "../../../../testkit/communityCombatFixture";
import { registerSkeletonContent, } from "../../../sim/content/skeleton";
import { castAbility } from "../../../sim/abilities/abilitySystem";
import { abilityInstanceFor } from "../../../sim/abilities/innateActive";
import { attachSource, recomputeStats } from "../../../sim/stats/statPipeline";
import { Stat } from "../../../sim/stats/statTypes";
import { ModOp } from "../../../sim/stats/modifiers";
import { runEffects } from "../../../sim/effects/effectRunner";
import { DEFAULT_HITSTOP } from "../../../sim/combat/hitstopHold";
import { asSeatId, type EntityId, type StatusId } from "../../../ids";
import type { CastableSlot } from "../../../sim/intents";
import { Abilities } from "../../../sim/content/registry";
import { zEffectDef } from "../../schema/effect";
import { zHookDef } from "../../schema/effects/_hook";
import { markCount, resetMarksForRound } from "../../../sim/marks";
import { mobRulesFromConfig, type MobWavesConfigLike } from "../../../sim/mobs";
import { fireHooks } from "../../../sim/effects/hooks";

beforeAll(registerSkeletonContent);
function setup(rank=1) {
  const r=communityCombatFixture("23",rank), events: typeof r.world.events=[];
  r.world.combatFeel={...r.world.combatFeel,knockback:{...r.world.combatFeel.knockback,maxBodies:0},hitstop:{...DEFAULT_HITSTOP,scale:0}};
  const arena=r.source.catalog.documents.get("config/arena-rules") as unknown as {mobWaves:MobWavesConfigLike};
  r.world.combatActive=true;
  r.world.mobRules={...mobRulesFromConfig(arena.mobWaves,r.world.dt),autoWaves:false,inertSeats:new Set([0,1,2,3].map(asSeatId))};
  const origin={...r.world.transform.get(r.caster)!.pos};
  for(const id of [r.caster,r.ally,r.enemy,r.distant]) {
    attachSource(r.world,id,{id:"test:stable",kind:"item",modifiers:[{stat:Stat.MaxHealth,op:ModOp.Override,value:100000},{stat:Stat.HealthRegen,op:ModOp.Override,value:0}]});
    recomputeStats(r.world,id);r.world.health.get(id)!.hp=50000;
  }
  const place=(id:EntityId,x:number,z=0)=>{r.world.transform.get(id)!.pos={x:origin.x+x,z:origin.z+z};r.world.transform.get(id)!.facing={x:1,z:0};r.world.nav.get(id)!.order={kind:"hold"};r.world.rebuildGrid();};
  place(r.caster,0);place(r.ally,-8);place(r.enemy,1);place(r.distant,10);
  const step=(n=1)=>{for(let i=0;i<n;i++){r.world.step(new Map());events.push(...r.world.events);}};
  const ready=(slot:CastableSlot,id=r.caster)=>{abilityInstanceFor(r.world.abilities.get(id)!,slot)!.cooldownRemainingTicks=0;r.world.health.get(id)!.mana=r.world.health.get(id)!.maxMana;};
  const cast=(slot:CastableSlot,n=15)=>{const start=r.world.events.length;const result=castAbility(r.world,r.caster,slot,slot==="Q"?{type:"dir",dir:{x:1,z:0}}:slot==="EX"?{type:"entity",entityId:r.enemy}:{type:"self"});events.push(...r.world.events.slice(start));if(result==="ok")step(n);return result;};
  const count=(name:string)=>markCount(r.world,r.caster,`${r.project.projectId}.${name}` as StatusId);
  const hit=(type:"physical"|"magic"|"true"="physical",amount=100)=>{r.world.damageQueue.push({source:r.enemy,target:r.caster,type,amount,origin:"basic",crit:false});step();};
  return {...r,origin,events,place,step,ready,cast,count,hit};
}
describe("Gintoki source-authored supply, parry and six slots",()=>{
  it("waits out combat, caps one supply and consumes it at drink submission",()=>{
    const r=setup();r.step(120);expect(r.count("supply")).toBe(0);r.step(61);expect(r.count("supply")).toBe(1);r.step(120);expect(r.count("supply")).toBe(1);
    const hp=r.world.health.get(r.caster)!.hp;expect(r.cast("W",0)).toBe("ok");expect(r.count("supply")).toBe(0);expect(r.world.health.get(r.caster)!.hp).toBe(hp);r.step(31);expect(r.world.health.get(r.caster)!.hp).toBe(hp+100);
    r.ready("W");expect(r.cast("W",0)).toBe("no-resource");
  });
  it("restarts rest after actual attacks and hostile hits without losing saved supply",()=>{
    const r=setup();r.step(100);r.hit();r.step(100);expect(r.count("supply")).toBe(0);r.step(65);expect(r.count("supply")).toBe(1);
    r.hit();expect(r.count("supply")).toBe(1);
  });
  it("drink cancels on real movement and keeps its paid supply/cooldown",()=>{
    const r=setup();r.step(181);expect(r.cast("W",0)).toBe("ok");
    const hp=r.world.health.get(r.caster)!.hp;
    r.world.step(new Map([[asSeatId(0),{commands:[],order:{kind:"move" as const,point:{x:r.origin.x+3,z:r.origin.z}}}]]));r.step(40);
    expect(r.world.transform.get(r.caster)!.pos.x).toBeGreaterThan(r.origin.x);expect(r.world.health.get(r.caster)!.hp).toBe(hp);expect(r.count("supply")).toBe(0);
    expect(r.events.some(e=>e.type==="castInterrupt"&&e.data.slot==="W")).toBe(true);expect(abilityInstanceFor(r.world.abilities.get(r.caster)!,"W")!.cooldownRemainingTicks).toBeGreaterThan(0);
  });
  it("drink cancels on a shield-absorbed hit without requiring HP loss",()=>{
    const r=setup();r.step(181);runEffects([{kind:"shield",amount:{flat:1000},duration:3}],{world:r.world,caster:r.caster,targets:[r.caster],rank:1,origin:"test:shield",rng:r.world.rng});
    const hp=r.world.health.get(r.caster)!.hp;r.cast("W",0);r.hit();r.step(40);expect(r.world.health.get(r.caster)!.hp).toBe(hp);expect(r.events.some(e=>e.type==="castInterrupt"&&e.data.slot==="W")).toBe(true);
  });
  it("Q is a single forward arc with no rear or friendly damage",()=>{
    const r=setup();r.place(r.ally,1);r.place(r.distant,-1);r.world.team.get(r.distant)!.teamId=r.world.team.get(r.enemy)!.teamId;
    expect(r.cast("Q")).toBe("ok");const hits=r.events.filter(e=>e.type==="damage"&&e.data.origin===`ability:${r.project.projectId}.q`);expect(hits.map(e=>e.data.target)).toEqual([r.enemy]);
  });
  it("only this parry's successful block earns a single expiring counter",()=>{
    const r=setup();expect(r.cast("E",0)).toBe("ok");const hp=r.world.health.get(r.caster)!.hp;r.hit();expect(r.world.health.get(r.caster)!.hp).toBe(hp);expect(r.count("counter")).toBe(1);
    r.hit();expect(r.world.health.get(r.caster)!.hp).toBeLessThan(hp);expect(r.count("counter")).toBe(1);
    r.step(65);expect(r.count("counter")).toBe(0);
  });
  it("shield absorption, absent block context and other block grants never award a counter",()=>{
    for(const variant of ["shield","other","context"] as const){const r=setup();
      if(variant==="other")attachSource(r.world,r.caster,{id:"test:other-block",kind:"item",block:{chance:1,fraction:1,damageTypes:["physical"]}});
      r.cast("E",0);
      if(variant==="shield"){runEffects([{kind:"shield",amount:{flat:1000},duration:3}],{world:r.world,caster:r.caster,targets:[r.caster],rank:1,origin:"test:shield",rng:r.world.rng});r.hit("true");}
      else if(variant==="other")r.hit();else fireHooks(r.world,r.caster,"onBlock",r.enemy);
      expect(r.count("counter"),variant).toBe(0);
    }
  });
  it("earned counter augments only the next real basic hit and does not seek a target",()=>{
    const r=setup();r.cast("E",0);r.hit();r.step(25);expect(r.count("counter")).toBe(1);const before=r.events.length;
    r.world.step(new Map([[asSeatId(0),{commands:[],order:{kind:"attackTarget" as const,entity:r.enemy}}]]));r.step(85);
    const counters=r.events.slice(before).filter(e=>e.type==="damage"&&e.data.source===r.caster&&String(e.data.origin).includes(`${r.project.projectId}.counter-listener`));expect(counters).toHaveLength(1);expect(r.count("counter")).toBe(0);
  });
  it("R grants only temporary combat modifiers and restores the original source stats",()=>{
    const r=setup();const stats=r.world.stats.get(r.caster)!;const ad=stats.final[Stat.AttackDamage],ms=stats.final[Stat.MoveSpeed];expect(r.cast("R")).toBe("ok");expect(stats.final[Stat.AttackDamage]).toBeGreaterThan(ad);expect(stats.final[Stat.MoveSpeed]).toBeGreaterThan(ms);r.step(135);expect(stats.final[Stat.AttackDamage]).toBe(ad);expect(stats.final[Stat.MoveSpeed]).toBe(ms);
  });
  it("EX interrupts an active enemy wind-up once without stun or refund",()=>{
    const r=setup();const result=castAbility(r.world,r.enemy,"R",{type:"self"});expect(result).toBe("ok");const mana=r.world.health.get(r.enemy)!.mana;
    expect(r.cast("EX",5)).toBe("ok");expect(r.world.abilities.get(r.enemy)!.cast).toBeNull();expect(r.world.health.get(r.enemy)!.mana).toBeLessThanOrEqual(mana+5);expect(r.world.status.get(r.enemy)!.effects.some(s=>s.stun)).toBe(false);
    expect(r.events.filter(e=>e.type==="castInterrupt"&&e.data.caster===r.enemy)).toHaveLength(1);expect(r.events.some(e=>e.type==="floatingText"&&String(e.data.text).includes("吐槽"))).toBe(true);
  });
  it("direct interrupt skips protected casts and does not rewind already resolved effects",()=>{
    const r=setup();const def=Abilities.get(r.compiled.abilityDrafts.R.id);Abilities.register(def.id,{...def,interruptible:false});castAbility(r.world,r.enemy,"R",{type:"self"});
    const context={world:r.world,caster:r.caster,targets:[r.enemy],rank:1,origin:"test:interrupt",rng:r.world.rng};runEffects([{kind:"interruptCast",shape:"single"}],context);expect(r.world.abilities.get(r.enemy)!.cast).not.toBeNull();r.step(15);expect(r.world.abilities.get(r.enemy)!.cast).toBeNull();const active=r.world.stats.get(r.enemy)!.sources.length;runEffects([{kind:"interruptCast",shape:"single"}],context);expect(r.world.stats.get(r.enemy)!.sources).toHaveLength(active);
  });
  it("rejects unsupported schema combinations and hashes sensitive channel state",()=>{
    expect(zEffectDef.safeParse({kind:"interruptCast",shape:"single"}).success).toBe(true);expect(zEffectDef.safeParse({kind:"interruptCast"}).success).toBe(false);
    expect(zHookDef.safeParse({on:"onAbilityCast",blockSource:"thisSource",effects:[]}).success).toBe(false);
    const r=setup();r.step(181);r.cast("W",0);const cast=r.world.abilities.get(r.caster)!.cast!;const digest=r.world.digest();cast.hitSinceStart=true;expect(r.world.digest()).not.toBe(digest);
  });

  it.each(["miss", "evade", "cancel"] as const)("a real %s attack attempt restarts the rest timer", mode=>{
    const r=setup();r.step(100);
    if(mode==="miss")runEffects([{kind:"applyStatus",statusId:"test:miss" as StatusId,duration:2,missChance:1}],{world:r.world,caster:r.caster,targets:[r.caster],rank:1,origin:"test",rng:r.world.rng});
    if(mode==="evade")attachSource(r.world,r.enemy,{id:"test:evade",kind:"item",modifiers:[{stat:Stat.Evasion,op:ModOp.Override,value:1}]});
    const nav=r.world.nav.get(r.caster)!;nav.order={kind:"attackTarget",entity:r.enemy};nav.attackTarget=r.enemy;r.step();
    expect(r.world.abilities.get(r.caster)!.basicAttackCdTicks).toBeGreaterThan(0);if(mode==="cancel")r.place(r.enemy,12);
    r.step(12);nav.order={kind:"hold"};nav.attackTarget=null;r.world.abilities.get(r.caster)!.basicAttackCdTicks=10000;
    expect(r.events.filter(e=>e.type==="damage"&&e.data.source===r.caster)).toHaveLength(0);r.step(110);expect(r.count("supply")).toBe(0);r.step(50);expect(r.count("supply")).toBe(1);
  });
  it("supply resets each round and rank-four drink pays only its authored healing",()=>{
    const r=setup(4);r.step(181);const hp=r.world.health.get(r.caster)!.hp;r.cast("W",31);expect(r.world.health.get(r.caster)!.hp).toBe(hp+250);r.step(200);expect(r.count("supply")).toBe(1);resetMarksForRound(r.world);expect(r.count("supply")).toBe(0);
  });
  it.each(["zero","immune"] as const)("a %s packet does not interrupt drinking",mode=>{
    const r=setup();r.step(181);const hp=r.world.health.get(r.caster)!.hp;r.cast("W",0);
    if(mode==="immune")runEffects([{kind:"invulnerable",durationSec:1}],{world:r.world,caster:r.caster,targets:[r.caster],rank:1,origin:"test:immune",rng:r.world.rng});
    r.hit("physical",mode==="zero"?0:100);r.step(31);expect(r.world.health.get(r.caster)!.hp).toBe(hp+100);expect(r.events.filter(e=>e.type==="castInterrupt"&&e.data.caster===r.caster)).toHaveLength(0);
  });
  it.each(["best","independent"] as const)("records the actual successful parry in %s block mode",stacking=>{
    const r=setup();r.world.blockRules={...r.world.blockRules,stacking};r.cast("E",0);r.hit("magic");expect(r.count("counter")).toBe(1);
  });
  it("parry excludes true damage and late hits without inventing a shield",()=>{
    const r=setup();r.cast("E",0);const hp=r.world.health.get(r.caster)!.hp;r.hit("true");expect(r.world.health.get(r.caster)!.hp).toBeLessThan(hp);expect(r.count("counter")).toBe(0);expect(r.shield(r.caster)).toBe(0);r.step(25);r.hit("magic");expect(r.count("counter")).toBe(0);
  });
  it("arc direction follows the real cast and excludes out-of-range and rear targets",()=>{
    const r=setup();r.place(r.enemy,-1);r.place(r.distant,8);r.world.team.get(r.distant)!.teamId=r.world.team.get(r.enemy)!.teamId;
    expect(castAbility(r.world,r.caster,"Q",{type:"dir",dir:{x:-1,z:0}})).toBe("ok");r.step(12);const hits=r.events.filter(e=>e.type==="damage"&&e.data.origin===`ability:${r.project.projectId}.q`);expect(hits.map(e=>e.data.target)).toEqual([r.enemy]);
  });
  it("EX rejects allies and approaches out-of-range enemies without paying or interrupting",()=>{
    const r=setup();const hp=r.world.health.get(r.caster)!;const mana=hp.mana;
    expect(castAbility(r.world,r.caster,"EX",{type:"entity",entityId:r.ally})).toBe("bad-target");r.place(r.enemy,12);expect(r.cast("EX",0)).toBe("approaching");expect(hp.mana).toBe(mana);expect(abilityInstanceFor(r.world.abilities.get(r.caster)!,"EX")!.cooldownRemainingTicks).toBe(0);
  });
  it("replays the same supply, drink, parry and counter sequence deterministically",()=>{
    const replay=()=>{const r=setup();const trail=[];r.step(181);trail.push(r.world.digest());r.cast("W",31);trail.push(r.world.digest());r.cast("E",0);r.hit();trail.push(r.world.digest());r.step(80);trail.push(r.world.digest());return trail;};expect(replay()).toEqual(replay());
  });

  it.each(["immune","other-zone","settled","ally"] as const)("interrupt respects %s eligibility at effect time",mode=>{
    const r=setup();expect(castAbility(r.world,r.enemy,"R",{type:"self"})).toBe("ok");
    if(mode==="immune")runEffects([{kind:"invulnerable",durationSec:1,blocksControl:true}],{world:r.world,caster:r.enemy,targets:[r.enemy],rank:1,origin:"test:immune",rng:r.world.rng});
    if(mode==="other-zone")r.world.transform.get(r.enemy)!.zone++;
    if(mode==="settled")r.world.settledZones.add(r.world.transform.get(r.enemy)!.zone);
    if(mode==="ally")r.world.team.get(r.enemy)!.teamId=r.world.team.get(r.caster)!.teamId;
    runEffects([{kind:"interruptCast",shape:"single"}],{world:r.world,caster:r.caster,targets:[r.enemy],rank:1,origin:"test:interrupt",rng:r.world.rng});expect(r.world.abilities.get(r.enemy)!.cast).not.toBeNull();
  });
});
