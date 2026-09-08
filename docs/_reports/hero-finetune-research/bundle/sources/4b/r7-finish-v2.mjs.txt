/** Bounded one-shot evidence collection after the three real workers exit.
 * No model calls, training, restart, checkpoint reselection or activation.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {fileHash} from './precision-diagnostic.mjs';
import {collect,render} from './r7-final-report-v2.mjs';

const read=p=>JSON.parse(fs.readFileSync(p));
const self=fileURLToPath(import.meta.url);
const predecessors=[
 {file:'run-state.json',done:'complete-research-only',pending:['running']},
 {file:'post-v1/state.json',done:'complete-research-evidence',pending:['waiting-for-core','running']},
 {file:'manual-entry-v1/state.json',done:'complete-research-evidence',pending:['waiting-for-core-and-post','running']},
];

export function ready(states,live,gpuBusy){
 assert.equal(states.length,3);assert.equal(live.length,3);
 let waiting=gpuBusy;
 for(let i=0;i<3;i++){
  const s=states[i],p=predecessors[i];
  assert(Number.isSafeInteger(s.pid)&&s.pid>1,'INVALID_PARENT_PID');
  if(s.status===p.done){waiting||=live[i];continue;}
  assert(p.pending.includes(s.status),'PREDECESSOR_NOT_SUCCESSFUL:'+p.file+':'+s.status);
  assert(live[i],'PREDECESSOR_DIED_WITHOUT_COMPLETION:'+p.file);
  waiting=true;
 }
 return !waiting;
}
function alive(pid){
 assert(Number.isSafeInteger(pid)&&pid>1,'INVALID_PARENT_PID');
 try{process.kill(pid,0);return true;}catch(e){assert.equal(e.code,'ESRCH','PROCESS_STATE_UNCERTAIN');return false;}
}

async function main(root,runtime){
 assert(path.isAbsolute(root)&&path.isAbsolute(runtime));
 const out=path.join(root,'finish-v1'),finalOut=path.join(root,'final-evidence-v1');
 assert(!fs.existsSync(out)&&!fs.existsSync(finalOut),'REFUSE_RESTART_OR_OVERWRITE');
 const policyPath=path.join(root,'experiment-policy.json'),policy=read(policyPath),manifest=read(path.join(root,'dataset-manifest.json'));
 const deadline=Date.parse(policy.deadline);assert(Number.isFinite(deadline)&&Date.now()<deadline,'REPORT_DEADLINE');
 const initial=predecessors.map(p=>read(path.join(root,p.file)));
 ready(initial,initial.map(s=>alive(s.pid)),fs.existsSync(path.join(runtime,'gpu.lock')));
 const pinPaths=[self,path.join(path.dirname(self),'r7-final-report-v2.mjs'),policyPath,path.join(root,'dataset-manifest.json')];
 const pins=pinPaths.map(p=>({path:p,sha256:fileHash(p)}));
 fs.mkdirSync(out);
 const put=(name,value)=>{const p=path.join(out,name);fs.writeFileSync(p+'.tmp',JSON.stringify(value,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
 const state={status:'waiting-for-core-post-entry',pid:process.pid,startedAt:new Date().toISOString(),predecessors:initial.map((s,i)=>({file:predecessors[i].file,pid:s.pid})),gpuCalls:0};
 put('preparation.json',{preparedAt:state.startedAt,deadline:policy.deadline,pins,predecessors:state.predecessors,trainingAllowed:false,selectionAllowed:false,activation:false});
 put('state.json',state);
 let stop=null;const onSignal=()=>{stop??='SIGNAL';};process.on('SIGTERM',onSignal);process.on('SIGINT',onSignal);
 function guard(){
  assert(!stop,stop);assert(Date.now()<deadline,'REPORT_DEADLINE');
  for(const p of [root,out,manifest.extension])assert(!fs.existsSync(path.join(p,'CANCEL')),'CANCEL');
  for(const p of pins)assert.equal(fileHash(p.path),p.sha256,'PIN_CHANGED:'+p.path);
 }
 try{
  while(true){
   guard();const states=predecessors.map(p=>read(path.join(root,p.file)));
   for(let i=0;i<3;i++)assert.equal(states[i].pid,initial[i].pid,'PREDECESSOR_PID_CHANGED');
   if(ready(states,states.map(s=>alive(s.pid)),fs.existsSync(path.join(runtime,'gpu.lock'))))break;
   await new Promise(resolve=>setTimeout(resolve,10000));
  }
  guard();state.status='collecting-read-only-evidence';put('state.json',state);
  const result=collect(root);guard();assert(!fs.existsSync(finalOut),'REFUSE_OVERWRITE');
  fs.mkdirSync(finalOut);
  fs.writeFileSync(path.join(finalOut,'summary.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  fs.writeFileSync(path.join(finalOut,'REPORT.md'),render(result),{flag:'wx'});
  put('result-receipt.json',{collectedAt:result.collectedAt,selectedStep:result.selectedStep,newAdapterSelected:result.newAdapterSelected,allMeasuredHighPriorityGatesPass:result.allMeasuredHighPriorityGatesPass,releaseQualified:false,files:['summary.json','REPORT.md'].map(n=>({path:path.join(finalOut,n),sha256:fileHash(path.join(finalOut,n))}))});
  state.status='complete-research-evidence';state.completedAt=new Date().toISOString();state.result=finalOut;put('state.json',state);
  console.log(JSON.stringify({status:state.status,selectedStep:result.selectedStep,newAdapterSelected:result.newAdapterSelected,gates:result.measuredGates,releaseQualified:false}));
 }catch(e){state.status='failed';state.error=String(e);put('state.json',state);console.error(e);process.exitCode=1;}
 finally{process.off('SIGTERM',onSignal);process.off('SIGINT',onSignal);}
}

if(process.argv[1]&&path.resolve(process.argv[1])===self)await main(...process.argv.slice(2));
