/** Corrected one-shot continuation of a live R3 run; replaces cancelled diagnostic v1. No training, checkpoint selection or promotion. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {digest} from './dataset.mjs';import {summarize,paired} from './r3-score.mjs';import {validateDiagnostic} from './r3-fidelity-diagnostic.mjs';
const [root,python,runtime]=process.argv.slice(2);for(const p of [root,python,runtime])assert(p&&path.isAbsolute(p));
const dir=path.dirname(fileURLToPath(import.meta.url)),out=path.join(root,'post-diagnostics-v2');assert(!fs.existsSync(out),'REFUSE_RESTART');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const policyPath=path.join(root,'experiment-policy.json'),policy=read(policyPath),origin=read(path.join(root,'run-pins.json'));
for(const k of ['cloudGpu','cloudFallback','externalTeacher','publish','activateInEditor'])assert.equal(policy[k],false);
assert.equal(policy.cloudGpuSpendLimit,0);assert.equal(policy.thinking,false);
const parentAtStart=read(path.join(root,'run-state.json'));assert.equal(parentAtStart.status,'running','REQUIRES_LIVE_R3');process.kill(parentAtStart.pid,0);
const datasets=['main-diagnostic-v2','fidelity-diagnostic-v2','main-hero-diagnostic-v1'].map(name=>{
 const dataRoot=path.join(root,name),requests=read(path.join(dataRoot,'requests.json')),cases=read(path.join(dataRoot,'cases.private.json')),manifest=read(path.join(dataRoot,'manifest.json')),budget=read(path.join(dataRoot,'token-budget.json'));
 assert.equal(manifest.trainingEligible,false);assert.equal(manifest.releaseQualified,false);assert.equal(manifest.casesSha256,digest(cases));assert.equal(budget.allFit,true);assert.equal(budget.requestsSha256,hash(path.join(dataRoot,'requests.json')));
 assert.deepEqual(requests,cases.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));
 return {name,dataRoot,cases};
});
const pinFiles=[policyPath,path.join(root,'run-pins.json'),path.join(root,'main-catalog-review-v2.json'),path.join(root,'main-data-corrections-v2.json'),path.join(root,'main-growth-receiver-probe.json'),path.join(root,'main-hero-inventory-v2.json'),...datasets.flatMap(d=>['requests.json','cases.private.json','manifest.json','token-budget.json'].map(n=>path.join(d.dataRoot,n))),...['worker.py','r3-score.mjs','classification-score.mjs','r3-fidelity-client.mjs','r3-fidelity-diagnostic.mjs','r3-data.mjs','dataset.mjs'].map(n=>path.join(dir,n)),path.join(root,'fidelity-diagnostic-v2/bundle.private.json')];
const pins=pinFiles.map(p=>({path:p,sha256:hash(p)}));
const checkPins=()=>{for(const p of pins)assert.equal(hash(p.path),p.sha256,'PIN_CHANGED:'+p.path);};
fs.mkdirSync(out);const put=(n,x)=>{const p=path.join(out,n);fs.writeFileSync(p+'.tmp',JSON.stringify(x,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
const state={status:'waiting-for-r3',pid:process.pid,parentPid:parentAtStart.pid,stages:[],startedAt:new Date().toISOString()};put('state.json',state);put('pins.json',{pins,model:origin.model,r2adapter:origin.r2adapter,releaseQualified:false});
const cutoff=Date.parse(policy.deadline)-policy.reportReserveSeconds*1000,lock=path.join(runtime,'gpu.lock');let child=null,reason=null,owned=false,killTimer=null;
function stop(why){if(reason)return;reason=why;if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},3000);}}
process.on('SIGTERM',()=>stop('SIGNAL'));process.on('SIGINT',()=>stop('SIGNAL'));
function guard(){assert(!reason,reason);assert(Date.now()<cutoff,'DEADLINE');assert(!fs.existsSync(path.join(root,'CANCEL'))&&!fs.existsSync(path.join(out,'CANCEL')),'CANCEL');checkPins();}
try{
 while(true){
  guard();const parent=read(path.join(root,'run-state.json'));
  if(parent.status==='complete-research-only')break;
  assert.equal(parent.status,'running','R3_NOT_SUCCESSFUL');assert.equal(parent.pid,parentAtStart.pid);process.kill(parent.pid,0);
  await new Promise(resolve=>setTimeout(resolve,10000));
 }
 // Parent publishes completion just before releasing its lock. Never remove its lock.
 for(let i=0;fs.existsSync(lock)&&i<30;i++){guard();await new Promise(resolve=>setTimeout(resolve,1000));}
 fs.writeFileSync(lock,JSON.stringify({pid:process.pid,root:out,kind:'r3-post-diagnostics-v2'}),{flag:'wx'});owned=true;
 const selected=read(path.join(root,'native-reference.json'));assert.equal(selected.base,origin.model);assert.equal(hash(path.join(selected.adapter,'adapters.safetensors')),selected.adapterSha256);
 state.status='running';put('state.json',state);
 const arms=[{id:'base',adapter:null},{id:'r2',adapter:origin.r2adapter},{id:'r3',adapter:selected.adapter}];
 put('arms.json',{arms,selectedAdapterSha256:selected.adapterSha256,selection:'already fixed by R3 dev before its sealed test; these diagnostics cannot change checkpoint',releaseQualified:false});
 const scores={};
 for(const d of datasets){scores[d.name]={};for(const arm of arms){
  guard();const stage=d.name+'-'+arm.id,output=path.join(out,stage+'.json');assert(!fs.existsSync(output));state.stage=stage;put('state.json',state);
  const args=[path.join(dir,'worker.py'),'eval','--model',origin.model,'--policy',policyPath,'--data',path.join(d.dataRoot,'requests.json'),'--output',output];if(arm.adapter)args.push('--adapter',arm.adapter);
  const log=fs.openSync(path.join(out,stage+'.log'),'wx');child=spawn(python,args,{stdio:['ignore',log,log],detached:true});fs.closeSync(log);put('worker-lease.json',{pid:child.pid,parent:process.pid,stage});
  const timer=setInterval(()=>{try{guard();}catch(e){stop(String(e));}},2000);
  let code;try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});}finally{clearInterval(timer);clearTimeout(killTimer);child=null;put('worker-lease.json',{pid:null,stage});}
  assert(!reason&&code===0,reason??'WORKER_FAILED:'+code);guard();
  const raw=read(output);assert.equal(raw.metadata.modelPath,origin.model);assert.equal(raw.metadata.adapter,arm.adapter);
  const score=summarize(d.cases,raw);scores[d.name][arm.id]=score;put(stage+'-score.json',score);
  if(d.name.startsWith('fidelity-'))put(stage+'-checklists.json',validateDiagnostic(read(path.join(d.dataRoot,'bundle.private.json')),raw));
  state.stages.push({stage,completedAt:new Date().toISOString(),score:{passed:score.passed,total:score.total,unsafe:score.unsafe}});put('state.json',state);console.log(JSON.stringify(state.stages.at(-1)));
 }}
 put('comparison.json',{scores,paired:Object.fromEntries(datasets.map(d=>[d.name,{r3VsBase:paired(scores[d.name].base,scores[d.name].r3),r3VsR2:paired(scores[d.name].r2,scores[d.name].r3)}])),releaseQualified:false,automaticActivation:false,checkpointReselected:false,scope:'Supplementary diagnostic only; corrected main version adaptation, full-proposal checklist omissions, and hero identity/origin/source controls. Does not replace hero/Owner gold or R3 held-out results.'});
 state.status='complete-research-only';state.completedAt=new Date().toISOString();put('state.json',state);
}catch(e){state.status='failed';state.error=String(e);put('state.json',state);console.error(e);process.exitCode=1;}
finally{clearTimeout(killTimer);if(owned&&fs.existsSync(lock)&&read(lock).pid===process.pid)fs.unlinkSync(lock);put('worker-lease.json',{pid:null,reason,endedAt:new Date().toISOString()});}
