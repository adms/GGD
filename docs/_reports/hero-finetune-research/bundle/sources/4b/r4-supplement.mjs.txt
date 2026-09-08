/** Run only after R4/post completion: corrected catalog and real public entry.
 * No waiting daemon, training, checkpoint selection, publishing or activation.
 */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {digest} from './dataset.mjs';import {compareArms,renderReport} from './r3-error-report.mjs';import {validateFidelity} from './r3-fidelity-client.mjs';
const [root,python,runtime]=process.argv.slice(2);for(const p of [root,python,runtime])assert(p&&path.isAbsolute(p));
const dir=path.dirname(fileURLToPath(import.meta.url)),read=p=>JSON.parse(fs.readFileSync(p)),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
assert.equal(read(path.join(root,'run-state.json')).status,'complete-research-only','WAIT_FOR_R4');
assert.equal(read(path.join(root,'post-diagnostics-v2/state.json')).status,'complete-research-evidence','WAIT_FOR_POST');
const r3=read(path.join(root,'dataset-manifest.json')).parent,where=path.join(r3,'main-diagnostic-v4'),reviewPath=path.join(r3,'main-catalog-review-v4.json'),review=read(reviewPath),manifest=read(path.join(where,'manifest.json')),cases=read(path.join(where,'cases.private.json'));
assert.equal(review.reviewVersion,4);assert.deepEqual(review.counts,{total:46,enabled:29,quarantined:6,draft:11});assert.equal(manifest.casesSha256,digest(cases));assert.equal(manifest.catalogReviewSha256,digest(review));assert.equal(manifest.changedLabels,2);
assert.deepEqual(read(path.join(where,'requests.json')),cases.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));
assert(cases.every(c=>c.split!=='train'&&!c.acceptedTargets.some(t=>t.templateId==='tpl-summon-agent')));
const policyPath=path.join(root,'experiment-policy.json'),policy=read(policyPath),cutoff=Date.parse(policy.deadline)-policy.reportReserveSeconds*1000;
for(const k of ['cloudGpu','cloudFallback','externalTeacher','publish','activateInEditor','thinking'])assert.equal(policy[k],false);assert.equal(policy.cloudGpuSpendLimit,0);
const selected=read(path.join(root,'native-reference.json')),previous=read(path.join(r3,'native-reference.json'));assert.equal(previous.base,selected.base);
for(const a of [selected,previous])assert.equal(hash(path.join(a.adapter,'adapters.safetensors')),a.adapterSha256);
const out=path.join(root,'supplement-v1'),lock=path.join(runtime,'gpu.lock');assert(!fs.existsSync(out),'REFUSE_RESTART');assert(!fs.existsSync(lock),'GPU_BUSY');assert(Date.now()<cutoff-600000,'INSUFFICIENT_EVALUATION_RESERVE');
const files=[fileURLToPath(import.meta.url),policyPath,reviewPath,...['manifest.json','cases.private.json','requests.json'].map(n=>path.join(where,n)),...['standalone-hero-request.json','standalone-fidelity-plan.json','native-reference.json'].map(n=>path.join(root,n)),...['worker.py','source-predict.py','r3-error-report.mjs','r3-score.mjs','classification-score.mjs','r3-fidelity-client.mjs','dataset.mjs'].map(n=>path.join(dir,n))];
const pins=files.map(p=>({path:p,sha256:hash(p)}));fs.mkdirSync(out);
const put=(n,x)=>{const p=path.join(out,n);fs.writeFileSync(p+'.tmp',JSON.stringify(x,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
put('pins.json',{pins,base:selected.base,adapters:[selected,previous],releaseQualified:false});
const state={status:'running',pid:process.pid,startedAt:new Date().toISOString(),stages:[]};put('state.json',state);
let child=null,reason=null,owned=false,killTimer;
function stop(why){if(reason)return;reason=why;if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},3000);}}
function guard(){assert(!reason,reason);assert(Date.now()<cutoff,'DEADLINE');assert(!fs.existsSync(path.join(root,'CANCEL'))&&!fs.existsSync(path.join(out,'CANCEL')),'CANCEL');for(const p of pins)assert.equal(hash(p.path),p.sha256,'PIN_CHANGED:'+p.path);}
process.on('SIGTERM',()=>stop('SIGNAL'));process.on('SIGINT',()=>stop('SIGNAL'));
function release(){if(owned&&fs.existsSync(lock)&&read(lock).pid===process.pid)fs.unlinkSync(lock);owned=false;}
async function execute(stage,args){
 guard();state.stage=stage;put('state.json',state);const log=fs.openSync(path.join(out,stage+'.log'),'wx');child=spawn(python,args,{stdio:['ignore',log,log],detached:true});fs.closeSync(log);put('worker-lease.json',{pid:child.pid,parent:process.pid,stage});
 const timer=setInterval(()=>{try{guard();}catch(e){stop(String(e));}},2000);let code;
 try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});}finally{clearInterval(timer);clearTimeout(killTimer);child=null;put('worker-lease.json',{pid:null,stage});}
 assert(!reason&&code===0,reason??'WORKER_EXIT:'+stage+':'+code);guard();state.stages.push({stage,completedAt:new Date().toISOString()});put('state.json',state);console.log(JSON.stringify(state.stages.at(-1)));
}
try{
 fs.writeFileSync(lock,JSON.stringify({pid:process.pid,kind:'r4-supplement',root:out}),{flag:'wx'});owned=true;
 const arms=[];
 for(const [name,adapter] of [['base',null],['r3',previous.adapter],['r4',selected.adapter]]){
  const output=path.join(out,'main-v4-'+name+'.json'),args=[path.join(dir,'worker.py'),'eval','--model',selected.base,'--policy',policyPath,'--data',path.join(where,'requests.json'),'--output',output];if(adapter)args.push('--adapter',adapter);
  await execute('main-v4-'+name,args);const raw=read(output);assert.equal(raw.metadata.modelPath,selected.base);assert.equal(raw.metadata.adapter,adapter);arms.push({name,raw});
 }
 const report=compareArms(cases,arms);put('main-v4-report.json',report);fs.writeFileSync(path.join(out,'main-v4-REPORT.md'),renderReport(report),{flag:'wx'});
 release(); // The public entry acquires the same lock itself.
 const smoke=[];
 for(const [name,input] of [['hero','standalone-hero-request.json'],['fidelity','standalone-fidelity-plan.json']]){
  const output=path.join(out,'source-'+name+'.json');
  await execute('source-'+name,[path.join(dir,'source-predict.py'),'--model',selected.base,'--adapter',selected.adapter,'--request',path.join(root,input),'--output',output,'--runtime-root',runtime,'--max-memory-gib','12','--timeout-seconds','300']);
  const raw=read(output);assert.equal(raw.complete,true);assert.equal(raw.metadata.memoryLimitGiB,12);assert.equal(raw.metadata.adapter,selected.adapter);
  smoke.push({name,metadata:raw.metadata,requests:raw.results.length,contractPass:raw.results.every(r=>r.outputContractPass),values:raw.results.map(r=>({id:r.id,value:r.value,seconds:r.seconds}))});
  if(name==='fidelity')put('source-fidelity-checked.json',validateFidelity(read(path.join(root,input)),raw));
 }
 put('summary.json',{mainV4Scores:Object.fromEntries(Object.entries(report.scores).map(([name,s])=>[name,{total:s.total,passed:s.passed,unsafe:s.unsafe}])),comparisons:report.comparisons,smoke,releaseQualified:false,checkpointReselected:false,editorActivated:false,scope:'New v4 availability inputs and representative real source entry under 12 GiB MLX allocation cap; not a physical 16GB Mac or new source-generalization test.'});
 state.status='complete-research-evidence';state.completedAt=new Date().toISOString();put('state.json',state);console.log(JSON.stringify({status:state.status,out}));
}catch(e){state.status='failed';state.error=String(e);put('state.json',state);console.error(e);process.exitCode=1;}
finally{release();put('worker-lease.json',{pid:null,reason,endedAt:new Date().toISOString()});}
