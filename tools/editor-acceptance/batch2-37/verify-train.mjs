// Evaluation fixture only. Production engine and registered content are read-only.
import { register } from 'tsx/esm/api'; register();
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const dir=resolve(root,'docs/_reports/hero-validation-batch2-37/data');
const read=p=>JSON.parse(readFileSync(resolve(dir,p),'utf8'));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const [sim,registry,baselineApi,landing,mobs,berserk,targeting,evasion]=await Promise.all([
  'sim/index.ts','sim/content/registryContext.ts','content/heroForge/simulationBaseline.ts','sim/movement/leap.ts',
  'sim/mobs.ts','sim/berserk.ts','sim/targeting.ts','sim/combat/evasion.ts',
].map(p=>import(resolve(root,'packages/shared/src',p))));
const docs=new Map();
for(const c of readdirSync(resolve(root,'content'),{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name))for(const f of readdirSync(resolve(root,'content',c)))if(f.endsWith('.json')&&!f.startsWith('_')){const d=JSON.parse(readFileSync(resolve(root,'content',c,f),'utf8'));if(d.id)docs.set(`${c}/${d.id}`,d);}
const baseline=baselineApi.createHeroSimulationBaseline(docs),build=read('report.json');
assert.equal(baseline.digest,build.baseline.digest,'BASELINE_DRIFT');
const draft=read('private/compiled/b2-kisaragi.json');
assert.equal(hash(draft),build.heroes.find(h=>h.id==='b2-kisaragi').compiledSha256,'COMPILED_CHANGED');
const origin=`ability:${draft.abilityDrafts.R.id}`,statusIds=['curse','blind','confusion'];
const area=draft.abilityDrafts.R.effects.find(e=>e.kind==='damageArea');assert(area,'TRAIN_AREA_MISSING');
const branch=area.onHitTargets?.find(e=>e.kind==='weightedBranch');assert(branch,'TRAIN_RANDOM_BRANCH_MISSING');
const distances=branch.branches.map(b=>b.effects.find(e=>e.kind==='blink')?.distanceUnits);
assert.deepEqual(distances,[8,12,16],'TRAIN_DISTANCE_CONTRACT_CHANGED');assert(branch.branches.every(b=>b.weight===1),'TRAIN_WEIGHT_CONTRACT_CHANGED');
const fixture=structuredClone(draft.champion);fixture.id='b2-kisaragi.evaluation-neutral';
for(const key of ['passive','passiveAbility','exAbility','transform'])delete fixture[key];
fixture.abilities=Object.fromEntries(['Q','W','E','R'].map(slot=>[slot,{id:`${fixture.id}.${slot.toLowerCase()}`,name:'Neutral fixture',slot,castType:'self',maxRank:1,cooldown:[0],manaCost:[0],range:0,effects:[]} ]));

function run(seed,{crowd=3,mana='full',cast=true,foeOffsets,omitArrivalPayload=false,probeOrders=false}={}) {
  const candidate=structuredClone(draft),mutations=[];
  if(omitArrivalPayload){
    const visit=value=>{if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){if(key==='onArrive'){mutations.push(structuredClone(child));value[key]=[];}else visit(child);}};
    visit(candidate.abilityDrafts.R.effects);assert.equal(mutations.length,3);candidate.champion.abilities.R=candidate.abilityDrafts.R;
  }
  const context=registry.extendRegistryContext(baseline.context,'batch2-train-review',()=>{
    for(const a of Object.values(candidate.abilityDrafts))sim.Abilities.register(a.id,a);
    sim.registerChampion(candidate.champion,{overrideAbilities:true});sim.registerChampion(fixture,{overrideAbilities:true});
  });
  return registry.withRegistryContext(context,()=>{
    const world=new sim.SimWorld(baseline.arena,seed);
    Object.assign(world,structuredClone(baseline.rules));world.ultGateOverride=true;world.combatActive=true;
    const arenaRules=docs.get('config/arena-rules');world.mobRules=mobs.mobRulesFromConfig(arenaRules.mobWaves,world.dt,1,world.combatEnv);world.mobRules.autoSchedule=false;
    const center=world.arena.zones[0].center,actors=[],seats=new Map();
    const spawn=(x,z,team,isCaster=false)=>{const seat=actors.length,id=sim.spawnChampion(world,{championId:isCaster?candidate.champion.id:fixture.id,seatId:seat,teamId:team,pos:{x:center.x+x,z:center.z+z},zone:0,level:18});actors.push(id);seats.set(id,seat);return id;};
    const caster=spawn(0,0,0,true);
    const offsets=foeOffsets??Array.from({length:crowd},(_,i)=>({x:2.7*Math.cos(i*2*Math.PI/crowd),z:2.7*Math.sin(i*2*Math.PI/crowd)}));
    const foes=offsets.map(p=>spawn(p.x,p.z,1)),ally=spawn(0,-1.4,0),far=spawn(13,0,1);
    world.mobRules.inertSeats=new Set(seats.values());world.step(new Map());
    const component=world.abilities.get(caster);component.unspentPoints=20;assert(sim.rankUpAbility(world,caster,'R'),'R_NOT_LEARNED');
    const casterHealth=world.health.get(caster),cost=candidate.abilityDrafts.R.manaCost[0];
    casterHealth.mana=mana==='zero'?0:mana==='below'?cost-1:mana==='exact'?cost:casterHealth.maxMana;
    const snapshot=()=>actors.map(id=>{const health=world.health.get(id),transform=world.transform.get(id);return {id,pos:{...transform.pos},bodyRadius:transform.radius,statuses:structuredClone(world.status.get(id)?.effects??[]),hp:health.hp,mana:health.mana,shield:health.shields?.filter(s=>s.expiresAtTick>world.tick).reduce((sum,s)=>sum+s.amount,0)??0,flags:{missChance:evasion.missChanceOf(world,id),berserk:berserk.isBerserk(world,id),confused:targeting.isConfused(world,id),dropsOrders:berserk.berserkDropsOrders(world,id)}};});
    const before=snapshot(),events=[],frames=[],orderProbes=[],checkpointTicks=new Set([2,32,92,211]);let arrival=null,arrivalTick=null,preArrival=null;
    for(let i=0;i<210;i++){
      const previous=snapshot(),frame=i===0&&cast?new Map([[0,{commands:[{kind:'castAbility',slot:'R',target:{type:'self'}}]}]]):new Map();
      let probe;
      if(probeOrders&&arrival){
        const foe=foes[0],expires=row(arrival,foe).statuses.find(s=>s.statusId==='confusion')?.expiresAtTick;
        if(world.tick===arrivalTick||world.tick===expires+1){probe={phase:world.tick===arrivalTick?'confused':'expired',actor:foe,inputTick:world.tick,previousCommandTick:world.lastCommandTick.get(foe)??null};frame.set(seats.get(foe),{commands:[],order:{kind:'stop'}});}
      }
      world.step(frame);
      if(probe)orderProbes.push({...probe,accepted:world.lastCommandTick.get(probe.actor)===probe.inputTick,resultCommandTick:world.lastCommandTick.get(probe.actor)??null});
      events.push(...world.events.map(e=>structuredClone(e)));
      if(!arrival&&world.events.some(e=>e.type==='displace'&&e.data.origin===origin)){
        arrival=snapshot();preArrival=previous;arrivalTick=world.tick;
        for(const row of arrival){
          const legal=landing.resolveLandingPoint(world,row.id,row.pos,{mode:'blink'});assert(Math.hypot(legal.x-row.pos.x,legal.z-row.pos.z)<0.02,'ILLEGAL_LANDING');
          for(const status of row.statuses.filter(s=>statusIds.includes(s.statusId)))for(const delta of [-1,0,1])checkpointTicks.add(status.expiresAtTick+delta);
        }
      }
      if(checkpointTicks.has(world.tick)||world.tick===arrivalTick)frames.push({tick:world.tick,actors:snapshot()});
    }
    return {seed,crowd:foes.length,mana,cast,omitArrivalPayload,mutation:mutations,fixture:{championId:fixture.id,candidateHooksOnTargets:false,ultGateOverride:true,combatActive:true,inertSeats:[...world.mobRules.inertSeats],mobWavesUnarmed:world.mobTicks===-1},actors:{caster,foes,ally,far},manaCost:cost,before,preArrival,arrivalTick,arrival,after:snapshot(),events,frames,orderProbes};
  });
}
const displaced=r=>r.events.filter(e=>e.type==='displace'&&e.data.origin===origin).map(e=>e.data.id);
const affected=r=>r.events.filter(e=>e.type==='statusApplied'&&e.data.origin===origin);
const row=(rows,id)=>rows.find(a=>a.id===id);
function assertTargets(r,expected){
  assert.deepEqual([...displaced(r)].sort((a,b)=>a-b),[...expected].sort((a,b)=>a-b),'WRONG_TELEPORT_TARGET_SET');
  for(const id of [r.actors.caster,r.actors.ally,r.actors.far]){assert(!displaced(r).includes(id),'FRIENDLY_OR_OUTSIDE_TELEPORTED');assert(!affected(r).some(e=>e.data.target===id),'FRIENDLY_OR_OUTSIDE_AFFLICTED');}
}
function assertStatuses(r,ids){
  for(const id of ids){
    const at=row(r.arrival,id),before=row(r.before,id),after=row(r.after,id),get=key=>at.statuses.find(s=>s.statusId===key);
    assert.equal(at.shield,0,'NEUTRAL_TARGET_INHERITED_CANDIDATE_SHIELD');
    assert.equal(get('curse')?.missChance,.5,'CURSE_FLAG_MISSING');assert.equal(get('blind')?.missChance,.5,'BLIND_FLAG_MISSING');
    assert.equal(get('confusion')?.berserk,true,'CONFUSION_BERSERK_MISSING');assert.equal(get('confusion')?.targetsAllies,true,'CONFUSION_FRIENDLY_TARGETING_MISSING');
    assert.deepEqual(at.flags,{missChance:.5,berserk:true,confused:true,dropsOrders:true},'RUNTIME_STATUS_CONSUMERS_INACTIVE');
    assert(Math.hypot(at.pos.x-before.pos.x,at.pos.z-before.pos.z)>1,'NO_REAL_DISPLACEMENT');
    for(const status of at.statuses.filter(s=>statusIds.includes(s.statusId))){
      const near=r.frames.find(f=>f.tick===status.expiresAtTick-1),atExpiry=r.frames.find(f=>f.tick===status.expiresAtTick),afterExpiry=r.frames.find(f=>f.tick===status.expiresAtTick+1);
      assert(near&&atExpiry&&afterExpiry,'EXPIRY_CHECKPOINT_MISSING');assert(row(near.actors,id).statuses.some(s=>s.statusId===status.statusId),'STATUS_EXPIRED_EARLY');
      if(status.statusId==='confusion'){assert.equal(row(near.actors,id).flags.dropsOrders,true);assert.equal(row(atExpiry.actors,id).flags.dropsOrders,false,'ORDERS_NOT_RESTORED');assert.equal(row(atExpiry.actors,id).flags.confused,false,'FRIENDLY_TARGETING_NOT_RESTORED');}
      if(status.statusId==='curse'){assert.equal(row(near.actors,id).flags.missChance,.5);assert.equal(row(atExpiry.actors,id).flags.missChance,0,'MISS_CHANCE_NOT_RESTORED');}
      assert(!row(afterExpiry.actors,id).statuses.some(s=>s.statusId===status.statusId),'STATUS_STORAGE_NOT_EXPIRED');
    }
    assert(!after.statuses.some(s=>statusIds.includes(s.statusId)),'STATUS_DID_NOT_EXPIRE');assert.deepEqual(after.flags,before.flags,'RUNTIME_FLAGS_NOT_RESTORED');
  }
}
const report={schema:'ggd-batch2-train-review@1',buildHash:hash(build),compiledSha256:hash(draft),baselineDigest:baseline.digest,status:'failed',cases:[],limits:[
  'Actual R IntentFrame casts with combat active, neutral opponent bodies and practice inert seats; the shipped Editor ult-gate override is explicit.',
  'Each target draws one equally weighted existing distance branch 8/12/16 towards the caster; legal landing clipping can collapse branches. This is not whole-map uniform randomness.',
  'AOE selection uses shipped body-overlap semantics: a body touching radius 4 is included even when its centre is outside radius 4.',
  'Actual runtime missChance/berserk/confusion/order-block consumers and expiration are checked; statistical attack-miss rates and live-game rendering remain unverified.'
]};
try {
  const outcomes=[];
  for(const seed of [1,2,3,4,5,1234]){const r=run(seed);report.cases.push(r);assert(r.arrival,'NO_GROUP_TELEPORT');assertTargets(r,r.actors.foes);assertStatuses(r,r.actors.foes);outcomes.push(hash(r.arrival.map(a=>a.pos)));}
  assert(new Set(outcomes).size>1,'ALL_SEEDS_SAME_LANDING');assert.equal(hash(run(1234)),hash(report.cases.at(-1)),'NON_DETERMINISTIC_REPLAY');
  // The first foe has a clear straight landing corridor in this arena. Quantize
  // only within one movement step: tiny confusion jitter cannot fake RNG spread.
  report.randomBranchEvidence=report.cases.slice(0,6).map(r=>{const id=r.actors.foes[0],start=row(r.preArrival,id).pos,end=row(r.arrival,id).pos,observed=Math.hypot(end.x-start.x,end.z-start.z),nearest=[...distances].sort((a,b)=>Math.abs(a-observed)-Math.abs(b-observed))[0],error=Math.abs(nearest-observed);assert(error<.15,'RANDOM_BRANCH_LENGTH_NOT_OBSERVED');return {seed:r.seed,observedDistance:observed,branchDistance:nearest,postArrivalMovementError:error};});
  assert.deepEqual([...new Set(report.randomBranchEvidence.map(e=>e.branchDistance))].sort((a,b)=>a-b),[8,12,16],'RANDOM_BRANCH_VARIATION_ONLY_MOVEMENT_JITTER');
  const crowd=run(77,{crowd:10});report.cases.push(crowd);const position=row(crowd.preArrival,crowd.actors.caster).pos;
  const closest=[...crowd.actors.foes].sort((a,b)=>{const pa=row(crowd.preArrival,a).pos,pb=row(crowd.preArrival,b).pos;const da=(pa.x-position.x)**2+(pa.z-position.z)**2,db=(pb.x-position.x)**2+(pb.z-position.z)**2;return da-db||a-b;}).slice(0,8);
  assertTargets(crowd,closest);assertStatuses(crowd,closest);
  for(const mode of ['zero','below']){const r=run(1234,{mana:mode});report.cases.push(r);assert.equal(r.arrival,null,'INSUFFICIENT_MANA_TELEPORTED');assert(!r.events.some(e=>e.type==='abilityCast'&&e.data.caster===r.actors.caster),'INSUFFICIENT_MANA_CAST_ACCEPTED');}
  const exact=run(1234,{mana:'exact'});report.cases.push(exact);assertTargets(exact,exact.actors.foes);assertStatuses(exact,exact.actors.foes);
  const noCast=run(1234,{cast:false});report.cases.push(noCast);assert.equal(noCast.arrival,null,'NO_CAST_TELEPORTED');assert.equal(affected(noCast).length,0,'NO_CAST_AFFLICTED');
  const noArrival=run(1234,{omitArrivalPayload:true});report.cases.push(noArrival);assertTargets(noArrival,noArrival.actors.foes);assert.equal(affected(noArrival).length,0,'ARRIVAL_ABLATION_STILL_AFFLICTED');assert(noArrival.arrival.every(a=>a.flags.missChance===0&&!a.flags.berserk&&!a.flags.confused),'ARRIVAL_ABLATION_RUNTIME_FLAGS');
  const zeroTargets=run(1234,{crowd:0});report.cases.push(zeroTargets);assertTargets(zeroTargets,[]);assert.equal(affected(zeroTargets).length,0,'EMPTY_AREA_AFFLICTED');
  const orders=run(1234,{probeOrders:true});report.cases.push(orders);assert.equal(orders.orderProbes.length,2,'ORDER_PROBES_MISSING');assert.equal(orders.orderProbes[0].accepted,false,'CONFUSION_DID_NOT_BLOCK_ACTUAL_ORDER');assert.equal(orders.orderProbes[1].accepted,true,'EXPIRED_CONFUSION_STILL_BLOCKS_ACTUAL_ORDER');
  const radius=row(report.cases[0].before,report.cases[0].actors.foes[0]).bodyRadius;
  for(const [name,offset,expected]of [['body-overlap',area.radius+radius-.05,true],['fully-outside',area.radius+radius+.05,false]]){
    const r=run(1234,{foeOffsets:[{x:0,z:offset}]});r.boundary={name,areaRadius:area.radius,bodyRadius:radius,requestedCenterDistance:offset};report.cases.push(r);
    const caster=row(r.preArrival??r.before,r.actors.caster).pos,foe=row(r.preArrival??r.before,r.actors.foes[0]).pos;
    assert(Math.abs(Math.hypot(foe.x-caster.x,foe.z-caster.z)-offset)<.01,'BOUNDARY_FIXTURE_MOVED');assertTargets(r,expected?r.actors.foes:[]);if(expected)assertStatuses(r,r.actors.foes);else assert.equal(affected(r).length,0,'OUTSIDE_BOUNDARY_AFFLICTED');
  }
  report.status='passed';report.checks=['multi-enemy-teleport','neutral-target-no-candidate-hooks','actual-runtime-status-consumers','friendly-caster-outside-exclusion','exact-expiry-and-order-restoration','actual-stop-order-block-and-recovery','legal-landings','seed-replay','seed-variation','nearest-eight-target-cap','zero-mana-negative','below-cost-negative','exact-cost-positive','no-cast-control','arrival-payload-ablation','zero-target-control','body-overlap-range-boundary'];
}catch(e){report.error=String(e);process.exitCode=1;}
writeFileSync(resolve(dir,'train-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,cases:report.cases.length,checks:report.checks?.length??0,error:report.error}));
