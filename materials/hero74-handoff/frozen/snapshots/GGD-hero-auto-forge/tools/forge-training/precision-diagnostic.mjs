/** Dev-only deployment precision choice, with fixed test and standalone evidence afterward. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {summarizeClassification} from './classification-score.mjs';import {buildRequest,validateRecommendation} from './classification-client.mjs';
export function fileHash(file){
 const h=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),buffer=Buffer.alloc(1024*1024);let count;
 try{while((count=fs.readSync(fd,buffer,0,buffer.length,null))>0)h.update(buffer.subarray(0,count));}finally{fs.closeSync(fd);}return h.digest('hex');
}
export function preservesMechanisms(original,candidate){
 const a=original.rows.filter(r=>r.task==='mechanism-template'),b=candidate.rows.filter(r=>r.task==='mechanism-template');
 if(!a.length||a.length!==b.length||a.some((r,i)=>r.id!==b[i].id))throw Error('INCOMPLETE_DEV_PAIRS');
 return a.every((r,i)=>(!r.pass||b[i].pass)&&(!r.decisionPass||b[i].decisionPass)&&(!r.schemaPass||b[i].schemaPass)&&(r.unsafe||!b[i].unsafe));
}
async function main(){
 const [root,python,runtime]=process.argv.slice(2);if(![root,python,runtime].every(p=>p&&path.isAbsolute(p)))throw Error('ABSOLUTE_ARGS_REQUIRED');
 const dir=path.dirname(fileURLToPath(import.meta.url)),read=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8')),hash=fileHash,put=(n,v)=>fs.writeFileSync(path.join(root,n),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
 if(read('post-state.json').status!=='complete-research-only')throw Error('ORIGINAL_EXPORT_NOT_COMPLETE');
 const policy=read('experiment-policy.json'),precision=read('precision-policy.json'),deployment=read('mac-deployment.json'),selected=read('priority-selection.json'),config=read('workflow-config.json'),cases=read('cases.private.json');
 if(precision.schema!=='ggd-forge-dev-precision-diagnostic@1'||precision.selectionUses!=='dev only'||precision.deadlineUnchanged!==policy.deadline)throw Error('PRECISION_POLICY_CHANGED');
 const cutoff=Date.parse(policy.deadline)-policy.reportReserveSeconds*1000,lock=path.join(runtime,'gpu.lock');
 const state={status:'running',startedAt:new Date().toISOString(),policySha256:hash(path.join(root,'precision-policy.json')),stages:[],pid:process.pid};put('precision-state.json',state);
 const update=()=>fs.writeFileSync(path.join(root,'precision-state.json'),JSON.stringify(state,null,2)+'\n');let child,cancelled=false;
 process.on('SIGTERM',()=>{cancelled=true;});process.on('SIGINT',()=>{cancelled=true;});
 async function run(stage,args,ownLock){
  if(cancelled||Date.now()>=cutoff||fs.existsSync(path.join(root,'CANCEL')))throw Error('CANCELLED_OR_DEADLINE');
  if(ownLock)fs.writeFileSync(lock,JSON.stringify({pid:process.pid,root,kind:'precision-diagnostic'}),{flag:'wx'});
  let monitor,killTimer,killed=false;state.stage=stage;update();
  try{const log=fs.openSync(path.join(root,stage+'.log'),'wx');try{child=spawn(python,args,{stdio:['ignore',log,log],detached:true});}finally{fs.closeSync(log);}
   monitor=setInterval(()=>{if(!killed&&(cancelled||Date.now()>=cutoff||fs.existsSync(path.join(root,'CANCEL')))){killed=true;try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},3000);}},1000);
   const code=await new Promise((ok,bad)=>{child.once('error',bad);child.once('exit',ok);});if(code!==0||killed)throw Error('STAGE_FAILED:'+stage+':'+code);
  }finally{clearInterval(monitor);clearTimeout(killTimer);if(ownLock&&fs.existsSync(lock)&&JSON.parse(fs.readFileSync(lock,'utf8')).pid===process.pid)fs.unlinkSync(lock);}
  state.stages.push({stage,completedAt:new Date().toISOString()});update();console.log(JSON.stringify({stage,status:'complete'}));
 }
 async function evaluate(name,model,split){await run(name,[path.join(dir,'worker.py'),'eval','--model',model,'--policy',path.join(root,'experiment-policy.json'),'--data',path.join(root,split+'-requests.json'),'--output',path.join(root,name+'.json')],true);const score=summarizeClassification(cases.filter(c=>c.split===split),read(name+'.json'));put(name+'-score.json',score);return score;}
 try{
  for(const f of deployment.files.filter(f=>f.path.startsWith(deployment.fusedPath+path.sep)))if(hash(f.path)!==f.sha256)throw Error('FUSED_INPUT_CHANGED');
  const fused=await evaluate('fused-dev',deployment.fusedPath,'dev');
  const destination=path.join(runtime,path.basename(root)+'-8bit-export');
  await run('deploy-8bit',[path.join(dir,'deploy.py'),'--manifest',path.join(root,'export-manifest.json'),'--policy',path.join(root,'experiment-policy.json'),'--dev-requests',path.join(root,'dev-requests.json'),'--destination',destination,'--report',path.join(root,'mac-deployment-8bit.json'),'--lease-dir',runtime,'--bits','8'],false);
  const q=read('mac-deployment-8bit.json'),qdev=await evaluate('eightbit-dev',q.quantizedPath,'dev');
  const nativeDev=summarizeClassification(cases.filter(c=>c.split==='dev'),read('dev-'+selected.selected.epoch+'.json'));
  const useEightBit=preservesMechanisms(nativeDev,qdev),model=useEightBit?q.quantizedPath:config.model,adapter=useEightBit?null:selected.selected.adapter;
  if(hash(path.join(selected.selected.adapter,'adapters.safetensors'))!==selected.selected.adapterSha256)throw Error('ADAPTER_CHANGED');
  const choice={mode:useEightBit?'8bit':'native-bf16-plus-lora',model,adapter,selectedAt:new Date().toISOString(),selectionUses:'dev only',fusedPreservesMechanisms:preservesMechanisms(nativeDev,fused),eightBitPreservesMechanisms:useEightBit,nativeDev:nativeDev.tasks['mechanism-template'],fusedDev:fused.tasks['mechanism-template'],eightBitDev:qdev.tasks['mechanism-template'],releaseQualified:false};put('precision-selection.json',choice);
  // Selection is persisted before any test output is read here.
  const finalScore=useEightBit?await evaluate('eightbit-test',model,'test'):summarizeClassification(cases.filter(c=>c.split==='test'),read('test-B.json'));
  const request=buildRequest(read('catalog.json'),{id:'standalone-mechanism',task:'mechanism',request:'我打中對手才額外加傷，不是被打才發動。'});put('precision-standalone-request.json',request);
  await run('precision-standalone',[path.join(dir,'classification-predict.py'),'--model',model,...(adapter?['--adapter',adapter]:[]),'--request',path.join(root,'precision-standalone-request.json'),'--output',path.join(root,'precision-standalone.json'),'--runtime-root',runtime,'--max-memory-gib','12'],false);
  const result=read('precision-standalone.json');if(result.requestDigest!==request.requestDigest)throw Error('STANDALONE_DIGEST');
  const standalone={...validateRecommendation(request,result.value),semanticPass:result.value?.decision==='accept'&&result.value?.templateId==='tpl-on-attack',model:result.model,adapter:result.adapter,peakMetalBytes:result.peakMetalBytes,seconds:result.seconds,loadSeconds:result.loadSeconds,memoryLimitGiB:result.memoryLimitGiB,mac16GB:'not-tested'};
  const nativeTest=summarizeClassification(cases.filter(c=>c.split==='test'),read('test-B.json')),precisionRetentionGate=preservesMechanisms(nativeTest,finalScore);
  put('precision-summary.json',{...choice,test:finalScore,standalone,precisionRetentionGate,deploymentDisposition:precisionRetentionGate?'precision-preserved-research-only-not-qualified':'precision-rejected-no-promotion',scope:'precision preservation diagnostics, not proof of sufficient model quality',wholeGoalQualified:false,releaseQualified:false});
  state.status='complete-research-only';state.completedAt=new Date().toISOString();update();console.log(JSON.stringify({mode:choice.mode,mechanismTest:finalScore.tasks['mechanism-template'],standalone}));
 }catch(e){state.status='failed';state.error=String(e);update();throw e;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
