/** Correct an entry-coordinator JSON-roundtrip check BEFORE any GPU entry ran.
 * Keep all frozen inputs/answers and the stopped v2 evidence unchanged.
 */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {isDeepStrictEqual as equal} from 'node:util';
import {fileHash} from './precision-diagnostic.mjs';import {prepare,infer} from './research-inference-v2.mjs';import {canRun} from './r6-entry-check.mjs';
const read=p=>JSON.parse(fs.readFileSync(p)),self=fileURLToPath(import.meta.url);
function alive(pid){try{process.kill(pid,0);return true;}catch(e){assert.equal(e.code,'ESRCH','PROCESS_STATE_UNCERTAIN');return false;}}
export function verifySerialized(spec,saved){assert.deepEqual(JSON.parse(JSON.stringify(prepare(spec))),saved,'PUBLIC_PREPARATION_DRIFT');return true;}
export function freeze(root){
 const old=path.join(root,'manual-entry-v2'),out=path.join(root,'manual-entry-v3'),state=read(path.join(old,'state.json')),prep=read(path.join(old,'preparation.json'));assert.equal(state.status,'failed');assert(String(state.error).includes('SIGNAL'));assert.equal(state.stages.length,0);assert.equal(alive(state.pid),false);assert(!fs.readdirSync(old).some(n=>n.endsWith('-result')),'GPU_ENTRY_ALREADY_RAN');assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
 for(const p of prep.pins)assert.equal(fileHash(p.path),p.sha256,'OLD_PIN_CHANGED');
 for(const id of prep.ids)verifySerialized(read(path.join(old,id+'.json')),read(path.join(old,id+'-prepared.json')));
 fs.mkdirSync(out);const names=['EXPECTED.private.json',...prep.ids.flatMap(id=>[id+'.json',id+'-prepared.json'])];for(const n of names){fs.copyFileSync(path.join(old,n),path.join(out,n),fs.constants.COPYFILE_EXCL);assert.equal(fileHash(path.join(old,n)),fileHash(path.join(out,n)));}
 const receipt={createdAt:new Date().toISOString(),previous:old,previousPid:state.pid,reason:'CPU reproduced: prepare() includes undefined optional properties, serialized JSON omits them. Compare canonical serialized preparation, not JS undefined-key presence.',gpuEntriesPreviouslyRun:0,inputAndExpectedBytesChanged:false,trainingOrSelectionChanged:false,releaseQualified:false};fs.writeFileSync(path.join(out,'recovery-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 const pins=[...prep.pins,...[self,path.join(old,'state.json'),path.join(old,'preparation.json'),...names.map(n=>path.join(out,n)),path.join(out,'recovery-receipt.json')].map(p=>({path:p,sha256:fileHash(p)}))];fs.writeFileSync(path.join(out,'preparation.json'),JSON.stringify({...prep,preparedAt:receipt.createdAt,pins,preparationCanonicalization:'JSON roundtrip only; no model-output repair',previous:old},null,2)+'\n',{flag:'wx'});return{out,entries:prep.ids.length,oldEvidencePreserved:true,trainingChanged:false};
}
async function run(root,python,runtime){
 const out=path.join(root,'manual-entry-v3'),prep=read(path.join(out,'preparation.json')),expected=read(path.join(out,'EXPECTED.private.json')),manifest=read(path.join(root,'dataset-manifest.json')),policy=read(path.join(root,'experiment-policy.json')),cutoff=Date.parse(policy.deadline)-policy.reportReserveSeconds*1000;assert(!fs.existsSync(path.join(out,'state.json')),'REFUSE_RESTART');
 const put=(n,x)=>{const p=path.join(out,n);fs.writeFileSync(p+'.tmp',JSON.stringify(x,null,2)+'\n');fs.renameSync(p+'.tmp',p);},state={status:'waiting-for-core-and-post',pid:process.pid,startedAt:new Date().toISOString(),stages:[]};let reason=null;const onSignal=()=>{reason??='SIGNAL';};process.on('SIGTERM',onSignal);process.on('SIGINT',onSignal);
 function guard(){assert(!reason,reason);assert(Date.now()<cutoff,'GPU_CUTOFF');for(const p of [root,out,manifest.extension])assert(!fs.existsSync(path.join(p,'CANCEL')),'CANCEL');for(const p of prep.pins)assert.equal(fileHash(p.path),p.sha256,'PIN_CHANGED:'+p.path);}
 guard();put('state.json',state);
 // Also propagate a parent cancellation during infer(), not just between calls.
 const watchdog=setInterval(()=>{try{guard();}catch(e){if(!reason){reason=String(e);process.emit('SIGTERM');}}},2000);
 try{
  while(true){guard();const core=read(path.join(root,'run-state.json')),post=read(path.join(root,'post-v1/state.json'));if(canRun(core,alive(core.pid),post,alive(post.pid),fs.existsSync(path.join(runtime,'gpu.lock'))))break;await new Promise(r=>setTimeout(r,10000));}
  const nativePath=path.join(root,'native-reference.json'),native=read(nativePath),selection=read(path.join(root,'selection.json'));assert.equal(selection.testUsed,false);assert.equal(selection.selected.step,native.selectedStep);assert.equal(fileHash(path.join(native.adapter,'adapters.safetensors')),native.adapterSha256);const results=[];
  for(const id of prep.ids){guard();state.status='running';state.stage=id;put('state.json',state);const specPath=path.join(out,id+'.json');verifySerialized(read(specPath),read(path.join(out,id+'-prepared.json')));const exp=expected.cases.find(c=>c.id===id);
   const result=await infer(specPath,nativePath,python,runtime,path.join(out,id+'-result'),new Date(cutoff).toISOString());guard();const values=result.values.map(v=>v.value),semanticMatch=result.contractPass&&exp.acceptedValues.some(xs=>equal(xs,values));results.push({id,contractPass:result.contractPass,semanticMatch,values:result.values,metadata:result.metadata,adapterSha256:result.adapterSha256,physical16GBMachineTested:false});state.stages.push({id,completedAt:new Date().toISOString(),contractPass:result.contractPass,semanticMatch});put('state.json',state);put('partial-summary.json',{selectedStep:native.selectedStep,results,releaseQualified:false});console.log(JSON.stringify(state.stages.at(-1)));
  }
  put('summary.json',{selectedStep:native.selectedStep,adapterSha256:native.adapterSha256,results,totalEntries:results.length,semanticPassed:results.filter(r=>r.semanticMatch).length,allContractsPass:results.every(r=>r.contractPass),allSemanticsPass:results.every(r=>r.semanticMatch),scope:prep.scope,decodingPresencePenalty:0,trainingAllowed:false,selectionAllowed:false,releaseQualified:false,activation:false,oldStoppedPreparationPreserved:prep.previous});state.status='complete-research-evidence';state.completedAt=new Date().toISOString();put('state.json',state);
 }catch(e){state.status='failed';state.error=String(e);put('state.json',state);console.error(e);process.exitCode=1;}
 finally{clearInterval(watchdog);process.off('SIGTERM',onSignal);process.off('SIGINT',onSignal);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===self){const [mode,root,python,runtime]=process.argv.slice(2);if(mode==='prepare')console.log(JSON.stringify(freeze(root)));else{assert.equal(mode,'run');await run(root,python,runtime);}}
