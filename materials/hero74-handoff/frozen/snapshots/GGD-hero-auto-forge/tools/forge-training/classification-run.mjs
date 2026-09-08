/** One local pipeline: pins -> doctor -> baseline -> clean training -> dev selection -> test. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {summarizeClassification} from './classification-score.mjs';
const [rootArg,python,model,runtimeArg]=process.argv.slice(2);if(![rootArg,python,model,runtimeArg].every(p=>p&&path.isAbsolute(p)))throw Error('ABSOLUTE_ARGUMENTS_REQUIRED');
const root=path.resolve(rootArg),runtime=path.resolve(runtimeArg),dir=path.dirname(fileURLToPath(import.meta.url));
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const put=(name,x)=>{const p=path.join(root,name);fs.writeFileSync(p+'.tmp',JSON.stringify(x,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
if(fs.existsSync(path.join(root,'run-state.json')))throw Error('REFUSE_RESTART_OR_OVERWRITE');
const policy=read(path.join(root,'experiment-policy.json'));if(policy.cloudGpu!==false||policy.externalTeacher!==false||policy.thinking!==false)throw Error('LOCAL_NONTHINKING_ONLY');
const cases=read(path.join(root,'cases.private.json'));const manifest=read(path.join(root,'dataset-manifest.json'));
const reviewed=manifest.schema==='ggd-forge-reviewed-curriculum@1';
if(reviewed){const r=read(path.join(root,'semantic-review.json'));if(r.status!=='approved-for-research-training'||r.casesSha256!==manifest.casesSha256||r.reviewedRows!==cases.length||r.ownerGold!==false)throw Error('SEMANTIC_REVIEW_REQUIRED');}
if(crypto.createHash('sha256').update(JSON.stringify(cases)).digest('hex')!==manifest.casesSha256)throw Error('DATASET_CHANGED');
const train=fs.readFileSync(path.join(root,'train.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
if(JSON.stringify(train)!==JSON.stringify(cases.filter(c=>c.split==='train').map(({id,messages,target})=>({id,messages,target}))))throw Error('TRAIN_EXPORT_CHANGED');
for(const split of ['dev','test'])if(JSON.stringify(read(path.join(root,split+'-requests.json')))!==JSON.stringify(cases.filter(c=>c.split===split).map(({id,messages,requestDigest})=>({id,messages,requestDigest}))))throw Error('EVAL_EXPORT_CHANGED');
const protectedFiles=['experiment-policy.json','cases.private.json','train.jsonl','dev-requests.json','test-requests.json','dataset-manifest.json',...(reviewed?['semantic-review.json','catalog.json']:[])].map(p=>({path:path.join(root,p),sha256:hash(path.join(root,p))}));
const sourceFiles=['worker.py','broad-data.ts','reviewed-curriculum.mjs','curate-data.mjs','classification-score.mjs','classification-run.mjs'].map(p=>({path:path.join(dir,p),sha256:hash(path.join(dir,p))}));
put('run-pins.json',{protectedFiles,sourceFiles,model,python,epochs:2,selection:'up to two full-corpus epochs within time reserve; dev assessed before sealed test',testUnseenUntilSelected:true});
const pinCheck=()=>{for(const f of [...protectedFiles,...sourceFiles])if(hash(f.path)!==f.sha256)throw Error('PIN_CHANGED:'+f.path);};
fs.mkdirSync(runtime,{recursive:true});const lock=path.join(runtime,'gpu.lock');fs.writeFileSync(lock,JSON.stringify({pid:process.pid,root,kind:'classification-pipeline'}),{flag:'wx'});
let child,reason=null,killTimer;const state={status:'running',startedAt:new Date().toISOString(),stage:null,stages:[],pid:process.pid};
const update=()=>put('run-state.json',state);
function stop(why){if(reason)return;reason=why;if(child?.pid){try{process.kill(-child.pid,'SIGTERM');}catch{}killTimer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},3000);}}
process.on('SIGTERM',()=>stop('SIGNAL'));process.on('SIGINT',()=>stop('SIGNAL'));
const cutoff=Date.parse(policy.deadline)-policy.reportReserveSeconds*1000;
async function worker(stage,command,data,output,adapter){pinCheck();if(reason||Date.now()>=cutoff||fs.existsSync(path.join(root,'CANCEL')))throw Error(reason??'CANCELLED_OR_DEADLINE');state.stage=stage;update();const args=[path.join(dir,'worker.py'),command,'--model',model,'--policy',path.join(root,'experiment-policy.json'),'--data',data,'--output',output];if(command==='train')args.push('--kind','formal','--epochs','2');if(adapter)args.push('--adapter',adapter);
 const log=fs.openSync(path.join(root,stage+'.log'),'wx');child=spawn(python,args,{stdio:['ignore',log,log],detached:true});fs.closeSync(log);put('worker-lease.json',{pid:child.pid,stage,parent:process.pid});
 const timer=setInterval(()=>{try{pinCheck();if(Date.now()>=cutoff)stop('GPU_CUTOFF');if(fs.existsSync(path.join(root,'CANCEL')))stop('CANCELLED');}catch(e){stop(String(e));}},2000);
 let code;try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});}finally{clearInterval(timer);clearTimeout(killTimer);put('worker-lease.json',{pid:null,stage,endedAt:new Date().toISOString()});}
 if(reason||code!==0)throw Error(reason??`WORKER_EXIT:${stage}:${code}`);pinCheck();state.stages.push({stage,output,completedAt:new Date().toISOString()});update();console.log(JSON.stringify({stage,status:'complete',output}));return command==='train'?null:read(output);}
try{
 update();await worker('doctor','doctor',path.join(root,'train.jsonl'),path.join(root,'doctor.json'));
 const baseDev=await worker('baseline-dev','eval',path.join(root,'dev-requests.json'),path.join(root,'baseline-dev.json'));
 put('baseline-dev-score.json',summarizeClassification(cases.filter(c=>c.split==='dev'),baseDev));
 const adapterRoot=path.join(runtime,path.basename(root)+'-adapter');if(fs.existsSync(adapterRoot))throw Error('ADAPTER_EXISTS');
 await worker('train','train',path.join(root,'train.jsonl'),adapterRoot);
 const completed=read(path.join(adapterRoot,'training-run.json')).recipe.epochs;
 const candidates=[];for(const epoch of [1,2].filter(e=>e<=completed)){const adapter=path.join(adapterRoot,'epoch-'+epoch);const r=await worker('dev-'+epoch,'eval',path.join(root,'dev-requests.json'),path.join(root,'dev-'+epoch+'.json'),adapter);const score=summarizeClassification(cases.filter(c=>c.split==='dev'),r);put('dev-'+epoch+'-score.json',score);candidates.push({epoch,adapter,score});}
 const devEligible=s=>s.unsafe===0&&s.schemaPassed===s.total&&s.decisionPassed===s.total&&s.macroPct>=95&&Object.values(s.tasks).every(t=>t.passed/t.total>=.9);
 candidates.sort((a,b)=>Number(devEligible(b.score))-Number(devEligible(a.score))||b.score.macroPct-a.score.macroPct||a.score.unsafe-b.score.unsafe||b.score.schemaPassed-a.score.schemaPassed||a.epoch-b.epoch);const selected=candidates[0];
 put('selection.json',{epoch:selected.epoch,adapter:selected.adapter,adapterSha256:hash(path.join(selected.adapter,'adapters.safetensors')),devScore:selected.score,selectedAt:new Date().toISOString()});
 const a=await worker('test-A','eval',path.join(root,'test-requests.json'),path.join(root,'test-A.json'));const b=await worker('test-B','eval',path.join(root,'test-requests.json'),path.join(root,'test-B.json'),selected.adapter);
 const test=cases.filter(c=>c.split==='test'),A=summarizeClassification(test,a),B=summarizeClassification(test,b);const pairs={fixed:0,regressed:0,bothCorrect:0,bothWrong:0};for(let i=0;i<A.rows.length;i++){const a=A.rows[i].pass,b=B.rows[i].pass;pairs[a&&b?'bothCorrect':!a&&b?'fixed':a&&!b?'regressed':'bothWrong']++;}
 const noRegression=B.macroPct>=A.macroPct&&pairs.regressed===0&&B.unsafe<=A.unsafe&&B.schemaPassed>=A.schemaPassed&&B.decisionPassed>=A.decisionPassed;
 const classificationGate=B.macroPct>=95&&Object.values(B.tasks).every(t=>t.passed/t.total>=.9)&&B.unsafe===0&&B.schemaPassed===B.total&&B.decisionPassed===B.total;
 const report={status:'evaluated-research-candidate',releaseQualified:false,selectedEpoch:selected.epoch,A,B,pairs,improvementPP:B.macroPct-A.macroPct,classificationGate,noRegression,disposition:classificationGate&&noRegression&&pairs.fixed>0?'research-candidate-only':'keep-base-do-not-promote',limits:'Assistant-reviewed synthetic catalog-aware corpus; no human aesthetic or production Editor qualification.'};put('comparison.json',report);
 const preserved=path.join(root,'selected-adapter');fs.mkdirSync(preserved);for(const name of ['adapter_config.json','adapters.safetensors'])fs.copyFileSync(path.join(selected.adapter,name),path.join(preserved,name));fs.copyFileSync(path.join(model,'LICENSE'),path.join(preserved,'LICENSE'));
 state.status='complete-research-only';state.result='comparison.json';update();console.log(JSON.stringify({status:state.status,macroA:A.macroPct,macroB:B.macroPct,pairs}));
}catch(e){state.status='failed';state.error=String(e);update();process.exitCode=1;console.error(e);}finally{put('worker-lease.json',{pid:null,endedAt:new Date().toISOString(),reason});if(fs.existsSync(lock)&&read(lock).pid===process.pid)fs.unlinkSync(lock);}
