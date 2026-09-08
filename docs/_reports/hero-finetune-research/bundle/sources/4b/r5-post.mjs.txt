/** One bounded post-selection evaluation. Never trains, reselects or activates. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {digest} from './dataset.mjs';import {compareArms,renderReport} from './r3-error-report.mjs';import {validateDiagnostic} from './r3-fidelity-diagnostic.mjs';import {validateFidelity} from './r3-fidelity-client.mjs';
const [root,python,runtime]=process.argv.slice(2);for(const p of [root,python,runtime])assert(p&&path.isAbsolute(p));
const dir=path.dirname(fileURLToPath(import.meta.url)),read=p=>JSON.parse(fs.readFileSync(p)),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const manifest=read(path.join(root,'dataset-manifest.json')),r3=manifest.parent,r4=manifest.rejectedIteration;
const parentStart=read(path.join(root,'run-state.json'));assert(['running','complete-research-only'].includes(parentStart.status));if(parentStart.status==='running')process.kill(parentStart.pid,0);
const out=path.join(root,'post-diagnostics-v1');assert(!fs.existsSync(out),'REFUSE_RESTART');
const policyPath=path.join(root,'experiment-policy.json'),policy=read(policyPath),cutoff=Date.parse(policy.deadline)-policy.reportReserveSeconds*1000;
for(const k of ['cloudGpu','cloudFallback','externalTeacher','publish','activateInEditor','thinking'])assert.equal(policy[k],false);assert.equal(policy.cloudGpuSpendLimit,0);
const original=read(path.join(root,'run-pins.json')),previous=read(path.join(r3,'native-reference.json'));assert.equal(original.base,previous.base);assert.equal(hash(path.join(previous.adapter,'adapters.safetensors')),previous.adapterSha256);
const fresh=path.join(root,'fresh-source-diagnostic-v1');const freshManifest=read(path.join(fresh,'manifest.json'));
assert.equal(freshManifest.trainingApproved,false);assert.equal(freshManifest.selectionAllowed,false);assert.equal(freshManifest.casesSha256,digest(read(path.join(fresh,'cases.private.json'))));
const budget=read(path.join(fresh,'token-budget.json'));assert.equal(budget.allFit,true);assert.equal(budget.requestsSha256,hash(path.join(fresh,'requests.json')));
const datasets=[
 {name:'fresh-source',where:fresh},
 {name:'current-main-v4',where:path.join(r3,'main-diagnostic-v4'),controls:Object.fromEntries(['base','r3','r4'].map(n=>[n,path.join(r4,'supplement-v1','main-v4-'+n+'.json')]))},
 ...['main-hero-diagnostic-v1','fidelity-diagnostic-v2'].map(name=>({name,where:path.join(r3,name),controls:Object.fromEntries(['base','r3'].map(n=>[n,path.join(r3,'post-diagnostics-v3',name+'-'+n+'.json')]))})),
 {name:'vfx',where:path.join(r4,'post-diagnostics-v2'),caseFile:'vfx-cases.private.json',requestFile:'vfx-requests.json',controls:Object.fromEntries(['base','r3'].map(n=>[n,path.join(r4,'post-diagnostics-v2','vfx-'+n+'.json')]))},
];
for(const d of datasets){d.casePath=path.join(d.where,d.caseFile??'cases.private.json');d.requestPath=path.join(d.where,d.requestFile??'requests.json');d.cases=read(d.casePath);assert(d.cases.every(c=>c.split!=='train'));assert.deepEqual(read(d.requestPath),d.cases.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));}
const files=[fileURLToPath(import.meta.url),policyPath,path.join(root,'run-pins.json'),path.join(root,'cases.private.json'),path.join(r4,'cases.private.json'),path.join(r3,'native-reference.json'),path.join(previous.adapter,'adapters.safetensors'),path.join(r3,'main-catalog-review-v4.json'),path.join(r3,'fidelity-diagnostic-v2/bundle.private.json'),path.join(r4,'post-diagnostics-v2/vfx-family-audit.json'),...['standalone-hero-request.json','standalone-fidelity-plan.json'].map(n=>path.join(r4,n)),...['manifest.json','personal-review.json','source-snapshot.json','token-budget.json'].map(n=>path.join(fresh,n)),...datasets.flatMap(d=>[d.casePath,d.requestPath,...Object.values(d.controls??{})]),...['worker.py','source-predict.py','r5-fresh-source-data.mjs','r3-error-report.mjs','r3-score.mjs','classification-score.mjs','r3-fidelity-diagnostic.mjs','r3-fidelity-client.mjs','r3-data.mjs','dataset.mjs'].map(n=>path.join(dir,n))];
files.push(...['test-base.json','test-r3.json'].map(n=>path.join(r4,n)));
const pins=files.map(p=>({path:p,sha256:hash(p)}));fs.mkdirSync(out);
const put=(n,x)=>{const p=path.join(out,n);fs.writeFileSync(p+'.tmp',JSON.stringify(x,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
put('pins.json',{pins,base:original.base,previous,releaseQualified:false,selectionUsesPostData:false});
const state={status:'waiting-for-r5',pid:process.pid,parentPid:parentStart.pid,startedAt:new Date().toISOString(),stages:[]};put('state.json',state);
let child=null,reason=null,owned=false,killTimer;const lock=path.join(runtime,'gpu.lock');
function stop(why){if(reason)return;reason=why;if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},3000);}}
function guard(){assert(!reason,reason);assert(Date.now()<cutoff,'DEADLINE');assert(!fs.existsSync(path.join(root,'CANCEL'))&&!fs.existsSync(path.join(out,'CANCEL')),'CANCEL');for(const p of pins)assert.equal(hash(p.path),p.sha256,'PIN_CHANGED:'+p.path);}
process.on('SIGTERM',()=>stop('SIGNAL'));process.on('SIGINT',()=>stop('SIGNAL'));
function release(){if(owned&&fs.existsSync(lock)&&read(lock).pid===process.pid)fs.unlinkSync(lock);owned=false;}
async function execute(stage,args){
 guard();state.status='running';state.stage=stage;put('state.json',state);const log=fs.openSync(path.join(out,stage+'.log'),'wx');child=spawn(python,args,{stdio:['ignore',log,log],detached:true});fs.closeSync(log);put('worker-lease.json',{pid:child.pid,parent:process.pid,stage});
 const timer=setInterval(()=>{try{guard();}catch(e){stop(String(e));}},2000);let code;
 try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});}finally{clearInterval(timer);clearTimeout(killTimer);child=null;put('worker-lease.json',{pid:null,stage});}
 assert(!reason&&code===0,reason??'WORKER_EXIT:'+stage+':'+code);guard();state.stages.push({stage,completedAt:new Date().toISOString()});put('state.json',state);console.log(JSON.stringify(state.stages.at(-1)));
}
async function evaluate(stage,requests,adapter){
 const output=path.join(out,stage+'.json'),args=[path.join(dir,'worker.py'),'eval','--model',original.base,'--policy',policyPath,'--data',requests,'--output',output];if(adapter)args.push('--adapter',adapter);
 await execute(stage,args);const raw=read(output);assert.equal(raw.metadata.modelPath,original.base);assert.equal(raw.metadata.adapter,adapter??null);return raw;
}
function report(name,cases,arms){const r=compareArms(cases,arms);put(name+'-report.json',r);fs.writeFileSync(path.join(out,name+'-REPORT.md'),renderReport(r),{flag:'wx'});return{name,scores:Object.fromEntries(Object.entries(r.scores).map(([k,s])=>[k,{total:s.total,passed:s.passed,unsafe:s.unsafe,tasks:s.tasks}])),comparisons:r.comparisons};}
const subset=(arms,ids)=>arms.map(a=>({...a,raw:{...a.raw,results:a.raw.results.filter(r=>ids.has(r.id))}}));
try{
 while(true){guard();const p=read(path.join(root,'run-state.json'));assert.equal(p.pid,parentStart.pid);if(p.status==='complete-research-only')break;assert.equal(p.status,'running','R5_NOT_COMPLETE');process.kill(p.pid,0);await new Promise(r=>setTimeout(r,10000));}
 for(let i=0;fs.existsSync(lock)&&i<30;i++){guard();await new Promise(r=>setTimeout(r,1000));}
 fs.writeFileSync(lock,JSON.stringify({pid:process.pid,kind:'r5-post',root:out}),{flag:'wx'});owned=true;
 const selected=read(path.join(root,'native-reference.json')),selection=read(path.join(root,'selection.json'));assert.equal(selected.base,original.base);assert.equal(hash(path.join(selected.adapter,'adapters.safetensors')),selected.adapterSha256);assert.equal(selection.testUsed,false);assert.equal(selected.selectedStep,selection.selected.step);
 pins.push(...['native-reference.json','selection.json','test-selected.json'].map(n=>{const p=path.join(root,n);return{path:p,sha256:hash(p)};}),{path:path.join(selected.adapter,'adapters.safetensors'),sha256:selected.adapterSha256});put('selected-pins.json',{selected,pins:pins.slice(files.length)});
 const reports=[];
 for(const d of datasets){
  const arms=[];
  for(const name of ['base','r3'])arms.push({name,raw:d.controls?read(d.controls[name]):await evaluate(d.name+'-'+name,d.requestPath,name==='base'?null:previous.adapter)});
  if(d.controls?.r4)arms.push({name:'r4',raw:read(d.controls.r4)});
  const raw=await evaluate(d.name+'-r5',d.requestPath,selected.adapter);arms.push({name:'r5',raw});reports.push(report(d.name,d.cases,arms));
  if(d.name==='fresh-source')for(const lineage of [...new Set(d.cases.map(c=>c.lineage))]){const cs=d.cases.filter(c=>c.lineage===lineage);reports.push(report('fresh-'+lineage,cs,subset(arms,new Set(cs.map(c=>c.id)))));}
  if(d.name==='fidelity-diagnostic-v2')put('fidelity-checklists.json',validateDiagnostic(read(path.join(r3,'fidelity-diagnostic-v2/bundle.private.json')),raw));
  if(d.name==='vfx'){
   for(const split of ['dev','test']){const cs=d.cases.filter(c=>c.split===split);reports.push(report('vfx-'+split,cs,subset(arms,new Set(cs.map(c=>c.id)))));}
   const oldAudit=read(path.join(r4,'post-diagnostics-v2/vfx-family-audit.json')),train=read(path.join(root,'cases.private.json')).filter(c=>c.split==='train');
   for(const c of d.cases)assert(!train.some(t=>t.requestDigest===c.requestDigest),'VFX_EXACT_REQUEST_LEAK');
   const audit=oldAudit.rows.map(r=>({...r,seenTrainingFamily:train.some(t=>t.lineage==='retention-'+r.lineage)}));put('vfx-family-audit.json',{rows:audit,exactRequestOverlap:0});
   for(const seen of [false,true]){const ids=new Set(audit.filter(r=>r.seenTrainingFamily===seen).map(r=>r.id)),cs=d.cases.filter(c=>ids.has(c.id));if(cs.length)reports.push(report(seen?'vfx-seen-family-retention':'vfx-family-disjoint',cs,subset(arms,ids)));}
  }
  put('partial-summary.json',{reports,selectedStep:selected.selectedStep,releaseQualified:false});
 }
 const oldCases=read(path.join(r4,'cases.private.json')),testArms=[['base',path.join(r4,'test-base.json')],['r3',path.join(r4,'test-r3.json')],['r5',path.join(root,'test-selected.json')]].map(([name,p])=>({name,raw:read(p)}));
 for(const cohort of ['r3-exposed-regression','r4-prospective-same-source-diagnostic']){const cs=oldCases.filter(c=>c.cohort===cohort);reports.push(report(cohort,cs,subset(testArms,new Set(cs.map(c=>c.id)))));}
 release(); // The real inference entry owns its own exclusive lease.
 const smoke=[];
 for(const [name,input] of [['hero','standalone-hero-request.json'],['fidelity','standalone-fidelity-plan.json']]){
  const output=path.join(out,'entry-'+name+'.json');await execute('entry-'+name,[path.join(dir,'source-predict.py'),'--model',selected.base,'--adapter',selected.adapter,'--request',path.join(r4,input),'--output',output,'--runtime-root',runtime,'--max-memory-gib','12','--timeout-seconds','300']);
  const raw=read(output);assert.equal(raw.complete,true);assert.equal(raw.metadata.memoryLimitGiB,12);assert.equal(raw.metadata.adapter,selected.adapter);smoke.push({name,metadata:raw.metadata,requests:raw.results.length,contractPass:raw.results.every(r=>r.outputContractPass),values:raw.results.map(r=>({id:r.id,value:r.value,seconds:r.seconds}))});
  if(name==='fidelity')put('entry-fidelity-checked.json',validateFidelity(read(path.join(r4,input)),raw));
 }
 put('summary.json',{reports,smoke,selectedStep:selected.selectedStep,selectedAdapterSha256:selected.adapterSha256,selectedIsUnchangedR3:selected.adapterSha256===previous.adapterSha256,releaseQualified:false,checkpointReselected:false,editorActivated:false,scope:'Fresh repository-source diagnostics separately reported from known regression. Repository text is not latest Owner; no new selection, parameters, visuals, full hero generation, or physical 16GB claim.'});state.status='complete-research-evidence';state.completedAt=new Date().toISOString();put('state.json',state);console.log(JSON.stringify({status:state.status,reports:reports.length}));
}catch(e){state.status='failed';state.error=String(e);put('state.json',state);console.error(e);process.exitCode=1;}
finally{clearTimeout(killTimer);release();put('worker-lease.json',{pid:null,reason,endedAt:new Date().toISOString()});}
