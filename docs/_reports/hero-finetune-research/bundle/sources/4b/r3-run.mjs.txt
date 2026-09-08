/** Mac-only source-priority experiment. Frozen inputs, managed GPU, dev-before-test. */
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';import {digest} from './dataset.mjs';import {summarize,rankCandidates,eligible,paired} from './r3-score.mjs';
import {createHash} from 'node:crypto';
const [root,python,model,runtime,r2adapter]=process.argv.slice(2);for(const p of [root,python,model,runtime,r2adapter])assert(p&&path.isAbsolute(p),'ABSOLUTE_ARGUMENTS_REQUIRED');
const dir=path.dirname(fileURLToPath(import.meta.url)),read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const put=(n,x)=>{const p=path.join(root,n);fs.writeFileSync(p+'.tmp',JSON.stringify(x,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
assert(!fs.existsSync(path.join(root,'run-state.json')),'REFUSE_RESTART');
const policy=read(path.join(root,'experiment-policy.json')),cases=read(path.join(root,'cases.private.json')),manifest=read(path.join(root,'dataset-manifest.json')),review=read(path.join(root,'semantic-review.json'));
assert.equal(policy.cloudGpu,false);assert.equal(policy.thinking,false);assert.equal(policy.trainingEpochs,3);assert.equal(review.status,'approved-for-research-training');assert.equal(review.ownerGold,false);assert.equal(review.reviewedRows,cases.length);assert.equal(review.casesSha256,digest(cases));assert.equal(manifest.casesSha256,digest(cases));
const train=fs.readFileSync(path.join(root,'train.jsonl'),'utf8').trim().split('\n').map(JSON.parse);assert.deepEqual(train,cases.filter(c=>c.split==='train').map(({id,messages,target})=>({id,messages,target})));
for(const split of ['dev','test'])assert.deepEqual(read(path.join(root,split+'-requests.json')),cases.filter(c=>c.split===split).map(({id,messages,requestDigest})=>({id,messages,requestDigest})));
const names=['cases.private.json','train.jsonl','dev-requests.json','test-requests.json','experiment-policy.json','semantic-review.json','dataset-manifest.json','catalog.json','personal-source-review.json','contract-check.json'];
const pins=[...names.map(n=>({path:path.join(root,n),sha256:hash(path.join(root,n))})),...['r3-run.mjs','r3-score.mjs','classification-score.mjs','worker.py'].map(n=>({path:path.join(dir,n),sha256:hash(path.join(dir,n))})),...read(path.join(root,'curriculum-pins.json'))];
const pinCheck=()=>{for(const p of pins)assert.equal(hash(p.path),p.sha256,'PIN_CHANGED:'+p.path);};
// The historical tokenizer/base receipt is durable and checksummed before this run.
put('run-pins.json',{pins,python,model,r2adapter,selection:'lexicographic hero-source, owner-mechanism, template; safety before accuracy within tier',testOutputsUnavailableAtStart:!fs.existsSync(path.join(root,'test-selected.json')),createdAt:new Date().toISOString()});pinCheck();
fs.mkdirSync(runtime,{recursive:true});const lock=path.join(runtime,'gpu.lock');fs.writeFileSync(lock,JSON.stringify({pid:process.pid,kind:'r3-source-priority',root}),{flag:'wx'});
let child,reason=null,killTimer;const state={status:'running',pid:process.pid,stage:null,stages:[],startedAt:new Date().toISOString()};
const cutoff=Date.parse(policy.deadline)-policy.reportReserveSeconds*1000;
function stop(why){if(reason)return;reason=why;if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},3000);}}
process.on('SIGTERM',()=>stop('SIGNAL'));process.on('SIGINT',()=>stop('SIGNAL'));
async function worker(stage,command,data,output,adapter){
 pinCheck();assert(!reason&&Date.now()<cutoff&&!fs.existsSync(path.join(root,'CANCEL')),'CANCEL_OR_CUTOFF');state.stage=stage;put('run-state.json',state);
 const args=[path.join(dir,'worker.py'),command,'--model',model,'--policy',path.join(root,'experiment-policy.json'),'--data',data,'--output',output];if(adapter)args.push('--adapter',adapter);if(command==='train')args.push('--kind','formal','--epochs','3');
 const log=fs.openSync(path.join(root,stage+'.log'),'wx');child=spawn(python,args,{stdio:['ignore',log,log],detached:true});fs.closeSync(log);put('worker-lease.json',{pid:child.pid,parent:process.pid,stage});
 const timer=setInterval(()=>{try{pinCheck();if(Date.now()>=cutoff)stop('DEADLINE');if(fs.existsSync(path.join(root,'CANCEL')))stop('CANCEL');}catch(e){stop(String(e));}},2000);
 let code;try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});}finally{clearInterval(timer);clearTimeout(killTimer);put('worker-lease.json',{pid:null,stage,endedAt:new Date().toISOString()});}
 assert(!reason&&code===0,reason??`WORKER_EXIT:${stage}:${code}`);pinCheck();state.stages.push({stage,output,completedAt:new Date().toISOString()});put('run-state.json',state);console.log(JSON.stringify({stage,status:'complete',output}));return command==='train'?null:read(output);
}
const devCases=cases.filter(c=>c.split==='dev'),testCases=cases.filter(c=>c.split==='test');
async function evalScore(stage,split,adapter){const raw=await worker(stage,'eval',path.join(root,split+'-requests.json'),path.join(root,stage+'.json'),adapter);assert.equal(raw.metadata.modelPath,model);assert.equal(raw.metadata.adapter,adapter??null);const score=summarize(split==='dev'?devCases:testCases,raw);put(stage+'-score.json',score);return score;}
try{
 await worker('doctor','doctor',path.join(root,'train.jsonl'),path.join(root,'doctor.json'));
 await evalScore('base-dev','dev');await evalScore('r2-dev','dev',r2adapter);
 const adapterRoot=path.join(runtime,path.basename(root)+'-adapter');assert(!fs.existsSync(adapterRoot),'ADAPTER_EXISTS');
 await worker('train','train',path.join(root,'train.jsonl'),adapterRoot);const training=read(path.join(adapterRoot,'training-run.json'));put('training-run.json',training);
 const candidates=[];for(let epoch=1;epoch<=training.recipe.epochs;epoch++){const adapter=path.join(adapterRoot,'epoch-'+epoch);const score=await evalScore('dev-'+epoch,'dev',adapter);candidates.push({epoch,adapter,adapterSha256:hash(path.join(adapter,'adapters.safetensors')),score});}
 candidates.sort(rankCandidates);const selected=candidates[0];assert(selected);put('selection.json',{selected,allCandidates:candidates,selectedAt:new Date().toISOString(),selectionData:'dev-only; test not evaluated',eligible:eligible(selected.score)});
 const base=await evalScore('test-base','test');const control=await evalScore('test-r2','test',r2adapter);const result=await evalScore('test-selected','test',selected.adapter);
 const againstBase=paired(base,result),againstR2=paired(control,result);const noRegression=Object.values(againstBase).every(t=>t.regressed===0)&&Object.values(againstR2).every(t=>t.regressed===0);
 put('comparison.json',{selectedEpoch:selected.epoch,base,r2:control,selected:result,againstBase,againstR2,devEligible:eligible(selected.score),testEligible:eligible(result),noRegression,releaseQualified:false,fullHeroForgeQualified:false,disposition:'research-only-no-activation',limitations:manifest.limitations});
 const keep=path.join(root,'selected-adapter');fs.mkdirSync(keep);for(const n of ['adapters.safetensors','adapter_config.json'])fs.copyFileSync(path.join(selected.adapter,n),path.join(keep,n),fs.constants.COPYFILE_EXCL);fs.copyFileSync(path.join(adapterRoot,'metrics.jsonl'),path.join(root,'training-metrics.jsonl'),fs.constants.COPYFILE_EXCL);
 put('native-reference.json',{base:model,adapter:keep,adapterSha256:hash(path.join(keep,'adapters.safetensors')),source:'clean original BF16 base plus R3 selected LoRA',releaseQualified:false});
 state.status='complete-research-only';state.completedAt=new Date().toISOString();put('run-state.json',state);console.log(JSON.stringify({status:state.status,selectedEpoch:selected.epoch,base:base.tasks,r2:control.tasks,selected:result.tasks}));
}catch(e){state.status='failed';state.error=String(e);put('run-state.json',state);process.exitCode=1;console.error(e);}finally{if(fs.existsSync(lock)&&read(lock).pid===process.pid)fs.unlinkSync(lock);put('worker-lease.json',{pid:null,reason,endedAt:new Date().toISOString()});}
