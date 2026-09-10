import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {compare,score} from '../../GGD-hero-auto-forge/tools/forge-training/r6-score.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
const read=n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8'));
const cases=read('cases.private.json'),names=['base','r3','r7'];
const labels=['supported','contradicted','not-stated'];
const mode=process.argv[2];assert(['snapshot','report'].includes(mode));
if(mode==='snapshot'){
 const errors=new Map();
 for(const name of names){
  const file=[name+'-raw.json',name+'-raw.json.partial'].find(n=>fs.existsSync(path.join(dir,n)));
  if(!file)continue;const raw=read(file);let passed=0,unsafe=0;
  raw.results.forEach((r,i)=>{
   const c=cases[i];assert.equal(r.id,c.id);assert.equal(r.requestDigest,c.requestDigest);
   const s=score(c,r.value);passed+=Number(s.pass);unsafe+=Number(s.unsafe);
   if(!s.pass){const input=JSON.parse(c.messages[1].content);const e=errors.get(c.id)??{id:c.id,unit:c.heroIndex+'.'+c.slot,source:input.source.text,claim:input.claim,gold:c.target.verdict,wrong:{}};e.wrong[name]=r.value;errors.set(c.id,e);}
  });
  console.log(JSON.stringify({model:name,complete:raw.complete??false,count:raw.results.length,passed,unsafe}));
 }
 const reviewed=process.argv.includes('--new-only')&&fs.existsSync(path.join(dir,'review-notes.json'))?read('review-notes.json'):{};
 for(const e of errors.values())if(!reviewed[e.id])console.log(JSON.stringify(e));
}else{
 const summary=read('summary.json');assert.equal(summary.status,'complete');assert.equal(summary.completedCalls,1665);
 assert.equal(summary.trainingCalls,0);assert.equal(summary.workerPid,null);assert.equal(summary.lockReleased,true);
 const arms=names.map(name=>({name,raw:read(name+'-raw.json')}));
 const comparison=compare(cases,arms);assert.deepEqual(comparison,read('comparison.json'));
 const perHero={},details={};
 for(const c of cases){perHero[c.heroIndex]??={heroIndex:c.heroIndex,name:JSON.parse(c.messages[1].content).source.text.split('\n')[0].replace(/^角色：/,''),models:{}};}
 for(const {name,raw} of arms){
  const s=comparison.scores[name],confusion=Object.fromEntries(labels.map(k=>[k,Object.fromEntries(labels.map(l=>[l,0]))]));
  const sources=new Map();
  for(let i=0;i<cases.length;i++){
   const c=cases[i],r=raw.results[i],sc=s.rows[i];assert.equal(r.error,null);assert.equal(r.finish,'stop');assert(sc.schema);
   confusion[c.target.verdict][r.value.verdict]++;
   const group=sources.get(c.sourceId)??{allCorrect:true,acceptedPositive:false,acceptedNegative:false};
   group.allCorrect&&=sc.pass;
   if(c.target.verdict==='supported'&&r.value.verdict==='supported')group.acceptedPositive=true;
   if(c.target.verdict==='contradicted'&&r.value.verdict==='supported')group.acceptedNegative=true;
   sources.set(c.sourceId,group);
   const hero=perHero[c.heroIndex].models[name]??={total:0,passed:0,unsafe:0};hero.total++;hero.passed+=Number(sc.pass);hero.unsafe+=Number(sc.unsafe);
  }
  const recalls=labels.map(k=>confusion[k][k]/Object.values(confusion[k]).reduce((a,b)=>a+b,0));
  const times=raw.results.map(r=>r.seconds).sort((a,b)=>a-b);
  details[name]={total:s.total,passed:s.passed,pct:s.passed/s.total*100,unsafe:s.unsafe,tasks:s.tasks,confusion,
   macroRecallPct:100*recalls.reduce((a,b)=>a+b,0)/labels.length,
   sourceGroups:{total:sources.size,allCorrect:[...sources.values()].filter(v=>v.allCorrect).length,acceptedBothPositiveAndContradiction:[...sources.values()].filter(v=>v.acceptedPositive&&v.acceptedNegative).length},
   meanSeconds:times.reduce((a,b)=>a+b,0)/times.length,p50Seconds:times[Math.floor(times.length*.5)],p95Seconds:times[Math.ceil(times.length*.95)-1],
   outputTokens:raw.results.reduce((n,r)=>n+r.tokens,0),...summary.arms.find(a=>a.name===name)};
 }
 const notes=fs.existsSync(path.join(dir,'review-notes.json'))?read('review-notes.json'):{};
 const errors=comparison.rows.filter(r=>names.some(n=>!r.outputs[n].score.pass)).map(r=>({...r,assistantPostInferenceReview:notes[r.id]??null,goldChanged:false,independentHumanReview:false}));
 for(const id of Object.keys(notes))assert(errors.some(e=>e.id===id),'NOTE_FOR_NON_ERROR:'+id);
 const analysis={createdAt:new Date().toISOString(),details,perHero:Object.values(perHero).sort((a,b)=>a.heroIndex.localeCompare(b.heroIndex)),comparisons:comparison.comparisons,
  questionCount:cases.length,heroCount:Object.keys(perHero).length,sourceCount:new Set(cases.map(c=>c.sourceId)).size,
  errorUnionCount:errors.length,reviewedErrorCount:errors.filter(e=>e.assistantPostInferenceReview).length,
  totalWorkerWallSeconds:summary.arms.reduce((n,a)=>n+a.seconds,0),releaseQualified:false,trainingExecuted:false,
  evidenceScope:'All 555 frozen source-entailment questions, not all hero generation or template combinations; train-candidate corpus, not independent heldout proof'};
 assert.equal(analysis.questionCount,555);assert.equal(analysis.heroCount,37);assert.equal(analysis.sourceCount,259);
 const invariants={sameOriginalCases:crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'cases.private.json'))).digest('hex')===crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,'../community37-corrected-dataset-20260907-v1/data/cases.private.json'))).digest('hex'),comparisonRecomputed:true,all1665Aligned:true,allOutputsSchemaValid:true,allOutputErrorsNull:true,allOutputFinishStop:true,releaseQualified:false};
 assert(invariants.sameOriginalCases);
 for(const [n,v] of Object.entries({'analysis.json':analysis,'error-review.json':errors,'ANALYSIS_VALIDATION.json':invariants}))fs.writeFileSync(path.join(dir,n),JSON.stringify(v,null,2)+'\n');
 console.log(JSON.stringify({...analysis,perHero:undefined},null,2));
}
