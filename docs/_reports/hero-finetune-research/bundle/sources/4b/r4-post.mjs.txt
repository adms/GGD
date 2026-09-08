/** One-shot R4 continuation: retain hero/fidelity/main gains and measure VFX drift.
 * Waits for completed dev selection and test. Never changes model selection.
 */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {digest} from './dataset.mjs';import {compareArms,renderReport} from './r3-error-report.mjs';import {summarize} from './r3-score.mjs';import {validateDiagnostic} from './r3-fidelity-diagnostic.mjs';
const [root,python,runtime]=process.argv.slice(2);for(const p of [root,python,runtime])assert(p&&path.isAbsolute(p));
const dir=path.dirname(fileURLToPath(import.meta.url)),read=p=>JSON.parse(fs.readFileSync(p)),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const manifest=read(path.join(root,'dataset-manifest.json')),r3=manifest.parent,r2=path.resolve(r3,'../forge-classification-reviewed-r2-20260906');
const parentStart=read(path.join(root,'run-state.json'));assert.equal(parentStart.status,'running');process.kill(parentStart.pid,0);
const out=path.join(root,'post-diagnostics-v2');assert(!fs.existsSync(out),'REFUSE_RESTART');fs.mkdirSync(out);
const put=(n,x)=>{const p=path.join(out,n);fs.writeFileSync(p+'.tmp',JSON.stringify(x,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
const policyPath=path.join(root,'experiment-policy.json'),policy=read(policyPath),cutoff=Date.parse(policy.deadline)-policy.reportReserveSeconds*1000;
for(const k of ['cloudGpu','cloudFallback','externalTeacher','publish','activateInEditor','thinking'])assert.equal(policy[k],false);assert.equal(policy.cloudGpuSpendLimit,0);
const original=read(path.join(root,'run-pins.json'));
// The R3 run pinned the exact R2 adapter used for its controls.
const r2adapter=read(path.join(r3,'run-pins.json')).r2adapter;
const datasets=['main-hero-diagnostic-v1','fidelity-diagnostic-v2','main-diagnostic-v3'].map(name=>({name,where:path.join(r3,name),cases:read(path.join(r3,name,'cases.private.json'))}));
for(const d of datasets)assert.deepEqual(read(path.join(d.where,'requests.json')),d.cases.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));
const vfx=read(path.join(r2,'cases.private.json')).filter(c=>c.task==='vfx-semantic'&&c.split!=='train');assert(vfx.length>0);put('vfx-cases.private.json',vfx);put('vfx-requests.json',vfx.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));
const r4train=read(path.join(root,'cases.private.json')).filter(c=>c.split==='train');
const vfxOverlap=vfx.map(c=>{
 const request=JSON.parse(c.messages[1].content).request;
 assert(!r4train.some(t=>t.requestDigest===c.requestDigest||(t.task==='vfx-semantic'&&JSON.parse(t.messages[1].content).request===request)),'VFX_EXACT_REQUEST_LEAK');
 return{id:c.id,split:c.split,lineage:c.lineage,seenTrainingFamily:r4train.some(t=>t.lineage==='retention-'+c.lineage)};
});
put('vfx-family-audit.json',{rows:vfxOverlap,total:vfxOverlap.length,seenTrainingFamily:vfxOverlap.filter(r=>r.seenTrainingFamily).length,exactRequestOverlap:0,scope:'Same-family wording variants are retention diagnostics, not unseen-family generalization. Both groups reported separately.'});
const files=[fileURLToPath(import.meta.url),policyPath,path.join(root,'run-pins.json'),path.join(out,'vfx-cases.private.json'),path.join(out,'vfx-requests.json'),path.join(r3,'fidelity-diagnostic-v2/bundle.private.json'),path.join(r3,'main-catalog-review-v3.json'),...datasets.flatMap(d=>[path.join(d.where,'cases.private.json'),path.join(d.where,'requests.json'),...['base','r3'].map(a=>path.join(r3,'post-diagnostics-v3',d.name+'-'+a+'.json'))]),...['worker.py','r3-error-report.mjs','r3-score.mjs','classification-score.mjs','r3-fidelity-diagnostic.mjs','r3-fidelity-client.mjs','r3-data.mjs','dataset.mjs'].map(n=>path.join(dir,n))];
const pins=files.map(p=>({path:p,sha256:hash(p)}));const checkPins=()=>{for(const p of pins)assert.equal(hash(p.path),p.sha256,'PIN_CHANGED:'+p.path);};
put('pins.json',{pins,model:original.model,r3adapter:original.r3adapter,r2adapter,releaseQualified:false});
const state={status:'waiting-for-r4',pid:process.pid,parentPid:parentStart.pid,startedAt:new Date().toISOString(),stages:[]};put('state.json',state);
let reason=null,child=null,killTimer,owned=false;const lock=path.join(runtime,'gpu.lock');
function stop(why){if(reason)return;reason=why;if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},3000);}}
function guard(){assert(!reason,reason);assert(Date.now()<cutoff,'DEADLINE');assert(!fs.existsSync(path.join(root,'CANCEL'))&&!fs.existsSync(path.join(out,'CANCEL')),'CANCEL');checkPins();}
process.on('SIGTERM',()=>stop('SIGNAL'));process.on('SIGINT',()=>stop('SIGNAL'));
async function evaluate(stage,requests,adapter){
 guard();state.status='running';state.stage=stage;put('state.json',state);const output=path.join(out,stage+'.json'),args=[path.join(dir,'worker.py'),'eval','--model',original.model,'--policy',policyPath,'--data',requests,'--output',output];if(adapter)args.push('--adapter',adapter);
 const log=fs.openSync(path.join(out,stage+'.log'),'wx');child=spawn(python,args,{stdio:['ignore',log,log],detached:true});fs.closeSync(log);put('worker-lease.json',{pid:child.pid,parent:process.pid,stage});
 const timer=setInterval(()=>{try{guard();}catch(e){stop(String(e));}},2000);let code;try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});}finally{clearInterval(timer);clearTimeout(killTimer);child=null;put('worker-lease.json',{pid:null,stage});}
 assert(!reason&&code===0,reason??'WORKER_EXIT:'+stage+':'+code);guard();const raw=read(output);assert.equal(raw.metadata.modelPath,original.model);assert.equal(raw.metadata.adapter,adapter??null);state.stages.push({stage,completedAt:new Date().toISOString()});put('state.json',state);console.log(JSON.stringify(state.stages.at(-1)));return raw;
}
function report(name,cases,arms){const report=compareArms(cases,arms);put(name+'-report.json',report);fs.writeFileSync(path.join(out,name+'-REPORT.md'),renderReport(report),{flag:'wx'});return{name,scores:Object.fromEntries(Object.entries(report.scores).map(([k,s])=>[k,{total:s.total,passed:s.passed,unsafe:s.unsafe,tasks:s.tasks}])),comparisons:report.comparisons};}
try{
 while(true){guard();const p=read(path.join(root,'run-state.json'));assert.equal(p.pid,parentStart.pid);if(p.status==='complete-research-only')break;assert.equal(p.status,'running','R4_FAILED');process.kill(p.pid,0);await new Promise(r=>setTimeout(r,10000));}
 for(let i=0;fs.existsSync(lock)&&i<30;i++){guard();await new Promise(r=>setTimeout(r,1000));}
 fs.writeFileSync(lock,JSON.stringify({pid:process.pid,kind:'r4-post',root:out}),{flag:'wx'});owned=true;
 const native=read(path.join(root,'native-reference.json'));assert.equal(native.base,original.model);assert.equal(hash(path.join(native.adapter,'adapters.safetensors')),native.adapterSha256);const reports=[];
 for(const d of datasets){const raw=await evaluate(d.name+'-r4',path.join(d.where,'requests.json'),native.adapter);reports.push(report(d.name,d.cases,[...['base','r3'].map(name=>({name,raw:read(path.join(r3,'post-diagnostics-v3',d.name+'-'+name+'.json'))})),{name:'r4',raw}]));if(d.name.startsWith('fidelity-'))put(d.name+'-r4-checklists.json',validateDiagnostic(read(path.join(d.where,'bundle.private.json')),raw));}
 const vfxArms=[];for(const [name,adapter] of [['base',null],['r2',r2adapter],['r3',original.r3adapter],['r4',native.adapter]])vfxArms.push({name,raw:await evaluate('vfx-'+name,path.join(out,'vfx-requests.json'),adapter)});
 reports.push(report('vfx-all',vfx,vfxArms));for(const split of ['dev','test']){const cs=vfx.filter(c=>c.split===split),ids=new Set(cs.map(c=>c.id));reports.push(report('vfx-'+split,cs,vfxArms.map(a=>({...a,raw:{...a.raw,results:a.raw.results.filter(r=>ids.has(r.id))}}))));}
 for(const seen of [false,true]){const ids=new Set(vfxOverlap.filter(r=>r.seenTrainingFamily===seen).map(r=>r.id)),cs=vfx.filter(c=>ids.has(c.id));if(cs.length)reports.push(report(seen?'vfx-seen-family-retention':'vfx-family-disjoint',cs,vfxArms.map(a=>({...a,raw:{...a.raw,results:a.raw.results.filter(r=>ids.has(r.id))}}))));}
 // All selection and original test reports are CPU-only and do not reselect.
 const coreCases=read(path.join(root,'cases.private.json')),selection=read(path.join(root,'selection.json'));
 reports.push(report('core-dev',coreCases.filter(c=>c.split==='dev'),[['base','base-dev'],['r3','r3-dev'],['r4','dev-'+selection.selected.epoch]].map(([name,stem])=>({name,raw:read(path.join(root,stem+'.json'))}))));
 for(const cohort of ['r3-exposed-regression','r4-prospective-same-source-diagnostic']){const cs=coreCases.filter(c=>c.cohort===cohort),ids=new Set(cs.map(c=>c.id));reports.push(report(cohort,cs,[['base','test-base'],['r3','test-r3'],['r4','test-selected']].map(([name,stem])=>{const raw=read(path.join(root,stem+'.json'));return{name,raw:{...raw,results:raw.results.filter(r=>ids.has(r.id))}};})));}
 put('summary.json',{reports,selectedEpoch:selection.selected.epoch,releaseQualified:false,checkpointReselected:false,editorActivated:false,scope:'Regression and prospective same-source diagnostics; not independent Owner Gold, whole hero generation, quantization or 16GB device proof.'});state.status='complete-research-evidence';state.completedAt=new Date().toISOString();put('state.json',state);console.log(JSON.stringify({status:state.status,reports:reports.length}));
}catch(e){state.status='failed';state.error=String(e);put('state.json',state);console.error(e);process.exitCode=1;}
finally{clearTimeout(killTimer);if(owned&&fs.existsSync(lock)&&read(lock).pid===process.pid)fs.unlinkSync(lock);put('worker-lease.json',{pid:null,reason,endedAt:new Date().toISOString()});}
