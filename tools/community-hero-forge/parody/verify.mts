import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {evaluateCombo,loadBaseline,probePassiveBehavior,probeExpiry,runSequence,hash} from './sim-harness.mjs';
import {probeSlots} from './slot-probes.mjs';
import {passiveScenarios} from './test-cases.mjs';
import {inspectDiversity} from '../kit-diversity.mjs';
const out=path.resolve(process.argv[2]??'/private/tmp/ggd-first37-parody');
const build=JSON.parse(fs.readFileSync(path.join(out,'build.json'),'utf8'));
for(const [name,digest] of Object.entries(build.sourceHashes))assert.equal(hash(fs.readFileSync(new URL(name,import.meta.url))),digest,`STALE_BUILD_SOURCE:${name}`);
const {baseline}=loadBaseline();
const report:any={schema:'ggd-first37-parody-causal-report@1',buildSha256:hash(fs.readFileSync(path.join(out,'build.json'))),baselineDigest:baseline.digest,heroes:[],counts:{heroes:0,combos:0,passed:0,failed:0},publicationVerified:false};
const drafts=[];
const cast=(slot:string,extra:any={})=>({kind:'cast',slot,waitSec:.3,...extra});
fs.mkdirSync(path.join(out,'evidence'),{recursive:true});
for(const hero of build.heroes){
 if(hero.error)continue;
 const draft=JSON.parse(fs.readFileSync(path.join(out,`${hero.number}.compiled.json`),'utf8'));
 drafts.push({id:draft.champion.id,name:hero.name,draft});
 const row:any={number:hero.number,name:hero.name,signature:hero.signature,combos:[],boundaries:[],passives:[],expiry:[]};report.heroes.push(row);
 for(const [i,c]of hero.combos.entries()){
  try{
   const result=evaluateCombo(draft,c,{baseline,relatedChampions:draft.relatedChampions??[]});
   const evidence=path.join(out,'evidence',`${hero.number}-combo-${i+1}.json`);
   const raw=JSON.stringify(result);fs.writeFileSync(evidence,raw+'\n');
   const {runs,...summary}=result;
   row.combos.push({...summary,evidence:path.relative(out,evidence),sha256:hash(raw+'\n')});
   console.log(`${hero.number}/${i+1}: ${result.status} ${JSON.stringify(result.values)} ${JSON.stringify(result.validationErrors)}`);
  }catch(e){row.combos.push({status:'failed',error:String(e)});console.log(`${hero.number}/${i+1}: ${String(e)}`);}
 }
 if(hero.group==='rewrite'){
  const options={baseline,relatedChampions:draft.relatedChampions??[]};
  row.slotProbes=probeSlots(hero.number,draft,options).map((p:any)=>{const {normal,control,...summary}=p;fs.writeFileSync(path.join(out,'evidence',`${hero.number}-${p.slot}-payload.json`),JSON.stringify(p)+'\n');console.log(`${hero.number}/${p.slot} payload: ${p.status}`);return summary;});
  for(const probe of probePassiveBehavior(draft,options,passiveScenarios[hero.number]??[])){
   const {normal,disabled,...summary}=probe;row.passives.push(summary);
   const evidence=path.join(out,'evidence',`${hero.number}-passive-${row.passives.length}.json`);fs.writeFileSync(evidence,JSON.stringify(probe)+'\n');
   console.log(`${hero.number}/P: ${probe.status} ${probe.event} ${probe.error??''}`);
  }
  for(const [slot,a]:any of Object.entries(draft.abilityDrafts)){
   if(slot==='PASSIVE')continue;
   if(a.manaCost[0]>0){
    const r=runSequence(draft,{...options,recordFrames:false,setup:{caster:{manaPct:0}},steps:[cast(slot)]});
    row.boundaries.push({slot,kind:'no-mana',passed:!r.steps[0].accepted&&r.steps[0].rejections.some((e:any)=>e.data.reason==='no-mana'),rejections:r.steps[0].rejections});
   }
   if(a.castType==='targeted'){
    const r=runSequence(draft,{...options,recordFrames:false,steps:[cast(slot,{target:a.targetsEnemies===false?'foe':'ally'})]});
    row.boundaries.push({slot,kind:'wrong-team',passed:!r.steps[0].accepted&&r.steps[0].rejections.some((e:any)=>e.data.reason==='bad-target')});
   }
   const e=probeExpiry(draft,slot,options);if(e){const {run,...summary}=e;row.expiry.push(summary);}
  }
  if(hero.number==='22'){
   const r=runSequence(draft,{...options,setup:{caster:{hpPct:.001}},steps:[cast('Q',{actor:'foe',target:'caster'}),{kind:'wait',waitSec:.7}]});
   const mark=r.after.caster.marks[`${draft.champion.id}.second-chance`];
   row.boundaries.push({slot:'PASSIVE',kind:'real-lethal-save-once',passed:r.after.caster.alive&&mark?.count===0,mark,hp:r.after.caster.hp});
  }
 }
}
report.diversity=inspectDiversity(drafts);
report.counts={heroes:report.heroes.length,combos:report.heroes.flatMap((h:any)=>h.combos).length,passed:report.heroes.flatMap((h:any)=>h.combos).filter((c:any)=>c.status==='passed').length,failed:report.heroes.flatMap((h:any)=>h.combos).filter((c:any)=>c.status!=='passed').length,slotProbes:report.heroes.flatMap((h:any)=>h.slotProbes??[]).length,slotProbeFailures:report.heroes.flatMap((h:any)=>h.slotProbes??[]).filter((p:any)=>p.status!=='passed').length,passives:report.heroes.flatMap((h:any)=>h.passives).length,passiveFailures:report.heroes.flatMap((h:any)=>h.passives).filter((p:any)=>p.status!=='passed').length,boundaries:report.heroes.flatMap((h:any)=>h.boundaries).length,boundaryFailures:report.heroes.flatMap((h:any)=>h.boundaries).filter((b:any)=>!b.passed).length,expiryFailures:report.heroes.flatMap((h:any)=>h.expiry).filter((e:any)=>e.status==='failed').length};
fs.writeFileSync(path.join(out,'behavior.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.counts));if(report.counts.slotProbeFailures||report.counts.failed||report.counts.passiveFailures||report.counts.boundaryFailures||report.counts.expiryFailures)process.exitCode=1;
