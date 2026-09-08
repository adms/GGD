/** Mac-only data intervention. Dev selection precedes every test prediction. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {digest} from './dataset.mjs';import {summarize,rankCandidates,eligible,paired} from './r3-score.mjs';
const [root,python,runtime]=process.argv.slice(2);for(const p of [root,python,runtime])assert(p&&path.isAbsolute(p));
const dir=path.dirname(fileURLToPath(import.meta.url)),read=p=>JSON.parse(fs.readFileSync(p)),put=(n,x)=>{const p=path.join(root,n);fs.writeFileSync(p+'.tmp',JSON.stringify(x,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
assert(!fs.existsSync(path.join(root,'run-state.json')),'REFUSE_RESTART');
const policyPath=path.join(root,'experiment-policy.json'),policy=read(policyPath),cases=read(path.join(root,'cases.private.json')),manifest=read(path.join(root,'dataset-manifest.json')),review=read(path.join(root,'semantic-review.json'));
assert.equal(policy.schema,'ggd-forge-source-priority-experiment@4');for(const k of ['cloudGpu','cloudFallback','externalTeacher','publish','activateInEditor','thinking'])assert.equal(policy[k],false);assert.equal(policy.cloudGpuSpendLimit,0);assert.equal(policy.trainingEpochs,3);
assert.equal(review.status,'approved-for-research-training');assert.equal(review.ownerGold,false);assert.equal(review.reviewedRows,cases.length);assert.equal(review.casesSha256,digest(cases));assert.equal(manifest.casesSha256,digest(cases));
assert.equal(review.newQuestionReviewSha256,digest(read(path.join(root,'new-question-review.json'))));assert.equal(review.newRowsPersonallyReviewed,manifest.newReviewedRows);
const parent=manifest.parent,origin=read(path.join(parent,'native-reference.json')),model=origin.base,control=origin.adapter;
// Byte hash, not JSON serialization hash, for weights and file pins.
const {createHash}=await import('node:crypto');const fileHash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
assert.equal(fileHash(path.join(control,'adapters.safetensors')),origin.adapterSha256,'R3_ADAPTER_CHANGED');
assert.equal(read(path.join(parent,'post-diagnostics-v3/state.json')).status,'complete-research-only');
const rows=split=>cases.filter(c=>c.split===split);
for(const split of ['train','dev','test'])assert.deepEqual(read(path.join(root,split+'-requests.json')),rows(split).map(({id,messages,requestDigest})=>({id,messages,requestDigest})));
assert.deepEqual(fs.readFileSync(path.join(root,'train.jsonl'),'utf8').trim().split('\n').map(JSON.parse),rows('train').map(({id,messages,target})=>({id,messages,target})));
const files=['cases.private.json','train.jsonl','train-requests.json','dev-requests.json','test-requests.json','experiment-policy.json','semantic-review.json','dataset-manifest.json','new-question-review.json','source-snapshot.json','catalog.json','contract-check.json','PRETRAIN_REVIEW.md','train-token-budget.json','test-token-budget.json'];
const pins=[...files.map(n=>({path:path.join(root,n),sha256:fileHash(path.join(root,n))})),...['r4-run.mjs','r4-data.mjs','r4-reviewed-claims.mjs','r3-data.mjs','r3-score.mjs','classification-score.mjs','dataset.mjs','worker.py'].map(n=>({path:path.join(dir,n),sha256:fileHash(path.join(dir,n))}))];
const checkPins=()=>{for(const p of pins)assert.equal(fileHash(p.path),p.sha256,'PIN_CHANGED:'+p.path);};
for(const s of ['train','test']){const b=read(path.join(root,s+'-token-budget.json'));assert.equal(b.allFit,true);assert.equal(b.requestsSha256,fileHash(path.join(root,s+'-requests.json')));}
const lock=path.join(runtime,'gpu.lock');fs.writeFileSync(lock,JSON.stringify({pid:process.pid,kind:'r4-source-calibration',root}),{flag:'wx'});
const state={status:'running',pid:process.pid,startedAt:new Date().toISOString(),stages:[]};put('run-state.json',state);put('run-pins.json',{pins,model,r3adapter:control,r3adapterSha256:origin.adapterSha256,python,selection:'same lexicographic R3 dev priority; all tests after checkpoint selection',testCohorts:'exposed R3 regression plus prospective same-source wording diagnostic',releaseQualified:false});
let child,reason=null,killTimer;const cutoff=Date.parse(policy.deadline)-policy.reportReserveSeconds*1000;
function stop(why){if(reason)return;reason=why;if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},3000);}}
function guard(){assert(!reason,reason);assert(Date.now()<cutoff,'DEADLINE');assert(!fs.existsSync(path.join(root,'CANCEL')),'CANCEL');checkPins();}
process.on('SIGTERM',()=>stop('SIGNAL'));process.on('SIGINT',()=>stop('SIGNAL'));
async function worker(stage,command,data,output,adapter){
 guard();state.stage=stage;put('run-state.json',state);const args=[path.join(dir,'worker.py'),command,'--model',model,'--policy',policyPath,'--data',data,'--output',output];if(adapter)args.push('--adapter',adapter);if(command==='train')args.push('--kind','formal','--epochs','3');
 const log=fs.openSync(path.join(root,stage+'.log'),'wx');child=spawn(python,args,{stdio:['ignore',log,log],detached:true});fs.closeSync(log);put('worker-lease.json',{pid:child.pid,parent:process.pid,stage});
 const timer=setInterval(()=>{try{guard();}catch(e){stop(String(e));}},2000);let code;
 try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});}finally{clearInterval(timer);clearTimeout(killTimer);child=null;put('worker-lease.json',{pid:null,stage});}
 assert(!reason&&code===0,reason??'WORKER_EXIT:'+stage+':'+code);guard();state.stages.push({stage,completedAt:new Date().toISOString(),output});put('run-state.json',state);console.log(JSON.stringify(state.stages.at(-1)));return command==='train'?null:read(output);
}
async function evalScore(stage,split,adapter){const raw=await worker(stage,'eval',path.join(root,split+'-requests.json'),path.join(root,stage+'.json'),adapter);assert.equal(raw.metadata.modelPath,model);assert.equal(raw.metadata.adapter,adapter??null);const score=summarize(rows(split),raw);put(stage+'-score.json',score);return{score,raw};}
function cohortScore(cohort,raw){const cs=rows('test').filter(c=>c.cohort===cohort),ids=new Set(cs.map(c=>c.id));return summarize(cs,{...raw,results:raw.results.filter(r=>ids.has(r.id))});}
try{
 await worker('doctor','doctor',path.join(root,'train.jsonl'),path.join(root,'doctor.json'));
 await evalScore('base-dev','dev');await evalScore('r3-dev','dev',control);
 const adapterRoot=path.join(runtime,path.basename(root)+'-adapter');assert(!fs.existsSync(adapterRoot),'ADAPTER_EXISTS');
 await worker('train','train',path.join(root,'train.jsonl'),adapterRoot);
 const training=read(path.join(adapterRoot,'training-run.json'));put('training-run.json',training);const candidates=[];
 for(let epoch=1;epoch<=training.recipe.epochs;epoch++){const adapter=path.join(adapterRoot,'epoch-'+epoch),{score}=await evalScore('dev-'+epoch,'dev',adapter);candidates.push({epoch,adapter,adapterSha256:fileHash(path.join(adapter,'adapters.safetensors')),score});}
 candidates.sort(rankCandidates);const selected=candidates[0];assert(selected);put('selection.json',{selected,allCandidates:candidates,selectedAt:new Date().toISOString(),selectionData:'R3 dev only; no R4 test outputs yet',eligible:eligible(selected.score)});
 const keep=path.join(root,'selected-adapter');fs.mkdirSync(keep);for(const n of ['adapters.safetensors','adapter_config.json'])fs.copyFileSync(path.join(selected.adapter,n),path.join(keep,n),fs.constants.COPYFILE_EXCL);
 fs.copyFileSync(path.join(adapterRoot,'metrics.jsonl'),path.join(root,'training-metrics.jsonl'),fs.constants.COPYFILE_EXCL);
 put('native-reference.json',{base:model,adapter:keep,adapterSha256:fileHash(path.join(keep,'adapters.safetensors')),source:'clean original BF16 base plus R4 dev-selected LoRA; no warm restart',releaseQualified:false});
 const arms={base:await evalScore('test-base','test'),r3:await evalScore('test-r3','test',control),r4:await evalScore('test-selected','test',keep)};
 const cohorts={};for(const c of ['r3-exposed-regression','r4-prospective-same-source-diagnostic']){const scores=Object.fromEntries(Object.entries(arms).map(([k,a])=>[k,cohortScore(c,a.raw)]));cohorts[c]={scores,againstBase:paired(scores.base,scores.r4),againstR3:paired(scores.r3,scores.r4)};}
 put('comparison.json',{selectedEpoch:selected.epoch,devEligible:eligible(selected.score),testScores:Object.fromEntries(Object.entries(arms).map(([k,a])=>[k,a.score])),cohorts,releaseQualified:false,fullHeroForgeQualified:false,disposition:'research-only-no-activation',limitations:manifest.limitations});
 state.status='complete-research-only';state.completedAt=new Date().toISOString();put('run-state.json',state);console.log(JSON.stringify({status:state.status,selectedEpoch:selected.epoch,scores:Object.fromEntries(Object.entries(arms).map(([k,a])=>[k,a.score.tasks]))}));
}catch(e){state.status='failed';state.error=String(e);put('run-state.json',state);console.error(e);process.exitCode=1;}
finally{if(fs.existsSync(lock)&&read(lock).pid===process.pid)fs.unlinkSync(lock);put('worker-lease.json',{pid:null,reason,endedAt:new Date().toISOString()});}
