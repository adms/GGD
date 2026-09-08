/** CPU-only report replay after the original collector's JSON optional-key mismatch.
 * Never overwrites old states/results, selects again, or calls a model.
 */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {collect,render} from './r6-final-report-v2.mjs';import {fileHash} from './precision-diagnostic.mjs';
const read=p=>JSON.parse(fs.readFileSync(p));
const [root,runtime]=process.argv.slice(2);assert(path.isAbsolute(root)&&path.isAbsolute(runtime));
const original=read(path.join(root,'finish-v1/state.json'));assert.equal(original.status,'failed');assert.match(original.error,/deep-equal/);
for(const [file,status] of [['run-state.json','complete-research-only'],['post-v1/state.json','complete-research-evidence'],['manual-entry-v3/state.json','complete-research-evidence'],['finish-v1/state.json','failed']]){const s=read(path.join(root,file));assert.equal(s.status,status);assert(Number.isSafeInteger(s.pid)&&s.pid>1);let live=false;try{process.kill(s.pid,0);live=true;}catch(e){assert.equal(e.code,'ESRCH');}assert(!live,'PRIOR_PROCESS_LIVE');}
assert(!fs.existsSync(path.join(runtime,'gpu.lock')),'GPU_BUSY');
const out=path.join(root,'finish-v2'),finalOut=path.join(root,'final-evidence-v2');assert(!fs.existsSync(out)&&!fs.existsSync(finalOut),'REFUSE_OVERWRITE');assert(!fs.existsSync(path.join(root,'final-evidence-v1')),'UNEXPECTED_OLD_REPORT');
const manifest=read(path.join(root,'dataset-manifest.json')),policy=read(path.join(root,'experiment-policy.json'));
const put=(n,x)=>{const p=path.join(out,n);fs.writeFileSync(p+'.tmp',JSON.stringify(x,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
const files=[fileURLToPath(import.meta.url),path.join(path.dirname(fileURLToPath(import.meta.url)),'r6-final-report-v2.mjs'),...['run-state.json','post-v1/state.json','manual-entry-v3/state.json','finish-v1/state.json','finish-v1/preparation.json','experiment-policy.json','selection.json','training-run.json'].map(n=>path.join(root,n))];
const pins=files.map(p=>({path:p,sha256:fileHash(p)}));
function guard(){assert(Date.now()<Date.parse(policy.deadline),'DEADLINE');for(const p of [root,manifest.extension])assert(!fs.existsSync(path.join(p,'CANCEL')),'CANCEL');for(const p of pins)assert.equal(fileHash(p.path),p.sha256,'PIN_CHANGED');}
guard();fs.mkdirSync(out);const state={status:'collecting-read-only-evidence',pid:process.pid,startedAt:new Date().toISOString(),gpuCalls:0};put('state.json',state);put('preparation.json',{pins,reason:'JSON-serialized report replay normalizes undefined optional fields only',oldFailurePreserved:true,trainingAllowed:false,selectionAllowed:false,modelCalls:0,oldResultsRewritten:false});
try{const r=collect(root);guard();fs.mkdirSync(finalOut);fs.writeFileSync(path.join(finalOut,'summary.json'),JSON.stringify(r,null,2)+'\n',{flag:'wx'});fs.writeFileSync(path.join(finalOut,'REPORT.md'),render(r),{flag:'wx'});put('result-receipt.json',{selectedStep:r.selectedStep,newAdapterSelected:r.newAdapterSelected,files:['summary.json','REPORT.md'].map(n=>({path:path.join(finalOut,n),sha256:fileHash(path.join(finalOut,n))})),releaseQualified:false});state.status='complete-research-evidence';state.completedAt=new Date().toISOString();state.result=finalOut;put('state.json',state);console.log(JSON.stringify({status:state.status,selectedStep:r.selectedStep,gates:r.measuredGates,entry:r.entry,finalOut}));}
catch(e){state.status='failed';state.error=String(e);put('state.json',state);console.error(e);process.exitCode=1;}
