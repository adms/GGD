/** One-shot continuation of frozen R5 diagnostics. No training or selection. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import {isDeepStrictEqual} from 'node:util';
import {fileHash} from './precision-diagnostic.mjs';
const self=fileURLToPath(import.meta.url),dir=path.dirname(self),read=p=>JSON.parse(fs.readFileSync(p));
const put=(out,n,v)=>{const p=path.join(out,n);fs.writeFileSync(p+'.tmp',JSON.stringify(v,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
export function phaseReadiness(core,post,alive,lockExists){
 if(core.status==='failed'||post.status==='failed')return{status:'failed',reason:'ORIGINAL_PARENT_FAILED'};
 if(core.status==='complete-research-only'&&post.status==='complete-research-evidence'&&!alive(core.pid)&&!alive(post.pid)&&!lockExists)return{status:'ready'};
 for(const s of [core,post])if(!s.status.startsWith('complete')&&!alive(s.pid))return{status:'failed',reason:'PARENT_STOPPED_WITHOUT_COMPLETE'};
 return{status:'waiting'};
}
const alive=pid=>{assert(Number.isInteger(pid)&&pid>0);try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}};
export async function run(root,extension,python,runtime,out){
 for(const p of [root,extension,python,runtime,out])assert(p&&path.isAbsolute(p));assert(!fs.existsSync(out),'REFUSE_RESTART');
 const authorization=path.join(extension,'AUTHORIZATION.json'),auth=read(authorization);for(const k of ['cloudGpu','publish','activateInEditor','parameterGenerationTraining','visualValidationTraining'])assert.equal(auth[k],false);assert.equal(auth.cloudGpuSpendLimit,0);
 const cutoff=Date.parse(auth.gpuCutoff);assert(Date.now()<cutoff-120000,'INSUFFICIENT_RESERVE');
 const compositionPrep=read(path.join(extension,'manual-composition-inputs-v1/preparation.json'));assert.equal(compositionPrep.modelRunRoot,root);
 const specs=[['source-label',path.join(extension,'source-label-paired-v1')],['composition',path.join(extension,'composition-paired-v1')]];
 for(const [,p] of specs){assert.equal(read(path.join(p,'preparation.json')).root,root);assert(!fs.existsSync(path.join(p,'state.json')),'PAIRED_ALREADY_STARTED');}
 assert(!fs.existsSync(path.join(root,'manual-entry-check-v1/run-state.json')),'ENTRY_ALREADY_STARTED');assert(!fs.existsSync(path.join(root,'final-evidence-v1')),'REPORT_ALREADY_EXISTS');
 const files=[self,authorization,...['current-template-entry-check.mjs','r5-final-report.mjs','paired-diagnostic-run.mjs','composition-predict.mjs','composition-client.mjs'].map(n=>path.join(dir,n)),path.join(root,'manual-entry-check-v1/preparation.json'),...specs.map(([,p])=>path.join(p,'preparation.json')),path.join(extension,'manual-composition-inputs-v1/preparation.json')];
 const pins=files.map(p=>({path:p,sha256:fileHash(p)}));let child=null,reason=null,killTimer;const state={status:'waiting-for-core-and-post',pid:process.pid,startedAt:new Date().toISOString(),root,stages:[],trainingAllowed:false,selectionAllowed:false,activation:false};
 function verifyPins(){for(const p of pins)assert.equal(fileHash(p.path),p.sha256,'PIN_CHANGED:'+p.path);}
 function guard(){assert(!reason,reason);assert(Date.now()<cutoff,'ADDITIONAL_GPU_CUTOFF');for(const p of [root,extension,out])assert(!fs.existsSync(path.join(p,'CANCEL')),'CANCEL');verifyPins();}
 function stop(why){if(reason)return;reason=why;if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},12000);}}
 const onSignal=()=>stop('SIGNAL');process.on('SIGTERM',onSignal);process.on('SIGINT',onSignal);
 async function execute(stage,args){
  guard();state.status='running';state.stage=stage;put(out,'state.json',state);const log=fs.openSync(path.join(out,stage+'.log'),'wx');
  child=spawn(process.execPath,args,{stdio:['ignore',log,log],detached:true});fs.closeSync(log);put(out,'child-lease.json',{pid:child.pid,stage,parent:process.pid});
  const timer=setInterval(()=>{try{guard();}catch(e){stop(String(e));}},2000);let code;
  try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});}finally{clearInterval(timer);clearTimeout(killTimer);child=null;put(out,'child-lease.json',{pid:null});}
  assert(!reason&&code===0,reason??'STAGE_FAILED:'+stage+':'+code);guard();state.stages.push({stage,completedAt:new Date().toISOString()});put(out,'state.json',state);console.log(JSON.stringify(state.stages.at(-1)));
 }
 try{
  guard();fs.mkdirSync(out);put(out,'pins.json',{pins});put(out,'state.json',state);
  while(true){guard();const ready=phaseReadiness(read(path.join(root,'run-state.json')),read(path.join(root,'post-diagnostics-v1/state.json')),alive,fs.existsSync(path.join(runtime,'gpu.lock')));assert.notEqual(ready.status,'failed',ready.reason);if(ready.status==='ready')break;await new Promise(resolve=>setTimeout(resolve,15000));}
  // Existing runner keeps its original 13:21 UTC cutoff. The extension does not rewrite it.
  await execute('original-manual-entry',[path.join(dir,'current-template-entry-check.mjs'),'run',root,python,runtime]);
  await execute('original-final-report',[path.join(dir,'r5-final-report.mjs'),root]);
  for(const [name,p] of specs)await execute(name+'-paired',[path.join(dir,'paired-diagnostic-run.mjs'),'run',p,python,runtime]);
  const manual=[];
  for(const pin of compositionPrep.pins)assert.equal(fileHash(pin.path),pin.sha256,'MANUAL_PREP_CHANGED');
  for(const c of compositionPrep.cases){
   const destination=path.join(out,c.id);await execute(c.id,[path.join(dir,'composition-predict.mjs'),compositionPrep.catalogPath,compositionPrep.catalogSha256,c.inputPath,path.join(root,'native-reference.json'),python,runtime,destination,auth.gpuCutoff,'RESEARCH_ONLY']);
   const result=read(path.join(destination,'summary.json'));assert.equal(read(path.join(destination,'request.json')).requestDigest,c.requestDigest);manual.push({id:c.id,contractPass:result.contractPass,semanticMatch:c.acceptedTargets.some(t=>isDeepStrictEqual(t,result.classification)),classification:result.classification,requiredChoices:result.requiredChoices,metadata:result.metadata,physical16GBMachineTested:false});
  }
  const native=read(path.join(root,'native-reference.json'));const summary={selectedStep:native.selectedStep,adapterSha256:native.adapterSha256,originalFinalReport:path.join(root,'final-evidence-v1/summary.json'),paired:Object.fromEntries(specs.map(([name,p])=>[name,read(path.join(p,'summary.json'))])),manualComposition:manual,allManualCompositionExamplesPass:manual.every(c=>c.contractPass&&c.semanticMatch),trainingAllowed:false,selectionAllowed:false,releaseQualified:false,activation:false,scope:'Frozen post-selection diagnostic and known-pattern entry checks only. No new training, checkpoint selection, original-score rewrite or independent-generalization claim.'};put(out,'summary.json',summary);
  state.status='complete-research-evidence';state.completedAt=new Date().toISOString();put(out,'state.json',state);console.log(JSON.stringify({status:state.status,selectedStep:native.selectedStep,allManualCompositionExamplesPass:summary.allManualCompositionExamplesPass}));return summary;
 }catch(e){if(fs.existsSync(out)){state.status='failed';state.error=String(e);put(out,'state.json',state);}throw e;}
 finally{clearTimeout(killTimer);process.off('SIGTERM',onSignal);process.off('SIGINT',onSignal);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===self)await run(...process.argv.slice(2));
