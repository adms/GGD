import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const code=path.join(root,'GGD-hero-auto-forge/tools/forge-training');
const python='/private/tmp/ggd-forge-mlx-20260906-venv/bin/python';
const runtime='/private/tmp/ggd-forge-training-runtime',lock=path.join(runtime,'gpu.lock');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const digest=v=>crypto.createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const put=(n,v)=>fs.writeFileSync(path.join(here,n),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
async function hash(p){const h=crypto.createHash('sha256');for await(const b of fs.createReadStream(p))h.update(b);return h.digest('hex');}
const mode=process.argv[2];assert(['prepare','run'].includes(mode));
if(mode==='prepare'){
 const data=path.join(root,'outputs/community37-corrected-dataset-20260907-v1/data');
 const all=read(path.join(data,'cases.private.json')),manifest=read(path.join(data,'dataset-manifest.json'));
 assert.equal(digest(all),manifest.casesSha256);
 const keys=new Set(['01.Q','02.E','04.R','06.Q','11.W','15.EX','17.E','19.W','22.R','26.W','32.EX','22.EX','19.R','13.HERO','30.HERO','32.HERO']);
 const cases=all.filter(c=>keys.has(c.heroIndex+'.'+c.slot));assert.equal(cases.length,43);
 const requests=cases.map(({id,messages,requestDigest})=>({id,messages,requestDigest}));
 const refs={r3:read(path.join(root,'outputs/forge-mechanism-priority-r3-20260906/native-reference.json')),r7:read(path.join(root,'outputs/forge-low-lr-r7-v2-20260906/native-reference.json'))};assert.equal(refs.r3.base,refs.r7.base);
 put('cases.private.json',cases);put('requests.json',requests);put('model-references.json',refs);
 const files=[path.join(data,'cases.private.json'),path.join(data,'dataset-manifest.json'),...['run.mjs','cases.private.json','requests.json','model-references.json'].map(n=>path.join(here,n)),...['worker.py','prompt-budget.py','r3-score.mjs','r6-score.mjs','classification-score.mjs','composition-client.mjs'].map(n=>path.join(code,n))];
 const pins=[];for(const p of files)pins.push({path:p,sha256:await hash(p)});
 put('PREPARATION.json',{authorizedAction:'User: 可以推論了; inference only, not training',createdAt:new Date().toISOString(),count:43,plannedCalls:129,models:['base','r3','r7'],selection:'Fixed source units before any new model outputs; hard-case diagnostic, not random or unseen release test',selectedSourceUnits:[...keys],pins,trainingCallsAllowed:false,oldCancelMarkersUntouched:true,cloudGpu:false});
 const check=spawnSync(python,[path.join(code,'prompt-budget.py'),'--model',refs.r3.base,'--requests',path.join(here,'requests.json'),'--output',path.join(here,'token-budget.json')],{encoding:'utf8',timeout:60000,env:{...process.env,TOKENIZERS_PARALLELISM:'false'}});process.stdout.write(check.stdout??'');process.stderr.write(check.stderr??'');assert.equal(check.status,0,'TOKEN_BUDGET_FAILED');
 console.log('PREPARED_INFERENCE_ONLY');
}else{
 assert(!fs.existsSync(path.join(here,'state.json')),'REFUSE_RESTART');assert(!fs.existsSync(lock),'GPU_BUSY');
 const prep=read(path.join(here,'PREPARATION.json')),refs=read(path.join(here,'model-references.json')),cases=read(path.join(here,'cases.private.json'));
 assert.equal(prep.trainingCallsAllowed,false);const token=read(path.join(here,'token-budget.json'));assert(token.allFit&&token.cpuOnly&&token.count===43);assert.equal(token.requestsSha256,await hash(path.join(here,'requests.json')));
 for(const p of prep.pins)assert.equal(await hash(p.path),p.sha256,'PIN_CHANGED:'+p.path);
 const receiptPath=path.join(path.dirname(refs.r3.base),'NATIVE_REFERENCE.json'),receipt=read(receiptPath),baseFiles=receipt.files.filter(f=>f.name.startsWith('base/'));
 async function models(){for(const f of baseFiles)assert.equal(await hash(path.join(path.dirname(refs.r3.base),f.name)),f.sha256,'BASE_CHANGED:'+f.name);for(const r of Object.values(refs))assert.equal(await hash(path.join(r.adapter,'adapters.safetensors')),r.adapterSha256,'ADAPTER_CHANGED');return{baseFiles:baseFiles.length,adapters:Object.fromEntries(Object.entries(refs).map(([n,r])=>[n,r.adapterSha256])),checkedAt:new Date().toISOString()};}
 put('models-before.json',await models());
 const start=Date.now(),cutoff=start+8*60*1000;
 const policy={deadline:new Date(cutoff+60000).toISOString(),reportReserveSeconds:60,maxMemoryGiB:12,maxSequenceTokens:4096,maxOutputTokens:256,seed:20260907,temperature:0,topP:.8,topK:20,presencePenalty:0,thinking:false,cloudGpu:false,cloudFallback:false,cloudGpuSpendLimit:0,externalTeacher:false,publish:false,activateInEditor:false,trainingCallsAllowed:false};put('policy.json',policy);
 fs.writeFileSync(lock,JSON.stringify({pid:process.pid,kind:'authorized-inference-only',root:here}),{flag:'wx'});
 const state={status:'running',pid:process.pid,startedAt:new Date(start).toISOString(),arms:[],trainingCalls:0};
 const update=()=>{fs.writeFileSync(path.join(here,'state.json.tmp'),JSON.stringify(state,null,2)+'\n');fs.renameSync(path.join(here,'state.json.tmp'),path.join(here,'state.json'));};update();
 let child=null,reason=null,killTimer=null;const arms=[];
 function stop(why){reason??=why;if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{}if(!killTimer)killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},3000);}}
 process.on('SIGINT',()=>stop('SIGINT'));process.on('SIGTERM',()=>stop('SIGTERM'));
 const timer=setInterval(()=>{if(Date.now()>=cutoff)stop('TIME_LIMIT');if(fs.existsSync(path.join(here,'CANCEL')))stop('CANCEL');},1000);
 try{
  for(const name of ['base','r3','r7']){
   assert(!reason,reason);assert(Date.now()<cutoff,'TIME_LIMIT');state.stage=name;update();
   const output=path.join(here,name+'-raw.json'),adapter=name==='base'?null:refs[name].adapter;
   const args=[path.join(code,'worker.py'),'eval','--model',refs.r3.base,'--policy',path.join(here,'policy.json'),'--data',path.join(here,'requests.json'),'--output',output];if(adapter)args.push('--adapter',adapter);
   const log=fs.openSync(path.join(here,name+'.log'),'wx');const t=Date.now();child=spawn(python,args,{stdio:['ignore',log,log],detached:true,env:{...process.env,TOKENIZERS_PARALLELISM:'false',OMP_NUM_THREADS:'4'}});fs.closeSync(log);state.workerPid=child.pid;update();
   const exit=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});child=null;clearTimeout(killTimer);killTimer=null;state.workerPid=null;update();assert(!reason&&exit===0,reason??'WORKER_EXIT:'+exit);
   const raw=read(output);assert(raw.complete&&raw.results.length===43);assert.equal(raw.metadata.thinking,false);assert.equal(raw.metadata.modelPath,refs.r3.base);assert.equal(raw.metadata.adapter,adapter);assert(raw.metadata.peakMetalBytes<=12*1024**3);
   arms.push({name,raw});state.arms.push({name,rows:43,seconds:(Date.now()-t)/1000,peakGiB:raw.metadata.peakMetalBytes/1024**3});update();console.log(JSON.stringify(state.arms.at(-1)));
  }
  const {compare}=await import(path.join(code,'r6-score.mjs'));put('comparison.json',compare(cases,arms));put('models-after.json',await models());
  state.status='complete';state.endedAt=new Date().toISOString();update();
 }catch(e){state.status='stopped-or-failed';state.error=String(e);state.endedAt=new Date().toISOString();update();console.error(e);process.exitCode=1;}
 finally{clearInterval(timer);clearTimeout(killTimer);if(fs.existsSync(lock)&&read(lock).pid===process.pid)fs.unlinkSync(lock);state.workerPid=null;state.lockReleased=true;update();put('summary.json',{...state,plannedCalls:129,completedCalls:state.arms.reduce((n,a)=>n+a.rows,0),releaseQualified:false,newDatasetTrainingRun:false,scope:'Existing model source-entailment diagnostic only; not template/generation/visual qualification'});}
}
