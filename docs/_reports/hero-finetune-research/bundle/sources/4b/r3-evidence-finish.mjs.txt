/** One-shot CPU report completion for this run. Never owns GPU or changes model selection. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {compareArms,renderReport} from './r3-error-report.mjs';
const [rootArg,outArg]=process.argv.slice(2);assert(rootArg&&outArg);
const root=path.resolve(rootArg),out=path.resolve(outArg),post=path.join(root,'post-diagnostics-v3');assert(!fs.existsSync(out),'REFUSE_RESTART');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const policyFile=path.join(root,'experiment-policy.json'),policy=read(policyFile),deadline=Date.parse(policy.deadline);assert(Number.isFinite(deadline));
const dir=path.dirname(fileURLToPath(import.meta.url));
const pins=[policyFile,fileURLToPath(import.meta.url),path.join(dir,'r3-error-report.mjs'),path.join(dir,'r3-score.mjs'),path.join(dir,'classification-score.mjs'),path.join(dir,'dataset.mjs')].map(file=>({file,sha256:hash(file)}));
const r3Initial=read(path.join(root,'run-state.json')),postInitial=read(path.join(post,'state.json'));
assert.equal(r3Initial.status,'running');assert(['waiting-for-r3','running'].includes(postInitial.status));process.kill(r3Initial.pid,0);process.kill(postInitial.pid,0);
fs.mkdirSync(out);const put=(name,value)=>{const p=path.join(out,name);fs.writeFileSync(p+'.tmp',JSON.stringify(value,null,2)+'\n');fs.renameSync(p+'.tmp',p);};
const state={status:'waiting',pid:process.pid,startedAt:new Date().toISOString(),r3Pid:r3Initial.pid,postPid:postInitial.pid};put('state.json',state);put('pins.json',pins);
let stopReason=null;process.on('SIGTERM',()=>{stopReason='SIGNAL';});process.on('SIGINT',()=>{stopReason='SIGNAL';});
try{
 while(true){
  for(const p of pins)assert.equal(hash(p.file),p.sha256,'PIN_CHANGED:'+p.file);
  if(stopReason||Date.now()>=deadline||fs.existsSync(path.join(out,'CANCEL'))||fs.existsSync(path.join(root,'CANCEL'))){stopReason??='CANCEL_OR_DEADLINE';break;}
  const r3=read(path.join(root,'run-state.json')),follow=read(path.join(post,'state.json'));
  assert.equal(r3.pid,r3Initial.pid);assert.equal(follow.pid,postInitial.pid);
  const r3Live=r3.status==='running',postLive=['waiting-for-r3','running'].includes(follow.status);
  if(r3Live)process.kill(r3.pid,0);if(postLive)process.kill(follow.pid,0);
  if(!r3Live&&!postLive)break;
  await new Promise(resolve=>setTimeout(resolve,10000));
 }
 const r3=read(path.join(root,'run-state.json')),follow=read(path.join(post,'state.json'));
 const selectionFile=path.join(root,'selection.json'),selection=fs.existsSync(selectionFile)?read(selectionFile):null;
 const specs=[
  {name:'r3-dev',cases:path.join(root,'cases.private.json'),split:'dev',arms:[['base','base-dev'],['r2','r2-dev'],...(selection?[['r3','dev-'+selection.selected.epoch]]:[])],where:root},
  {name:'r3-test',cases:path.join(root,'cases.private.json'),split:'test',arms:[['base','test-base'],['r2','test-r2'],['r3','test-selected']],where:root},
  ...['main-hero-diagnostic-v1','fidelity-diagnostic-v2','main-diagnostic-v3'].map(name=>({name,cases:path.join(root,name,'cases.private.json'),split:'all',arms:['base','r2','r3'].map(arm=>[arm,name+'-'+arm]),where:post})),
 ];
 const reports=[],missing=[];
 for(const spec of specs){
  const arms=spec.arms.flatMap(([name,stem])=>{const file=path.join(spec.where,stem+'.json');if(!fs.existsSync(file)){missing.push({group:spec.name,arm:name,reason:'NO_FINAL_OUTPUT'});return [];}const raw=read(file);if(raw.complete!==true){missing.push({group:spec.name,arm:name,reason:'INCOMPLETE_OUTPUT'});return [];}return [{name,file,raw}];});
  if(arms.length<2){missing.push({group:spec.name,reason:'FEWER_THAN_TWO_COMPLETED_ARMS'});continue;}
  const cases=read(spec.cases).filter(c=>spec.split==='all'||c.split===spec.split),report=compareArms(cases,arms);
  report.inputFiles=[{path:spec.cases,sha256:hash(spec.cases)},...arms.map(a=>({arm:a.name,path:a.file,sha256:hash(a.file)}))];
  const reportDir=path.join(out,spec.name);fs.mkdirSync(reportDir);fs.writeFileSync(path.join(reportDir,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});fs.writeFileSync(path.join(reportDir,'REPORT.md'),renderReport(report),{flag:'wx'});
  reports.push({group:spec.name,arms:arms.map(a=>a.name),scores:Object.fromEntries(Object.entries(report.scores).map(([name,s])=>[name,{total:s.total,passed:s.passed,unsafe:s.unsafe,tasks:s.tasks}])),comparisons:report.comparisons,reportPath:path.join(reportDir,'REPORT.md')});
 }
 const complete=r3.status==='complete-research-only'&&follow.status==='complete-research-only'&&reports.length===5&&reports.every(r=>r.arms.includes('r3'))&&missing.length===0;
 const summary={status:complete?'complete-research-evidence':'partial-research-evidence',r3Status:r3.status,postStatus:follow.status,stopReason,selectedEpoch:selection?.selected.epoch??null,reports,missing,sourcePriority:['hero-source','owner-mechanism','mechanism-template','vfx-template'],releaseQualified:false,checkpointReselected:false,editorActivated:false,cloudGpu:false,scope:'Paired task diagnostics, not full hero generation, independent Owner Gold, full template runtime validation, or 16GB device proof.'};
 put('summary.json',summary);const lines=['# R3 與接續診斷證據索引','',`狀態：${summary.status}；原訓練程序：${r3.status}；接續診斷：${follow.status}。`,'','本報告只整理證據，不重新選模型、不啟用Editor、不宣告完整目標達成。',''];
 for(const r of reports)lines.push(`- [${r.group}](${r.group}/REPORT.md)：${r.arms.join(' / ')}。`);
 if(missing.length)lines.push('','缺少／未完成：',...missing.map(m=>`- ${m.group} ${m.arm??''}：${m.reason}`));
 lines.push('','分數必須連同逐案退步、錯誤放行及來源限制閱讀。只有套用模板分類結果，不等於完整技能用途與英雄設定已能自動鑄造。');fs.writeFileSync(path.join(out,'REPORT.md'),lines.join('\n')+'\n',{flag:'wx'});
 state.status=summary.status;state.completedAt=new Date().toISOString();put('state.json',state);console.log(JSON.stringify({status:state.status,reports:reports.length,missing:missing.length,out}));
}catch(e){state.status='failed';state.error=String(e);put('state.json',state);console.error(e);process.exitCode=1;}
