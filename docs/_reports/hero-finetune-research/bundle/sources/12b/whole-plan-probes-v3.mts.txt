/** Source-specific acceptance fixtures, never source-specific engine code. */
import assert from 'node:assert/strict';
import {engineProbe} from './probe-harness.mts';
import {castAbility} from '../../GGD-community-hero-forge/packages/shared/src/sim/abilities/abilitySystem.ts';
import {hasStatus} from '../../GGD-community-hero-forge/packages/shared/src/sim/effects/effectCommon.ts';
import {recomputeStats} from '../../GGD-community-hero-forge/packages/shared/src/sim/stats/statPipeline.ts';
import {Abilities} from '../../GGD-community-hero-forge/packages/shared/src/sim/content/registry.ts';
import {Stat} from '../../GGD-community-hero-forge/packages/shared/src/sim/stats/statTypes.ts';
const near=(a:number,b:number,msg:string)=>assert(Math.abs(a-b)<1e-5,`${msg}:${a} != ${b}`);
function disarm(r:any,exceptCaster=false){
  // Fixture-only isolation of ability events. Passive scenarios leave caster armed.
  for(const id of [r.caster,r.foe,r.other])if(!exceptCaster||id!==r.caster)r.world.status.get(id).effects.push({
    statusId:'research.no-basics',sourceId:'fixture-only',applierId:id,expiresAtTick:100000,stacks:1,disarmed:true});
}
function pos(r:any,id:any,x:number,z?:number){
  const t=r.world.transform.get(id);t.pos.x=x;if(z!==undefined)t.pos.z=z;r.world.rebuildGrid();
}
const shieldTotal=(r:any,id=r.caster)=>r.world.health.get(id).shields.filter((s:any)=>s.expiresAtTick>r.world.tick&&s.amount>0).reduce((n:number,s:any)=>n+s.amount,0);
function status(r:any,id:any,kind:string){return r.world.status.get(id).effects.find((s:any)=>s[kind]&&s.expiresAtTick>r.world.tick);}
function stat(r:any,key:string,id=r.caster){recomputeStats(r.world,id);return r.world.stats.get(id).final[key];}
export function wholePlanProbes(compiled:any,id:string,catalog:any,onlyNames?:string[]){
  assert(['community7-lux','community7-xerath'].includes(id));
  const rows:any[]=[];let seed=0;
  const requireTier=(amount:any,tier:string)=>{
    const config=catalog.documents.get('config/damage-tiers');
    assert(config?.enabled&&Number.isFinite(config.damage[tier]),'PINNED_DAMAGE_TIER_UNAVAILABLE');
    assert.equal(amount.damageTier,tier,'SOURCE_DAMAGE_TIER');
    near(amount.flat,config.damage[tier],'PER_HIT_SOURCE_TIER_AMOUNT');
  };
  const probe=(name:string,slot:string,fn:(r:any)=>any)=>{
    if(onlyNames&&!onlyNames.includes(name))return;
    const row=engineProbe(compiled,catalog,name,r=>{
      // Validate actual registry input, not just a mutated parallel JSON mirror.
      for(const s of ['PASSIVE','Q','W','E','R','EX']){
        const expected=compiled.abilityDrafts[s],actual=Abilities.get(expected.id);
        for(const key of ['effects','passive','cooldown','castTimeSec','range'])
          assert.deepEqual(actual[key],expected[key],`RUNTIME_MIRROR_MISMATCH:${s}:${key}`);
      }
      return fn(r);
    },seed);rows.push({...row,slot});
  };
  for(seed of [20260908,20260909]){
    probe('P-magic-ICD-without-mark-or-mana-restore','PASSIVE',r=>{
      disarm(r,true);r.world.nav.get(r.caster).order={kind:'attackTarget',entity:r.foe};r.step(240);
      const passive=Abilities.get(compiled.abilityDrafts.PASSIVE.id);
      requireTier(passive.passive.ranks[0].hooks[0].effects[0].amount,'極小');
      const hits=r.hits('PASSIVE');assert(hits.length>=2,'NO_PASSIVE_WITHOUT_MARK');
      assert(hits.every((h:any)=>h.data.dmgType==='magic'),'PASSIVE_DAMAGE_TYPE');
      for(let i=1;i<hits.length;i++)assert(hits[i].tick-hits[i-1].tick>=60,'PASSIVE_ICD');
      assert.equal(r.events.filter((e:any)=>e.type==='manaRestore').length,0,'OLD_PASSIVE_MANA_MECHANIC');
      return {procTicks:hits.map((e:any)=>e.tick),type:'magic',withoutPrerequisiteMarks:true};
    });
    const fieldSlot=id==='community7-lux'?'E':'R';
    for(const movement of ['stay','leave','enter'])probe(`field-${movement}`,fieldSlot,r=>{
      disarm(r);const point={...r.world.transform.get(r.foe).pos},far=point.x+20;
      if(movement==='enter')pos(r,r.foe,far);
      assert.equal(r.cast(fieldSlot,{type:'point',point}),'ok');
      const first=id==='community7-lux'?31:4;r.step(first);
      if(movement==='leave')pos(r,r.foe,far);if(movement==='enter')pos(r,r.foe,point.x,point.z);
      r.step(120);const expected=movement==='stay'?3:movement==='leave'?1:2;
      assert.equal(r.hits(fieldSlot).length,expected,'SPATIAL_FIELD_COUNT');
      assert.equal(r.hits('PASSIVE').length,0,'SKILL_DAMAGE_PROC_PASSIVE');
      if(movement==='stay'&&id==='community7-lux'){
        requireTier(Abilities.get(compiled.abilityDrafts.E.id).effects[0].effects[0].amount,'極小');
        assert.deepEqual(r.hits(fieldSlot).map((h:any)=>h.tick),[30,60,90],'ONE_SECOND_CADENCE');
        assert(r.hits(fieldSlot).every((h:any)=>h.data.dmgType==='magic'),'FIELD_DAMAGE_TYPE');
        const amounts=r.hits(fieldSlot).map((h:any)=>h.data.amount);near(amounts[0],amounts[1],'PER_PULSE_AMOUNT');near(amounts[1],amounts[2],'PER_PULSE_AMOUNT');
      }
      return {movement,hits:r.hits(fieldSlot).length,ticks:r.hits(fieldSlot).map((e:any)=>e.tick)};
    });
    probe('field-does-not-follow-caster-or-hit-ally',fieldSlot,r=>{
      disarm(r);const point={...r.world.transform.get(r.foe).pos};pos(r,r.other,point.x,point.z+1.5);
      assert.equal(r.cast(fieldSlot,{type:'point',point}),'ok');pos(r,r.caster,point.x-12);
      r.step(125);assert.equal(r.hits(fieldSlot).length,3,'FOLLOWED_CASTER_INSTEAD_OF_GROUND');
      assert.equal(r.events.filter((e:any)=>e.type==='damage'&&e.data.source===r.caster&&e.data.target===r.other).length,0,'FRIENDLY_FIRE');
      return {hits:3,allyDamage:0};
    });
    probe('whole-kit-no-resource-gates-or-automatic-displacement','ALL',r=>{
      disarm(r);const casterStart={...r.world.transform.get(r.caster).pos};
      for(const slot of ['Q','W','E','R','EX']){assert.equal(r.cast(slot),'ok',`CAST_${slot}`);r.step(150);}
      assert.equal(r.events.filter((e:any)=>e.type==='displace'&&e.data.id===r.caster).length,0,'EXTRA_SELF_MOVEMENT');
      assert.equal(r.hits('PASSIVE').length,0,'SPELLS_TRIGGERED_ON_BASIC_PASSIVE');
      near(r.world.transform.get(r.caster).pos.x,casterStart.x,'CASTER_NOT_MOVEMENT_HERO');
      return {castSlots:['Q','W','E','R','EX'],extraSelfDisplacements:0};
    });
    if(id==='community7-lux'){
      probe('Q-one-enemy-root-exact-duration-no-extra-hit','Q',r=>{
        disarm(r);r.world.team.get(r.other).teamId=r.world.team.get(r.foe).teamId;
        const p=r.world.transform.get(r.foe).pos;pos(r,r.other,p.x,p.z+1.4);
        assert.equal(r.cast('Q'),'ok');const root=status(r,r.foe,'root');assert(root,'MISSING_ROOT');
        assert.equal(root.expiresAtTick-r.world.tick,24,'ROOT_DURATION');assert(!status(r,r.other,'root'),'SECOND_ENEMY_ROOT');
        r.step(23);assert(hasStatus(r.world,r.foe,root.statusId));r.step(1);assert(!hasStatus(r.world,r.foe,root.statusId));
        assert.equal(r.hits('Q').length,0,'UNSOURCED_Q_DAMAGE');return {rootTicks:24,targets:1,extraDamage:0};
      });
      for(const type of ['physical','magic','true'])probe(`W-absorbs-${type}`,'W',r=>{
        disarm(r);assert.equal(r.cast('W'),'ok');const h=r.world.health.get(r.caster),hp=h.hp,before=shieldTotal(r);
        assert(before>0);r.world.damageQueue.push({source:r.foe,target:r.caster,amount:10,type,crit:false,origin:'research:incoming'});
        r.step(1);near(h.hp,hp,'SHIELD_LEAKED');assert(shieldTotal(r)<before,'SHIELD_NOT_EXERCISED');
        assert.equal(shieldTotal(r,r.other),0,'SHIELDED_ALLY');return {type,absorbed:before-shieldTotal(r)};
      });
      probe('W-keep-larger-and-expire','W',r=>{
        disarm(r);assert.equal(r.cast('W'),'ok');const h=r.world.health.get(r.caster);assert.equal(h.shields.length,1);
        h.shields[0].amount*=2;const greater=shieldTotal(r);assert.equal(r.cast('W'),'ok');
        assert.equal(h.shields.length,1,'STACKED_SHIELD');near(shieldTotal(r),greater,'REPLACED_GREATER_SHIELD');
        r.step(91);assert.equal(shieldTotal(r),0,'SHIELD_NOT_EXPIRED');
        const hp=h.hp;r.world.damageQueue.push({source:r.foe,target:r.caster,amount:10,type:'true',crit:false,origin:'research:expired-shield'});
        r.step(1);near(hp-h.hp,10,'EXPIRED_SHIELD_STILL_ABSORBED');
        return {preserved:greater,expiryTicks:91,postExpiryDamage:hp-h.hp};
      });
      probe('R-four-overlap-hits-frozen-direction','R',r=>{
        disarm(r);assert.equal(r.cast('R'),'ok');r.step(4);assert.equal(r.hits('R').length,1);
        r.world.transform.get(r.caster).facing={x:-1,z:0};pos(r,r.caster,r.world.transform.get(r.caster).pos.x-8);
        r.step(30);assert.equal(r.hits('R').length,4,'LINE_LOST_REPEAT_OR_CHANGED_ANCHOR');
        assert.deepEqual(r.hits('R').map((e:any)=>e.tick),[3,6,9,12]);return {hits:4,ticks:[3,6,9,12]};
      });
      probe('EX-self-heal-and-three-second-speed-no-attack-buff','EX',r=>{
        disarm(r);const h=r.world.health.get(r.caster);h.hp=h.maxHp*0.5;const hp=h.hp,ms=stat(r,Stat.MoveSpeed),as=stat(r,Stat.AttackSpeed);
        const allyMs=stat(r,Stat.MoveSpeed,r.other);assert.equal(r.cast('EX'),'ok');assert(h.hp>hp,'NO_SELF_HEAL');
        assert(stat(r,Stat.MoveSpeed)>ms,'NO_SPEED_BUFF');
        const mod=Abilities.get(compiled.abilityDrafts.EX.id).effects[0].modifiers.find((m:any)=>m.stat==='ms');
        assert.equal(mod?.msBonusTier,'極小','SOURCE_SPEED_TIER');
        near(mod.value,catalog.documents.get('config/move-speed-tiers').bonus['極小'],'SOURCE_SPEED_TIER_VALUE');near(stat(r,Stat.AttackSpeed),as,'EXTRA_ATTACK_SPEED');
        near(stat(r,Stat.MoveSpeed,r.other),allyMs,'BUFFED_ALLY');r.step(91);near(stat(r,Stat.MoveSpeed),ms,'BUFF_NOT_EXPIRED');
        return {healed:h.hp-hp,speedExpired:true,allyBuff:false};
      });
    }else{
      probe('Q-windup-four-scheduled-segments','Q',r=>{
        disarm(r);assert(compiled.abilityDrafts.Q.castTimeSec>0,'MISSING_WINDUP');assert.equal(r.cast('Q'),'ok');
        r.step(1);assert.equal(r.hits('Q').length,0,'HIT_BEFORE_WINDUP');r.step(9);
        const wave=r.world.delayed.find((w:any)=>String(w.origin).includes(compiled.abilityDrafts.Q.id));
        assert(wave,'MISSING_DELAYED_LINE');assert.equal(wave.strikes.length,4,'LINE_SEGMENT_COUNT');
        r.step(30);assert.equal(r.hits('Q').length,1,'PREVIEW_REPEAT_POLICY_CHANGED');
        return {queued:4,hits:1,repeatPolicyIsProposal:true};
      });
      for(const slot of ['Q','R'])probe(`${slot}-finite-source-range`,slot,r=>{
        disarm(r);const a=compiled.abilityDrafts[slot],p=r.world.transform.get(r.caster).pos;
        assert.equal(a.range,slot==='Q'?8:12,'SOURCE_RANGE_TIER');
        const start={...p},requested={x:p.x+a.range+10,z:p.z};pos(r,r.foe,requested.x,requested.z);
        const outcome=r.cast(slot,{type:'point',point:requested});assert.equal(outcome,'ok','GROUND_CAST_CLAMPS');
        r.step(60);
        const event=r.events.find((e:any)=>e.type==='abilityCast'&&e.data.abilityId===a.id);
        assert(event?.data.point,'MISSING_CAST_POINT');
        const actualDistance=Math.hypot(event.data.point.x-start.x,event.data.point.z-start.z);
        near(actualDistance,a.range,'GROUND_CAST_NOT_RANGE_CLAMPED');
        assert.equal(r.hits(slot).length,0,'FAR_TARGET_HIT');
        return {range:a.range,outcome,requested,actualPoint:event.data.point,actualDistance,farTargetHits:0};
      });
      probe('W-single-ground-explosion-magic','W',r=>{
        disarm(r);assert.equal(r.cast('W'),'ok');r.step(60);assert.equal(r.hits('W').length,1,'W_EXPLOSION_COUNT');
        assert.equal(r.hits('W')[0].data.dmgType,'magic');
        requireTier(Abilities.get(compiled.abilityDrafts.W.id).effects[0].amount,'小');return {hits:1,type:'magic'};
      });
      for(const distance of [2,5])probe(`E-fixed-stun-distance-${distance}`,'E',r=>{
        disarm(r);pos(r,r.foe,r.world.transform.get(r.caster).pos.x+distance);assert.equal(r.cast('E'),'ok');
        const stun=status(r,r.foe,'stun');assert(stun,'MISSING_STUN');assert.equal(stun.expiresAtTick-r.world.tick,24,'STUN_SCALED_BY_DISTANCE');
        r.step(25);assert.equal(r.hits('E').length,1);assert(!status(r,r.foe,'stun'));return {distance,stunTicks:24};
      });
      probe('R-cannot-reaim-during-barrage','R',r=>{
        disarm(r);assert.equal(r.cast('R'),'ok');r.step(4);
        const target={type:'point' as const,point:{x:r.world.transform.get(r.foe).pos.x+6,z:r.world.transform.get(r.foe).pos.z}};
        assert.equal(castAbility(r.world,r.caster,'R',target),'cooldown');r.step(60);assert.equal(r.hits('R').length,3);
        return {secondCast:'cooldown',originalLandingHits:3};
      });
      probe('EX-adds-fifteen-percent-self-mana-and-keeps-cooldown','EX',r=>{
        disarm(r);const h=r.world.health.get(r.caster);h.mana=h.maxMana*0.5;const before=h.mana,cost=compiled.abilityDrafts.EX.manaCost[0];
        assert.equal(r.cast('EX'),'ok');near(h.mana,before-cost+h.maxMana*0.15,'WRONG_MANA_RESTORE');
        assert(shieldTotal(r)>0,'MISSING_EX_SHIELD');assert(h.shields.every((s:any)=>s.absorbs==='magic'),'WRONG_SHIELD_TYPE');
        assert.equal(castAbility(r.world,r.caster,'EX',{type:'self'}),'cooldown');return {fraction:0.15,cost,secondCast:'cooldown'};
      });
      for(const type of ['physical','magic'])probe(`EX-shield-filter-${type}`,'EX',r=>{
        disarm(r);assert.equal(r.cast('EX'),'ok');const h=r.world.health.get(r.caster),hp=h.hp,before=shieldTotal(r);
        r.world.damageQueue.push({source:r.foe,target:r.caster,amount:10,type,crit:false,origin:'research:incoming'});r.step(1);
        if(type==='magic'){near(h.hp,hp,'MAGIC_SHIELD_LEAKED');assert(shieldTotal(r)<before);}
        else{assert(h.hp<hp,'MAGIC_SHIELD_BLOCKED_PHYSICAL');near(shieldTotal(r),before,'PHYSICAL_CONSUMED_MAGIC_POOL');}
        return {type,hpLost:hp-h.hp,shieldLost:before-shieldTotal(r)};
      });
    }
  }
  return {id,total:rows.length,passed:rows.filter(r=>r.passed).length,rows,
    allSlotsExercised:[...new Set(rows.map(r=>r.slot))],fullHeroQualified:false,trainingAdmitted:false};
}
