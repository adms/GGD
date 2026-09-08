/** Deadline recovery: evaluate complete saved checkpoints, never resume training.
 * Original failed run stays immutable; all recovered evidence has a new root.
 */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn,spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {digest} from './dataset.mjs';import {summarize,rankCandidates,eligible,paired} from './r3-score.mjs';import {compareArms,renderReport} from './r3-error-report.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),read=p=>JSON.parse(fs.readFileSync(p)),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function assertStopped(pid){try{process.kill(pid,0);}catch(e){assert.equal(e.code,'ESRCH','PROCESS_STATE_UNCERTAIN');return;}throw Error('ORIGINAL_PROCESS_STILL_LIVE');}
export function inspectRecovery(original,runtime){
 const state=read(path.join(original,'run-state.json'));assert.equal(state.status,'failed','CORE_NOT_TERMINAL_FAILURE');assert.equal(state.stage,'train','NOT_A_TRAINING_CUTOFF');assert(String(state.error).includes('TRAINING_STOP_RESERVE'),'NOT_A_TRAINING_CUTOFF');assertStopped(state.pid);
 const policy=read(path.join(original,'experiment-policy.json'));assert(Date.now()>=Date.parse(policy.trainingStopAt),'NOT_AT_TRAINING_CUTOFF');assert(!fs.existsSync(path.join(original,'CANCEL')),'CANCELLED');
 if(fs.existsSync(path.join(original,'post-diagnostics-v1/state.json'))){const post=read(path.join(original,'post-diagnostics-v1/state.json'));assert.equal(post.status,'failed','OLD_POST_NOT_TERMINAL');assertStopped(post.pid);}
 assert(!fs.existsSync(path.join(runtime,'gpu.lock')),'GPU_BUSY');
 const originalPins=read(path.join(original,'run-pins.json'));for(const p of originalPins.pins)assert.equal(hash(p.path),p.sha256,'ORIGINAL_PIN_CHANGED:'+p.path);
 const adapterRoot=path.join(runtime,path.basename(original)+'-adapter');assert.equal(hash(path.join(adapterRoot,'initial.safetensors')),policy.initialAdapterSha256,'INITIAL_WEIGHTS_NOT_EXACT');
 const config=read(path.join(originalPins.initialAdapter,'adapter_config.json')),checkpoints=read(path.join(adapterRoot,'checkpoints.json'));
 assert(checkpoints.length>0&&checkpoints.length<=2,'NO_COMPLETE_CHECKPOINT');assert.equal(new Set(checkpoints.map(c=>c.step)).size,checkpoints.length);
 const metricsText=fs.readFileSync(path.join(adapterRoot,'metrics.jsonl'),'utf8'),needed=Math.max(...checkpoints.map(c=>c.examplesSeen));
 const prefix=metricsText.split('\n').slice(0,needed).map(JSON.parse);assert.equal(prefix.length,needed);
 for(const [i,r] of prefix.entries()){assert.equal(r.example,i+1,'METRIC_ORDER');assert(Number.isFinite(r.loss)&&Number.isFinite(r.seconds)&&r.seconds>=0,'NONFINITE_METRIC');}
 for(const c of checkpoints){assert([80,157].includes(c.step),'UNDECLARED_CHECKPOINT');assert.equal(c.examplesSeen,c.step*4);assert.equal(c.adapter,path.join(adapterRoot,'step-'+c.step));assert.equal(hash(path.join(c.adapter,'adapters.safetensors')),c.sha256);assert.notEqual(c.sha256,policy.initialAdapterSha256,'UNCHANGED_CHECKPOINT');assert.deepEqual(read(path.join(c.adapter,'adapter_config.json')),config);assert.equal(prefix[c.examplesSeen-1].step,c.step,'INCOMPLETE_CHECKPOINT_METRICS');}
 return{original,state,policy,originalPins,adapterRoot,checkpoints,validatedMetricPrefix:needed,metricPrefixSeconds:prefix.reduce((n,r)=>n+r.seconds,0),trainingComplete:false,scope:'Completed optimizer checkpoints only. No optimizer resume, extra examples, changed deadline or changed labels.'};
}
async function main(){
 const [original,python,runtime]=process.argv.slice(2);for(const p of [original,python,runtime])assert(p&&path.isAbsolute(p));
 const audit=inspectRecovery(original,runtime),root=path.join(original,'recovered-checkpoint-eval-v1');assert(!fs.existsSync(root),'REFUSE_RESTART');
 const {policy,checkpoints}=audit,cutoff=Date.parse(policy.deadline)-policy.reportReserveSeconds*1000;assert(Date.now()<cutoff-600000,'INSUFFICIENT_EVALUATION_RESERVE');
 for(const k of ['cloudGpu','cloudFallback','externalTeacher','publish','activateInEditor','thinking'])assert.equal(policy[k],false);assert.equal(policy.cloudGpuSpendLimit,0);
 fs.mkdirSync(root);const copy=n=>fs.copyFileSync(path.join(original,n),path.join(root,n),fs.constants.COPYFILE_EXCL);
 for(const n of ['experiment-policy.json','dataset-manifest.json','cases.private.json','dev-requests.json','test-requests.json','semantic-review.json'])copy(n);
 fs.cpSync(path.join(original,'fresh-source-diagnostic-v1'),path.join(root,'fresh-source-diagnostic-v1'),{recursive:true,errorOnExist:true,force:false});
 const put=(n,x)=>{const p=path.join(root,n);fs.writeFileSync(p+'.tmp',JSON.stringify(x,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
 put('recovery-receipt.json',{...audit,createdAt:new Date().toISOString(),trainingStarted:false,releaseQualified:false});
 const manifest=read(path.join(root,'dataset-manifest.json')),r4=manifest.rejectedIteration,cases=read(path.join(root,'cases.private.json')),rows=s=>cases.filter(c=>c.split===s),native=read(path.join(manifest.parent,'native-reference.json'));
 assert.equal(digest(cases),manifest.casesSha256);for(const s of ['dev','test'])assert.deepEqual(read(path.join(root,s+'-requests.json')),rows(s).map(({id,messages,requestDigest})=>({id,messages,requestDigest})));
 const ordering=spawnSync(python,['-c','import json,random,sys; ids=json.load(sys.stdin); order=list(range(len(ids))); random.Random(int(sys.argv[1])).shuffle(order); print(json.dumps([ids[i] for i in order]))',String(policy.seed)],{input:JSON.stringify(rows('train').map(c=>c.id)),encoding:'utf8'});
 assert.equal(ordering.status,0,ordering.stderr);const orderedIds=JSON.parse(ordering.stdout);assert.deepEqual(orderedIds.slice().sort(),rows('train').map(c=>c.id).sort());
 put('effective-training-exposure.json',{method:'Reconstructed exact frozen warm-train.py Python shuffle using same interpreter and seed; inherited R3 training remains applicable.',seed:policy.seed,preparedRows:rows('train').length,inheritedR3TrainIds:read(path.join(manifest.parent,'cases.private.json')).filter(c=>c.split==='train').map(c=>c.id),checkpoints:checkpoints.map(c=>({step:c.step,examplesSeen:c.examplesSeen,seenR5TrainIds:orderedIds.slice(0,c.examplesSeen)})),trainingComplete:false});
 const files=[fileURLToPath(import.meta.url),...['worker.py','r3-score.mjs','r3-error-report.mjs','classification-score.mjs','dataset.mjs'].map(n=>path.join(dir,n)),...['experiment-policy.json','dataset-manifest.json','cases.private.json','dev-requests.json','test-requests.json'].map(n=>path.join(root,n)),...['r3-dev.json','base-dev.json','test-r3.json','test-base.json'].map(n=>path.join(r4,n)),...checkpoints.map(c=>path.join(c.adapter,'adapters.safetensors'))];
 const pins=[...audit.originalPins.pins,...files.map(p=>({path:p,sha256:hash(p)}))];put('run-pins.json',{pins,base:native.base,initialAdapter:native.adapter,initialAdapterSha256:native.adapterSha256,recoveryFrom:original,releaseQualified:false});
 const lock=path.join(runtime,'gpu.lock');fs.writeFileSync(lock,JSON.stringify({pid:process.pid,kind:'r5-deadline-checkpoint-evaluation',root}),{flag:'wx'});
 const state={status:'running',pid:process.pid,startedAt:new Date().toISOString(),stage:'recovery-evaluation',trainingComplete:false,stages:[]};put('run-state.json',state);
 let child=null,reason=null,killTimer;function stop(why){if(reason)return;reason=why;if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},3000);}}
 function guard(){assert(!reason,reason);assert(Date.now()<cutoff,'DEADLINE');assert(!fs.existsSync(path.join(root,'CANCEL'))&&!fs.existsSync(path.join(original,'CANCEL')),'CANCEL');for(const p of pins)assert.equal(hash(p.path),p.sha256,'PIN_CHANGED:'+p.path);}
 process.on('SIGTERM',()=>stop('SIGNAL'));process.on('SIGINT',()=>stop('SIGNAL'));
 async function evaluate(stage,split,adapter){
  guard();state.stage=stage;put('run-state.json',state);const output=path.join(root,stage+'.json'),log=fs.openSync(path.join(root,stage+'.log'),'wx');
  child=spawn(python,[path.join(dir,'worker.py'),'eval','--model',native.base,'--adapter',adapter,'--policy',path.join(root,'experiment-policy.json'),'--data',path.join(root,split+'-requests.json'),'--output',output],{stdio:['ignore',log,log],detached:true});fs.closeSync(log);put('worker-lease.json',{pid:child.pid,parent:process.pid,stage});
  const timer=setInterval(()=>{try{guard();}catch(e){stop(String(e));}},1000);let code;
  try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});}finally{clearInterval(timer);clearTimeout(killTimer);child=null;put('worker-lease.json',{pid:null,stage});}
  assert(!reason&&code===0,reason??'WORKER_EXIT:'+code);guard();const raw=read(output);assert.equal(raw.metadata.modelPath,native.base);assert.equal(raw.metadata.adapter,adapter);state.stages.push({stage,completedAt:new Date().toISOString()});put('run-state.json',state);console.log(JSON.stringify(state.stages.at(-1)));return{raw,score:summarize(rows(split),raw)};
 }
 try{
  const controlRaw=read(path.join(r4,'r3-dev.json')),baseRaw=read(path.join(r4,'base-dev.json')),controlScore=summarize(rows('dev'),controlRaw),sourcePassIds=new Set(controlScore.rows.filter(r=>['hero-source','owner-mechanism'].includes(r.task)&&r.pass).map(r=>r.id));
  const candidates=[{step:0,epoch:0,label:'unchanged-r3-control',adapter:native.adapter,adapterSha256:native.adapterSha256,score:controlScore,preservesSource:true}];
  for(const cp of checkpoints){const {score}=await evaluate('dev-step-'+cp.step,'dev',cp.adapter);candidates.push({step:cp.step,epoch:0,label:'saved-partial-training-step-'+cp.step,adapter:cp.adapter,adapterSha256:cp.sha256,score,preservesSource:score.rows.every(r=>!sourcePassIds.has(r.id)||r.pass)});}
  candidates.sort((a,b)=>Number(b.preservesSource)-Number(a.preservesSource)||rankCandidates({...a,epoch:0},{...b,epoch:0})||b.step-a.step);
  const selected=candidates[0];put('selection.json',{selected,allCandidates:candidates,selectedAt:new Date().toISOString(),selectionUses:'original 83 dev only; original source-preserving ranking and tie-break',eligible:eligible(selected.score),testUsed:false,trainingComplete:false});
  const keep=path.join(root,'selected-adapter');fs.mkdirSync(keep);for(const n of ['adapters.safetensors','adapter_config.json'])fs.copyFileSync(path.join(selected.adapter,n),path.join(keep,n),fs.constants.COPYFILE_EXCL);
  put('native-reference.json',{base:native.base,adapter:keep,adapterSha256:hash(path.join(keep,'adapters.safetensors')),selectedStep:selected.step,source:selected.step?'Dev-selected complete checkpoint from deadline-interrupted R5; not completed one-pass training':'Unchanged R3 selected; no new model gain',trainingComplete:false,releaseQualified:false});
  const selectedRaw=selected.step?read(path.join(root,'dev-step-'+selected.step+'.json')):controlRaw,devReport=compareArms(rows('dev'),[{name:'base',raw:baseRaw},{name:'r3',raw:controlRaw},{name:'r5',raw:selectedRaw}]);put('dev-report.json',devReport);fs.writeFileSync(path.join(root,'DEV_REPORT.md'),renderReport(devReport),{flag:'wx'});
  const {raw,score}=await evaluate('test-selected','test',keep),testReport=compareArms(rows('test'),[{name:'base',raw:read(path.join(r4,'test-base.json'))},{name:'r3',raw:read(path.join(r4,'test-r3.json'))},{name:'r5',raw}]);put('test-report.json',testReport);fs.writeFileSync(path.join(root,'TEST_REPORT.md'),renderReport(testReport),{flag:'wx'});
  put('comparison.json',{selectedStep:selected.step,devEligible:eligible(selected.score),testScores:testReport.scores,againstR3:paired(testReport.scores.r3,score),trainingComplete:false,releaseQualified:false,activated:false,scope:'Deadline checkpoint recovery; all 162 test questions are exposed regression.'});
  state.status='complete-research-only';state.completedAt=new Date().toISOString();put('run-state.json',state);console.log(JSON.stringify({status:state.status,root,selectedStep:selected.step,trainingComplete:false}));
 }catch(e){state.status='failed';state.error=String(e);put('run-state.json',state);console.error(e);process.exitCode=1;}
 finally{clearTimeout(killTimer);if(fs.existsSync(lock)&&read(lock).pid===process.pid)fs.unlinkSync(lock);put('worker-lease.json',{pid:null,reason,endedAt:new Date().toISOString()});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
