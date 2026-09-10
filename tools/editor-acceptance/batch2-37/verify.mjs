// Reproducible, heterogeneous real-SimWorld behavior receipts for frozen data.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {gzipSync} from 'node:zlib';
import {roster} from './roster.mjs';
import {root,hash,loadBaseline,runSequence,evaluateCombo,metricValue,probePassiveBehavior,probeExpiry} from './sim-harness.mjs';

const dir=resolve(root,'docs/_reports/hero-validation-batch2-37/data');
const read=p=>JSON.parse(readFileSync(resolve(dir,p),'utf8'));
const save=(p,v)=>{const f=resolve(dir,p);mkdirSync(dirname(f),{recursive:true});writeFileSync(f,p.endsWith('.gz')?gzipSync(JSON.stringify(v)+'\n'):JSON.stringify(v,null,2)+'\n');};
const {docs,baseline}=loadBaseline(),build=read('report.json');
assert.equal(baseline.digest,build.baseline.digest,'BASELINE_DRIFT');
const statuses=new Set([...docs].filter(([k])=>k.startsWith('status-effects/')).map(([,d])=>d.id));
const walk=(x,p,out=[])=>{if(x&&typeof x==='object'){if(p(x))out.push(x);for(const v of Object.values(x))walk(v,p,out);}return out;};
const only=process.argv.find(s=>s.startsWith('--hero='))?.split('=')[1];
const report={schema:'ggd-batch2-behavior-review@2',engineCommit:build.engineCommit,buildHash:hash(build),baselineDigest:baseline.digest,
  verifierSha256:hash(readFileSync(new URL(import.meta.url))),harnessSha256:hash(readFileSync(new URL('./sim-harness.mjs',import.meta.url))),
  heroes:[],admitted:0,scope:only??'all-37',limits:[
    'Four real-operation timelines per authored combo; scalar metrics retain their own units (HP, mana, shield, position, status stacks, cooldown ticks, summon count, stats).',
    'Controls ablate a logged effect or hook only in an evaluation copy. No state injection establishes the required precondition.',
    'Raw every-tick state/events are losslessly compressed as private .json.gz evidence.',
    'Passing behavior scenarios do not establish balance, rendered assets, live game import, independent review or complete-hero admission.'
  ]};

for(const hero of roster.filter(h=>!only||h.id===only)){
  const row={id:hero.id,name:hero.name,status:'failed',pairs:[],boundaries:[],noNewStatusIds:false,noNewTemplates:false};report.heroes.push(row);
  try{
    const draft=read(`private/compiled/${hero.id}.json`),project=read(`private/teachers/${hero.id}.project.json`);
    assert.equal(hash(draft),build.heroes.find(h=>h.id===hero.id).compiledSha256,'COMPILED_CHANGED');
    for(const n of walk(draft.abilityDrafts,n=>['applyStatus','consumeStatus','status'].includes(n.kind)))if(n.statusId)assert(statuses.has(n.statusId),`NEW_STATUS:${n.statusId}`);
    row.noNewStatusIds=true;
    for(const slot of Object.values(project.acceptedPlan.slots))for(const p of slot.products)assert.equal(docs.get(`ability-templates/${p.template.ref}`)?.status,'enabled');
    row.noNewTemplates=true;
    assert(hero.combos?.length>=2,'TWO_AUTHORED_CAUSAL_COMBOS_REQUIRED');
    const options={baseline,relatedChampions:draft.relatedChampions??draft.formChampions??[],seed:1234};
    for(const [i,combo]of hero.combos.entries()){
      const result=evaluateCombo(draft,combo,options);
      const evidence=`private/evidence/${hero.id}.combo-${i+1}.json.gz`;
      save(evidence,{projectSha256:hash(project),compiledSha256:hash(draft),combo,result});
      const {runs,...summary}=result;
      row.pairs.push({...summary,evidence,evidenceSha256:hash(readFileSync(resolve(dir,evidence)))});
    }
    const boundaryEvidence=[];
    row.passiveBehavior=[];
    for(const probe of probePassiveBehavior(draft,options,hero.passiveScenarios??[])){
      const {normal,disabled,...summary}=probe;row.passiveBehavior.push(summary);
      boundaryEvidence.push({kind:'passive-runtime-positive-disabled-control',probe});
    }
    row.expiry=[];
    for(const [slot,a]of Object.entries(draft.abilityDrafts)){
      const passive=a.innateKind==='passive'||(a.passive&&a.effects.length===0)||a.marks?.length;
      if(passive){
        const r=runSequence(draft,{...options,recordFrames:false,steps:[{kind:'cast',slot,waitSec:.2}]});
        const attached=r.initial.caster.sources.some(s=>s.id.includes(a.id))||Object.keys(r.initial.caster.marks).length>0;
        const rejected=!r.steps[0].accepted&&r.steps[0].rejections.some(e=>e.data.reason==='passive');
        row.boundaries.push({kind:'passive-installation-and-noncastability',slot,passed:attached&&rejected,attached,rejected});
        boundaryEvidence.push({kind:'passive',slot,run:r});
      }else{
        const expiry=probeExpiry(draft,slot,options);
        if(expiry){const {run,...summary}=expiry;row.expiry.push(summary);boundaryEvidence.push({kind:'lifetime-expiry',probe:expiry});}
        if((a.manaCost?.[0]??0)>0||a.statusCost){
          const r=runSequence(draft,{...options,recordFrames:false,setup:{caster:{manaPct:0}},steps:[{kind:'cast',slot,waitSec:.2}]});
          const passed=!r.steps[0].accepted&&r.steps[0].rejections.length>0;
          row.boundaries.push({kind:'resource-insufficient',slot,passed,reasons:r.steps[0].rejections.map(e=>e.data.reason)});boundaryEvidence.push({kind:'zero-resource',slot,run:r});
        }
        if(a.castType==='targeted'){
          const wrong=a.targetsEnemies===false?'foe':'ally';
          const r=runSequence(draft,{...options,recordFrames:false,steps:[{kind:'cast',slot,target:wrong,waitSec:.2}]});
          const passed=!r.steps[0].accepted&&r.steps[0].rejections.length>0;
          row.boundaries.push({kind:'wrong-team-target',slot,passed,reasons:r.steps[0].rejections.map(e=>e.data.reason)});boundaryEvidence.push({kind:'wrong-team',slot,run:r});
        }
      }
    }
    for(const [i,scenario]of (hero.boundaryScenarios??[]).entries()){
      const r=runSequence(draft,{...options,...scenario});
      const assertions=(scenario.assertions??[]).map(a=>{
        const state=a.step===undefined?r.after:r.steps[a.step][a.phase??'after'];
        const actor=state[a.actor??'caster'];let passed=false,observed;
        const compare=(got,op,want)=>op==='>'?got>want:op==='>='?got>=want:op==='<'?got<want:op==='<='?got<=want:op==='!=='?got!==want:got===want;
        if(a.kind==='statusAbsent')passed=!actor.statuses.some(s=>s.statusId===a.statusId);
        if(a.kind==='summons')passed=actor.summons===a.equals;
        if(a.kind==='form')passed=actor.inAlternateForm===a.equals;
        if(a.kind==='castAccepted')passed=r.steps[a.step].accepted===a.equals;
        if(a.kind==='alive')passed=actor.alive===a.equals;
        if(a.kind==='statusFlag'){
          observed=actor.statuses.find(s=>s.statusId===a.statusId)?.[a.flag];passed=observed===a.equals;
        }
        if(a.kind==='metric'){observed=metricValue(state,a);passed=compare(observed,a.op??'===',a.value);}
        if(a.kind==='eventCount'){
          const events=a.step===undefined?r.events:r.steps[a.step].events;
          const origin=a.originSlot?`ability:${draft.abilityDrafts[a.originSlot].id}`:a.origin;
          observed=events.filter(e=>e.type===a.event&&(origin===undefined||e.data.origin===origin)
            &&(a.actorKey===undefined||e.data[a.actorKey]===r.actors[a.actor??'caster'])).length;
          passed=compare(observed,a.op??'===',a.value);
        }
        return{...a,passed,...(observed===undefined?{}:{observed})};
      });
      row.boundaries.push({kind:scenario.name??`authored-boundary-${i+1}`,passed:assertions.length>0&&assertions.every(a=>a.passed),assertions});
      boundaryEvidence.push({kind:'authored-boundary',scenario,run:r});
    }
    const boundaryPath=`private/evidence/${hero.id}.boundaries.json.gz`;save(boundaryPath,boundaryEvidence);row.boundaryEvidence=boundaryPath;row.boundaryEvidenceSha256=hash(readFileSync(resolve(dir,boundaryPath)));
    assert(row.pairs.every(p=>p.status==='passed'),'CAUSAL_COMBO_FAILED');
    assert(row.boundaries.every(b=>b.passed),'BOUNDARY_FAILED');
    assert(row.passiveBehavior.every(b=>b.status==='passed'),'PASSIVE_BEHAVIOR_FAILED');
    assert(row.expiry.every(b=>b.status!=='failed'),'EXPIRY_FAILED');
    row.status='passed';
  }catch(e){row.error=String(e);}
  console.log(hero.number,hero.name,row.status,row.error??'',row.pairs.map(p=>`${p.source}>${p.target}:${p.interaction}`).join(' '));
}
report.passed=report.heroes.filter(h=>h.status==='passed').length;
report.comboChecks=report.heroes.reduce((n,h)=>n+h.pairs.length,0);
report.timelineChecks=report.comboChecks*4;
report.boundaryChecks=report.heroes.reduce((n,h)=>n+h.boundaries.length,0);
report.passiveBehaviorChecks=report.heroes.reduce((n,h)=>n+(h.passiveBehavior?.length??0),0);
report.expiryChecks=report.heroes.reduce((n,h)=>n+(h.expiry??[]).filter(p=>p.status==='passed').length,0);
save(only?`private/evidence/${only}.behavior-partial.json`:'behavior-report.json',report);
console.log(JSON.stringify({passed:report.passed,total:report.heroes.length,combos:report.comboChecks,timelines:report.timelineChecks,boundaries:report.boundaryChecks,admitted:0}));
if(report.passed!==report.heroes.length)process.exitCode=1;
