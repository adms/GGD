/** One-factor learning-rate follow-up; byte-identical reviewed R6 data.
 * Preparation is CPU-only. Starting the run requires all R6 work to exit.
 */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {fileHash} from './precision-diagnostic.mjs';import {verify} from './r6-verify.mjs';import {verifyFresh} from './r6-fresh-audit.mjs';
const read=p=>JSON.parse(fs.readFileSync(p)),dir=path.dirname(fileURLToPath(import.meta.url));
export function treatmentChanges(before,after){
 const keys=[...new Set([...Object.keys(before),...Object.keys(after)])];
 const changed=keys.filter(k=>JSON.stringify(before[k])!==JSON.stringify(after[k]));
 assert.deepEqual(changed.slice().sort(),['learningRate','trainingCutoff','trainingHardStopAt','trainingStopAt'].sort(),'UNREGISTERED_TREATMENT_CHANGE');
 assert.equal(before.learningRate,1e-5);assert.equal(after.learningRate,2.5e-6);
 assert.equal(after.deadline,before.deadline);assert.equal(after.reportReserveSeconds,before.reportReserveSeconds);
 assert(Date.parse(after.trainingCutoff)<Date.parse(after.trainingStopAt));assert(Date.parse(after.trainingStopAt)<Date.parse(after.trainingHardStopAt));assert(Date.parse(after.trainingHardStopAt)<Date.parse(after.deadline)-after.reportReserveSeconds*1000);
 return{changed,trainingKnobChanged:'learningRate',ratio:0.25,sameDataRequired:true,sameSeedOrderRequired:true,timingChangesAreBudgetControls:true};
}
export function prepare(previousRun,root){
 assert(path.isAbsolute(previousRun)&&path.isAbsolute(root));assert.equal(path.dirname(previousRun),path.dirname(root));assert(!fs.existsSync(root),'REFUSE_OVERWRITE');
 const state=read(path.join(previousRun,'run-state.json'));assert.equal(state.status,'complete-research-only','R6_CORE_INCOMPLETE');
 const selection=read(path.join(previousRun,'selection.json'));assert.equal(selection.selected.step,0);assert.equal(selection.testUsed,false);assert.equal(read(path.join(previousRun,'training-run.json')).trainingComplete,true);
 verify(previousRun);verifyFresh(previousRun);
 const before=read(path.join(previousRun,'experiment-policy.json')),policy={...before,learningRate:2.5e-6,trainingCutoff:'2026-09-06T15:30:00Z',trainingStopAt:'2026-09-06T16:45:00Z',trainingHardStopAt:'2026-09-06T16:48:00Z'};const treatment=treatmentChanges(before,policy);
 const files=['dataset-manifest.json','cases.private.json','catalog.json','train.jsonl','owner-unknown-review.json','stack-new-review.json','excluded-legacy-mechanism-training.json','verification.json','DATA_ADMISSION.json','DATA_ADMISSION.md',...['train','dev','test'].flatMap(s=>[s+'-requests.json',s+'-token-budget.json'])];
 for(const n of fs.readdirSync(path.join(previousRun,'fresh-source-v1'))){assert(fs.statSync(path.join(previousRun,'fresh-source-v1',n)).isFile(),'UNEXPECTED_FRESH_DIRECTORY');files.push('fresh-source-v1/'+n);}
 fs.mkdirSync(root);const copies=[];
 for(const name of files){const old=path.join(previousRun,name),target=path.join(root,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(old,target,fs.constants.COPYFILE_EXCL);const sha256=fileHash(old);assert.equal(fileHash(target),sha256);copies.push({name,source:old,path:target,sha256});}
 const put=(n,v)=>fs.writeFileSync(path.join(root,n),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
 fs.copyFileSync(path.join(dir,'r7-PRETRAIN_REVIEW.md'),path.join(root,'PRETRAIN_REVIEW.md'),fs.constants.COPYFILE_EXCL);
 fs.copyFileSync(path.join(previousRun,'PRETRAIN_REVIEW.md'),path.join(root,'R6_PRETRAIN_REVIEW.md'),fs.constants.COPYFILE_EXCL);
 put('experiment-policy.json',policy);
 const evidence=['experiment-policy.json','run-pins.json','training-run.json','selection.json','r3-dev.json',...['48','96','117'].map(s=>'dev-step-'+s+'.json')].map(n=>path.join(previousRun,n));
 const code=['r7-prepare-v2.mjs','r7-run-v2.mjs','r7-PRETRAIN_REVIEW.md','r6-train.py','r6-verify.mjs','r6-score.mjs','worker.py'].map(n=>path.join(dir,n));
 put('ablation-preparation.json',{preparedAt:new Date().toISOString(),previousRun,treatment,copies,pins:[...evidence,...code,path.join(root,'PRETRAIN_REVIEW.md'),path.join(root,'experiment-policy.json')].map(p=>({path:p,sha256:fileHash(p)})),counts:{train:466,dev:158,test:186},labelsChanged:0,messagesChanged:0,newDataRows:0,trainingOrderSeed:policy.seed,post63PreviouslyUsedInR6:true,allPostGroupsPreviouslyUsed:true,trainingStarted:false,cloudGpu:false,releaseQualified:false});
 verifyAblation(root);return{root,treatment,copiedFiles:copies.length,trainingStarted:false};
}
export function verifyAblation(root){
 const a=read(path.join(root,'ablation-preparation.json'));for(const p of a.pins)assert.equal(fileHash(p.path),p.sha256,'ABLATION_PIN_CHANGED:'+p.path);
 for(const c of a.copies){assert.equal(fileHash(c.source),c.sha256,'ORIGINAL_DATA_CHANGED');assert.equal(fileHash(c.path),c.sha256,'COPIED_DATA_CHANGED');}
 assert.deepEqual(treatmentChanges(read(path.join(a.previousRun,'experiment-policy.json')),read(path.join(root,'experiment-policy.json'))),a.treatment);verify(root);verifyFresh(root);return a;
}
export function assertPriorFinished(root,runtime){
 const a=verifyAblation(root);
 for(const [file,status] of [['run-state.json','complete-research-only'],['post-v1/state.json','complete-research-evidence'],['manual-entry-v3/state.json','complete-research-evidence'],['finish-v2/state.json','complete-research-evidence']]){
  const s=read(path.join(a.previousRun,file));assert.equal(s.status,status,'R6_STAGE_NOT_COMPLETE:'+file);assert(Number.isSafeInteger(s.pid)&&s.pid>1);
  let alive=false;try{process.kill(s.pid,0);alive=true;}catch(e){assert.equal(e.code,'ESRCH','PROCESS_STATE_UNCERTAIN');}assert(!alive,'R6_STAGE_STILL_LIVE:'+file);
 }
 assert(!fs.existsSync(path.join(runtime,'gpu.lock')),'GPU_BUSY');return a;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const [mode,a,b]=process.argv.slice(2);assert(['prepare','verify'].includes(mode));console.log(JSON.stringify(mode==='prepare'?prepare(a,b):verifyAblation(a)));}
