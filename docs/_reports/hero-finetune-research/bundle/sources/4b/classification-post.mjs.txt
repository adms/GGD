/** Fixed 4-bit Mac research export and paired precision check; never activates anything. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {summarizeClassification} from './classification-score.mjs';import {buildRequest,validateRecommendation} from './classification-client.mjs';
const [root,python,baseReceipt,runtime]=process.argv.slice(2);if(![root,python,baseReceipt,runtime].every(p=>p&&path.isAbsolute(p)))throw Error('ABSOLUTE_ARGS_REQUIRED');
const dir=path.dirname(fileURLToPath(import.meta.url)),read=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const put=(n,v)=>fs.writeFileSync(path.join(root,n),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
if(read('run-state.json').status!=='complete-research-only')throw Error('TRAINING_NOT_COMPLETE');if(fs.existsSync(path.join(root,'post-state.json')))throw Error('REFUSE_OVERWRITE');
const policy=read('experiment-policy.json'),comparison=read('comparison.json'),selection=read('selection.json'),cases=read('cases.private.json');
const cutoff=Date.parse(policy.deadline)-policy.reportReserveSeconds*1000;
const base=JSON.parse(fs.readFileSync(baseReceipt,'utf8')).base;
const adapter=path.join(root,'selected-adapter');if(hash(path.join(adapter,'adapters.safetensors'))!==selection.adapterSha256)throw Error('SELECTION_HASH');
put('export-manifest.json',{base,adapter,adapterArtifacts:['adapters.safetensors','adapter_config.json'].map(n=>({path:path.join(adapter,n),sha256:hash(path.join(adapter,n))})),releaseQualified:false});
let child;const lock=path.join(runtime,'gpu.lock');
async function run(stage,args,ownsLock=false){
 if(Date.now()>=cutoff||fs.existsSync(path.join(root,'CANCEL')))throw Error('CANCELLED_OR_DEADLINE');
 if(ownsLock)fs.writeFileSync(lock,JSON.stringify({pid:process.pid,root,kind:'classification-post'}),{flag:'wx'});
 const log=fs.openSync(path.join(root,stage+'.log'),'wx');child=spawn(python,args,{stdio:['ignore',log,log],detached:true});fs.closeSync(log);
 let killed=false;const kill=()=>{if(killed)return;killed=true;try{process.kill(-child.pid,'SIGTERM');}catch{}};
 const monitor=setInterval(()=>{if(Date.now()>=cutoff||fs.existsSync(path.join(root,'CANCEL')))kill();},1000);
 const handle=()=>kill();process.once('SIGTERM',handle);process.once('SIGINT',handle);
 try{const code=await new Promise((ok,bad)=>{child.once('error',bad);child.once('exit',ok);});if(code!==0||killed)throw Error('STAGE_FAILED:'+stage+':'+code);}finally{clearInterval(monitor);process.removeListener('SIGTERM',handle);process.removeListener('SIGINT',handle);if(ownsLock&&fs.existsSync(lock)&&JSON.parse(fs.readFileSync(lock,'utf8')).pid===process.pid)fs.unlinkSync(lock);}
 console.log(JSON.stringify({stage,status:'complete'}));
}
try{
 put('post-state.json',{status:'running',startedAt:new Date().toISOString(),pid:process.pid,qualityDisposition:comparison.disposition});
 const destination=path.join(runtime,path.basename(root)+'-export');
 await run('deploy',[path.join(dir,'deploy.py'),'--manifest',path.join(root,'export-manifest.json'),'--policy',path.join(root,'experiment-policy.json'),'--dev-requests',path.join(root,'dev-requests.json'),'--destination',destination,'--report',path.join(root,'mac-deployment.json'),'--lease-dir',runtime]);
 const q=read('mac-deployment.json').quantizedPath;
 for(const split of ['dev','test']){
  await run('quantized-'+split,[path.join(dir,'worker.py'),'eval','--model',q,'--policy',path.join(root,'experiment-policy.json'),'--data',path.join(root,split+'-requests.json'),'--output',path.join(root,'quantized-'+split+'.json')],true);
  put('quantized-'+split+'-score.json',summarizeClassification(cases.filter(c=>c.split===split),read('quantized-'+split+'.json')));
 }
 // Public client, not preconstructed benchmark candidates: retrieval is part of this check.
 const probes=[['ki-cannon','vfx','發出一個氣功砲，請建議套用特效模板，其他參數我自己調。',['fx.prim.ki.beam']],['ice-wave','vfx','我想要寒冰的向外滾動衝擊波外觀，不是光束。',['fx.prim.ice.shockwave']],['attack-event','mechanism','我打中對手才額外加傷，不是被打才發動。',['tpl-on-attack']],['taken-event','mechanism','對手打傷我後反擊他本人，不影響周圍。',['tpl-on-hit-react']],['no-random-approx','mechanism','每發砲彈要獨立隨機落點並重新判定，只命中爆點旁的人；不允許近似。',[]],['no-vfx-damage','vfx','只套粒子模板就必須真的扣敵人生命，不接傷害機制，能直接做嗎？',[]]];
 const catalog=read('catalog.json');const requests=probes.map(([id,task,request])=>buildRequest(catalog,{id,task,request}));put('interactive-requests.private.json',requests);put('interactive-eval-requests.json',requests.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));
 await run('interactive',[path.join(dir,'worker.py'),'eval','--model',q,'--policy',path.join(root,'experiment-policy.json'),'--data',path.join(root,'interactive-eval-requests.json'),'--output',path.join(root,'interactive-result.json')],true);
 const interactive=read('interactive-result.json'),results=interactive.results;if(!interactive.complete||results.length!==requests.length||requests.some((r,i)=>r.id!==results[i].id||r.requestDigest!==results[i].requestDigest))throw Error('INTERACTIVE_RESULT_MISMATCH');
 const checked=requests.map((r,i)=>{const v=results[i].value,ids=r.task==='vfx'?v?.suggestedTemplateIds:v?.templateId?[v.templateId]:[];const expected=probes[i][3];return{id:r.id,request:r.sourceRequest,value:v,contract:validateRecommendation(r,v),semanticPass:JSON.stringify(ids)===JSON.stringify(expected)&&v?.decision===(expected.length?'accept':'refuse'),seconds:results[i].seconds};});put('interactive-checked.json',checked);
 put('standalone-request.json',requests[0]);
 await run('standalone',[path.join(dir,'classification-predict.py'),'--model',q,'--request',path.join(root,'standalone-request.json'),'--output',path.join(root,'standalone-result.json'),'--runtime-root',runtime,'--max-memory-gib','12']);
 const standalone=read('standalone-result.json');if(standalone.requestDigest!==requests[0].requestDigest)throw Error('STANDALONE_DIGEST_MISMATCH');
 const standaloneCheck={...validateRecommendation(requests[0],standalone.value),sameAsBatch:JSON.stringify(standalone.value)===JSON.stringify(results[0].value),peakMetalBytes:standalone.peakMetalBytes,memoryLimitGiB:standalone.memoryLimitGiB,seconds:standalone.seconds,loadSeconds:standalone.loadSeconds,mac16GB:'not-tested'};put('standalone-checked.json',standaloneCheck);
 const qscore=read('quantized-test-score.json');const precisionPairs={fixed:0,regressed:0};for(let i=0;i<qscore.rows.length;i++){if(comparison.B.rows[i].pass&&!qscore.rows[i].pass)precisionPairs.regressed++;if(!comparison.B.rows[i].pass&&qscore.rows[i].pass)precisionPairs.fixed++;}
 put('mac-quality-summary.json',{status:'research-only-not-activated',selectedEpoch:selection.epoch,bf16Score:comparison.B,quantizedScore:qscore,precisionPairs,interactive:checked,standalone:standaloneCheck,mac16GB:'not-tested',boundedResearchQualityGate:comparison.disposition==='research-candidate-only'&&precisionPairs.regressed===0&&qscore.schemaPassed===qscore.total&&qscore.decisionPassed===qscore.total&&qscore.unsafe===0&&checked.every(c=>c.contract.pass&&c.semanticPass)&&standaloneCheck.pass&&standaloneCheck.sameAsBatch,releaseQualified:false,scope:'Reviewed catalog and fixed corpus only; not full hero forging qualification.'});
 fs.writeFileSync(path.join(root,'post-state.json'),JSON.stringify({status:'complete-research-only',completedAt:new Date().toISOString(),quality:'mac-quality-summary.json'},null,2)+'\n');
}catch(e){fs.writeFileSync(path.join(root,'post-state.json'),JSON.stringify({status:'failed',error:String(e),at:new Date().toISOString()},null,2)+'\n');throw e;}
