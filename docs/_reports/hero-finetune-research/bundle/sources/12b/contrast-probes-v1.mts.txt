/** Real-engine source-derived engineering probes, separate from IR validation. */
import assert from 'node:assert/strict';
import {engineProbe,effectNodes} from './probe-harness.mts';
import {Abilities} from '../../GGD-community-hero-forge/packages/shared/src/sim/content/registry.ts';
import {recomputeStats} from '../../GGD-community-hero-forge/packages/shared/src/sim/stats/statPipeline.ts';
import {Stat} from '../../GGD-community-hero-forge/packages/shared/src/sim/stats/statTypes.ts';
function disarm(r:any,exceptCaster=false){for(const id of [r.caster,r.foe,r.other])if(!exceptCaster||id!==r.caster)
  r.world.status.get(id).effects.push({statusId:'research.no-basics',sourceId:'fixture-only',applierId:id,expiresAtTick:100000,stacks:1,disarmed:true});}
function pos(r:any,id:any,x:number,z:number){Object.assign(r.world.transform.get(id).pos,{x,z});r.world.rebuildGrid();}
const shield=(r:any,id=r.caster)=>r.world.health.get(id).shields.filter((s:any)=>s.expiresAtTick>r.world.tick&&s.amount>0).reduce((n:number,s:any)=>n+s.amount,0);
const near=(a:number,b:number,label:string)=>assert(Math.abs(a-b)<1e-5,`${label}:${a} != ${b}`);
export function contrastProbes(compiled:any,f:any,catalog:any,seeds=[20260908,20260909]){
  const rows:any[]=[];
  const run=(name:string,slot:string,fn:(r:any)=>any,seed:number)=>rows.push({...engineProbe(compiled,catalog,name,r=>{
    for(const s of ['PASSIVE','Q','W','E','R','EX']){
      const expected=compiled.abilityDrafts[s],actual=Abilities.get(expected.id);
      for(const k of ['effects','passive','cooldown','castTimeSec','range'])assert.deepEqual(actual[k],expected[k],`REGISTRY_MIRROR:${s}:${k}`);
    }
    return fn(r);
  },seed),slot});
  const requireTier=(amount:any,tier:string)=>{assert.equal(amount.damageTier,tier,'SOURCE_TIER');
    near(amount.flat,catalog.documents.get('config/damage-tiers').damage[tier],'PER_HIT_TIER_AMOUNT');};
  for(const seed of seeds){
    for(const s of ['Q','W','E']){
      const family=f.familyBySlot[s];
      run(`${s}-${family}-spatial-timing-and-amount`,s,r=>{
        disarm(r);r.world.team.get(r.other).teamId=r.world.team.get(r.foe).teamId;
        const c={...r.world.transform.get(r.caster).pos};
        pos(r,r.foe,c.x+(family==='line'?1.5:6),c.z);pos(r,r.other,c.x+6,c.z+(family==='line'?0:1.5));
        const hitsFor=(id:any)=>r.events.filter((e:any)=>e.type==='damage'&&e.data.source===r.caster&&e.data.target===id&&String(e.data.origin).includes(compiled.abilityDrafts[s].id));
        assert.equal(r.cast(s,family==='unit'?{type:'entity',entityId:r.foe}:{type:'point',point:{x:c.x+6,z:c.z}}),'ok','SOURCE_TARGET_CONTRACT');
        assert.equal(Boolean(r.world.abilities.get(r.caster).cast),f.timing==='required','SOURCE_CAST_PHASE');
        if(f.timing==='required'){assert.equal(hitsFor(r.foe).length,0,'DAMAGE_BEFORE_CAST');r.step(1);assert.equal(hitsFor(r.foe).length,0,'DAMAGE_BEFORE_CAST');}
        r.step(120);
        assert.equal(hitsFor(r.foe).length,family==='unit'?1:3,'PRIMARY_SPATIAL_HITS');
        assert.equal(hitsFor(r.other).length,family==='field'?3:0,'SECONDARY_SPATIAL_HITS');
        assert.equal(r.hits('PASSIVE').length,0,'SPELL_TRIGGERS_BASIC_PASSIVE');
        assert(hitsFor(r.foe).every((e:any)=>e.data.dmgType==='magic'),'SOURCE_DAMAGE_TYPE');
        const nodes=effectNodes(Abilities.get(compiled.abilityDrafts[s].id).effects??[]).filter((e:any)=>e.kind==='damage');
        assert(nodes.length>0,'DAMAGE_EFFECT_MISSING');for(const n of nodes)requireTier(n.amount,'小');
        return {family,castRequirement:f.timing,primaryHits:hitsFor(r.foe).length,secondaryHits:hitsFor(r.other).length,
          ticks:hitsFor(r.foe).map((e:any)=>e.tick),sourceDamageType:'magic',sourceTier:'小'};
      },seed);
      if(family==='field')for(const movement of ['leave','enter'])run(`${s}-fixed-field-${movement}`,s,r=>{
        disarm(r);const c={...r.world.transform.get(r.caster).pos},point={x:c.x+6,z:c.z};
        pos(r,r.foe,movement==='enter'?point.x+20:point.x,point.z);
        // Witness enemy is present for pulse 1, so unknown delay does not set the test's expectation.
        r.world.team.get(r.other).teamId=r.world.team.get(r.foe).teamId;pos(r,r.other,point.x,point.z+1.5);
        assert.equal(r.cast(s,{type:'point',point}),'ok');
        const witness=()=>r.events.filter((e:any)=>e.type==='damage'&&e.data.source===r.caster&&e.data.target===r.other&&String(e.data.origin).includes(compiled.abilityDrafts[s].id));
        for(let t=0;t<120&&witness().length===0;t++)r.step(1);assert.equal(witness().length,1,'MISSING_FIRST_PULSE_WITNESS');
        const firstTick=r.world.tick;pos(r,r.foe,movement==='leave'?point.x+20:point.x,point.z);
        pos(r,r.caster,c.x-8,c.z);r.world.transform.get(r.caster).facing={x:-1,z:0};r.step(120);
        assert.equal(r.hits(s).length,movement==='leave'?1:2,'FIELD_DOES_NOT_RECHECK_FIXED_POINT');
        assert.equal(witness().length,3,'FIELD_TRACKS_CASTER_OR_REAIM');return {movement,firstTick,targetHits:r.hits(s).length,witnessHits:3};
      },seed);
    }
    run('PASSIVE-basic-magic-two-second-ICD','PASSIVE',r=>{
      disarm(r,true);r.world.nav.get(r.caster).order={kind:'attackTarget',entity:r.foe};r.step(240);
      const a=Abilities.get(compiled.abilityDrafts.PASSIVE.id);requireTier(a.passive.ranks[0].hooks[0].effects[0].amount,'極小');
      const hits=r.hits('PASSIVE');assert(hits.length>=2);assert(hits.every((e:any)=>e.data.dmgType==='magic'));
      for(let n=1;n<hits.length;n++)assert(hits[n].tick-hits[n-1].tick>=60,'PASSIVE_ICD');
      assert.equal(r.events.filter((e:any)=>e.type==='manaRestore').length,0,'UNSOURCED_PASSIVE_MANA');
      return {hits:hits.length,ticks:hits.map((e:any)=>e.tick)};
    },seed);
    run('R-self-all-shield-preserves-larger-and-expires','R',r=>{
      disarm(r);assert.equal(r.cast('R'),'ok');const h=r.world.health.get(r.caster);assert(shield(r)>0);assert.equal(shield(r,r.other),0);
      h.shields[0].amount*=2;const larger=shield(r);assert.equal(r.cast('R'),'ok');assert.equal(h.shields.length,1);near(shield(r),larger,'KEEP_LARGER');
      const hp=h.hp;for(const type of ['physical','magic','true']){
        const before=shield(r);r.world.damageQueue.push({source:r.foe,target:r.caster,amount:10,type,crit:false,origin:'research:shield'});
        r.step(1);near(h.hp,hp,'SHIELD_LEAK');assert(shield(r)<before);}
      r.step(88);assert.equal(shield(r),0,'THREE_SECOND_EXPIRY');return {types:['physical','magic','true'],selfOnly:true,keptLarger:true,expired:true};
    },seed);
    run('EX-self-max-mana-add-and-speed-not-AS','EX',r=>{
      disarm(r);const h=r.world.health.get(r.caster),other=r.world.health.get(r.other);h.mana=h.maxMana*0.2;other.mana=other.maxMana*0.2;
      const before=h.mana,otherBefore=other.mana;recomputeStats(r.world,r.caster);
      const ms=r.world.stats.get(r.caster).final[Stat.MoveSpeed],as=r.world.stats.get(r.caster).final[Stat.AttackSpeed];
      const previewManaCost=compiled.abilityDrafts.EX.manaCost[0];
      assert.equal(r.cast('EX'),'ok');near(h.mana,before-previewManaCost+h.maxMana*0.15,'MAX_MANA_ADDITIVE');near(other.mana,otherBefore,'SELF_ONLY_MANA');
      recomputeStats(r.world,r.caster);assert(r.world.stats.get(r.caster).final[Stat.MoveSpeed]>ms);near(r.world.stats.get(r.caster).final[Stat.AttackSpeed],as,'UNSOURCED_AS');
      const mod=Abilities.get(compiled.abilityDrafts.EX.id).effects.find((e:any)=>e.kind==='applyBuff').modifiers.find((m:any)=>m.stat==='ms');
      assert.equal(mod.msBonusTier,'極小','MS_TIER');r.step(91);recomputeStats(r.world,r.caster);near(r.world.stats.get(r.caster).final[Stat.MoveSpeed],ms,'SPEED_EXPIRY');
      return {selfManaFraction:0.15,basis:'max',speedTier:'極小',durationSeconds:3,noAttackSpeedBuff:true,previewManaCost};
    },seed);
  }
  return {passed:rows.filter(r=>r.passed).length,total:rows.length,rows,allSixSlotsCovered:true,
    exhaustiveMechanicCoverage:false,fullHeroQualified:false,releaseQualified:false};
}
