// Adapted from batch2-37 at cd5e98945; source SHA-256 4e04220dfdfcc6eb93e7df9d7d7a2645e3c6c20f9b948d8144202a8a57cf3f0f.
// Evaluation fixtures only. No production registry or engine file is changed.
import {register} from 'tsx/esm/api'; register();
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const [sim,registries,baselineApi,abilityApi,mobApi]=await Promise.all([
  'sim/index.ts','sim/content/registryContext.ts','content/heroForge/simulationBaseline.ts','sim/abilities/abilitySystem.ts','sim/mobs.ts',
].map(p=>import(resolve(root,'packages/shared/src',p))));
export const hash=x=>createHash('sha256').update(Buffer.isBuffer(x)||typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const copy=x=>structuredClone(x);
const slots=['PASSIVE','Q','W','E','R','EX'];
const ccStatusIds=new Set(readdirSync(resolve(root,'content/status-effects')).filter(f=>f.endsWith('.json')&&!f.startsWith('_')).flatMap(f=>{
  const d=JSON.parse(readFileSync(resolve(root,'content/status-effects',f),'utf8'));return d.tags?.includes('cc')?[d.id]:[];
}));

export function loadBaseline(){
  const docs=new Map();
  for(const c of readdirSync(resolve(root,'content'),{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name).sort()){
    for(const f of readdirSync(resolve(root,'content',c)).sort())if(f.endsWith('.json')&&!f.startsWith('_')){
      const d=JSON.parse(readFileSync(resolve(root,'content',c,f),'utf8'));if(d.id)docs.set(`${c}/${d.id}`,d);
    }
  }
  return {docs,baseline:baselineApi.createHeroSimulationBaseline(docs)};
}

function matches(node,rule,hookOn){
  if(!node||typeof node!=='object')return false;
  if(rule.kind!==undefined&&node.kind!==rule.kind)return false;
  if(rule.statusId!==undefined&&node.statusId!==rule.statusId)return false;
  if(rule.hookOn!==undefined&&hookOn!==rule.hookOn)return false;
  if(rule.conditionalOnly&&!node.condition)return false;
  if(rule.conditionStatus!==undefined&&node.condition?.statusId!==rule.conditionStatus)return false;
  if(rule.stat!==undefined&&!node.modifiers?.some(m=>m.stat===rule.stat))return false;
  if(rule.hookOn!==undefined&&rule.kind===undefined&&rule.statusId===undefined&&rule.stat===undefined)return node.on===rule.hookOn;
  return rule.kind!==undefined||rule.statusId!==undefined||rule.stat!==undefined;
}

/** Mutate only a fresh test copy; log every removed node and reject a no-op. */
export function ablateDraft(original,selection){
  const draft=copy(original),removed=[];
  for(const rule of Array.isArray(selection)?selection:[selection]){
    const a=draft.abilityDrafts[rule.slot];assert(a,`ABLATION_UNKNOWN_SLOT:${rule.slot}`);
    const visit=(v,path,hookOn)=>{
      if(Array.isArray(v))return v.filter((n,i)=>{
        const on=n?.on??hookOn;
        if((rule.path===undefined||`${path}/${i}`===rule.path)&&matches(n,rule,on)){
          removed.push({slot:rule.slot,path:`${path}/${i}`,node:copy(n)});return false;
        }
        return true;
      }).map((n,i)=>visit(n,`${path}/${i}`,n?.on??hookOn));
      if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,n])=>[k,visit(n,`${path}/${k}`,v.on??hookOn)]));
      return v;
    };
    draft.abilityDrafts[rule.slot]=visit(a,'',undefined);
  }
  assert(removed.length,'ABLATION_MATCHED_NO_NODE');
  for(const slot of ['Q','W','E','R'])draft.champion.abilities[slot]=draft.abilityDrafts[slot];
  return {draft,removed};
}

function fixtureChampion(champion){
  // A transparent adversarial fixture: same base body, no candidate hooks.
  // Q/W/E are fixed true/physical/magic 60 damage test attacks, not teacher data.
  const c=copy(champion);c.id=`${champion.id}.evaluation-fixture`;
  delete c.passive;delete c.exAbility;delete c.transform;c.passiveAbility=`${c.id}.control`;
  c.abilities=Object.fromEntries(['Q','W','E','R'].map((slot,i)=>[slot,{
    id:`${c.id}.${slot.toLowerCase()}`,name:`Evaluation ${slot}`,slot,castType:'targeted',
    maxRank:1,range:40,cooldown:[0],manaCost:[0],castTimeSec:0,recoverySec:0,
    targetsEnemies:true,effects:[{kind:'damage',damageType:['true','physical','magic','true'][i],amount:{flat:60}}],
  }]));
  c.abilities.R.targetsEnemies=false;
  c.abilities.R.effects=[{kind:'heal',amount:{flat:60}}];
  return c;
}

const serial=x=>x===undefined?null:JSON.parse(JSON.stringify(x,(_k,v)=>v instanceof Map?Object.fromEntries(v):v instanceof Set?[...v]:v));

/**
 * Run real IntentFrames in the shipped arena. setup adjusts only initial body
 * position/health/mana, never required statuses, cooldowns or named resources.
 * Steps: cast, attack, move, stop, wait. Every step may specify waitSec.
 */
export function runSequence(original,{baseline,seed=1234,setup={},steps=[],remove,rank=1,recordFrames=true,relatedChampions=[]}={}){
  assert(baseline,'BASELINE_REQUIRED');
  const mutation=remove?ablateDraft(original,remove):{draft:copy(original),removed:[]};
  const draft=mutation.draft,fixture=fixtureChampion(draft.champion);
  const fixtureControl={...fixture.abilities.Q,id:fixture.passiveAbility,slot:'PASSIVE',innateKind:'active',effects:[{kind:'applyStatus',statusId:'root',duration:.6,root:true}]};
  const context=registries.extendRegistryContext(baseline.context,'batch2-sequence',()=>{
    for(const a of Object.values(draft.abilityDrafts))sim.Abilities.register(a.id,a);
    for(const a of Object.values(fixture.abilities))sim.Abilities.register(a.id,a);
    sim.Abilities.register(fixtureControl.id,fixtureControl);
    for(const champion of relatedChampions)sim.registerChampion(champion,{overrideAbilities:true});
    sim.registerChampion(draft.champion,{overrideAbilities:true});
    sim.registerChampion(fixture,{overrideAbilities:true});
  });
  return registries.withRegistryContext(context,()=>{
    const world=new sim.SimWorld(baseline.arena,seed);
    Object.assign(world,copy(baseline.rules));world.ultGateOverride=true;
    // Combat gates must run, while the existing practice-seat surface prevents
    // unrequested auto-acquisition. Explicit attack/move/cast orders still run.
    world.combatActive=true;
    const arenaRules=JSON.parse(readFileSync(resolve(root,'content/config/arena-rules.json'),'utf8'));
    world.mobRules=mobApi.mobRulesFromConfig(arenaRules.mobWaves,world.dt,1,world.combatEnv);
    world.mobRules.inertSeats=new Set([0,1,2,3]);world.mobRules.autoSchedule=false;
    const center=world.arena.zones[0].center;
    const actors={},seats={caster:0,foe:1,ally:2,far:3};
    const defaults={caster:{x:0,z:0,hpPct:.5,manaPct:1},foe:{x:2,z:0,hpPct:.5,manaPct:1},ally:{x:0,z:2,hpPct:.5,manaPct:1},far:{x:14,z:0,hpPct:.5,manaPct:1}};
    for(const [name,seat]of Object.entries(seats)){
      const p={...defaults[name],...setup[name]};
      assert(!('statuses'in p)&&!('marks'in p),'NO_REQUIRED_STATUS_OR_RESOURCE_INJECTION');
      actors[name]=sim.spawnChampion(world,{championId:name==='caster'?draft.champion.id:fixture.id,seatId:seat,teamId:name==='foe'||name==='far'?1:0,pos:{x:center.x+p.x,z:center.z+p.z},zone:0,level:setup.level??18});
    }
    world.step(new Map());
    for(const [name,id]of Object.entries(actors)){
      const ab=world.abilities.get(id);ab.unspentPoints=100;
      for(const slot of ['Q','W','E','R'])while(ab.slots[slot].rank<rank&&sim.rankUpAbility(world,id,slot)){}
      if(name==='caster')abilityApi.learnEx(world,id);
      const p={...defaults[name],...setup[name]},h=world.health.get(id);
      const fraction=n=>n>1?n/100:n;
      h.hp=h.maxHp*fraction(p.hpPct);h.mana=h.maxMana*fraction(p.manaPct);
    }
    const snapshot=()=>Object.fromEntries(Object.entries(actors).map(([name,id])=>{
      const h=world.health.get(id),a=world.abilities.get(id),s=world.stats.get(id),pos=world.transform.get(id)?.pos;
      const cd=Object.fromEntries(slots.map(slot=>[slot,(slot==='PASSIVE'?a?.passiveSlot:slot==='EX'?a?.exSlot:a?.slots[slot])?.cooldownRemainingTicks??0]));
      const owned=[...world.summon].filter(([,v])=>v.ownerId===id).map(([entity,v])=>({entity,...serial(v),alive:world.health.get(entity)?.alive??false,pos:serial(world.transform.get(entity)?.pos)}));
      return[name,{id,hp:h?.hp??0,maxHp:h?.maxHp??0,mana:h?.mana??0,maxMana:h?.maxMana??0,alive:h?.alive??false,
        x:(pos?.x??center.x)-center.x,z:(pos?.z??center.z)-center.z,
        shield:(h?.shields??[]).filter(p=>p.expiresAtTick>world.tick&&p.amount>0).reduce((n,p)=>n+p.amount,0),
        shields:serial((h?.shields??[]).filter(p=>p.expiresAtTick>world.tick&&p.amount>0)),rawShields:serial(h?.shields??[]),
        statuses:serial(world.status.get(id)?.effects??[]),cooldowns:cd,stats:serial(s?.final??{}),sources:serial((s?.sources??[]).map(({id,kind,expiresAtTick,modifiers,hookLastFired})=>({id,kind,expiresAtTick,modifiers,hookLastFired}))),
        marks:serial(world.marks.get(id)??new Map()),summons:owned.filter(s=>s.alive).length,summonBodies:owned,
        inAlternateForm:world.championForm.get(id)?.index===1?1:0,form:serial(world.championForm.get(id)??null)}];
    }));
    const initial=snapshot(),frames=[],events=[],results=[];
    const record=()=>{const es=serial(world.events);events.push(...es);if(recordFrames)frames.push({tick:world.tick,digest:world.digest(),actors:snapshot(),events:es});};
    const targetFor=(action,ability,actor)=>{
      if(action.target&&typeof action.target==='object')return action.target;
      const who=action.target??(ability.targetsEnemies===false?(actor==='caster'?'ally':'foe'):(actor==='foe'||actor==='far'?'caster':'foe'));
      const id=actors[who];assert(id!==undefined,`UNKNOWN_ACTOR:${who}`);
      if(ability.castType==='self')return{type:'self'};
      if(ability.castType==='targeted')return{type:'entity',entityId:id};
      if(ability.castType==='skillshot')return{type:'dir',dir:action.direction??{x:1,z:0}};
      return{type:'point',point:action.point?{x:center.x+action.point.x,z:center.z+action.point.z}:{...world.transform.get(id).pos}};
    };
    for(const step of steps){
      const actor=step.actor??'caster',id=actors[actor];assert(id!==undefined,`UNKNOWN_ACTOR:${actor}`);
      const before=snapshot(),start=events.length,startTick=world.tick;
      let frame={commands:[]},ability;
      if(step.kind==='cast'){
        ability=actor==='caster'?draft.abilityDrafts[step.slot]:step.slot==='PASSIVE'?fixtureControl:fixture.abilities[step.slot];assert(ability,`UNKNOWN_CAST_SLOT:${step.slot}`);
        frame.commands.push({kind:'castAbility',slot:step.slot,target:targetFor(step,ability,actor)});
      }else if(step.kind==='attack')frame.order={kind:'attackTarget',entity:actors[step.target??(actor==='caster'?'foe':'caster')]};
      else if(step.kind==='move')frame.order={kind:'move',point:{x:center.x+step.point.x,z:center.z+step.point.z}};
      else if(step.kind==='stop')frame.order={kind:'stop'};
      else assert.equal(step.kind,'wait','UNKNOWN_STEP');
      const count=Math.max(1,Math.ceil((step.waitSec??1)/world.dt));
      for(let t=0;t<count;t++){world.step(t===0?new Map([[seats[actor],frame]]):new Map());record();}
      const emitted=events.slice(start),castEvents=emitted.filter(e=>e.type==='abilityCast'&&e.data.caster===id&&e.data.abilityId===ability?.id);
      const rejections=emitted.filter(e=>e.type==='castRejected'&&e.data.entity===id&&e.data.slot===step.slot);
      results.push({step:copy(step),startTick,endTick:world.tick,before,after:snapshot(),events:emitted,
        ...(step.kind==='cast'?{accepted:castEvents.length>0,rejections}:{}),digest:world.digest()});
    }
    return{schema:'ggd-batch2-sim-sequence@1',seed,baselineDigest:baseline.digest,compiledSha256:hash(original),mutation:mutation.removed,
      fixture:{opponent:'same base body without candidate hooks; Q/W/E fixed 60 true/physical/magic damage; R 60 allied healing; PASSIVE 0.6 second existing root',ultGateOverride:true,combatActive:true,practiceInertSeats:[0,1,2,3],mobWavesUnarmed:world.mobTicks===-1,rank},
      actors,initial,after:snapshot(),steps:results,events,frames};
  });
}

export function metricValue(snapshot,metric){
  const a=snapshot[metric.actor??'caster'];assert(a,'METRIC_ACTOR_MISSING');
  const [kind,key]=metric.field.split(':');
  if(kind==='status')return a.statuses.filter(s=>s.statusId===key).reduce((n,s)=>n+(s.stacks??1),0)+(a.marks[key]?.count??0);
  if(kind==='cooldown')return a.cooldowns[key];
  if(kind==='stat')return a.stats[key]??0;
  if(kind==='distance')return Math.hypot(a.x-snapshot[key].x,a.z-snapshot[key].z);
  assert.equal(typeof a[kind],'number',`UNKNOWN_METRIC:${metric.field}`);return a[kind];
}

export function metricDelta(run,index,metric){
  const step=run.steps[index];assert(step,'METRIC_STEP_MISSING');
  if(metric.event){
    const id=run.actors[metric.actor??'caster'];
    return run.steps.slice(index).flatMap(s=>s.events).filter(e=>e.type===metric.event
      &&(metric.actorKey===undefined||e.data[metric.actorKey]===id)
      &&(metric.origin===undefined||e.data.origin===metric.origin)).reduce((n,e)=>n+(metric.eventField?Number(e.data[metric.eventField]??0):1),0);
  }
  const baseline=metricValue(step.before,metric);
  if(metric.sample==='max'||(metric.field.startsWith('status:')&&metric.sample!=='final')){
    const observed=run.frames.filter(f=>f.tick>step.startTick).map(f=>metricValue(f.actors,metric));
    return Math.max(baseline,...observed)-baseline;
  }
  return metricValue(run.after,metric)-baseline;
}

/** Four matched timelines estimate the source's effect on the tested response. */
export function evaluateCombo(draft,combo,options){
  assert(combo.remove,'COMBO_ABLATION_REQUIRED');
  const action=(slot,actor,target,waitSec)=>slot==='ATTACK'
    ?{kind:'attack',actor:actor??'caster',target:target??'foe',waitSec}
    :{kind:'cast',slot,actor:actor??'caster',...(target?{target}:{}),waitSec};
  const prefix=combo.beforeSteps??[];
  const source=combo.sourceSteps??[{...action(combo.source,combo.sourceActor,combo.sourceTarget,combo.waitSec??.8),...(combo.sourcePoint?{point:combo.sourcePoint}:{})}];
  const response=combo.targetSteps??[{...action(combo.target,combo.targetActor,combo.targetTarget,combo.observeSec??1.2),...(combo.targetPoint?{point:combo.targetPoint}:{})},...(combo.afterSteps??[])];
  const normalSteps=combo.steps??[...prefix,...source,...response];
  const index=combo.responseIndex??prefix.length+source.length;
  assert(index>0&&index<normalSteps.length,'SOURCE_AND_RESPONSE_STEPS_REQUIRED');
  const sourceIndexes=combo.sourceIndexes??source.map((_,i)=>prefix.length+i);
  const noSourceSteps=normalSteps.map((s,i)=>sourceIndexes.includes(i)?{kind:'wait',waitSec:s.waitSec??1}:s);
  const common={...options,setup:combo.setup??options.setup,seed:combo.seed??options.seed??1234};
  const prepared=runSequence(draft,{...common,steps:normalSteps});
  const preparedAblated=runSequence(draft,{...common,steps:normalSteps,remove:combo.remove});
  const unprepared=runSequence(draft,{...common,steps:noSourceSteps});
  const unpreparedAblated=runSequence(draft,{...common,steps:noSourceSteps,remove:combo.remove});
  const runs={prepared,preparedAblated,unprepared,unpreparedAblated};
  const validationErrors=[];
  const check=(ok,error)=>{if(!ok)validationErrors.push(error);};
  const controls=['preparedAblated','unprepared','unpreparedAblated'];
  const controlRejections=combo.expectedControlResponseRejections??{};
  check(typeof controlRejections==='object'&&!Array.isArray(controlRejections)
    &&Object.entries(controlRejections).every(([key,reason])=>controls.includes(key)&&typeof reason==='string'&&reason.length>0),'INVALID_CONTROL_REJECTION_DECLARATION');
  check(!combo.expectedResponseRejection||Object.keys(controlRejections).length===0,'CONFLICTING_RESPONSE_REJECTION_DECLARATIONS');
  if(combo.expectedResponseRejection||Object.keys(controlRejections).length)check(normalSteps[index].kind==='cast','REJECTION_DECLARATION_REQUIRES_RESPONSE_CAST');
  for(const i of sourceIndexes)if(prepared.steps[i].step.kind==='cast')check(prepared.steps[i].accepted,`SOURCE_CAST_REJECTED:${JSON.stringify(prepared.steps[i].rejections)}`);
  for(const [key,run]of Object.entries(runs))for(const [i,step]of run.steps.entries())if(i>=index&&step.step.kind==='cast'){
    const expected=i===index?(key==='prepared'?combo.expectedResponseRejection:controlRejections[key]):undefined;
    if(expected){
      const exact=!step.accepted&&step.rejections.length>0&&step.rejections.every(e=>e.data.reason===expected);
      check(exact,key==='prepared'?'EXPECTED_RESPONSE_REJECTION_NOT_OBSERVED':`EXPECTED_CONTROL_RESPONSE_REJECTION_NOT_OBSERVED:${key}:${expected}`);
    }else check(step.accepted,key==='prepared'?`RESPONSE_CAST_REJECTED:${JSON.stringify(step.rejections)}`:`UNDECLARED_CONTROL_RESPONSE_REJECTION:${key}:${i}:${JSON.stringify(step.rejections)}`);
  }
  const values=Object.fromEntries(Object.entries(runs).map(([key,run])=>[key,metricDelta(run,index,combo.metric)]));
  const preparedContribution=values.prepared-values.preparedAblated;
  const unpreparedContribution=values.unprepared-values.unpreparedAblated;
  const interaction=preparedContribution-unpreparedContribution;
  const epsilon=combo.epsilon??1e-6;
  const passed=validationErrors.length===0&&(combo.expect==='increase'?interaction>epsilon:combo.expect==='decrease'?interaction< -epsilon:false);
  return{schema:'ggd-batch2-causal-combo@1',source:combo.source,target:combo.target,metric:combo.metric,expect:combo.expect,...(combo.note?{note:combo.note}:{}),
    values,preparedContribution,unpreparedContribution,interaction,status:passed?'passed':'failed',validationErrors,runs,
    method:'Difference in response-window deltas across four matched timelines. Source-only residuals remain in both prepared runs and are subtracted; no required status/resource is injected.',
    limits:['Nonlinear damage caps, deaths and position changes remain visible in snapshots; origin-specific metrics may be required for an intended attribution.']};
}

const nodes=(x,p,out=[])=>{if(x&&typeof x==='object'){if(p(x))out.push(x);for(const v of Object.values(x))nodes(v,p,out);}return out;};

/** Probe each installed hook through real input, with a disabled-hook control. */
export function probePassiveBehavior(draft,options,authored=[]){
  const passive=draft.abilityDrafts.PASSIVE;
  const hooks=passive.passive?.ranks?.[0]?.hooks??[];
  const choose=predicate=>{
    const active=Object.values(draft.abilityDrafts).filter(a=>a.slot!=='PASSIVE');
    return(active.find(a=>a.effects.some(predicate))??active.find(a=>nodes(a.effects,predicate).length))?.slot;
  };
  const cast=(slot,extra={})=>{assert(slot,'NO_AUTHORED_TRIGGER_ABILITY');return{kind:'cast',slot,waitSec:1,...extra};};
  const attack=(actor='caster',target='foe')=>({kind:'attack',actor,target,waitSec:1.3});
  const probes=[];
  for(const on of [...new Set(hooks.map(h=>h.on))]){
    const item={event:on,status:'failed'};probes.push(item);
    try{
      const custom=authored.find(s=>s.event===on),hook=hooks.find(h=>h.on===on);
      let steps=[],setup={caster:{hpPct:.35,manaPct:.4},foe:{hpPct:1}};
      if(custom){steps=custom.steps;setup={...setup,...custom.setup};}
      else{
        // Prerequisites are discovered from the authored effect condition, but
        // established solely by actually casting its source ability.
        const needed=nodes(hook,n=>n.kind==='status'&&n.subject==='self').map(n=>n.statusId);
        for(const statusId of new Set(needed)){
          const slot=choose(n=>['applyStatus','applyBuff'].includes(n.kind)&&n.statusId===statusId);
          steps.push(cast(slot));
        }
        if(['onBasicAttack','onDamageDealt'].includes(on))steps.push(attack());
        else if(on==='onDamageTaken')steps.push(cast(hook.damageType==='physical'?'W':hook.damageType==='magic'?'E':'Q',{actor:'foe',target:'caster',waitSec:.5}));
        else if(on==='onAllyDamaged')steps.push(cast('Q',{actor:'foe',target:'ally',waitSec:.5}));
        else if(on==='onHeal'||on==='onOverheal')steps.push(cast('R',{actor:'ally',target:'caster',waitSec:.5}));
        else if(on==='onCrowdControlReceived'||on==='onStunned')steps.push(cast('PASSIVE',{actor:'foe',target:'caster',waitSec:.5}));
        else if(on==='onDashOrBlink')steps.push(cast(choose(n=>['blink','dash','leap'].includes(n.kind)&&n.applyTo!=='target')));
        else if(on==='onShieldGained')steps.push(cast(choose(n=>n.kind==='shield')));
        else if(on==='onCrowdControlApplied')steps.push(cast(hook.abilitySlot??choose(n=>n.kind==='applyStatus'&&n.applyTo!=='self'&&ccStatusIds.has(n.statusId)&&['root','stun','silenced','disarmed','feared','berserk','missChance','moveSpeedMult'].some(k=>n[k]))));
        else if(on==='onAbilityCast')steps.push(cast(hook.abilitySlot??'Q'));
        else if(on==='onUltimateCast'||on==='onUltimateHit')steps.push(cast('R',{waitSec:2}));
        else if(on==='onInterval')steps.push({kind:'wait',waitSec:Math.max(1,(hook.internalCooldown??1)+.1)});
        else if(on==='onEvade'){steps.push(cast(choose(n=>n.kind==='evasion'),{waitSec:.2}),attack('foe','caster'));}
        else if(on==='onReflectSuccess'){steps.push(cast(choose(n=>n.kind==='damage'&&n.incomingPct),{waitSec:.2}),cast('W',{actor:'foe',target:'caster',waitSec:.5}));}
        else if(on==='onKill'){setup.foe.hpPct=.001;steps.push(attack());}
        else throw Error(`AUTHORED_PASSIVE_SCENARIO_REQUIRED:${on}`);
      }
      if(!custom){
        // A trigger payload may itself sit behind a resource conversion (for
        // example R's silence marker -> EX's real blind). Earn that marker by
        // its real authoring operation before probing the trigger callback.
        const prepared=[],earned=new Set();
        const enqueue=(step,visiting=new Set())=>{
          if(step.kind==='cast'&&(step.actor??'caster')==='caster'){
            assert(!visiting.has(step.slot),'CYCLIC_PASSIVE_PROBE_PREREQUISITE');
            const chain=new Set([...visiting,step.slot]),a=draft.abilityDrafts[step.slot];
            for(const statusId of new Set(nodes(a.effects,n=>n.kind==='consumeStatus').map(n=>n.statusId))){
              if(earned.has(statusId))continue;
              const source=Object.values(draft.abilityDrafts).find(s=>s.slot!=='PASSIVE'&&!chain.has(s.slot)&&nodes(s.effects,n=>['applyStatus','applyBuff'].includes(n.kind)&&n.statusId===statusId).length);
              if(source)enqueue(cast(source.slot),chain);
            }
            for(const n of nodes(a.effects,n=>['applyStatus','applyBuff'].includes(n.kind)&&n.statusId))earned.add(n.statusId);
          }
          prepared.push(step);
        };
        for(const step of steps)enqueue(step);steps=prepared;
      }
      const normal=runSequence(draft,{...options,setup,steps});
      const disabled=runSequence(draft,{...options,setup,steps,remove:{slot:'PASSIVE',hookOn:on}});
      const origin=`hook:abilityPassive:${passive.id}`;
      const emitted=r=>r.events.filter(e=>e.data.origin===origin&&(!('amount'in e.data)||Number(e.data.amount)>0));
      const effects=emitted(normal),controlEffects=emitted(disabled);
      const castsAccepted=normal.steps.filter(s=>s.step.kind==='cast').every(s=>s.accepted);
      item.status=castsAccepted&&effects.length>controlEffects.length?'passed':'failed';
      Object.assign(item,{steps,setup,castsAccepted,observedEffects:effects,disabledEffects:controlEffects,
        normal,disabled,claim:'Real triggering inputs produced positive effect events with the candidate passive origin; removing that hook reduced those events.'});
    }catch(e){item.error=String(e);}
  }
  return probes;
}

/** Observe actual timed payloads, then keep stepping beyond their deadlines. */
export function probeExpiry(draft,slot,options){
  const a=draft.abilityDrafts[slot];
  const timing=nodes(a.effects,n=>['duration','durationSec','delaySec','intervalSec'].some(k=>typeof n[k]==='number'));
  if(!timing.length)return null;
  const longest=Math.max(0,...timing.flatMap(n=>[...(Array.isArray(n.duration)?n.duration:[n.duration??0]),n.durationSec??0,(n.delaySec??0)+(n.count??1)*(n.intervalSec??0)]));
  if(longest>30)return{slot,status:'failed',error:'AUTHORED_LONG_LIFETIME_SCENARIO_REQUIRED'};
  const r=runSequence(draft,{...options,steps:[{kind:'cast',slot,waitSec:Math.max(.2,(a.castTimeSec??0)+.1)},{kind:'stop',waitSec:longest+2}]});
  const observed=new Map();
  for(const frame of r.frames)for(const [actor,state]of Object.entries(frame.actors)){
    for(const [kind,list]of [['status',state.statuses],['shield',state.shields],['buff',state.sources]])for(const value of list){
      const id=value.sourceId??value.id;
      if(!String(id).includes(a.id)||!Number.isFinite(value.expiresAtTick))continue;
      const key=`${actor}:${kind}:${id}:${value.statusId??''}`;
      observed.set(key,{actor,kind,sourceId:id,statusId:value.statusId,expiresAtTick:value.expiresAtTick});
    }
    for(const body of state.summonBodies)if(Number.isFinite(body.expiresAtTick))observed.set(`${actor}:summon:${body.entity}`,{actor,kind:'summon',entity:body.entity,expiresAtTick:body.expiresAtTick});
    if(state.form?.index===1&&Number.isFinite(state.form.expiresTick))observed.set(`${actor}:form`,{actor,kind:'form',expiresAtTick:state.form.expiresTick});
  }
  const checks=[...observed.values()].filter(v=>v.expiresAtTick<r.steps.at(-1).endTick).map(value=>{
    const actor=r.after[value.actor];let remaining;
    if(value.kind==='summon')remaining=actor.summonBodies.some(s=>s.entity===value.entity&&s.alive);
    else if(value.kind==='form')remaining=actor.inAlternateForm===1;
    else{
      const list=value.kind==='status'?actor.statuses:value.kind==='shield'?actor.shields:actor.sources;
      remaining=list.some(s=>(s.sourceId??s.id)===value.sourceId&&s.statusId===value.statusId);
    }
    return{...value,passed:!remaining};
  });
  return{slot,status:checks.length?checks.every(c=>c.passed)?'passed':'failed':'not-observed',castAccepted:r.steps[0].accepted,checks,run:r,
    claim:'Actual status/shield/buff/summon/form instances were observed in a cast timeline and checked again after their runtime expiration tick. Conditional effects not established by this isolated cast are reported not observed.'};
}
