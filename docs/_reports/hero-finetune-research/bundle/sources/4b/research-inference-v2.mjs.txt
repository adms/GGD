/** Public local entry with the R6 zero-penalty decode contract.
 * No case file or expected-answer lookup; no output repair or activation.
 */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {digest,mechanicsText} from './dataset.mjs';import {fileHash} from './precision-diagnostic.mjs';import {buildCompositionRequest,validateCompositionResult} from './composition-client.mjs';import {buildCurrentRequest} from './current-template-client.mjs';import {buildRequest,validateRecommendation} from './classification-client.mjs';import {buildFidelityPlan,validateFidelity} from './r3-fidelity-client.mjs';import {system} from './r3-data.mjs';
const self=fileURLToPath(import.meta.url),dir=path.dirname(self),read=p=>JSON.parse(fs.readFileSync(p)),keys=x=>Object.keys(x).sort();
export function buildSource(input){
 assert.deepEqual(keys(input),['claim','id','source','task']);assert(['hero-source','owner-mechanism'].includes(input.task));assert(typeof input.id==='string'&&/^[a-zA-Z0-9_.-]{1,100}$/.test(input.id));
 const source=input.source;assert.deepEqual(keys(source),['id','name','sha256','text','version']);for(const k of ['id','name','version','text'])assert(typeof source[k]==='string'&&source[k].trim());assert(source.text.length<=12000);assert.equal(source.sha256,digest(source.text),'SOURCE_CHANGED');assert(typeof input.claim==='string'&&input.claim.trim()&&input.claim.length<=6000);
 const text=input.task==='owner-mechanism'?mechanicsText(source.text):source.text;
 const payload={task:input.task,source:{id:source.id,name:source.name,snapshot:source.sha256,text},claim:input.claim,instruction:'只根據此份鎖定來源判斷 claim。輸出 {"verdict":"supported|contradicted|not-stated"}。不判斷整招是否已能用模板實現。'},messages=[{role:'system',content:system},{role:'user',content:JSON.stringify(payload)}];
 return{id:input.id,messages,requestDigest:digest(messages),sourceLock:{id:source.id,version:source.version,sha256:source.sha256},warning:'Explicit caller-selected source; this entry does not resolve ambiguous hero identity or verify external canon.'};
}
const sourceContract=v=>v&&typeof v==='object'&&!Array.isArray(v)&&keys(v).join()==='verdict'&&['supported','contradicted','not-stated'].includes(v.verdict);
export function prepare(spec){
 assert(spec&&['source','fidelity','single','stack','vfx'].includes(spec.kind));assert.deepEqual(keys(spec),['source','fidelity'].includes(spec.kind)?['input','kind']:['catalog','input','kind']);
 let catalog,request,plan;
 if(spec.catalog){assert.deepEqual(keys(spec.catalog),['path','sha256']);assert(path.isAbsolute(spec.catalog.path));catalog=read(spec.catalog.path);assert.equal(digest(catalog),spec.catalog.sha256,'CATALOG_CHANGED');}
 if(spec.kind==='source')request=buildSource(spec.input);
 else if(spec.kind==='fidelity')plan=buildFidelityPlan(spec.input);
 else if(spec.kind==='single')request=buildCurrentRequest(catalog,spec.input,spec.catalog.sha256);
 else if(spec.kind==='stack')request=buildCompositionRequest(catalog,spec.input,spec.catalog.sha256);
 else{assert.equal(spec.input.task,'vfx');assert.deepEqual(keys(spec.input),['id','request','task']);request=buildRequest(catalog,spec.input);}
 const requests=(plan?.requests??[request]).map(({id,messages,requestDigest})=>({id,messages,requestDigest}));assert(requests.length>=1&&requests.length<=25);
 return{requests,request,plan,catalog};
}
export function validate(spec,prepared,raw){
 assert.deepEqual(prepared,prepare(spec),'REQUEST_CHANGED');assert.equal(raw.complete,true);assert.equal(raw.metadata.thinking,false);assert.equal(raw.results.length,prepared.requests.length);
 for(const [i,r] of raw.results.entries()){assert.equal(r.id,prepared.requests[i].id);assert.equal(r.requestDigest,prepared.requests[i].requestDigest);assert.equal(r.error,null,'INFERENCE_FAILED');}
 let checked,contractPass;
 if(spec.kind==='stack'){checked=validateCompositionResult(prepared.catalog,prepared.request,raw,spec.catalog.sha256);contractPass=checked.pass;}
 else if(['single','vfx'].includes(spec.kind)){checked=validateRecommendation(prepared.request,raw.results[0].value);contractPass=checked.pass;}
 else if(spec.kind==='fidelity'){checked=validateFidelity(prepared.plan,raw);contractPass=raw.results.every(r=>sourceContract(r.value));}
 else{checked={value:raw.results[0].value,sourceLock:prepared.request.sourceLock};contractPass=!!sourceContract(checked.value);}
 return{kind:spec.kind,contractPass,checked,values:raw.results.map(r=>({id:r.id,value:r.value,seconds:r.seconds})),semanticQualified:false,releaseQualified:false,activation:false,warning:'Contract validity is not semantic correctness. Manual source/mechanism/parameter review remains required.'};
}
export function preflight(specPath,nativePath,runtime,out){
 for(const p of [specPath,nativePath,runtime,out])assert(p&&path.isAbsolute(p));const spec=read(specPath),prepared=prepare(spec),native=read(nativePath);assert(path.isAbsolute(native.base)&&path.isAbsolute(native.adapter));assert.equal(native.decoding?.presencePenalty,0,'EXPLICIT_ZERO_PENALTY_REFERENCE_REQUIRED');assert.equal(fileHash(path.join(native.adapter,'adapters.safetensors')),native.adapterSha256,'ADAPTER_CHANGED');assert(!fs.existsSync(out),'REFUSE_OVERWRITE');assert(!fs.existsSync(path.join(runtime,'gpu.lock')),'GPU_BUSY');const baseReceipt=path.join(path.dirname(native.base),'NATIVE_REFERENCE.json');assert.equal(read(baseReceipt).model,native.base);return{spec,prepared,native,baseReceipt};
}
export async function infer(specPath,nativePath,python,runtime,out,gpuCutoff){
 assert(path.isAbsolute(python));const {spec,prepared,native,baseReceipt}=preflight(specPath,nativePath,runtime,out),cutoff=Math.min(Date.parse(gpuCutoff),Date.now()+300000);assert(Number.isFinite(cutoff)&&cutoff>Date.now()+10000,'INSUFFICIENT_TIME');
 const files=[self,...['dataset.mjs','precision-diagnostic.mjs','composition-client.mjs','current-template-client.mjs','classification-client.mjs','r3-fidelity-client.mjs','r3-data.mjs','reviewed-curriculum.mjs','worker.py'].map(n=>path.join(dir,n)),specPath,nativePath,baseReceipt,...(spec.catalog?[spec.catalog.path]:[]),...['adapters.safetensors','adapter_config.json'].map(n=>path.join(native.adapter,n))],pins=files.map(p=>({path:p,sha256:fileHash(p)}));
 const lock=path.join(runtime,'gpu.lock'),baseFiles=read(baseReceipt).files.filter(f=>f.name.startsWith('base/'));assert.equal(baseFiles.length,13);let child=null,owned=false,reason=null,killTimer;
 const put=(n,x)=>{const p=path.join(out,n);fs.writeFileSync(p+'.tmp',JSON.stringify(x,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
 function guard(){assert(!reason,reason);assert(Date.now()<cutoff,'TIMEOUT');assert(!fs.existsSync(path.join(out,'CANCEL')),'CANCEL');for(const p of pins)assert.equal(fileHash(p.path),p.sha256,'PIN_CHANGED:'+p.path);}
 function verifyBase(){for(const f of baseFiles){const p=path.join(path.dirname(native.base),f.name);assert.equal(fs.statSync(p).size,f.bytes);assert.equal(fileHash(p),f.sha256,'BASE_CHANGED:'+p);}}
 function stop(why){if(reason)return;reason=why;if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},3000);}}
 const onSignal=()=>stop('SIGNAL');process.on('SIGTERM',onSignal);process.on('SIGINT',onSignal);const state={status:'preflight',pid:process.pid,startedAt:new Date().toISOString(),activation:false};
 try{
  guard();verifyBase();guard();fs.writeFileSync(lock,JSON.stringify({pid:process.pid,kind:'public-r6-research-inference',out}),{flag:'wx'});owned=true;fs.mkdirSync(out);
  put('prepared.json',prepared);put('requests.json',prepared.requests);
  const policy={schema:'ggd-public-research-zero-penalty@2',deadline:new Date(cutoff+900000).toISOString(),reportReserveSeconds:900,platform:'darwin-arm64',cloudGpu:false,cloudFallback:false,cloudGpuSpendLimit:0,externalTeacher:false,publish:false,activateInEditor:false,thinking:false,maxMemoryGiB:12,maxSequenceTokens:4096,maxOutputTokens:256,seed:20260906,temperature:0,topP:.8,topK:20,presencePenalty:0,trainingAllowed:false,releaseQualified:false};put('policy.json',policy);
  for(const n of ['prepared.json','requests.json','policy.json']){const p=path.join(out,n);pins.push({path:p,sha256:fileHash(p)});}put('pins.json',{pins,baseBytesVerified:true});state.status='running';put('state.json',state);
  const log=fs.openSync(path.join(out,'inference.log'),'wx');child=spawn(python,[path.join(dir,'worker.py'),'eval','--model',native.base,'--adapter',native.adapter,'--policy',path.join(out,'policy.json'),'--data',path.join(out,'requests.json'),'--output',path.join(out,'raw.json')],{stdio:['ignore',log,log],detached:true});fs.closeSync(log);put('worker-lease.json',{pid:child.pid,parent:process.pid});
  const timer=setInterval(()=>{try{guard();}catch(e){stop(String(e));}},1000);let code;try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});}finally{clearInterval(timer);clearTimeout(killTimer);child=null;put('worker-lease.json',{pid:null});}
  assert(!reason&&code===0,reason??'WORKER_EXIT:'+code);guard();verifyBase();guard();const raw=read(path.join(out,'raw.json'));assert.equal(raw.metadata.modelPath,native.base);assert.equal(raw.metadata.adapter,native.adapter);assert(raw.metadata.peakMetalBytes<=12*1024**3,'PEAK_OVER_LIMIT');
  const checked=validate(spec,prepared,raw);put('checked.json',checked);state.status=checked.contractPass?'complete-research-inference':'invalid-model-output';state.completedAt=new Date().toISOString();put('state.json',state);const result={...state,...checked,metadata:raw.metadata,adapterSha256:native.adapterSha256,memoryLimitGiB:12,physical16GBMachineTested:false,decodingPresencePenalty:0};put('summary.json',result);return result;
 }catch(e){if(fs.existsSync(out)){state.status='failed';state.error=String(e);put('state.json',state);}throw e;}
 finally{clearTimeout(killTimer);process.off('SIGTERM',onSignal);process.off('SIGINT',onSignal);if(owned&&fs.existsSync(lock)&&read(lock).pid===process.pid)fs.unlinkSync(lock);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===self){const [spec,native,python,runtime,out,cutoff,mode]=process.argv.slice(2);assert.equal(mode,'RESEARCH_ONLY');console.log(JSON.stringify(await infer(spec,native,python,runtime,out,cutoff),null,2));}
