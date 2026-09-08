/** Post-selection only: fresh predictions for base, R3 and the frozen selection. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {digest} from './dataset.mjs';
import {fileHash} from './precision-diagnostic.mjs';
import {compareArms,renderReport} from './r3-error-report.mjs';

const self=fileURLToPath(import.meta.url),dir=path.dirname(self);
const read=p=>JSON.parse(fs.readFileSync(p));
const put=(out,name,value)=>{const p=path.join(out,name);fs.writeFileSync(p+'.tmp',JSON.stringify(value,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
const localPolicy=p=>{for(const k of ['cloudGpu','cloudFallback','externalTeacher','publish','activateInEditor','thinking'])assert.equal(p[k],false,k);assert.equal(p.cloudGpuSpendLimit,0);};

export function validateDiagnostic(data,manifest,requests,budget,requestHash,training){
 assert.equal(manifest.trainingEligible??manifest.trainingApproved,false,'TRAINING_NOT_DIAGNOSTIC');
 assert.equal(manifest.selectionEligible??manifest.selectionAllowed,false,'SELECTION_NOT_DIAGNOSTIC');
 assert.equal(manifest.casesSha256,digest(data),'CASES_CHANGED');assert(data.length>0);
 assert.equal(new Set(data.map(c=>c.id)).size,data.length,'DUPLICATE_IDS');
 for(const c of data){assert.notEqual(c.split,'train');assert.equal(c.requestDigest,digest(c.messages),'MESSAGE_DIGEST_CHANGED');assert(!training.some(t=>t.requestDigest===c.requestDigest),'EXACT_TRAIN_REQUEST');}
 assert.deepEqual(requests,data.map(({id,messages,requestDigest})=>({id,messages,requestDigest})),'REQUESTS_CHANGED');
 assert.equal(budget.requestsSha256,requestHash);assert.equal(budget.allFit,true);assert.equal(budget.thinking,false);
 assert.equal(budget.count,data.length);assert.equal(budget.maxSequence,4096);assert.equal(budget.outputReserve,256);
 return {count:data.length,exactTrainOverlap:0,knownSourceIds:data.filter(c=>training.some(t=>t.sourceId&&t.sourceId===c.sourceId)).map(c=>c.id)};
}

export function requireCompleted(root){
 assert.equal(read(path.join(root,'run-state.json')).status,'complete-research-only','CORE_NOT_COMPLETE');
 assert.equal(read(path.join(root,'post-diagnostics-v1/state.json')).status,'complete-research-evidence','POST_NOT_COMPLETE');
 const selected=read(path.join(root,'native-reference.json')),selection=read(path.join(root,'selection.json'));
 assert.equal(selection.testUsed,false);assert.equal(selected.selectedStep,selection.selected.step);
 assert.equal(fileHash(path.join(selected.adapter,'adapters.safetensors')),selected.adapterSha256,'ADAPTER_CHANGED');
 return selected;
}

export function prepare(root,dataRoot,authorization,out){
 for(const p of [root,dataRoot,authorization,out])assert(path.isAbsolute(p));assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
 const coreManifest=read(path.join(root,'dataset-manifest.json')),previousPath=path.join(coreManifest.parent,'native-reference.json'),previous=read(previousPath);
 const original=read(path.join(root,'experiment-policy.json'));localPolicy(original);
 const auth=read(authorization);for(const k of ['cloudGpu','publish','activateInEditor','parameterGenerationTraining','visualValidationTraining'])assert.equal(auth[k],false);assert.equal(auth.cloudGpuSpendLimit,0);
 assert.equal(Date.parse(auth.deadline)-auth.reportReserveSeconds*1000,Date.parse(auth.gpuCutoff));assert(Date.now()<Date.parse(auth.gpuCutoff));
 const casePath=path.join(dataRoot,'cases.private.json'),requestPath=path.join(dataRoot,'requests.json'),budgetPath=path.join(dataRoot,'token-budget.json'),manifestPath=path.join(dataRoot,'manifest.json');
 const data=read(casePath),budget=read(budgetPath),manifest=read(manifestPath),training=read(path.join(root,'cases.private.json')).filter(c=>c.split==='train');
 const audit=validateDiagnostic(data,manifest,read(requestPath),budget,fileHash(requestPath),training);assert.equal(budget.model,previous.base);
 const baseReceipt=path.join(path.dirname(previous.base),'NATIVE_REFERENCE.json');assert.equal(read(baseReceipt).model,previous.base);
 const policy={...original,schema:'ggd-post-selection-paired-diagnostic@1',deadline:auth.deadline,reportReserveSeconds:auth.reportReserveSeconds,trainingAllowed:false,selectionAllowed:false,releaseQualified:false,authorization};
 const files=[self,authorization,previousPath,baseReceipt,path.join(previous.adapter,'adapters.safetensors'),path.join(previous.adapter,'adapter_config.json'),path.join(root,'dataset-manifest.json'),path.join(root,'cases.private.json'),path.join(root,'experiment-policy.json'),casePath,requestPath,budgetPath,manifestPath,path.join(dataRoot,'personal-review.json'),...['worker.py','dataset.mjs','precision-diagnostic.mjs','r3-error-report.mjs','r3-score.mjs','classification-score.mjs'].map(n=>path.join(dir,n))];
 assert.equal(fileHash(path.join(previous.adapter,'adapters.safetensors')),previous.adapterSha256);
 const pins=files.map(p=>({path:p,sha256:fileHash(p)}));fs.mkdirSync(out);
 put(out,'policy.json',policy);pins.push({path:path.join(out,'policy.json'),sha256:fileHash(path.join(out,'policy.json'))});
 put(out,'preparation.json',{root,dataRoot,previous,baseReceipt,authorization,pins,audit,manifest,preparedAt:new Date().toISOString(),trainingAllowed:false,selectionAllowed:false,releaseQualified:false,scope:'Same-input post-selection diagnostic only. Keep the original benchmark scores and denominators; clarified claims are not necessarily equivalent and are not independent new-source generalization.'});
 return {out,rows:data.length,gpuStarted:false};
}

export async function run(out,python,runtime){
 for(const p of [out,python,runtime])assert(path.isAbsolute(p));const prep=read(path.join(out,'preparation.json'));
 // These guards run before any mutation or GPU child. A live old run is never displaced.
 const selected=requireCompleted(prep.root);assert.equal(selected.base,prep.previous.base);
 assert(!fs.existsSync(path.join(out,'state.json')),'REFUSE_RESTART');const lock=path.join(runtime,'gpu.lock');assert(!fs.existsSync(lock),'GPU_BUSY');
 const policyPath=path.join(out,'policy.json'),policy=read(policyPath);localPolicy(policy);
 const cutoff=Date.parse(policy.deadline)-policy.reportReserveSeconds*1000;assert(Date.now()<cutoff-120000,'INSUFFICIENT_RESERVE');
 const pins=[...prep.pins,...['native-reference.json','selection.json','run-state.json','post-diagnostics-v1/state.json'].map(n=>{const p=path.join(prep.root,n);return {path:p,sha256:fileHash(p)};}),...['adapters.safetensors','adapter_config.json'].map(n=>{const p=path.join(selected.adapter,n);return {path:p,sha256:fileHash(p)};})];
 let child=null,reason=null,killTimer,owned=false;
 function guard(){assert(!reason,reason);assert(Date.now()<cutoff,'DEADLINE');for(const p of [prep.root,out,path.dirname(prep.authorization)])assert(!fs.existsSync(path.join(p,'CANCEL')),'CANCEL');for(const p of pins)assert.equal(fileHash(p.path),p.sha256,'PIN_CHANGED:'+p.path);}
 function verifyBase(){for(const f of read(prep.baseReceipt).files.filter(f=>f.name.startsWith('base/'))){const p=path.join(path.dirname(selected.base),f.name);assert.equal(fs.statSync(p).size,f.bytes);assert.equal(fileHash(p),f.sha256,'BASE_CHANGED:'+p);}}
 function stop(why){if(reason)return;reason=why;if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},3000);}}
 const signal=()=>stop('SIGNAL');process.on('SIGTERM',signal);process.on('SIGINT',signal);
 const state={status:'running',pid:process.pid,startedAt:new Date().toISOString(),selected,stages:[]};
 try{
  guard();verifyBase();guard();fs.writeFileSync(lock,JSON.stringify({pid:process.pid,kind:'post-selection-paired-diagnostic',out}),{flag:'wx'});owned=true;
  put(out,'run-pins.json',{pins,selected,baseBytesVerifiedAt:new Date().toISOString()});put(out,'state.json',state);
  const arms=[];
  for(const [name,adapter] of [['base',null],['r3',prep.previous.adapter],['selected',selected.adapter]]){
   guard();state.stage=name;put(out,'state.json',state);const output=path.join(out,name+'.json'),log=fs.openSync(path.join(out,name+'.log'),'wx');
   const args=[path.join(dir,'worker.py'),'eval','--model',selected.base,'--policy',policyPath,'--data',path.join(prep.dataRoot,'requests.json'),'--output',output];if(adapter)args.push('--adapter',adapter);
   child=spawn(python,args,{stdio:['ignore',log,log],detached:true});fs.closeSync(log);put(out,'worker-lease.json',{pid:child.pid,parent:process.pid,stage:name});
   const timer=setInterval(()=>{try{guard();}catch(e){stop(String(e));}},2000);let code;
   try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});}finally{clearInterval(timer);clearTimeout(killTimer);child=null;put(out,'worker-lease.json',{pid:null});}
   assert(!reason&&code===0,reason??'WORKER_EXIT:'+code);guard();const raw=read(output);assert.equal(raw.metadata.adapter,adapter);assert.equal(raw.metadata.modelPath,selected.base);arms.push({name,raw});state.stages.push({name,completedAt:new Date().toISOString()});put(out,'state.json',state);console.log(JSON.stringify(state.stages.at(-1)));
  }
  verifyBase();guard();const report=compareArms(read(path.join(prep.dataRoot,'cases.private.json')),arms);
  put(out,'report.json',report);fs.writeFileSync(path.join(out,'REPORT.md'),renderReport(report)+'\n## 診斷限制\n\n'+prep.scope+'\n',{flag:'wx'});
  put(out,'summary.json',{selectedStep:selected.selectedStep,selectedIsUnchangedR3:selected.adapterSha256===prep.previous.adapterSha256,selectedAdapterSha256:selected.adapterSha256,scores:Object.fromEntries(Object.entries(report.scores).map(([k,s])=>[k,{total:s.total,passed:s.passed,unsafe:s.unsafe,tasks:s.tasks}])),comparisons:report.comparisons,scope:prep.scope,trainingAllowed:false,selectionAllowed:false,oldScoresRewritten:false,releaseQualified:false});
  state.status='complete-research-evidence';state.completedAt=new Date().toISOString();put(out,'state.json',state);return {status:state.status,out};
 }catch(e){state.status='failed';state.error=String(e);put(out,'state.json',state);throw e;}
 finally{clearTimeout(killTimer);process.off('SIGTERM',signal);process.off('SIGINT',signal);if(owned&&fs.existsSync(lock)&&read(lock).pid===process.pid)fs.unlinkSync(lock);put(out,'worker-lease.json',{pid:null,reason,endedAt:new Date().toISOString()});}
}

if(process.argv[1]&&path.resolve(process.argv[1])===self){const [mode,...args]=process.argv.slice(2);assert(['prepare','run'].includes(mode));console.log(JSON.stringify(mode==='prepare'?prepare(...args):await run(...args)));}
