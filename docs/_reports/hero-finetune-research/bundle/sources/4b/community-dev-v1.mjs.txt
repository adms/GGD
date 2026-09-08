/** One-shot prospective dev evaluation after R7 exits. No train/test/selection calls. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import{spawn}from'node:child_process';import{fileURLToPath}from'node:url';
import{fileHash}from'./precision-diagnostic.mjs';import{compare,render}from'./r6-score.mjs';
const self=fileURLToPath(import.meta.url),dir=path.dirname(self),read=p=>JSON.parse(fs.readFileSync(p));
const stages=[['run-state.json','complete-research-only',['running']],['post-v1/state.json','complete-research-evidence',['waiting-for-core','running']],['manual-entry-v1/state.json','complete-research-evidence',['waiting-for-core-and-post','running']],['finish-v1/state.json','complete-research-evidence',['waiting-for-core-post-entry','collecting-read-only-evidence']]];
function alive(pid){assert(Number.isSafeInteger(pid)&&pid>1);try{process.kill(pid,0);return true;}catch(e){assert.equal(e.code,'ESRCH','PROCESS_STATE_UNCERTAIN');return false;}}
export function readiness(states,live,busy){assert.equal(states.length,4);let waiting=busy;for(const[i,s]of states.entries()){const[,done,pending]=stages[i];if(s.status===done)waiting||=live[i];else{assert(pending.includes(s.status),'PARENT_NOT_SUCCESSFUL:'+stages[i][0]+':'+s.status);assert(live[i],'PARENT_DIED');waiting=true;}}return !waiting;}
async function main(parent,community,python,runtime,out){
 assert([parent,community,python,runtime,out].every(path.isAbsolute));assert(!fs.existsSync(out),'REFUSE_RESTART');
 const admission=read(path.join(community,'ADMISSION.json'));assert(admission.allPromptsFit&&admission.sourceEntailmentOnly);const cases=read(path.join(community,'cases.private.json')).filter(c=>c.split==='dev');assert.equal(cases.length,21);
 const requestPath=path.join(community,'dev-requests.json');assert.deepEqual(read(requestPath),cases.map(({id,messages,requestDigest})=>({id,messages,requestDigest})));
 const initial=stages.map(([p])=>read(path.join(parent,p)));readiness(initial,initial.map(s=>alive(s.pid)),fs.existsSync(path.join(runtime,'gpu.lock')));
 const original=read(path.join(parent,'run-pins.json')),r3=read(path.join(parent,'dataset-manifest.json')).parent,control=read(path.join(r3,'native-reference.json')),extension=path.dirname(community),authorization=path.join(extension,'EXTENSION.md');assert(fs.existsSync(authorization));
 const policy={...read(path.join(parent,'experiment-policy.json')),deadline:'2026-09-06T20:36:10Z',reportReserveSeconds:1800};assert.equal(policy.presencePenalty,0);assert.equal(policy.thinking,false);
 // Earlier operational cutoff preserves time for a possible final training decision.
 const cutoff=Date.parse('2026-09-06T17:45:00Z');assert(Date.now()<cutoff,'DEV_START_DEADLINE');
 fs.mkdirSync(out);const put=(n,v)=>{const p=path.join(out,n);fs.writeFileSync(p+'.tmp',JSON.stringify(v,null,2)+'\n');fs.renameSync(p+'.tmp',p);};put('policy.json',policy);
 const pinPaths=[self,path.join(dir,'worker.py'),path.join(dir,'r6-score.mjs'),path.join(dir,'r3-score.mjs'),path.join(community,'ADMISSION.json'),path.join(community,'manifest.json'),path.join(community,'cases.private.json'),requestPath,path.join(community,'dev-token-budget.json'),path.join(parent,'run-pins.json'),path.join(r3,'native-reference.json'),path.join(control.adapter,'adapters.safetensors'),path.join(control.adapter,'adapter_config.json'),authorization,path.join(out,'policy.json')],pins=pinPaths.map(p=>({path:p,sha256:fileHash(p)}));
 put('preparation.json',{createdAt:new Date().toISOString(),pins,parent,community,predecessors:initial.map((s,i)=>({path:stages[i][0],pid:s.pid})),models:['base','r3','r7-selected'],devRows:21,testRows:0,trainingCalls:0,checkpointSelection:false,releaseQualified:false});
 const state={status:'waiting-for-r7-all-stages',pid:process.pid,startedAt:new Date().toISOString(),stages:[]};put('state.json',state);let child=null,reason=null,killTimer,owned=false;const lock=path.join(runtime,'gpu.lock');
 function stop(why){reason??=why;if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},3000);}}
 process.on('SIGTERM',()=>stop('SIGNAL'));process.on('SIGINT',()=>stop('SIGNAL'));
 function guard(){assert(!reason,reason);assert(Date.now()<cutoff,'COMMUNITY_DEV_CUTOFF');for(const r of[parent,extension,out])assert(!fs.existsSync(path.join(r,'CANCEL')),'CANCEL');for(const p of pins)assert.equal(fileHash(p.path),p.sha256,'PIN_CHANGED:'+p.path);}
 async function evaluate(name,adapter){
  guard();state.status='running';state.stage=name;put('state.json',state);const output=path.join(out,name+'.json'),args=[path.join(dir,'worker.py'),'eval','--model',original.base,'--policy',path.join(out,'policy.json'),'--data',requestPath,'--output',output];if(adapter)args.push('--adapter',adapter);
  const log=fs.openSync(path.join(out,name+'.log'),'wx');child=spawn(python,args,{stdio:['ignore',log,log],detached:true});fs.closeSync(log);put('worker-lease.json',{pid:child.pid,parent:process.pid,stage:name});
  const timer=setInterval(()=>{try{guard();}catch(e){stop(String(e));}},2000);let code;try{code=await new Promise((res,rej)=>{child.once('exit',res);child.once('error',rej);});}finally{clearInterval(timer);clearTimeout(killTimer);child=null;put('worker-lease.json',{pid:null,stage:name});}
  assert(!reason&&code===0,reason??'WORKER_EXIT:'+code);guard();const raw=read(output);assert.equal(raw.metadata.adapter,adapter??null);assert.equal(raw.metadata.modelPath,original.base);state.stages.push({name,completedAt:new Date().toISOString()});put('state.json',state);return raw;
 }
 try{
  while(true){guard();const now=stages.map(([p])=>read(path.join(parent,p)));for(let i=0;i<4;i++)assert.equal(now[i].pid,initial[i].pid,'PARENT_PID_CHANGED');if(readiness(now,now.map(s=>alive(s.pid)),fs.existsSync(lock)))break;await new Promise(r=>setTimeout(r,10000));}
  const selected=read(path.join(parent,'native-reference.json'));assert.equal(selected.base,original.base);assert.equal(fileHash(path.join(selected.adapter,'adapters.safetensors')),selected.adapterSha256);assert.equal(selected.decoding.presencePenalty,0);
  for(const p of[path.join(parent,'native-reference.json'),path.join(parent,'selection.json'),path.join(selected.adapter,'adapters.safetensors'),path.join(selected.adapter,'adapter_config.json')])pins.push({path:p,sha256:fileHash(p)});put('selected-pins.json',{selected,pins:pins.slice(pinPaths.length)});
  fs.writeFileSync(lock,JSON.stringify({pid:process.pid,kind:'community-dev-only',root:out}),{flag:'wx'});owned=true;
  const arms=[];for(const[name,adapter]of[['base',null],['r3',control.adapter],['r7-selected',selected.adapter]])arms.push({name,raw:await evaluate(name,adapter)});
  const report=compare(cases,arms);put('comparison.json',report);fs.writeFileSync(path.join(out,'REPORT.md'),'# 七角色新增開發集：李星21題\n\n只測dev，42題拉克絲／沃維克未送入神經模型。本次不是新一輪訓練或權重選擇。\n\n'+render(report),{flag:'wx'});
  state.status='complete-research-evidence';state.completedAt=new Date().toISOString();put('state.json',state);console.log(JSON.stringify({status:state.status,scores:Object.fromEntries(Object.entries(report.scores).map(([n,s])=>[n,{passed:s.passed,total:s.total,unsafe:s.unsafe,tasks:s.tasks}])),testRows:0,releaseQualified:false}));
 }catch(e){state.status='failed';state.error=String(e);put('state.json',state);console.error(e);process.exitCode=1;}
 finally{clearTimeout(killTimer);if(owned&&fs.existsSync(lock)&&read(lock).pid===process.pid)fs.unlinkSync(lock);put('worker-lease.json',{pid:null,endedAt:new Date().toISOString(),reason});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===self)await main(...process.argv.slice(2));
