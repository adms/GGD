// Bounded adversarial scenarios for the frozen batch. Never changes the engine.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {gzipSync} from 'node:zlib';
import {root,hash,loadBaseline,runSequence,metricValue,evaluateCombo} from './sim-harness.mjs';
import {roster} from './roster.mjs';

const dir=resolve(root,'docs/_reports/hero-validation-batch2-37/data');
const read=p=>JSON.parse(readFileSync(resolve(dir,p),'utf8'));
const build=read('report.json'),buildHash=hash(build),{baseline}=loadBaseline();
assert.equal(baseline.digest,build.baseline.digest,'BASELINE_DRIFT');
const verifierSha256=hash(readFileSync(new URL(import.meta.url)));
const harnessSha256=hash(readFileSync(new URL('./sim-harness.mjs',import.meta.url)));
const drafts=new Map(),cases=[];
const load=id=>{
  if(!drafts.has(id)){
    const draft=read(`private/compiled/${id}.json`);
    assert.equal(hash(draft),build.heroes.find(h=>h.id===id)?.compiledSha256,`COMPILED_DRIFT:${id}`);
    drafts.set(id,draft);
  }
  return drafts.get(id);
};
const cast=(slot,waitSec=.25,extra={})=>({kind:'cast',slot,waitSec,...extra});
const wait=waitSec=>({kind:'wait',waitSec});
const foeCast=(slot,waitSec=.25)=>cast(slot,waitSec,{actor:'foe',target:'caster'});
const attack=(actor='caster',target='foe',waitSec=1.1)=>({kind:'attack',actor,target,waitSec});
const stop=(actor='caster',waitSec=.1)=>({kind:'stop',actor,waitSec});
const events=(run,type,p=()=>true)=>run.events.filter(e=>e.type===type&&p(e.data,e));
const originEvents=(run,type,id,slot)=>events(run,type,d=>d.origin?.startsWith(`ability:${id}.${slot.toLowerCase()}`));
const damage=(run,id,slot)=>originEvents(run,'damage',id,slot).reduce((n,e)=>n+e.data.amount,0);
const passiveDamage=(run,id)=>events(run,'damage',d=>d.origin===`hook:abilityPassive:${id}.passive`&&d.amount>0);
const countStatus=(state,actor,id)=>metricValue(state,{actor,field:`status:${id}`});
const same=(a,b)=>Math.abs(a-b)<1e-6;
const walk=(x,p,out=[])=>{if(x&&typeof x==='object'){if(p(x))out.push(x);for(const v of Object.values(x))walk(v,p,out);}return out;};

function scenario(id,name,body){
  const runs={},checks=[],row={heroId:id,name,status:'failed',checks};
  cases.push(row);
  const check=(name,passed,observed)=>checks.push({name,passed:Boolean(passed),observed});
  try{
    const draft=load(id);
    const run=(key,steps,extra={})=>{
      const r=runSequence(draft,{baseline,relatedChampions:draft.relatedChampions??draft.formChampions??[],seed:1234,steps,...extra});
      runs[key]=r;return r;
    };
    const evaluate=combo=>{
      const result=evaluateCombo(draft,combo,{baseline,relatedChampions:draft.relatedChampions??draft.formChampions??[],seed:1234});
      Object.assign(runs,result.runs);return result;
    };
    body({draft,run,check,evaluate});
    row.status=checks.length&&checks.every(c=>c.passed)?'passed':'failed';
  }catch(error){row.error=String(error);}
  const evidence=`private/evidence/special/${id}.${name}.json.gz`;
  mkdirSync(resolve(dir,'private/evidence/special'),{recursive:true});
  const raw={schema:'ggd-batch2-special-evidence@1',buildHash,baselineDigest:baseline.digest,verifierSha256,harnessSha256,
    compiledSha256: drafts.has(id)?hash(drafts.get(id)):null,case:row,runs};
  writeFileSync(resolve(dir,evidence),gzipSync(JSON.stringify(raw)+'\n'));
  row.evidence=evidence;row.evidenceSha256=hash(readFileSync(resolve(dir,evidence)));
  row.timelineCount=Object.keys(runs).length;
  console.log(id,name,row.status,checks.filter(c=>!c.passed).map(c=>c.name).join(';'),row.error??'');
}

scenario('b2-noor','physical-once-consumed',({run,check})=>{
  const r=run('normal',[cast('Q',.2),foeCast('W'),foeCast('W')]);
  check('all three casts accepted',r.steps.every(s=>s.accepted));
  const first=events(r.steps[1],'reflectSuccess'),second=events(r.steps[2],'reflectSuccess');
  check('first physical ability reflected exactly once',first.length===1,first);
  const incoming=events(r.steps[1],'damage',d=>d.target===r.actors.caster);
  check('original first damage negated',incoming.length===1&&incoming[0].data.amount===0);
  check('return damage is positive magic',events(r.steps[1],'damage',d=>d.source===r.actors.caster&&d.type==='magic'&&d.amount>0).length===1);
  check('second physical ability damages and does not reflect',second.length===0&&events(r.steps[2],'damage',d=>d.target===r.actors.caster&&d.amount>0).length===1);
  check('consumed Q buff removed before original expiry',!r.steps[1].after.caster.sources.some(s=>s.id.startsWith('buff:ability:b2-noor.q')));
  check('successful reflection earned passive receipt',countStatus(r.steps[1].after,'caster','rage')===1);
});
scenario('b2-noor','reflect-passive-receipt-own-w-heal-chain',({evaluate,check})=>{
  const combo=roster.find(h=>h.id==='b2-noor').combos[0];
  const result=evaluate(combo),{prepared,preparedAblated,unprepared,unpreparedAblated}=result.runs;
  check('authored combo measures own W after Q and enemy trigger',combo.source==='Q'&&combo.target==='W'&&combo.responseIndex===2
    &&prepared.steps[2].step.actor==='caster'&&prepared.steps[2].step.slot==='W',combo);
  check('four-control interaction is exactly the W heal',result.status==='passed'&&same(result.interaction,220),{
    values:result.values,preparedContribution:result.preparedContribution,unpreparedContribution:result.unpreparedContribution,interaction:result.interaction,validationErrors:result.validationErrors});
  for(const [key,r]of Object.entries(result.runs)){
    check(`${key}: incoming physical ability and own response really cast`,r.steps[1].accepted&&r.steps[2].accepted);
    check(`${key}: no Q-origin damage or healing enters response window`,events(r.steps[2],'damage',d=>d.origin?.includes('b2-noor.q')).length===0
      &&events(r.steps[2],'heal',d=>d.origin?.includes('b2-noor.q')).length===0);
  }
  check('no-Q controls retain the enemy physical cast',unprepared.steps[0].step.kind==='wait'&&unpreparedAblated.steps[0].step.kind==='wait'
    &&unprepared.steps[1].step.actor==='foe'&&unpreparedAblated.steps[1].step.actor==='foe');
  check('reflection and rage precede own response',events(prepared.steps[1],'reflectSuccess').length===1&&countStatus(prepared.steps[2].before,'caster','rage')===1);
  const heals=events(prepared.steps[2],'heal',d=>d.origin==='ability:b2-noor.w'&&d.target===prepared.actors.caster);
  check('own W emits a single 220 heal and consumes rage',heals.length===1&&same(heals[0].data.amount,220)&&countStatus(prepared.after,'caster','rage')===0,heals);
  check('removing W consumption leaves receipt but removes heal',countStatus(preparedAblated.after,'caster','rage')===1&&events(preparedAblated.steps[2],'heal').length===0);
  check('without Q there is neither receipt nor W heal',countStatus(unprepared.steps[2].before,'caster','rage')===0&&events(unprepared.steps[2],'heal').length===0);
});
for(const [channel,step]of [['basic',attack('foe','caster',1.1)],['magic',foeCast('E')],['true',foeCast('Q')]]){
  scenario('b2-noor',`exclude-${channel}`,({run,check})=>{
    const r=run('normal',[cast('Q',.2),step,stop('foe')]);
    check('Q accepted',r.steps[0].accepted);
    check('incoming channel really attempted',channel==='basic'?events(r.steps[1],'basicAttack').length>0:r.steps[1].accepted);
    check('incoming attempt resolved to damage or evasion',events(r.steps[1],'damage',d=>d.target===r.actors.caster&&d.amount>0).length>0||events(r.steps[1],'evade',d=>d.target===r.actors.caster).length>0);
    check('excluded channel never reflects',events(r,'reflectSuccess').length===0);
    check('excluded channel earns no rage',countStatus(r.after,'caster','rage')===0);
    check('excluded channel does not consume Q source',r.steps[1].after.caster.sources.some(s=>s.id.startsWith('buff:ability:b2-noor.q')));
  });
}
scenario('b2-noor','past-reflect-window',({run,check})=>{
  const r=run('normal',[cast('Q',2.1),foeCast('W')]);
  check('Q and later physical cast accepted',r.steps.every(s=>s.accepted));
  check('expired Q source absent before hit',!r.steps[1].before.caster.sources.some(s=>s.id.startsWith('buff:ability:b2-noor.q')));
  check('past-window damage lands without reflection',events(r,'reflectSuccess').length===0&&events(r.steps[1],'damage',d=>d.target===r.actors.caster&&d.amount>0).length===1);
});

for(const hpPct of [.8,.4])for(const notified of [false,true]){
  scenario('b2-yogiri',`threshold-${hpPct===.8?'high':'low'}-${notified?'notified':'unnotified'}`,({draft,run,check})=>{
    const steps=[notified?cast('Q',.2):wait(.2),cast('W',.4)];
    const setup={foe:{hpPct}};
    const r=run('normal',steps,{setup});
    const a=run('bonus-ablated',steps,{setup,remove:{slot:'W',kind:'damage',conditionalOnly:true}});
    const bonus=damage(r,'b2-yogiri','W')-damage(a,'b2-yogiri','W');
    const eligible=hpPct===.4&&notified;
    check('all attempted casts accepted',r.steps.filter(s=>s.step.kind==='cast').every(s=>s.accepted));
    check('ablation control casts accepted',a.steps.filter(s=>s.step.kind==='cast').every(s=>s.accepted));
    check('both low HP and notification required for bonus',eligible?bonus>0:same(bonus,0),{eligible,bonus,normalDamage:damage(r,'b2-yogiri','W'),controlDamage:damage(a,'b2-yogiri','W')});
    check('no kill effect in compiled kit',walk(draft.abilityDrafts,n=>n.kind==='kill').length===0);
    check('this target survives finite damage',r.after.foe.alive&&!events(r,'damage',d=>d.killingBlow).length);
    check('notification absent after settlement',countStatus(r.after,'foe','curse')===0);
  });
}

scenario('b2-klaus','cancel-outstanding-schedule',({run,check})=>{
  const prefix=[cast('Q',.2),cast('W',.6)];
  const r=run('cancelled',[...prefix,cast('EX',.2),wait(1.3)]);
  const c=run('continues',[...prefix,wait(.2),wait(1.3)]);
  const before=originEvents(r.steps[1],'damage','b2-klaus','W');
  const after=r.steps.slice(2).flatMap(s=>originEvents(s,'damage','b2-klaus','W'));
  const control=originEvents(c,'damage','b2-klaus','W');
  check('Q W EX accepted',r.steps.slice(0,3).every(s=>s.accepted));
  check('uncancelled control Q and W accepted',c.steps.slice(0,2).every(s=>s.accepted));
  check('one payment arrived before cancellation',before.length===1,before);
  check('two outstanding payments suppressed',after.length===0&&control.length===3,{afterCancel:after.length,withoutCancel:control.length});
  check('EX consumes authorization and grants shield',countStatus(r.steps[2].after,'caster','red-comet')===0&&r.steps[2].after.caster.shield>0);
});

scenario('b2-kaede','uninstall-passive-keep-ad-until-expiry',({run,check})=>{
  const prefix=[cast('Q',.2),attack('caster','foe',1.2),stop()];
  const r=run('uninstalled',[...prefix,cast('EX',.2),attack('caster','foe',1.3),stop(),wait(1.8)],{setup:{caster:{manaPct:.5},foe:{hpPct:1}}});
  const c=run('enchantment-kept',[...prefix,wait(.2),attack('caster','foe',1.3),stop(),wait(1.8)],{setup:{caster:{manaPct:.5},foe:{hpPct:1}}});
  const buff=s=>s.caster.sources.find(s=>s.id.startsWith('buff:ability:b2-kaede.q'));
  check('Q and EX accepted',r.steps[0].accepted&&r.steps[3].accepted);
  check('control Q accepted',c.steps[0].accepted);
  check('enchantment gives positive passive damage before uninstall',passiveDamage(r.steps[1],'b2-kaede').length>0);
  check('post-uninstall real attack occurs',events(r.steps[4],'basicAttack').length>0);
  check('post-uninstall passive bonus absent while control remains positive',passiveDamage(r.steps[4],'b2-kaede').length===0&&passiveDamage(c.steps[4],'b2-kaede').length>0);
  check('EX consumes status but retains original AD expiry',countStatus(r.steps[3].after,'caster','three-sword-style')===0&&buff(r.steps[3].after)?.expiresAtTick===buff(r.steps[0].after)?.expiresAtTick);
  check('45 AD remains after uninstall',same(r.steps[3].after.caster.stats.ad-r.initial.caster.stats.ad,45));
  check('AD expires at original deadline',!buff(r.after)&&same(r.after.caster.stats.ad,r.initial.caster.stats.ad));
});

scenario('b2-rin','bank-consumed-no-repeat-bonus',({run,check})=>{
  const steps=[cast('Q',.2),cast('W',.3),cast('W',.2),wait(15),cast('W',.4)];
  const r=run('banked',steps,{setup:{foe:{hpPct:1}}});
  const c=run('never-banked',[wait(.2),...steps.slice(1)],{setup:{foe:{hpPct:1}}});
  const a=run('consume-ablated',steps.slice(0,2),{setup:{foe:{hpPct:1}},remove:{slot:'W',kind:'consumeStatus'}});
  const firstBonus=damage(r.steps[1],'b2-rin','W')-damage(c.steps[1],'b2-rin','W');
  const repeatBonus=damage(r.steps[4],'b2-rin','W')-damage(c.steps[4],'b2-rin','W');
  check('deposit and first shot accepted',r.steps[0].accepted&&r.steps[1].accepted);
  check('comparison shots accepted',c.steps[1].accepted&&c.steps[4].accepted&&a.steps[0].accepted&&a.steps[1].accepted);
  check('first shot has actual bank bonus',firstBonus>0,{firstBonus});
  check('first shot consumes bank before natural expiry',countStatus(r.steps[1].after,'caster','nen-banked')===0&&countStatus(a.after,'caster','nen-banked')>0);
  check('immediate repeat rejected for cooldown',!r.steps[2].accepted&&r.steps[2].rejections.some(e=>e.data.reason==='cooldown'));
  check('legal later repeat has no bonus',r.steps[4].accepted&&same(repeatBonus,0),{repeatBonus});
});

// Fixed, declared seed census; no search for a flattering seed and no omissions.
const seeds=Array.from({length:24},(_,i)=>i+1);
for(const id of ['b2-luckyman','b2-kaiji'])scenario(id,'weighted-branch-seed-census',({run,check})=>{
  const outcomes={};
  for(const seed of seeds){
    const steps=[cast('R',.3)],opts={seed,setup:{caster:{hpPct:.5,manaPct:.4}}};
    const r=run(`seed-${seed}`,steps,opts),repeat=run(`seed-${seed}-repeat`,steps,opts);
    const receipts=r.events.filter(e=>['heal','shieldGained','manaRestore'].includes(e.type)&&e.data.origin===`ability:${id}.r`);
    const outcome=receipts.map(e=>e.type).sort().join('+');outcomes[outcome]=(outcomes[outcome]??0)+1;
    check(`seed ${seed}: cast and one bounded branch`,r.steps[0].accepted&&receipts.length===1,receipts);
    const expectedAmount=id==='b2-luckyman'?(outcome==='heal'?150:180):(outcome==='shieldGained'?150:r.initial.caster.maxMana*.15);
    check(`seed ${seed}: authored reward amount`,receipts.length===1&&same(receipts[0].data.amount,expectedAmount),{outcome,expectedAmount,amount:receipts[0]?.data.amount});
    check(`seed ${seed}: deterministic replay`,hash(r)===hash(repeat));
  }
  const expected=id==='b2-luckyman'?['heal','shieldGained']:['manaRestore','shieldGained'];
  check('all authored branches observed across declared seeds',expected.every(k=>outcomes[k]>0)&&Object.keys(outcomes).length===2,{seeds,outcomes});
});

scenario('b2-luckyman','evasion-seed-census',({run,check})=>{
  const counts={Q:{evades:0,hits:0},E:{evades:0,hits:0}};
  for(const seed of seeds)for(const slot of ['Q','E']){
    const steps=[cast(slot,.2),slot==='Q'?attack('foe','caster',1.3):foeCast('W',.3),stop('foe')];
    const r=run(`${slot}-seed-${seed}`,steps,{seed,setup:{caster:{manaPct:.35}}});
    const evades=events(r.steps[1],'evade',d=>d.target===r.actors.caster).length;
    const hits=events(r.steps[1],'damage',d=>d.target===r.actors.caster&&d.amount>0).length;
    counts[slot].evades+=evades;counts[slot].hits+=hits;
    const refunds=events(r.steps[1],'manaRestore',d=>d.origin==='hook:abilityPassive:b2-luckyman.passive').length;
    check(`${slot} seed ${seed}: real incoming attempt`,r.steps[0].accepted&&(slot==='Q'?events(r.steps[1],'basicAttack').length>0:r.steps[1].accepted));
    check(`${slot} seed ${seed}: refunds follow actual evasion`,evades>0?refunds>0:refunds===0,{evades,hits,refunds});
  }
  check('both evade and hit observed for each tested channel',Object.values(counts).every(c=>c.evades>0&&c.hits>0),{seeds,counts});
});

scenario('b2-uncle','root-releases-movement',({run,check})=>{
  const r=run('rooted',[cast('W',.2),{kind:'move',actor:'foe',point:{x:7,z:0},waitSec:.4},wait(.8),{kind:'move',actor:'foe',point:{x:7,z:0},waitSec:.6},foeCast('Q')]);
  check('authored root cast accepted',r.steps[0].accepted);
  check('root flag observed during initial movement order',r.steps[1].before.foe.statuses.some(s=>s.statusId==='root'&&s.root===true));
  check('rooted movement blocked',Math.hypot(r.steps[1].after.foe.x-r.steps[1].before.foe.x,r.steps[1].after.foe.z-r.steps[1].before.foe.z)<.05);
  check('root absent after expiry',!r.steps[3].before.foe.statuses.some(s=>s.root));
  check('movement resumes after expiry',r.steps[3].after.foe.x-r.steps[3].before.foe.x>.5);
  check('actor can cast after expiry',r.steps[4].accepted);
});
scenario('b2-yogiri','silence-releases-casting',({run,check})=>{
  const r=run('silenced',[cast('Q',.2),cast('EX',.2),foeCast('W',.2),wait(2.6),foeCast('W',.3),{kind:'move',actor:'foe',point:{x:7,z:0},waitSec:.5}]);
  check('Q and EX accepted',r.steps[0].accepted&&r.steps[1].accepted);
  check('silence flag present at rejected attempt',r.steps[2].before.foe.alive&&r.steps[2].before.foe.statuses.some(s=>s.silenced));
  check('attempt rejected specifically for silence',!r.steps[2].accepted&&r.steps[2].rejections.some(e=>e.data.reason==='silenced'));
  check('silence absent after expiry and cast accepted',!r.steps[4].before.foe.statuses.some(s=>s.silenced)&&r.steps[4].accepted);
  check('actor moves after expiry',r.steps[5].after.foe.x-r.steps[5].before.foe.x>.5);
});

const drift=[];
if(hash(read('report.json'))!==buildHash)drift.push('BUILD_CHANGED_DURING_VERIFICATION');
if(hash(readFileSync(new URL(import.meta.url)))!==verifierSha256)drift.push('VERIFIER_CHANGED_DURING_VERIFICATION');
if(hash(readFileSync(new URL('./sim-harness.mjs',import.meta.url)))!==harnessSha256)drift.push('HARNESS_CHANGED_DURING_VERIFICATION');
for(const [id,d]of drafts)if(hash(read(`private/compiled/${id}.json`))!==hash(d))drift.push(`COMPILED_CHANGED_DURING_VERIFICATION:${id}`);
const report={schema:'ggd-batch2-special-review@1',buildHash,engineCommit:build.engineCommit,baselineDigest:baseline.digest,verifierSha256,harnessSha256,
  status:cases.every(c=>c.status==='passed')&&!drift.length?'passed':'failed',drift,cases,
  counts:{cases:cases.length,passed:cases.filter(c=>c.status==='passed').length,timelines:cases.reduce((n,c)=>n+c.timelineCount,0),assertions:cases.reduce((n,c)=>n+c.checks.length,0)},
  limits:[
    'Bounded level-18, rank-1 practice scenarios with real casts, attacks, movement, runtime flags and expiry; not exhaustive combat, balance or multiplayer validation.',
    'Seed census is exactly integers 1 through 24 and retains every result. It demonstrates observed branches and deterministic replays; it does not estimate or prove long-run probability.',
    'Rin has a cooldown longer than the four-second bank lifetime. Immediate bank removal is compared with consumption ablation; immediate recast must reject, and later legal recast is compared with a never-banked control.',
    'Damage tests use emitted damage events with the authored origin, avoiding HP regeneration as a false bonus. No required status or cooldown is injected.',
    'Yogiri no-kill check verifies absence of an unconditional kill effect and survival in the named fixtures. Finite ordinary damage can still kill a sufficiently weak target.'
  ]};
writeFileSync(resolve(dir,'special-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,...report.counts,drift}));
process.exitCode=report.status==='passed'?0:1;
