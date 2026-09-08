/** Small real-CLI integration check, not a new benchmark or checkpoint selector. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';import {digest} from './dataset.mjs';import {buildCurrentRequest,validateCurrentResult} from './current-template-client.mjs';import {buildRequest,validateRecommendation} from './classification-client.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url)),read=p=>JSON.parse(fs.readFileSync(p)),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const [mode,root,python,runtime]=process.argv.slice(2);assert(['prepare','run'].includes(mode));assert(path.isAbsolute(root));
const out=path.join(root,'manual-entry-check-v1'),m=read(path.join(root,'dataset-manifest.json')),r3=m.parent;
const reviewFile=path.join(r3,'main-catalog-review-v4.json'),review=read(reviewFile),reviewHash=digest(review),catalogFile=path.resolve(r3,'../forge-classification-reviewed-r2-20260906/catalog.json');
const write=(n,x)=>fs.writeFileSync(path.join(out,n),JSON.stringify(x,null,2)+'\n',{flag:'wx'});
if(mode==='prepare'){
 assert(!fs.existsSync(out),'REFUSE_OVERWRITE');assert.equal(reviewHash,m.mainReviewSha256);fs.mkdirSync(out);
 const examples=[
  ['manual-retaliation','我挨了一次傷害之後，當下只對打我的那個敵人回擊一次。不要反傷旁邊其他人，也不取消已承受的傷害。',{decision:'accept',templateId:'tpl-on-hit-react'}],
  ['manual-wave','傷害波依節拍分段朝前推進，各段重算敵人，整串同一人只受傷一次。抵達最後落點後還要另結算一次範圍爆炸。',{decision:'accept',templateId:'tpl-traveling-wave'}],
  ['manual-clone','我要一具會自己攻擊、擁有生命且可選取的施法者分身。只能用目前可推薦的單張卡，不能修改遊戲程式。',{decision:'refuse',templateId:null}],
 ];
 const rows=examples.map(([id,request,expected])=>({id,task:'mechanism',request:buildCurrentRequest(review,{id,request},reviewHash),expected}));
 rows.push({id:'manual-ki-vfx',task:'vfx',request:buildRequest(read(catalogFile),{id:'manual-ki-vfx',task:'vfx',request:'發出一道氣功砲，特效只建議套用現有模板，其他參數我自己調整。'}),expected:{decision:'accept',suggestedTemplateIds:['fx.prim.ki.beam'],reasonCode:'matching-template'}});
 for(const r of rows)write(r.id+'-request.json',r.request);
 write('cases.private.json',rows.map(({request,...r})=>({...r,requestDigest:request.requestDigest})));
 const files=[fileURLToPath(import.meta.url),reviewFile,catalogFile,path.join(root,'experiment-policy.json'),...['current-template-client.mjs','classification-client.mjs','classification-predict.py','dataset.mjs'].map(n=>path.join(dir,n)),...rows.map(r=>path.join(out,r.id+'-request.json')),path.join(out,'cases.private.json')];
 write('preparation.json',{preparedAt:new Date().toISOString(),reviewHash,pins:files.map(p=>({path:p,sha256:hash(p)})),rows:rows.length,trainingAllowed:false,selectionAllowed:false,releaseQualified:false,scope:'Four representative manual-entry integration examples. Known semantic patterns; not independent generalization or full scope proof.'});
 console.log(JSON.stringify({mode,out,rows:rows.length,gpuStarted:false}));
}else{
 assert(python&&runtime&&path.isAbsolute(python)&&path.isAbsolute(runtime));
 assert.equal(read(path.join(root,'run-state.json')).status,'complete-research-only','CORE_NOT_COMPLETE');assert.equal(read(path.join(root,'post-diagnostics-v1/state.json')).status,'complete-research-evidence','POST_NOT_COMPLETE');
 assert(!fs.existsSync(path.join(out,'run-state.json')),'REFUSE_RESTART');assert(!fs.existsSync(path.join(runtime,'gpu.lock')),'GPU_BUSY');
 const prep=read(path.join(out,'preparation.json')),policy=read(path.join(root,'experiment-policy.json')),cutoff=Date.parse(policy.deadline)-policy.reportReserveSeconds*1000,selected=read(path.join(root,'native-reference.json'));
 for(const k of ['cloudGpu','cloudFallback','externalTeacher','publish','activateInEditor','thinking'])assert.equal(policy[k],false);assert.equal(policy.cloudGpuSpendLimit,0);
 assert.equal(hash(path.join(selected.adapter,'adapters.safetensors')),selected.adapterSha256);assert(Date.now()<cutoff-120000,'INSUFFICIENT_RESERVE');
 const state={status:'running',pid:process.pid,startedAt:new Date().toISOString(),selected,results:[]};const put=()=>{const p=path.join(out,'run-state.json');fs.writeFileSync(p+'.tmp',JSON.stringify(state,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
 let child=null,reason=null,killTimer;function stop(why){if(reason)return;reason=why;if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},3000);}}
 function guard(){assert(!reason,reason);assert(Date.now()<cutoff,'DEADLINE');assert(!fs.existsSync(path.join(root,'CANCEL'))&&!fs.existsSync(path.join(out,'CANCEL')),'CANCEL');for(const p of prep.pins)assert.equal(hash(p.path),p.sha256,'PIN_CHANGED:'+p.path);}
 process.on('SIGTERM',()=>stop('SIGNAL'));process.on('SIGINT',()=>stop('SIGNAL'));put();
 try{
  for(const c of read(path.join(out,'cases.private.json'))){
   guard();const requestFile=path.join(out,c.id+'-request.json'),output=path.join(out,c.id+'-raw.json'),request=read(requestFile);assert.equal(request.requestDigest,c.requestDigest);
   const log=fs.openSync(path.join(out,c.id+'.log'),'wx');child=spawn(python,[path.join(dir,'classification-predict.py'),'--model',selected.base,'--adapter',selected.adapter,'--request',requestFile,'--output',output,'--runtime-root',runtime,'--max-memory-gib','12'],{stdio:['ignore',log,log],detached:true});fs.closeSync(log);
   const timer=setInterval(()=>{try{guard();}catch(e){stop(String(e));}},1000);let code;
   try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});}finally{clearInterval(timer);clearTimeout(killTimer);child=null;}
   assert(!reason&&code===0,reason??'CHILD_EXIT:'+code);guard();const raw=read(output);assert.equal(raw.model,selected.base);assert.equal(raw.adapter,selected.adapter);assert.equal(raw.memoryLimitGiB,12);assert.equal(raw.requestDigest,c.requestDigest);assert.equal(raw.inputIntegrityVerified,true);
   const checked=c.task==='mechanism'?validateCurrentResult(review,request,raw,prep.reviewHash):validateRecommendation(request,raw.value);write(c.id+'-checked.json',checked);
   const semanticMatch=isDeepStrictEqual(raw.value,c.expected);state.results.push({id:c.id,contractPass:checked.pass,semanticMatch,expected:c.expected,value:raw.value,seconds:raw.seconds,loadSeconds:raw.loadSeconds,peakMetalBytes:raw.peakMetalBytes,error:raw.error});put();
  }
  state.status='complete-research-evidence';state.completedAt=new Date().toISOString();put();write('summary.json',{...state,allRepresentativeExamplesPass:state.results.every(r=>r.contractPass&&r.semanticMatch&&!r.error),releaseQualified:false,activation:false,scope:prep.scope});console.log(JSON.stringify({status:state.status,results:state.results}));
 }catch(e){state.status='failed';state.error=String(e);put();console.error(e);process.exitCode=1;}
 finally{clearTimeout(killTimer);}
}
