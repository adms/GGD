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
const [sim,registry,baselineApi,landing]=await Promise.all([
  'sim/index.ts','sim/content/registryContext.ts','content/heroForge/simulationBaseline.ts','sim/movement/leap.ts'
].map(p=>import(resolve(root,'packages/shared/src',p))));
const docs=new Map();
for(const c of readdirSync(resolve(root,'content'),{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name))for(const f of readdirSync(resolve(root,'content',c)))if(f.endsWith('.json')&&!f.startsWith('_')){const d=JSON.parse(readFileSync(resolve(root,'content',c,f),'utf8'));if(d.id)docs.set(`${c}/${d.id}`,d);}
const baseline=baselineApi.createHeroSimulationBaseline(docs),build=read('report.json');
assert.equal(baseline.digest,build.baseline.digest,'BASELINE_DRIFT');
const draft=read('private/compiled/b2-kisaragi.json');
assert.equal(hash(draft),build.heroes.find(h=>h.id==='b2-kisaragi').compiledSha256,'COMPILED_CHANGED');
const context=registry.extendRegistryContext(baseline.context,'batch2-train-review',()=>{
  for(const a of Object.values(draft.abilityDrafts))sim.Abilities.register(a.id,a);
  sim.registerChampion(draft.champion,{overrideAbilities:true});
});
const run=(seed,{crowd=3,zeroMana=false}={})=>registry.withRegistryContext(context,()=>{
  const world=new sim.SimWorld(baseline.arena,seed);
  Object.assign(world,structuredClone(baseline.rules));world.ultGateOverride=true;
  const center=world.arena.zones[0].center;
  const actors=[];
  const spawn=(x,z,team)=>{const seat=actors.length;const id=sim.spawnChampion(world,{championId:draft.champion.id,seatId:seat,teamId:team,pos:{x:center.x+x,z:center.z+z},zone:0,level:18});actors.push(id);return id;};
  const caster=spawn(0,0,0);
  const foes=Array.from({length:crowd},(_,i)=>spawn(2.7*Math.cos(i*2*Math.PI/crowd),2.7*Math.sin(i*2*Math.PI/crowd),1));
  const ally=spawn(0,-1.4,0),far=spawn(13,0,1);
  world.step(new Map());
  const component=world.abilities.get(caster);component.unspentPoints=20;
  assert(sim.rankUpAbility(world,caster,'R'),'R_NOT_LEARNED');
  const casterHealth=world.health.get(caster);casterHealth.mana=zeroMana?0:casterHealth.maxMana;
  const events=[],frames=[];
  const snapshot=()=>actors.map(id=>({id,pos:{...world.transform.get(id).pos},statuses:structuredClone(world.status.get(id)?.effects??[]),hp:world.health.get(id).hp}));
  const before=snapshot();let arrival=null;
  for(let i=0;i<210;i++){
    world.step(i===0?new Map([[0,{commands:[{kind:'castAbility',slot:'R',target:{type:'self'}}]}]]):new Map());
    events.push(...world.events.map(e=>structuredClone(e)));
    if(!arrival&&world.events.some(e=>e.type==='displace'&&e.data.origin===`ability:${draft.abilityDrafts.R.id}`)){
      arrival=snapshot();
      for(const row of arrival){const legal=landing.resolveLandingPoint(world,row.id,row.pos,{mode:'blink'});assert(Math.hypot(legal.x-row.pos.x,legal.z-row.pos.z)<0.02,'ILLEGAL_LANDING');}
    }
    if(i===0||i===30||i===90||i===209)frames.push({tick:world.tick,actors:snapshot()});
  }
  return {seed,crowd,zeroMana,actors:{caster,foes,ally,far},before,arrival,after:snapshot(),events,frames};
});
const report={schema:'ggd-batch2-train-review@1',buildHash:hash(build),compiledSha256:hash(draft),baselineDigest:baseline.digest,status:'failed',cases:[],limits:[
  'Actual R IntentFrame casts in the shipped skeleton arena; ult gate overridden like the Editor scenario seam.',
  'Randomness is three existing distance branches towards the caster, not arbitrary whole-map random coordinates.',
  'Status payloads and expiration are checked; statistical attack-miss rates and live rendered train appearance are not certified.'
]};
try {
  const outcomes=[];
  for(const seed of [1,2,3,4,5,1234]){
    const r=run(seed);report.cases.push(r);assert(r.arrival,'NO_GROUP_TELEPORT');
    const moved=r.events.filter(e=>e.type==='displace'&&e.data.origin===`ability:${draft.abilityDrafts.R.id}`).map(e=>e.data.id);
    assert.deepEqual([...moved].sort(),[...r.actors.foes].sort(),'WRONG_TELEPORT_TARGET_SET');
    for(const id of r.actors.foes){
      const at=r.arrival.find(a=>a.id===id),before=r.before.find(a=>a.id===id),after=r.after.find(a=>a.id===id);
      const get=key=>at.statuses.find(s=>s.statusId===key);
      assert.equal(get('curse')?.missChance,0.5,'CURSE_FLAG_MISSING');
      assert.equal(get('blind')?.missChance,0.5,'BLIND_FLAG_MISSING');
      assert.equal(get('confusion')?.berserk,true,'CONFUSION_BERSERK_MISSING');
      assert.equal(get('confusion')?.targetsAllies,true,'CONFUSION_FRIENDLY_TARGETING_MISSING');
      assert(Math.hypot(at.pos.x-before.pos.x,at.pos.z-before.pos.z)>1,'NO_REAL_DISPLACEMENT');
      assert(!after.statuses.some(s=>['curse','blind','confusion'].includes(s.statusId)),'STATUS_DID_NOT_EXPIRE');
    }
    for(const id of [r.actors.ally,r.actors.far]){
      assert(!moved.includes(id),'ALLY_OR_OUTSIDE_TELEPORTED');
      assert(!r.events.some(e=>e.type==='statusApplied'&&e.data.target===id&&e.data.origin===`ability:${draft.abilityDrafts.R.id}`),'ALLY_OR_OUTSIDE_AFFLICTED');
    }
    outcomes.push(hash(r.arrival.map(a=>a.pos)));
  }
  assert(new Set(outcomes).size>1,'ALL_SEEDS_SAME_LANDING');
  assert.equal(hash(run(1234)),hash(report.cases.at(-1)),'NON_DETERMINISTIC_REPLAY');
  const crowd=run(77,{crowd:10});report.cases.push(crowd);
  const displaced=crowd.events.filter(e=>e.type==='displace'&&e.data.origin===`ability:${draft.abilityDrafts.R.id}`);
  assert.equal(new Set(displaced.map(e=>e.data.id)).size,8,'MAX_TARGET_CAP');
  const empty=run(1234,{zeroMana:true});report.cases.push(empty);
  assert.equal(empty.arrival,null,'ZERO_MANA_STILL_TELEPORTED');
  assert(!empty.events.some(e=>e.type==='abilityCast'&&e.data.caster===empty.actors.caster),'ZERO_MANA_CAST_ACCEPTED');
  report.status='passed';report.checks=['multi-enemy-teleport','three-existing-status-flags','friendly-and-outside-exclusion','expiry','legal-landings','seed-replay','seed-variation','eight-target-cap','zero-mana-negative'];
}catch(e){report.error=String(e);process.exitCode=1;}
writeFileSync(resolve(dir,'train-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,cases:report.cases.length,error:report.error}));
