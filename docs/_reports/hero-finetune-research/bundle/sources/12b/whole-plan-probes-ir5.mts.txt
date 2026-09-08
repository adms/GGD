/** Keep source-known constraints, replace preview-timed fixtures explicitly. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {wholePlanProbes} from './whole-plan-probes-v3.mts';
import {engineProbe} from './probe-harness.mts';
import {Abilities} from '../../GGD-community-hero-forge/packages/shared/src/sim/content/registry.ts';
import {castAbility} from '../../GGD-community-hero-forge/packages/shared/src/sim/abilities/abilitySystem.ts';
const prior=JSON.parse(fs.readFileSync(new URL('./whole-plan-acceptance-v1/cases.json',import.meta.url),'utf8'));
const replaces=['field-stay','field-leave','field-enter','Q-windup-four-scheduled-segments','R-cannot-reaim-during-barrage'];
function disarm(r:any){for(const id of [r.caster,r.foe,r.other])r.world.status.get(id).effects.push({
  statusId:'research.no-basics',sourceId:'fixture-only',applierId:id,expiresAtTick:100000,stacks:1,disarmed:true});}
function pos(r:any,id:any,x:number,z?:number){const p=r.world.transform.get(id).pos;p.x=x;if(z!==undefined)p.z=z;r.world.rebuildGrid();}
export function wholePlanProbes5(compiled:any,id:string,catalog:any){
  assert(['community7-lux','community7-xerath'].includes(id));
  const names=[...new Set(prior.rows.find((f:any)=>f.id===id).source.rows.map((r:any)=>r.name))].filter(n=>!replaces.includes(n as string));
  const old=wholePlanProbes(compiled,id,catalog,names as string[]),rows=[...old.rows];
  const run=(name:string,slot:string,fn:(r:any)=>any,seed:number)=>rows.push({...engineProbe(compiled,catalog,name,r=>{
    for(const s of ['PASSIVE','Q','W','E','R','EX']){const a=compiled.abilityDrafts[s],actual=Abilities.get(a.id);
      for(const k of ['effects','passive','cooldown','castTimeSec','range'])assert.deepEqual(actual[k],a[k],`REGISTRY_MIRROR:${s}:${k}`);}
    disarm(r);return fn(r);
  },seed),slot});
  for(const seed of [20260908,20260909]){
    const slot=id==='community7-lux'?'E':'R';
    for(const movement of ['stay','leave','enter'])run(`field-${movement}-event-anchored`,slot,r=>{
      const p={...r.world.transform.get(r.foe).pos};r.world.team.get(r.other).teamId=r.world.team.get(r.foe).teamId;
      pos(r,r.other,p.x,p.z+1.5);if(movement==='enter')pos(r,r.foe,p.x+20);
      assert.equal(r.cast(slot,{type:'point',point:p}),'ok');
      const witness=()=>r.events.filter((e:any)=>e.type==='damage'&&e.data.source===r.caster&&e.data.target===r.other&&String(e.data.origin).includes(compiled.abilityDrafts[slot].id));
      for(let t=0;t<120&&witness().length===0;t++)r.step(1);assert.equal(witness().length,1,'NO_FIRST_PULSE');
      const firstTick=r.world.tick;if(movement==='leave')pos(r,r.foe,p.x+20);if(movement==='enter')pos(r,r.foe,p.x,p.z);
      r.step(120);assert.equal(r.hits(slot).length,movement==='stay'?3:movement==='leave'?1:2,'SPATIAL_FIELD_COUNT');assert.equal(witness().length,3,'FIELD_PULSE_COUNT');
      if(id==='community7-lux'){
        assert.deepEqual(witness().map((h:any)=>h.tick),[30,60,90],'SOURCE_ONE_SECOND_CADENCE');
        assert(witness().every((h:any)=>h.data.dmgType==='magic'));const amount=Abilities.get(compiled.abilityDrafts[slot].id).effects[0].effects[0].amount;
        assert.equal(amount.damageTier,'極小');assert.equal(amount.flat,catalog.documents.get('config/damage-tiers').damage['極小']);
      }
      return {movement,firstTick,targetHits:r.hits(slot).length,witnessTicks:witness().map((h:any)=>h.tick),unknownDelayNotAClassificationLabel:id==='community7-xerath'};
    },seed);
    if(id==='community7-xerath'){
      run('Q-required-cast-four-segments-repeat-policy-unspecified','Q',r=>{
        assert.equal(r.cast('Q'),'ok');assert(r.world.abilities.get(r.caster).cast,'SOURCE_MISSING_CAST');r.step(1);assert.equal(r.hits('Q').length,0);
        for(let t=0;t<300&&r.world.abilities.get(r.caster).cast;t++)r.step(1);assert(!r.world.abilities.get(r.caster).cast,'CAST_DID_NOT_COMPLETE');
        const wave=r.world.delayed.find((w:any)=>String(w.origin).includes(compiled.abilityDrafts.Q.id));assert(wave,'NO_DELAYED_LINE');assert.equal(wave.strikes.length,4);
        r.step(60);assert(r.hits('Q').length>=1&&r.hits('Q').length<=4,'NO_HIT_OR_TOO_MANY');
        return {segments:4,hits:r.hits('Q').length,repeatPolicyNotUniquelySourceSpecified:true};
      },seed);
      run('R-reaim-rejected-after-first-observed-pulse','R',r=>{
        assert.equal(r.cast('R'),'ok');for(let t=0;t<120&&r.hits('R').length===0;t++)r.step(1);assert.equal(r.hits('R').length,1);
        const p=r.world.transform.get(r.foe).pos;
        assert.equal(castAbility(r.world,r.caster,'R',{type:'point',point:{x:p.x+6,z:p.z}}),'cooldown');r.step(120);assert.equal(r.hits('R').length,3);
        return {firstObserved:true,reaimRejected:true,originalPointHits:3};
      },seed);
      run('W-ground-explosion-affects-nearby-second-enemy','W',r=>{
        const p={...r.world.transform.get(r.foe).pos};r.world.team.get(r.other).teamId=r.world.team.get(r.foe).teamId;pos(r,r.other,p.x,p.z+1.5);
        assert.equal(r.cast('W',{type:'point',point:p}),'ok');r.step(60);assert.equal(r.hits('W').length,1);
        const second=r.events.filter((e:any)=>e.type==='damage'&&e.data.source===r.caster&&e.data.target===r.other&&String(e.data.origin).includes(compiled.abilityDrafts.W.id));
        assert.equal(second.length,1,'AREA_MISREAD_AS_SINGLE_UNIT');return {primaryHits:1,secondEnemyHits:1};
      },seed);
    }
  }
  return {id,passed:rows.filter(r=>r.passed).length,total:rows.length,rows,retainedV3ProbeNames:names,
    replacementReasons:'Source-unknown preview timing is event anchored; source-known Lux cadence stays exact. Q repeat policy is not unique source truth.',
    modelEvaluation:false,fullHeroQualified:false,trainingAdmitted:false};
}
