/** Zero-penalty three-arm post-selection regressions and new-source diagnostic.
 * One-shot continuation, not training, selection, cron, or product activation.
 */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {digest} from './dataset.mjs';import {fileHash} from './precision-diagnostic.mjs';import {compare,render} from './r6-score.mjs';import {validateDiagnostic} from './r3-fidelity-diagnostic.mjs';import {verifyFresh} from './r6-fresh-audit.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),read=p=>JSON.parse(fs.readFileSync(p));
export function readiness(state,alive,gpuBusy){
 if(state.status==='running'){assert(alive,'PARENT_DIED_WITHOUT_COMPLETION');return'wait';}
 assert.equal(state.status,'complete-research-only','CORE_NOT_COMPLETE');return alive||gpuBusy?'wait':'ready';
}
function alive(pid){try{process.kill(pid,0);return true;}catch(e){assert.equal(e.code,'ESRCH','PROCESS_STATE_UNCERTAIN');return false;}}
async function main(){
 const [root,python,runtime]=process.argv.slice(2);for(const p of [root,python,runtime])assert(p&&path.isAbsolute(p));
 const manifest=read(path.join(root,'dataset-manifest.json')),r3=manifest.parent,r4=manifest.previousRegression,ext=manifest.extension,outputs=path.dirname(root),original=read(path.join(root,'run-pins.json')),parentStart=read(path.join(root,'run-state.json')),previous=read(path.join(r3,'native-reference.json')),policyPath=path.join(root,'experiment-policy.json'),policy=read(policyPath),cutoff=Date.parse(policy.deadline)-policy.reportReserveSeconds*1000;
 assert(['running','complete-research-only'].includes(parentStart.status));if(parentStart.status==='running')assert(alive(parentStart.pid));assert.equal(policy.presencePenalty,0);for(const k of ['cloudGpu','cloudFallback','externalTeacher','publish','activateInEditor','thinking'])assert.equal(policy[k],false);assert.equal(policy.cloudGpuSpendLimit,0);
 verifyFresh(root);
 const fresh=path.join(root,'fresh-source-v1'),freshManifest=read(path.join(fresh,'manifest.json'));assert.equal(freshManifest.trainingAllowed,false);assert.equal(freshManifest.selectionAllowed,false);assert.equal(freshManifest.casesSha256,digest(read(path.join(fresh,'cases.private.json'))));const budget=read(path.join(fresh,'token-budget.json'));assert.equal(budget.allFit,true);assert.equal(budget.requestsSha256,fileHash(path.join(fresh,'requests.json')));
 for(const p of [...freshManifest.sourceFiles,...freshManifest.priorAuditFiles])assert.equal(fileHash(p.path),p.sha256,'FRESH_PIN_CHANGED');
 const datasets=[
  {name:'new-source-63',where:fresh,fresh:true},
  {name:'previous-source-72',where:path.join(outputs,'forge-contrastive-r5-20260906/fresh-source-diagnostic-v1')},
  {name:'current-main-v4',where:path.join(r3,'main-diagnostic-v4')},
  {name:'hero-140',where:path.join(r3,'main-hero-diagnostic-v1')},
  {name:'fidelity-114',where:path.join(r3,'fidelity-diagnostic-v2')},
  {name:'vfx-118',where:path.join(r4,'post-diagnostics-v2'),caseFile:'vfx-cases.private.json',requestFile:'vfx-requests.json'},
  {name:'composition-regression-20',where:path.join(ext,'composition-diagnostic-v2')},
  {name:'source-clarification-15',where:path.join(ext,'source-label-clarification-v1')},
 ];
 const train=read(path.join(root,'cases.private.json')).filter(c=>c.split==='train');
 for(const d of datasets){d.casePath=path.join(d.where,d.caseFile??'cases.private.json');d.requestPath=path.join(d.where,d.requestFile??'requests.json');d.cases=read(d.casePath);assert(d.cases.every(c=>c.split!=='train'));assert.deepEqual(read(d.requestPath),d.cases.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));d.exactTrainRequestOverlap=d.cases.filter(c=>train.some(t=>t.requestDigest===c.requestDigest)).map(c=>c.id);if(d.fresh)assert.equal(d.exactTrainRequestOverlap.length,0);}
 const out=path.join(root,'post-v1');assert(!fs.existsSync(out),'REFUSE_RESTART');
 const files=[fileURLToPath(import.meta.url),...['r6-score.mjs','worker.py','r3-score.mjs','classification-score.mjs','composition-client.mjs','r3-fidelity-diagnostic.mjs','r3-fidelity-client.mjs','dataset.mjs','precision-diagnostic.mjs','r6-fresh-source.mjs'].map(n=>path.join(dir,n)),policyPath,path.join(root,'run-pins.json'),path.join(root,'cases.private.json'),path.join(r3,'native-reference.json'),path.join(previous.adapter,'adapters.safetensors'),path.join(r3,'fidelity-diagnostic-v2/bundle.private.json'),path.join(r4,'post-diagnostics-v2/vfx-family-audit.json'),...['manifest.json','personal-review.json','source-snapshot.json','token-budget.json'].map(n=>path.join(fresh,n)),...datasets.flatMap(d=>[d.casePath,d.requestPath])];
 files.push(path.join(dir,'r6-fresh-audit.mjs'),path.join(fresh,'verification.json'));
 const pins=[...new Set(files)].map(p=>({path:p,sha256:fileHash(p)})),initialPinCount=pins.length;fs.mkdirSync(out);const put=(n,x)=>{const p=path.join(out,n);fs.writeFileSync(p+'.tmp',JSON.stringify(x,null,2)+'\n');fs.renameSync(p+'.tmp',p);};put('pins.json',{pins,base:original.base,previous,decodePolicySha256:fileHash(policyPath),selectionUsesPostData:false});
 const state={status:'waiting-for-core',pid:process.pid,parentPid:parentStart.pid,startedAt:new Date().toISOString(),stages:[]};put('state.json',state);let child=null,reason=null,owned=false,killTimer;const lock=path.join(runtime,'gpu.lock');
 function stop(why){if(reason)return;reason=why;if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},3000);}}
 function guard(){assert(!reason,reason);assert(Date.now()<cutoff,'GPU_CUTOFF');for(const p of [root,ext,out])assert(!fs.existsSync(path.join(p,'CANCEL')),'CANCEL');for(const p of pins)assert.equal(fileHash(p.path),p.sha256,'PIN_CHANGED:'+p.path);}
 process.on('SIGTERM',()=>stop('SIGNAL'));process.on('SIGINT',()=>stop('SIGNAL'));
 async function evaluate(stage,requests,adapter){
  guard();state.status='running';state.stage=stage;put('state.json',state);const output=path.join(out,stage+'.json'),args=[path.join(dir,'worker.py'),'eval','--model',original.base,'--policy',policyPath,'--data',requests,'--output',output];if(adapter)args.push('--adapter',adapter);const log=fs.openSync(path.join(out,stage+'.log'),'wx');child=spawn(python,args,{stdio:['ignore',log,log],detached:true});fs.closeSync(log);put('worker-lease.json',{pid:child.pid,parent:process.pid,stage});
  const timer=setInterval(()=>{try{guard();}catch(e){stop(String(e));}},2000);let code;try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});}finally{clearInterval(timer);clearTimeout(killTimer);child=null;put('worker-lease.json',{pid:null,stage});}assert(!reason&&code===0,reason??'WORKER_EXIT:'+stage+':'+code);guard();state.stages.push({stage,completedAt:new Date().toISOString()});put('state.json',state);console.log(JSON.stringify(state.stages.at(-1)));const raw=read(output);assert.equal(raw.metadata.modelPath,original.base);assert.equal(raw.metadata.adapter,adapter??null);return raw;
 }
 function report(name,cases,arms){const r=compare(cases,arms);put(name+'-report.json',r);fs.writeFileSync(path.join(out,name+'-REPORT.md'),render(r),{flag:'wx'});return{name,scores:Object.fromEntries(Object.entries(r.scores).map(([n,s])=>[n,{total:s.total,passed:s.passed,unsafe:s.unsafe,tasks:s.tasks}])),comparisons:r.comparisons};}
 const subset=(arms,ids)=>arms.map(a=>({...a,raw:{...a.raw,results:a.raw.results.filter(r=>ids.has(r.id))}}));
 try{
  while(true){guard();const core=read(path.join(root,'run-state.json'));assert.equal(core.pid,parentStart.pid);if(readiness(core,alive(core.pid),fs.existsSync(lock))==='ready')break;await new Promise(resolve=>setTimeout(resolve,10000));}
  for(const p of original.pins)assert.equal(fileHash(p.path),p.sha256,'CORE_PIN_CHANGED');
  const selected=read(path.join(root,'native-reference.json')),selection=read(path.join(root,'selection.json'));assert.equal(selection.testUsed,false);assert.equal(selected.selectedStep,selection.selected.step);assert.equal(selected.base,original.base);assert.equal(fileHash(path.join(selected.adapter,'adapters.safetensors')),selected.adapterSha256);assert.equal(selected.decoding.presencePenalty,0);
  for(const p of ['native-reference.json','selection.json','base-test.json','r3-test.json','selected-test.json'].map(n=>path.join(root,n)).concat(path.join(selected.adapter,'adapters.safetensors')))pins.push({path:p,sha256:fileHash(p)});put('selected-pins.json',{selected,pins:pins.slice(initialPinCount)});
  fs.writeFileSync(lock,JSON.stringify({pid:process.pid,kind:'r6-post',root:out}),{flag:'wx'});owned=true;
  const reports=[],overlap=[];
  for(const d of datasets){
   const arms=[];for(const name of ['base','r3','selected'])arms.push({name,raw:await evaluate(d.name+'-'+name,d.requestPath,name==='base'?null:name==='r3'?previous.adapter:selected.adapter)});reports.push(report(d.name,d.cases,arms));overlap.push({name:d.name,exactTrainRequestOverlap:d.exactTrainRequestOverlap,newSkillTextRelativeToAuditedFiles:d.fresh===true,independentHumanGold:false});
   if(d.fresh)for(const lineage of [...new Set(d.cases.map(c=>c.lineage))]){const cs=d.cases.filter(c=>c.lineage===lineage),ids=new Set(cs.map(c=>c.id));reports.push(report('new-'+lineage,cs,subset(arms,ids)));}
   if(d.name==='fidelity-114')for(const a of arms)put('fidelity-bundles-'+a.name+'.json',validateDiagnostic(read(path.join(r3,'fidelity-diagnostic-v2/bundle.private.json')),a.raw));
   if(d.name==='vfx-118'){
    const audit=read(path.join(r4,'post-diagnostics-v2/vfx-family-audit.json'));for(const seen of [false,true]){const ids=new Set(audit.rows.filter(r=>train.some(t=>t.lineage==='retention-'+r.lineage)===seen).map(r=>r.id)),cs=d.cases.filter(c=>ids.has(c.id));if(cs.length)reports.push(report(seen?'vfx-seen-family':'vfx-family-disjoint',cs,subset(arms,ids)));}
   }
   put('partial-summary.json',{selectedStep:selected.selectedStep,reports,overlap,releaseQualified:false});
  }
  const all=read(path.join(root,'cases.private.json')),arms=['base','r3','selected'].map(name=>({name,raw:read(path.join(root,name+'-test.json'))}));
  for(const cohort of ['r3-exposed-regression','r4-prospective-same-source-diagnostic','r6-familiar-plan-complete-requirements']){const cs=all.filter(c=>c.split==='test'&&c.cohort===cohort),ids=new Set(cs.map(c=>c.id));if(cs.length)reports.push(report('core-'+cohort,cs,subset(arms,ids)));}
  put('summary.json',{selectedStep:selected.selectedStep,selectedAdapterSha256:selected.adapterSha256,selectedIsUnchangedR3:selected.adapterSha256===previous.adapterSha256,reports,overlap,decodingPresencePenalty:0,oldScoresRewritten:false,checkpointReselected:false,releaseQualified:false,activation:false,realPublicEntryChecksStillRequired:true,scope:'All three arms rerun identically with zero presence penalty. New63 source texts separated from exposed/familiar-family regressions; no selection or new training from post results.'});state.status='complete-research-evidence';state.completedAt=new Date().toISOString();put('state.json',state);console.log(JSON.stringify({status:state.status,reports:reports.length}));
 }catch(e){state.status='failed';state.error=String(e);put('state.json',state);console.error(e);process.exitCode=1;}
 finally{clearTimeout(killTimer);if(owned&&fs.existsSync(lock)&&read(lock).pid===process.pid)fs.unlinkSync(lock);put('worker-lease.json',{pid:null,reason,endedAt:new Date().toISOString()});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
