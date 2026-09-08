/** Portable model-bundle entry. Reuses the original five public input/output contracts. */
import fs from'node:fs';import path from'node:path';import assert from'node:assert/strict';import{spawn}from'node:child_process';import{fileURLToPath}from'node:url';
import{prepare,validate}from'./research-inference-v2.mjs';import{fileHash}from'./precision-diagnostic.mjs';
const self=fileURLToPath(import.meta.url),dir=path.dirname(self),read=p=>JSON.parse(fs.readFileSync(p));
export function contained(root,relative){assert(typeof relative==='string'&&relative.length&&!path.isAbsolute(relative));const p=path.resolve(root,relative);assert(p.startsWith(path.resolve(root)+path.sep),'BUNDLE_PATH_ESCAPE');assert(!fs.lstatSync(p).isSymbolicLink(),'BUNDLE_SYMLINK');const real=fs.realpathSync(p);assert(real.startsWith(fs.realpathSync(root)+path.sep),'BUNDLE_PATH_ESCAPE');return real;}
export function verifyBundle(bundleRoot,variantName){
 const manifest=read(path.join(bundleRoot,'MODEL_BUNDLE.json'));assert.equal(manifest.schema,'ggd-mac-model-bundle@1');assert.equal(manifest.releaseQualified,false);assert.equal(manifest.thinking,false);assert.equal(manifest.decoding.presencePenalty,0);
 assert(Array.isArray(manifest.files)&&manifest.files.length>0);assert.equal(new Set(manifest.files.map(f=>f.path)).size,manifest.files.length,'DUPLICATE_BUNDLE_FILE');
 for(const f of manifest.files){const p=contained(bundleRoot,f.path);assert(fs.statSync(p).isFile());assert.equal(fs.statSync(p).size,f.bytes);assert.equal(fileHash(p),f.sha256,'BUNDLE_HASH_CHANGED:'+f.path);}
 const variant=manifest.variants[variantName];assert(variant,'UNKNOWN_MODEL_VARIANT');const model=contained(bundleRoot,variant.model),adapter=variant.adapter?contained(bundleRoot,variant.adapter):null;
 for(const root of[variant.model,...(variant.adapter?[variant.adapter]:[])]){const actual=fs.readdirSync(path.join(bundleRoot,root),{recursive:true}).filter(p=>fs.statSync(path.join(bundleRoot,root,p)).isFile()).map(p=>path.posix.join(root,p));const expected=manifest.files.filter(f=>f.path.startsWith(root+'/')).map(f=>f.path);assert.deepEqual(actual.sort(),expected.sort(),'UNMANIFESTED_MODEL_FILE');}
 assert(manifest.files.some(f=>f.path===path.relative(fs.realpathSync(bundleRoot),fs.realpathSync(self)).split(path.sep).join('/')),'ENTRY_NOT_MANIFESTED');
 return{manifest,variant,model,adapter};
}
export function loadSpec(file){const spec=read(file);if(spec.catalog){assert(typeof spec.catalog.path==='string');spec.catalog.path=path.resolve(path.dirname(file),spec.catalog.path);}return{spec,prepared:prepare(spec)};}
export async function infer(bundleRoot,specPath,python,runtime,out,variantName,externalCutoff){
 for(const p of[bundleRoot,specPath,python,runtime,out])assert(path.isAbsolute(p),'ABSOLUTE_PATH_REQUIRED');assert(fs.statSync(runtime).isDirectory());assert(!fs.existsSync(out),'REFUSE_OVERWRITE');const lock=path.join(runtime,'gpu.lock');assert(!fs.existsSync(lock),'GPU_BUSY');
 const cutoff=Math.min(externalCutoff?Date.parse(externalCutoff):Infinity,Date.now()+300000);assert(Number.isFinite(cutoff)&&cutoff>Date.now()+10000,'INSUFFICIENT_TIME');
 const model=verifyBundle(bundleRoot,variantName),{spec,prepared}=loadSpec(specPath);assert(Date.now()<cutoff,'PRECHECK_TIMEOUT');
 const metadataPins=[path.join(bundleRoot,'MODEL_BUNDLE.json'),specPath,...(spec.catalog?[spec.catalog.path]:[])].map(p=>({path:p,sha256:fileHash(p)}));
 const codePins=model.manifest.files.filter(f=>f.path.startsWith('code/')).map(f=>({path:contained(bundleRoot,f.path),sha256:f.sha256}));
 let child=null,owned=false,reason=null,killTimer;const state={status:'preparing',pid:process.pid,startedAt:new Date().toISOString(),variant:variantName,releaseQualified:false,activation:false};
 const put=(n,v)=>{const p=path.join(out,n);fs.writeFileSync(p+'.tmp',JSON.stringify(v,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
 function guard(){assert(!reason,reason);assert(Date.now()<cutoff,'TIMEOUT');assert(!fs.existsSync(path.join(out,'CANCEL')),'CANCEL');for(const p of[...metadataPins,...codePins])assert.equal(fileHash(p.path),p.sha256,'INPUT_OR_CODE_CHANGED');}
 function stop(why){reason??=why;if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},3000);}}
 const signal=()=>stop('SIGNAL');process.on('SIGTERM',signal);process.on('SIGINT',signal);
 try{
  guard();fs.writeFileSync(lock,JSON.stringify({pid:process.pid,kind:'portable-ggd-inference',out}),{flag:'wx'});owned=true;fs.mkdirSync(out);put('prepared.json',prepared);put('requests.json',prepared.requests);
  const policy={schema:'ggd-portable-research-inference@1',deadline:new Date(cutoff+900000).toISOString(),reportReserveSeconds:900,platform:'darwin-arm64',cloudGpu:false,cloudFallback:false,cloudGpuSpendLimit:0,externalTeacher:false,publish:false,activateInEditor:false,thinking:false,maxMemoryGiB:12,maxSequenceTokens:4096,maxOutputTokens:256,seed:20260906,temperature:0,topP:.8,topK:20,presencePenalty:0,trainingAllowed:false,releaseQualified:false};put('policy.json',policy);
  for(const n of['prepared.json','requests.json','policy.json'])metadataPins.push({path:path.join(out,n),sha256:fileHash(path.join(out,n))});put('pins.json',{metadataPins,codePins,modelFilesVerified:true});state.status='running';put('state.json',state);
  const args=[path.join(dir,'worker.py'),'eval','--model',model.model,'--policy',path.join(out,'policy.json'),'--data',path.join(out,'requests.json'),'--output',path.join(out,'raw.json')];if(model.adapter)args.push('--adapter',model.adapter);
  const log=fs.openSync(path.join(out,'inference.log'),'wx');child=spawn(python,args,{stdio:['ignore',log,log],detached:true});fs.closeSync(log);put('worker-lease.json',{pid:child.pid,parent:process.pid});
  const timer=setInterval(()=>{try{guard();}catch(e){stop(String(e));}},1000);let code;try{code=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});}finally{clearInterval(timer);clearTimeout(killTimer);child=null;put('worker-lease.json',{pid:null});}
  assert(!reason&&code===0,reason??'WORKER_EXIT:'+code);guard();verifyBundle(bundleRoot,variantName);guard();const raw=read(path.join(out,'raw.json'));assert.equal(raw.metadata.modelPath,model.model);assert.equal(raw.metadata.adapter,model.adapter);assert(raw.metadata.peakMetalBytes<=12*1024**3);
  const result=validate(spec,prepared,raw);put('checked.json',result);state.status=result.contractPass?'complete-research-inference':'invalid-model-output';state.completedAt=new Date().toISOString();put('state.json',state);const summary={...state,...result,metadata:raw.metadata,memoryLimitGiB:12,physical16GBMachineTested:false,modelBundle:bundleRoot};put('summary.json',summary);return summary;
 }catch(e){if(fs.existsSync(out)){state.status='failed';state.error=String(e);put('state.json',state);}throw e;}
 finally{clearTimeout(killTimer);process.off('SIGTERM',signal);process.off('SIGINT',signal);if(owned&&fs.existsSync(lock)&&read(lock).pid===process.pid)fs.unlinkSync(lock);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===self){const[spec,python,runtime,out,variant,ack,cutoff]=process.argv.slice(2);assert.equal(ack,'RESEARCH_ONLY','EXPLICIT_RESEARCH_ACK_REQUIRED');const root=path.dirname(dir);console.log(JSON.stringify(await infer(root,path.resolve(spec),path.resolve(python),path.resolve(runtime),path.resolve(out),variant,cutoff),null,2));}
