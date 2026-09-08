/** One bounded Mac-only manual inference using the existing offline MLX worker. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {fileHash} from './precision-diagnostic.mjs';import {buildCompositionRequest,validateCompositionResult} from './composition-client.mjs';
const self=fileURLToPath(import.meta.url),dir=path.dirname(self),read=p=>JSON.parse(fs.readFileSync(p));
const put=(out,n,x)=>{const p=path.join(out,n);fs.writeFileSync(p+'.tmp',JSON.stringify(x,null,2)+'\n');fs.renameSync(p+'.tmp',p);};

export function preflight(catalogPath,expectedHash,inputPath,nativePath,runtime,out){
 for(const p of [catalogPath,inputPath,nativePath,runtime,out])assert(p&&path.isAbsolute(p));
 const catalog=read(catalogPath),input=read(inputPath),request=buildCompositionRequest(catalog,input,expectedHash),native=read(nativePath);
 assert(path.isAbsolute(native.base)&&path.isAbsolute(native.adapter));assert.equal(fileHash(path.join(native.adapter,'adapters.safetensors')),native.adapterSha256,'ADAPTER_CHANGED');
 assert(!fs.existsSync(out),'REFUSE_OVERWRITE');assert(!fs.existsSync(path.join(runtime,'gpu.lock')),'GPU_BUSY');
 assert(fs.statSync(native.base).isDirectory());const baseReceipt=path.join(path.dirname(native.base),'NATIVE_REFERENCE.json');assert.equal(read(baseReceipt).model,native.base);
 return{catalog,request,native,baseReceipt};
}
export async function predict(catalogPath,expectedHash,inputPath,nativePath,python,runtime,out,options={}){
 assert(path.isAbsolute(python));const check=preflight(catalogPath,expectedHash,inputPath,nativePath,runtime,out),{catalog,request,native,baseReceipt}=check;
 const timeoutSeconds=options.timeoutSeconds??120,maxMemoryGiB=options.maxMemoryGiB??12;assert(timeoutSeconds>=30&&timeoutSeconds<=600);assert(Number.isInteger(maxMemoryGiB)&&maxMemoryGiB>=12&&maxMemoryGiB<=80);
 const cutoff=Math.min(Date.now()+timeoutSeconds*1000,options.gpuCutoff===undefined?Infinity:Date.parse(options.gpuCutoff));assert(Number.isFinite(cutoff)&&cutoff>Date.now()+10000,'INSUFFICIENT_TIME');
 const files=[self,path.join(dir,'composition-client.mjs'),path.join(dir,'dataset.mjs'),path.join(dir,'precision-diagnostic.mjs'),path.join(dir,'worker.py'),catalogPath,inputPath,nativePath,baseReceipt,...['adapters.safetensors','adapter_config.json'].map(n=>path.join(native.adapter,n))];
 const pins=files.map(p=>({path:p,sha256:fileHash(p)})),lock=path.join(runtime,'gpu.lock');let child=null,owned=false,reason=null,killTimer;
 const baseFiles=read(baseReceipt).files.filter(f=>f.name.startsWith('base/'));assert(baseFiles.length>0);
 function verifyBase(){for(const f of baseFiles){const p=path.join(path.dirname(native.base),f.name);assert.equal(fs.statSync(p).size,f.bytes);assert.equal(fileHash(p),f.sha256,'BASE_CHANGED:'+p);}}
 function guard(){assert(!reason,reason);assert(Date.now()<cutoff,'TIMEOUT');assert(!fs.existsSync(path.join(out,'CANCEL')),'CANCEL');for(const p of pins)assert.equal(fileHash(p.path),p.sha256,'PIN_CHANGED:'+p.path);}
 function stop(why){if(reason)return;reason=why;if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},3000);}}
 const onSignal=()=>stop('SIGNAL');process.on('SIGTERM',onSignal);process.on('SIGINT',onSignal);
 const state={status:'preflight',pid:process.pid,startedAt:new Date().toISOString(),model:native.base,adapter:native.adapter,adapterSha256:native.adapterSha256,activation:false};
 try{
  guard();verifyBase();guard();fs.writeFileSync(lock,JSON.stringify({pid:process.pid,kind:'manual-composition-inference',out}),{flag:'wx'});owned=true;fs.mkdirSync(out);
  put(out,'request.json',request);put(out,'worker-requests.json',[{id:request.id,messages:request.messages,requestDigest:request.requestDigest}]);
  const policy={schema:'ggd-manual-composition-inference@1',deadline:new Date(cutoff+900000).toISOString(),reportReserveSeconds:900,platform:'darwin-arm64',cloudGpu:false,cloudFallback:false,cloudGpuSpendLimit:0,externalTeacher:false,publish:false,activateInEditor:false,thinking:false,maxMemoryGiB,maxSequenceTokens:4096,maxOutputTokens:256,seed:20260906,temperature:0,topP:.8,topK:20,presencePenalty:1.5,trainingAllowed:false,releaseQualified:false};put(out,'policy.json',policy);
  pins.push(...['request.json','worker-requests.json','policy.json'].map(n=>{const p=path.join(out,n);return{path:p,sha256:fileHash(p)};}));put(out,'pins.json',{pins,baseBytesVerified:true});state.status='running';put(out,'state.json',state);
  const log=fs.openSync(path.join(out,'inference.log'),'wx');child=spawn(python,[path.join(dir,'worker.py'),'eval','--model',native.base,'--adapter',native.adapter,'--policy',path.join(out,'policy.json'),'--data',path.join(out,'worker-requests.json'),'--output',path.join(out,'raw.json')],{stdio:['ignore',log,log],detached:true});fs.closeSync(log);put(out,'worker-lease.json',{pid:child.pid,parent:process.pid});
  const timer=setInterval(()=>{try{guard();}catch(e){stop(String(e));}},1000);let code;
  try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});}finally{clearInterval(timer);clearTimeout(killTimer);child=null;put(out,'worker-lease.json',{pid:null});}
  assert(!reason&&code===0,reason??'WORKER_EXIT:'+code);guard();verifyBase();guard();const raw=read(path.join(out,'raw.json'));
  assert.equal(raw.metadata.modelPath,native.base);assert.equal(raw.metadata.adapter,native.adapter);assert(raw.metadata.peakMetalBytes<=maxMemoryGiB*1024**3,'PEAK_OVER_LIMIT');
  const result=validateCompositionResult(catalog,request,raw,expectedHash);put(out,'checked.json',result);state.status=result.pass?'complete-research-inference':'invalid-model-output';state.completedAt=new Date().toISOString();put(out,'state.json',state);
  const summary={...state,contractPass:result.pass,classification:result.value,requiredChoices:result.plans??[],catalogSha256:expectedHash,inputIntegrityVerified:true,metadata:raw.metadata,memoryLimitGiB:maxMemoryGiB,physical16GBMachineTested:false,semanticQualified:false,releaseQualified:false,activation:false};put(out,'summary.json',summary);return summary;
 }catch(e){if(fs.existsSync(out)){state.status='failed';state.error=String(e);put(out,'state.json',state);}throw e;}
 finally{clearTimeout(killTimer);process.off('SIGTERM',onSignal);process.off('SIGINT',onSignal);if(owned&&fs.existsSync(lock)&&read(lock).pid===process.pid)fs.unlinkSync(lock);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===self){
 const args=process.argv.slice(2);assert(args.length===9,'usage: composition-predict.mjs CATALOG EXPECTED_HASH INPUT MODEL_REFERENCE PYTHON RUNTIME NEW_OUTPUT GPU_CUTOFF RESEARCH_ONLY');assert.equal(args[8],'RESEARCH_ONLY','EXPLICIT_RESEARCH_MODE_REQUIRED');
 const [catalogPath,expectedHash,inputPath,nativePath,python,runtime,out,gpuCutoff]=args;console.log(JSON.stringify(await predict(catalogPath,expectedHash,inputPath,nativePath,python,runtime,out,{gpuCutoff}),null,2));
}
