import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {digest,prepare,writeJSON} from './dataset.mjs';
import {score,scorerChecks} from './scorer.mjs';
import {pinDatasetExports} from './input-integrity.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
// Buffers must be hashed as bytes, not as their JSON representation.
import crypto from 'node:crypto';
const hash=p=>{const h=crypto.createHash('sha256'),fd=fs.openSync(p,'r'),b=Buffer.alloc(8*1024*1024);try{let n;while((n=fs.readSync(fd,b,0,b.length,null))>0)h.update(b.subarray(0,n));return h.digest('hex');}finally{fs.closeSync(fd);}};
export function validatePolicy(p){
 const keys=['schema','startedAt','deadline','trainingCutoff','reportReserveSeconds','platform','compute','cloudGpu','cloudFallback','cloudGpuSpendLimit','externalTeacher','publish','activateInEditor','base','thinking','scope','primaryMetric','promisingImprovementPP','newCriticalAllowed','trainingRecipes','maximumGpuJobs','maxMemoryGiB','maxSequenceTokens','maxOutputTokens','seed','temperature','topP','topK','presencePenalty','dataQualification','releaseQualified','mac16GB'];
 if(Object.keys(p).some(k=>!keys.includes(k))||keys.some(k=>!(k in p)))throw Error('POLICY_FIELDS');
 if(p.schema!=='ggd-forge-experiment@1'||p.platform!=='darwin-arm64'||p.compute!=='local-mlx'||p.base!=='Qwen/Qwen3.5-4B')throw Error('POLICY_PLATFORM');
 for(const k of ['cloudGpu','cloudFallback','externalTeacher','publish','activateInEditor','thinking','releaseQualified'])if(p[k]!==false)throw Error('POLICY_FORBIDDEN:'+k);
 if(p.cloudGpuSpendLimit!==0||p.maximumGpuJobs!==1||p.trainingRecipes!==1||p.newCriticalAllowed!==0)throw Error('POLICY_BUDGET');
 const start=Date.parse(p.startedAt),end=Date.parse(p.deadline),cut=Date.parse(p.trainingCutoff);
 if(!Number.isFinite(start)||!Number.isFinite(end)||!Number.isFinite(cut)||end<=start||end-start>8*3600e3||cut>start+5*3600e3||cut<=start||p.reportReserveSeconds<3600)throw Error('POLICY_DEADLINE');
 for(const [k,min,max]of [['maxMemoryGiB',1,80],['maxSequenceTokens',256,4096],['maxOutputTokens',16,1024],['temperature',0,2],['topP',0,1],['topK',0,100],['presencePenalty',0,2],['promisingImprovementPP',1,100]])if(!Number.isFinite(p[k])||p[k]<min||p[k]>max)throw Error('POLICY_RANGE:'+k);
 if(!Number.isSafeInteger(p.seed)||p.maxOutputTokens>=p.maxSequenceTokens)throw Error('POLICY_TOKENS');
 return p;
}
function artifacts(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('ARTIFACT_SYMLINK');return e.isDirectory()?artifacts(p):[{path:p,bytes:fs.statSync(p).size,sha256:hash(p)}];});}
function scores(root,result){const cases=read(path.join(root,'cases.private.json'));return result.results.map(r=>({...r,score:score(cases.find(c=>c.id===r.id),r.value)}));}
function summarize(rows,cases){const eligible=rows.filter(r=>['proposed','degraded'].includes(cases.find(c=>c.id===r.id).spec.outcome));return{passed:rows.filter(r=>r.score.pass).length,total:rows.length,eligiblePassed:eligible.filter(r=>r.score.pass).length,eligibleTotal:eligible.length,critical:rows.filter(r=>r.score.critical).length,meanSeconds:rows.reduce((s,r)=>s+r.seconds,0)/rows.length};}

export async function main(argv=process.argv.slice(2)){
 const command=argv.shift();if(!['run','resume','status','cancel','report','plan'].includes(command))throw Error('COMMAND: run/resume/status/cancel/report/plan');
 const opts={};for(let i=0;i<argv.length;i+=2){if(!['--root','--python','--model-receipt','--runtime-root'].includes(argv[i])||!argv[i+1])throw Error('ARGUMENT');opts[argv[i].slice(2)]=path.resolve(argv[i+1]);}
 if(!opts.root||opts.root===path.parse(opts.root).root||opts.root===repo)throw Error('EXPLICIT_RUN_ROOT_REQUIRED');
 const root=opts.root,policyFile=path.join(root,'experiment-policy.json'),policy=validatePolicy(read(policyFile));
 const stateFile=path.join(root,'state.json');let state=fs.existsSync(stateFile)?read(stateFile):{schema:'ggd-forge-run@1',status:'pending',stages:{},startedAt:policy.startedAt};
 if(command==='status'){console.log(JSON.stringify(state,null,2));return;}
 if(command==='plan'){console.log(JSON.stringify({policy,stages:['preflight','doctor','baseline-dev','learning-sanity','sanity-reload','train','candidate-dev','freeze','test-A','test-B','engine-validation','package','report']},null,2));return;}
 if(command==='cancel'){writeJSON(path.join(root,'CANCEL'),{requestedAt:new Date().toISOString()});console.log('Cancellation requested; managed worker group will stop.');return;}
 const report=()=>{
  const comparison=fs.existsSync(path.join(root,'comparison.json'))?read(path.join(root,'comparison.json')):null;
  const lines=['# Mac 本機微調實驗報告','',`執行狀態：${state.status}。結論：${comparison?.verdict??'evidence-insufficient'}。`,`開始：${policy.startedAt}；截止：${policy.deadline}；更新：${new Date().toISOString()}。`,'','Qwen3.5-4B non-thinking；本機 MLX，沒有雲端 GPU／外部教師／Editor 啟用。',
   '', '## 資料與結論邊界','', '本輪資料為新編寫的 synthetic-research 診斷案例，沒有已核可的 Owner Gold。家族先切分再擴增，但仍共用一種語言模板與引擎模板。不能以此宣稱真實英雄需求泛化或正式發布合格。原先四組 benchmark 沒有作為訓練集或此次未見評測。',
   '', '## 階段', '', '| 階段 | 狀態 | 證據 |','| --- | --- | --- |',...Object.entries(state.stages).map(([k,v])=>`| ${k} | ${v.status} | ${v.output?`[artifact](${path.relative(root,v.output)})`:v.error??''} |`)];
  if(comparison)lines.push('','## A/B 合成診斷結果','','| 組別 | 全題通過 | 可完成題通過 | 重大錯誤 | 平均秒 |','| --- | ---: | ---: | ---: | ---: |',...['A','B'].map(k=>{const s=comparison[k];return`| ${k} | ${s.passed}/${s.total} | ${s.eligiblePassed}/${s.eligibleTotal} | ${s.critical} | ${s.meanSeconds.toFixed(2)} |`;}),'',`配對：${JSON.stringify(comparison.pairs)}；主指標提升 ${comparison.improvementPP.toFixed(2)} 個百分點。`,`這是合成診斷，不是先前 GGUF benchmark 的直接延續；本次 A/B 使用相同 BF16 MLX、相同請求／抽樣與無 grammar 的原始輸出。`,'','[逐案比較](comparison.json)');
  lines.push('','## 未驗證與操作','', '16GB MacBook 實機、視覺、美感、全英雄創意／平衡、完整 Editor 接入及跨平台發布均未驗證。現有 release manifests 保持不變。', '協調器使用原子 JSON 階段收據與 process-group lease；未實作 SQLite。可續跑完成階段，但非 optimizer/RNG 精確續訓。訓練中斷後以新 attempt 從乾淨底座重跑，保留舊 checkpoint。', '', `研究 adapter 與大型檔案放在設定的 runtime-root，不在 Dropbox；請依 package-manifest.json 備份，/private/tmp 不是永久儲存。`, '', '[資料清單](dataset-manifest.json) · [split 報告](split-report.json) · [scorer 守衛](scorer-checks.json) · [執行政策](experiment-policy.json)', '', '技術依據：[Qwen 官方模型卡](https://huggingface.co/Qwen/Qwen3.5-4B)、[MLX-LM LoRA](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/LORA.md)。實際版本與權重 hash 以本次收據為準。');
  fs.writeFileSync(path.join(root,'experiment-report.md'),lines.join('\n')+'\n');
 };
 if(command==='report'){report();return;}
 if(!opts.python||!opts['model-receipt']||!opts['runtime-root'])throw Error('RUN_PATHS_REQUIRED');
 // The CPU-only coordinator may run under Rosetta to reuse the checkout's
 // esbuild. worker.py independently requires native arm64 + real Metal.
 if(process.platform!=='darwin')throw Error('MAC_ONLY');
 const runtime=opts['runtime-root'];if(runtime===root||runtime===repo||runtime===os.homedir()||runtime==='/private/tmp'||runtime==='/')throw Error('UNSAFE_RUNTIME_ROOT');
 fs.mkdirSync(runtime,{recursive:true});fs.mkdirSync(path.join(root,'stages'),{recursive:true});
 const lock=path.join(runtime,'gpu.lock');let child=null,cancelled=false,lockOwned=false;
 const save=()=>{state.updatedAt=new Date().toISOString();writeJSON(stateFile,state);};
 const terminate=()=>{if(child){try{process.kill(-child.pid,'SIGTERM');}catch{}setTimeout(()=>{if(child){try{process.kill(-child.pid,'SIGKILL');}catch{}}},3000).unref();}};
 const cancel=()=>{cancelled=true;terminate();};
 for(const sig of ['SIGINT','SIGTERM'])process.on(sig,cancel);
 const sourceFiles=['cli.mjs','dataset.mjs','scorer.mjs','engine.ts','worker.py','input-integrity.mjs'].map(n=>({path:path.join(here,n),sha256:hash(path.join(here,n))}));
 const sourceDigest=digest(sourceFiles),policyDigest=hash(policyFile);
 let verifyPinnedData=()=>{};
 const ensure=()=>{verifyPinnedData();if(cancelled||fs.existsSync(path.join(root,'CANCEL')))throw Error('CANCELLED');if(Date.now()>=Date.parse(policy.deadline)-policy.reportReserveSeconds*1000)throw Error('BUDGET_EXHAUSTED');if(hash(policyFile)!==policyDigest||sourceFiles.some(f=>hash(f.path)!==f.sha256))throw Error('INPUT_CHANGED_DURING_RUN');};
 const runChild=(exe,args,log,timeout)=>new Promise((resolve,reject)=>{
  ensure();const fd=fs.openSync(log,'a');child=spawn(exe,args,{cwd:repo,detached:true,stdio:['ignore',fd,fd],env:{...process.env,HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',HF_HUB_DISABLE_TELEMETRY:'1'}});fs.closeSync(fd);
  const owned=child;writeJSON(path.join(root,'worker-lease.json'),{pid:owned.pid,parentPid:process.pid,startedAt:new Date().toISOString(),executable:exe,log});
  let interrupted=null;
  const limit=Math.min(timeout,Date.parse(policy.deadline)-policy.reportReserveSeconds*1000-Date.now());
  const timer=setTimeout(()=>{interrupted='STAGE_TIMEOUT';terminate();},Math.max(1,limit));
  const poll=setInterval(()=>{try{ensure();}catch(e){interrupted=String(e);terminate();}},1000);
  const done=(error)=>{clearTimeout(timer);clearInterval(poll);child=null;writeJSON(path.join(root,'worker-lease.json'),{pid:null,endedAt:new Date().toISOString()});error?reject(error):resolve();};
  owned.on('error',done);owned.on('exit',(code,signal)=>done(interrupted||code!==0?Error(interrupted??`CHILD_EXIT:${code}:${signal}; ${log}`):null));
 });
 const stage=async(name,fn)=>{
  ensure();const old=state.stages[name];
  if(old?.status==='succeeded'){
   if(old.sourceDigest!==sourceDigest||old.policyDigest!==policyDigest||old.artifacts.some(a=>!fs.existsSync(a.path)||hash(a.path)!==a.sha256))throw Error('STALE_STAGE:'+name);
   return old.output;
  }
  const attempt=(old?.attempt??0)+1;const dir=path.join(root,'stages',name,`attempt-${attempt}`);fs.mkdirSync(dir,{recursive:true});
  state.stages[name]={status:'running',attempt,sourceDigest,policyDigest,startedAt:new Date().toISOString(),dir};save();console.log(JSON.stringify({stage:name,status:'running',attempt}));
  try{const output=await fn(dir,attempt);state.stages[name]={...state.stages[name],status:'succeeded',output,artifacts:artifacts(dir),endedAt:new Date().toISOString()};save();return output;}
  catch(e){state.stages[name]={...state.stages[name],status:'failed',error:String(e),endedAt:new Date().toISOString()};save();throw e;}
 };
 try{
  if(fs.existsSync(path.join(root,'dataset-manifest.json')))verifyPinnedData=pinDatasetExports(root);
  else if(Object.values(state.stages).some(s=>s.status==='succeeded'))throw Error('MISSING_CACHED_DATASET');
  if(fs.existsSync(lock)){
   const owner=read(lock);try{process.kill(owner.pid,0);throw Error('GPU_LEASE_BUSY:'+owner.pid);}catch(e){if(e.code!=='ESRCH')throw e;}
   const oldLease=path.join(owner.root,'worker-lease.json');
   // A crashed coordinator can leave its child alive. Do not start a second
   // worker or kill an uncertain PID merely because the parent disappeared.
   if(fs.existsSync(oldLease)&&read(oldLease).pid){const pid=read(oldLease).pid;try{process.kill(pid,0);throw Error('ORPHAN_WORKER_REQUIRES_REVIEW:'+pid);}catch(e){if(e.code!=='ESRCH')throw e;}}
   fs.unlinkSync(lock);
  }
  fs.writeFileSync(lock,JSON.stringify({pid:process.pid,root,startedAt:new Date().toISOString()}),{flag:'wx'});lockOwned=true;
  if(state.sourceDigest&&state.sourceDigest!==sourceDigest)throw Error('SOURCE_CHANGED_USE_NEW_RUN');
  state={...state,status:'running',sourceDigest,policyDigest,runtimeRoot:runtime};save();
  const receipt=read(opts['model-receipt']);
  if(receipt.repo!==policy.base||!(/^[a-f0-9]{40}$/.test(receipt.revision)))throw Error('MODEL_REVISION');
  for(const f of receipt.files)if(path.basename(f.name)!==f.name||hash(path.join(receipt.path,f.name))!==f.sha256)throw Error('MODEL_HASH_MISMATCH');
  const common=['--model',receipt.path,'--policy',policyFile];
  const worker=(cmd,data,output,extra=[])=>[path.join(here,'worker.py'),cmd,...common,'--data',data,'--output',output,...extra];
  const engine=(args,dir)=>runChild(process.execPath,['--import',path.join(repo,'node_modules/tsx/dist/loader.mjs'),path.join(here,'engine.ts'),...args],path.join(dir,'engine.log'),120000);
  await stage('preflight',async dir=>{
   fs.mkdirSync(path.join(dir,'source'),{recursive:true});for(const f of sourceFiles)fs.copyFileSync(f.path,path.join(dir,'source',path.basename(f.path)));
   if(!fs.existsSync(path.join(root,'engine-snapshot.json')))await engine(['snapshot',path.join(root,'engine-snapshot.json')],dir);
   const snap=read(path.join(root,'engine-snapshot.json'));
   for(const f of snap.files)if(hash(path.join(repo,f.path))!==f.sha256)throw Error('ENGINE_DRIFT');
   if(!fs.existsSync(path.join(root,'dataset-manifest.json')))prepare(root,snap);
   const cases=read(path.join(root,'cases.private.json')),manifest=read(path.join(root,'dataset-manifest.json'));
   if(digest(cases)!==manifest.casesDigest||manifest.sourceDigest!==digest(fs.readFileSync(path.join(here,'dataset.mjs'),'utf8')))throw Error('DATASET_DRIFT');
   const checks=scorerChecks(cases);writeJSON(path.join(root,'scorer-checks.json'),checks);if(checks.status!=='pass')throw Error('SCORER_FAILED');
   await engine(['validate',path.join(root,'cases.private.json'),path.join(dir,'targets-engine.json')],dir);
   if(read(path.join(dir,'targets-engine.json')).status!=='pass')throw Error('TARGET_ENGINE_FAILED');
   const output=path.join(dir,'result.json');writeJSON(output,{status:'pass',model:receipt,sourceFiles,policyDigest,dataset:manifest,qualification:'synthetic-diagnostic-only'});return output;
  });
  verifyPinnedData=pinDatasetExports(root);
  const data=path.join(root,'train.jsonl');
  const doctor=await stage('doctor',async dir=>{const out=path.join(dir,'result.json');await runChild(opts.python,worker('doctor',data,out),path.join(dir,'worker.log'),300000);return out;});
  const evaluate=async(name,split,adapter)=>stage(name,async dir=>{const out=path.join(dir,'result.json');await runChild(opts.python,worker('eval',path.join(root,`${split}-requests.json`),out,adapter?['--adapter',adapter]:[]),path.join(dir,'worker.log'),3600000);return out;});
  const baseDev=await evaluate('baseline-dev','dev',null);
  const train=async(kind)=>stage(kind==='sanity'?'learning-sanity':'train',async(dir,attempt)=>{const out=path.join(runtime,`${path.basename(root)}-${sourceDigest.slice(0,12)}-${kind}-${attempt}`);await runChild(opts.python,worker('train',data,out,['--kind',kind]),path.join(dir,'worker.log'),kind==='sanity'?1800000:7200000);const result=read(path.join(out,'training-run.json'));writeJSON(path.join(dir,'result.json'),{...result,adapterPath:out,externalArtifacts:artifacts(out)});return path.join(dir,'result.json');});
  const sanity=read(await train('sanity'));
  if(!(sanity.afterProbeLoss<sanity.beforeProbeLoss))throw Error('SANITY_NO_LOSS_GAIN');
  await stage('sanity-reload',async dir=>{const requests=read(path.join(root,'train-requests.json')).slice(0,2),input=path.join(dir,'requests.json'),out=path.join(dir,'result.json');writeJSON(input,requests);await runChild(opts.python,worker('eval',input,out,['--adapter',sanity.adapterPath]),path.join(dir,'worker.log'),300000);return out;});
  const trained=read(await train('formal'));
  const devCandidates=[];
  for(let epoch=1;epoch<=3;epoch++){
   const adapter=path.join(trained.adapterPath,`epoch-${epoch}`),result=await evaluate(`candidate-dev-${epoch}`,'dev',adapter);
   devCandidates.push({epoch,adapter,result,stats:summarize(scores(root,read(result)),read(path.join(root,'cases.private.json')))});
  }
  devCandidates.sort((a,b)=>a.stats.critical-b.stats.critical||b.stats.eligiblePassed-a.stats.eligiblePassed||b.stats.passed-a.stats.passed||a.epoch-b.epoch);
  const candidate=devCandidates[0];
  const freezePath=await stage('freeze',async dir=>{const out=path.join(dir,'result.json');writeJSON(out,{candidate,devCandidates,adapterArtifacts:artifacts(candidate.adapter),requestHash:hash(path.join(root,'test-requests.json')),casesHash:hash(path.join(root,'cases.private.json')),sourceDigest,policyDigest,baseRevision:receipt.revision,engineDigest:read(path.join(root,'engine-snapshot.json')).digest,frozenAt:new Date().toISOString()});return out;});
  const frozen=read(freezePath);if(frozen.requestHash!==hash(path.join(root,'test-requests.json'))||frozen.casesHash!==hash(path.join(root,'cases.private.json'))||frozen.adapterArtifacts.some(a=>hash(a.path)!==a.sha256))throw Error('FREEZE_DRIFT');
  const A=await evaluate('test-A','test',null),B=await evaluate('test-B','test',frozen.candidate.adapter);
  const ar=scores(root,read(A)),br=scores(root,read(B)),cases=read(path.join(root,'cases.private.json'));
  if(!read(A).complete||!read(B).complete||ar.length!==cases.filter(c=>c.split==='test').length||ar.length!==br.length)throw Error('INCOMPLETE_COMPARISON');
  await stage('engine-validation',async dir=>{const valid=[...ar.map(r=>({...r,id:'A:'+r.id})),...br.map(r=>({...r,id:'B:'+r.id}))].filter(r=>r.score.pass);const input=path.join(dir,'input.json'),out=path.join(dir,'result.json');writeJSON(input,valid);await engine(['validate',input,out],dir);if(read(out).status!=='pass')throw Error('CANDIDATE_ENGINE_FAILED');return out;});
  const pairs={bothCorrect:0,fixedByFinetune:0,regressedByFinetune:0,bothWrong:0};let fixed=0,regressed=0,newCritical=0;
  const rows=ar.map((a,i)=>{const b=br[i];if(a.id!==b.id||a.requestDigest!==b.requestDigest||a.seed!==b.seed)throw Error('PAIR_MISMATCH');const key=a.score.pass?(b.score.pass?'bothCorrect':'regressedByFinetune'):(b.score.pass?'fixedByFinetune':'bothWrong');pairs[key]++;if(['proposed','degraded'].includes(cases.find(c=>c.id===a.id).spec.outcome)){if(key==='fixedByFinetune')fixed++;if(key==='regressedByFinetune')regressed++;}if(!a.score.critical&&b.score.critical)newCritical++;return{id:a.id,A:a,B:b,pair:key};});
  const astats=summarize(ar,cases),bstats=summarize(br,cases),pp=100*(fixed-regressed)/astats.eligibleTotal;
  writeJSON(path.join(root,'comparison.json'),{verdict:'evidence-insufficient',reason:'No independent human-confirmed source families; synthetic diagnostic only.',diagnosticSignal:newCritical?'regressed':pp>=policy.promisingImprovementPP?'positive-synthetic-signal':'no-clear-gain',A:astats,B:bstats,pairs,eligibleFixed:fixed,eligibleRegressed:regressed,newCritical,improvementPP:pp,candidate:frozen.candidate,rows});
  await stage('package',async dir=>{const out=path.join(dir,'result.json');const value={schema:'ggd-forge-research-package@1',qualified:false,base:receipt,adapter:frozen.candidate.adapter,adapterArtifacts:frozen.adapterArtifacts,policyDigest,sourceDigest,datasetDigest:read(path.join(root,'dataset-manifest.json')).casesDigest,scope:policy.scope,limitations:['synthetic diagnostic only','not production hero proposal schema; bounded adapter maps to existing Q slot','no visual verification'],mac16GB:'not-tested',fused:'not-tested',quantized:'not-tested',editor:'not-integrated',resume:'stage-resume; no exact training resume'};writeJSON(out,value);writeJSON(path.join(root,'package-manifest.json'),value);writeJSON(path.join(root,'mac-deployment-report.json'),{status:'adapter-reloaded-on-M5-Max',doctor:read(doctor),candidate:read(candidate.result).metadata,mac16GB:'not-tested',fused:'not-tested',quantized:'not-tested'});return out;});
  state.status='pipeline-complete-unqualified';state.endedAt=new Date().toISOString();save();report();
  console.log(JSON.stringify({status:state.status,report:path.join(root,'experiment-report.md')}));
 }catch(e){state.status=String(e).includes('CANCEL')?'cancelled':String(e).includes('BUDGET')?'budget-exhausted':'incomplete';state.error=String(e);save();report();process.exitCode=2;throw e;}
 finally{terminate();if(lockOwned&&fs.existsSync(lock)&&read(lock).pid===process.pid)fs.unlinkSync(lock);for(const sig of ['SIGINT','SIGTERM'])process.off(sig,cancel);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(String(e));process.exitCode=2;});
