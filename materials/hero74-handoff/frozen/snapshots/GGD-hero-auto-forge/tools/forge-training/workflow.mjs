import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validatePolicy} from './cli.mjs';
import {digest,writeJSON} from './dataset.mjs';
import {verifyDatasetExports} from './input-integrity.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=p=>{const h=crypto.createHash('sha256'),fd=fs.openSync(p,'r'),b=Buffer.alloc(8*1024**2);try{let n;while((n=fs.readSync(fd,b,0,b.length,null)))h.update(b.subarray(0,n));return h.digest('hex');}finally{fs.closeSync(fd);}};
export function validateWorkflow(c){
 const required=['schema','mode','root','python','modelReceipt','runtimeRoot','behaviorOutput','deployDestination','knownCorpusRoot','allowNewGpuDiagnostics'];
 if(Object.keys(c).some(k=>!required.includes(k))||required.some(k=>!(k in c))||c.schema!=='ggd-forge-workflow@1'||!['run','finalize-existing'].includes(c.mode)||typeof c.allowNewGpuDiagnostics!=='boolean')throw Error('WORKFLOW_CONFIG');
 for(const k of ['root','python','modelReceipt','runtimeRoot','behaviorOutput'])if(typeof c[k]!=='string'||!path.isAbsolute(c[k]))throw Error('ABSOLUTE_PATH:'+k);
 for(const k of ['deployDestination','knownCorpusRoot'])if(c[k]!==null&&(typeof c[k]!=='string'||!path.isAbsolute(c[k])))throw Error('OPTIONAL_PATH:'+k);
 if(c.root===c.runtimeRoot||c.runtimeRoot==='/private/tmp'||c.runtimeRoot==='/'||c.root==='/'||c.behaviorOutput===c.root)throw Error('UNSAFE_WORKFLOW_PATH');
 return c;
}
async function main(){
 const [command,file]=process.argv.slice(2);if(!['plan','run'].includes(command)||!file)throw Error('usage: workflow.mjs plan|run CONFIG.json');
 const configPath=path.resolve(file),c=validateWorkflow(read(configPath));
 const policyPath=path.join(c.root,'experiment-policy.json'),policy=validatePolicy(read(policyPath));
 const plan={mode:c.mode,stages:[...(c.mode==='run'?['core-experiment']:[]),'audit','diagnostics','behavior',...(c.deployDestination?['deployment','quantized-dev']:[]),...(c.knownCorpusRoot?['known-corpus-regression']:[]),'audit-final','final-report'],publish:false,activateInEditor:false,cloudGpu:false};
 if(command==='plan'){console.log(JSON.stringify(plan,null,2));return;}
 const configHash=hash(configPath),policyHash=hash(policyPath),deadline=Date.parse(policy.deadline),gpuDeadline=deadline-policy.reportReserveSeconds*1000;
 if(Date.now()>=deadline)throw Error('WORKFLOW_DEADLINE');
 const lock=path.join(c.root,'workflow.lock');fs.writeFileSync(lock,JSON.stringify({pid:process.pid,configHash}),{flag:'wx'});
 const dir=path.join(c.root,'workflow-attempts',Date.now()+'-'+process.pid);fs.mkdirSync(dir,{recursive:true});
 const receipt={schema:'ggd-forge-workflow-receipt@1',config:c,configHash,policyHash,startedAt:new Date().toISOString(),status:'running',stages:[],modelPromoted:false};
 let child=null,reason=null,timer=null,killer=null;
 const save=()=>writeJSON(path.join(dir,'receipt.json'),receipt);
 const guard=()=>{if(Date.now()>=deadline)throw Error('WORKFLOW_DEADLINE');if(fs.existsSync(path.join(c.root,'CANCEL')))throw Error('CANCELLED');if(hash(configPath)!==configHash||hash(policyPath)!==policyHash)throw Error('WORKFLOW_INPUT_DRIFT');};
 const stop=why=>{reason??=why;if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{}killer??=setTimeout(()=>{try{if(child?.pid)process.kill(-child.pid,'SIGKILL');}catch{}},5000);}};
 const onSignal=()=>stop('SIGNAL');process.on('SIGINT',onSignal);process.on('SIGTERM',onSignal);
 const run=async(name,exe,args,gpu=false)=>{
  guard();if(reason)throw Error(reason);if(gpu&&Date.now()>=gpuDeadline)throw Error('GPU_RESERVE_REACHED');
  const fd=fs.openSync(path.join(dir,name+'.log'),'a');child=spawn(exe,args,{cwd:repo,detached:true,stdio:['ignore',fd,fd],env:{...process.env,HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1'}});fs.closeSync(fd);
  const timeout=Math.min(gpu?gpuDeadline:deadline,Date.now()+(gpu?7*3600e3:60000));
  timer=setInterval(()=>{try{guard();if(Date.now()>=timeout)throw Error('STAGE_TIMEOUT');}catch(e){stop(String(e));}},250);
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});child=null;clearInterval(timer);clearTimeout(killer);killer=null;
  if(reason||code!==0)throw Error(reason??`${name}:EXIT:${code}`);
  receipt.stages.push({name,status:'executed',log:path.join(dir,name+'.log')});save();
 };
 const node=(name,script,args=[],gpu=false)=>run(name,process.execPath,[path.join(here,script),...args],gpu);
 const adopt=(name,file)=>{receipt.stages.push({name,status:'verified-existing',path:file,sha256:hash(file)});save();};
 const verifyEval=(file,requests,model,adapter)=>{
  const value=read(file),input=read(requests);if(!value.complete||value.results.length!==input.length||value.metadata.modelPath!==model||value.metadata.adapter!==adapter||value.metadata.thinking!==false)throw Error('EVALUATION_IDENTITY:'+file);
  for(let i=0;i<input.length;i++)if(value.results[i].id!==input[i].id||value.results[i].requestDigest!==digest(input[i].messages)||value.results[i].seed!==policy.seed+i)throw Error('EVALUATION_REQUEST:'+file);
 };
 const evaluate=async(name,requests,output,model,adapter=null,evalPolicy=policyPath)=>{
  if(!fs.existsSync(output)){
   if(!c.allowNewGpuDiagnostics)throw Error('MISSING_GPU_RESULT:'+name);
   await node(name,'evaluate-extra.mjs',['--root',c.root,'--python',c.python,'--model',model,'--data',requests,'--output',output,'--policy',evalPolicy,'--runtime-root',c.runtimeRoot,...(adapter?['--adapter',adapter]:[])],true);
  }
  verifyEval(output,requests,model,adapter);adopt(name+'-receipt',output);
 };
 try{
  save();
  if(c.mode==='run')await node('core-experiment','cli.mjs',['run','--root',c.root,'--python',c.python,'--model-receipt',c.modelReceipt,'--runtime-root',c.runtimeRoot],true);
  else if(read(path.join(c.root,'state.json')).status!=='pipeline-complete-unqualified')throw Error('NO_COMPLETED_EXPERIMENT');
  verifyDatasetExports(c.root);await node('audit','audit.mjs',[c.root]);
  const metrics=path.join(c.root,'diagnostics/metrics.json');
  if(fs.existsSync(metrics)){if(read(metrics).originalComparisonDigest!==digest(read(path.join(c.root,'comparison.json'))))throw Error('DIAGNOSTIC_DRIFT');adopt('diagnostics',metrics);}
  else await node('diagnostics','diagnostics.mjs',[c.root]);
  const behavior=path.join(c.behaviorOutput,'results.json');
  if(!fs.existsSync(behavior))await run('behavior',process.execPath,['--import',path.join(repo,'node_modules/tsx/dist/loader.mjs'),path.join(here,'behavior.ts'),c.root,c.behaviorOutput]);
  const b=read(behavior);if(b.status!=='pass'||!b.mutation?.detected||b.sourceHash!==hash(path.join(here,'behavior.ts')))throw Error('BEHAVIOR_INCOMPLETE_OR_STALE');adopt('behavior',behavior);
  const pkg=read(path.join(c.root,'package-manifest.json'));if(pkg.qualified!==false)throw Error('UNEXPECTED_PROMOTION');
  if(c.deployDestination){
   const deployment=path.join(c.root,'deployment-roundtrip.json');
   if(!fs.existsSync(deployment)){
    if(!c.allowNewGpuDiagnostics)throw Error('MISSING_GPU_RESULT:deployment');
    await run('deployment',c.python,[path.join(here,'deploy.py'),'--manifest',path.join(c.root,'package-manifest.json'),'--policy',policyPath,'--dev-requests',path.join(c.root,'dev-requests.json'),'--destination',c.deployDestination,'--report',deployment,'--lease-dir',c.runtimeRoot],true);
   }
   const d=read(deployment);if(d.status!=='roundtrip-pass'||d.adapter!==pkg.adapter||d.baseRevision!==pkg.base.revision||d.quantizedPath!==path.join(c.deployDestination,'mlx-4bit'))throw Error('DEPLOYMENT_IDENTITY');
   for(const f of d.files){guard();if(!f.path.startsWith(c.deployDestination+path.sep)||hash(f.path)!==f.sha256)throw Error('DEPLOYMENT_FILE_DRIFT');}adopt('deployment',deployment);
   await evaluate('quantized-dev',path.join(c.root,'dev-requests.json'),path.join(c.root,'quantized-dev.json'),d.quantizedPath);
  }
  if(c.knownCorpusRoot){
   const reg=path.join(c.root,'known-corpus-regression'),requests=path.join(reg,'requests.json');
   if(!fs.existsSync(requests))await node('regression-prepare','regression.mjs',['prepare',c.knownCorpusRoot,c.root]);
   const regPolicy=path.join(reg,'policy.json');
   await evaluate('regression-A',requests,path.join(reg,'A.json'),pkg.base.path,null,regPolicy);
   await evaluate('regression-B',requests,path.join(reg,'B.json'),pkg.base.path,pkg.adapter,regPolicy);
   await node('regression-score','regression.mjs',['score',c.knownCorpusRoot,c.root]);
  }
  await node('audit-final','audit.mjs',[c.root]);await node('final-report','finish-report.mjs',[c.root]);
  receipt.status='completed-research-unqualified';receipt.endedAt=new Date().toISOString();save();
 }catch(e){receipt.status='incomplete';receipt.error=String(e);receipt.endedAt=new Date().toISOString();save();process.exitCode=2;}
 finally{clearInterval(timer);clearTimeout(killer);process.off('SIGINT',onSignal);process.off('SIGTERM',onSignal);if(fs.existsSync(lock)&&read(lock).pid===process.pid)fs.unlinkSync(lock);}
 console.log(JSON.stringify({status:receipt.status,receipt:path.join(dir,'receipt.json'),error:receipt.error??null}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
