/** Deterministic per-case comparisons; never selects a checkpoint or approves a model. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {summarize,score,paired} from './r3-score.mjs';import {digest} from './dataset.mjs';

export function failureKind(c,value){
 const s=score(c,value);if(s.pass)return null;if(!s.schema)return 'invalid-output-schema';
 if(s.unsafe)return ['hero-source','owner-mechanism'].includes(c.task)?'unsupported-source-claim-accepted':'wrong-or-unsupported-template-accepted';
 if(['hero-source','owner-mechanism'].includes(c.task))return c.target.verdict==='supported'?'supported-source-claim-rejected':'contradicted-versus-not-stated-confusion';
 return 'supported-template-refused';
}
export function compareArms(cases,arms){
 assert(cases.length>0);assert.equal(new Set(cases.map(c=>c.id)).size,cases.length,'DUPLICATE_CASES');
 assert(cases.every(c=>c.split!=='train'),'TRAINING_IS_NOT_EVALUATION');assert(arms.length>=2);
 assert.equal(new Set(arms.map(a=>a.name)).size,arms.length,'DUPLICATE_ARMS');
 const first=arms[0];for(const a of arms){
  assert(/^[a-z0-9_-]+$/.test(a.name),'INVALID_ARM_NAME');
  assert.equal(a.raw.metadata.thinking,false);assert.equal(a.raw.metadata.modelPath,first.raw.metadata.modelPath,'BASE_MODEL_CHANGED');
  assert.deepEqual(a.raw.metadata.versions,first.raw.metadata.versions,'RUNTIME_CHANGED');
  assert.equal(a.raw.metadata.grammar,first.raw.metadata.grammar,'GRAMMAR_CHANGED');
  assert.deepEqual(a.raw.results.map(r=>r.seed),first.raw.results.map(r=>r.seed),'SEEDS_CHANGED');
 }
 const scores=Object.fromEntries(arms.map(a=>[a.name,summarize(cases,a.raw)]));
 const comparisons=[];for(let i=0;i<arms.length;i++)for(let j=i+1;j<arms.length;j++)comparisons.push({before:arms[i].name,after:arms[j].name,byTask:paired(scores[arms[i].name],scores[arms[j].name])});
 const rows=cases.map((c,i)=>{
  const outputs=Object.fromEntries(arms.map(a=>{const r=a.raw.results[i];return[a.name,{value:r.value,score:score(c,r.value),failureKind:failureKind(c,r.value),seconds:r.seconds,finish:r.finish,error:r.error}];}));
  const changes=comparisons.map(p=>{const a=outputs[p.before].score,b=outputs[p.after].score;return{before:p.before,after:p.after,kind:a.pass?(b.pass?'both-correct':'regressed'):(b.pass?'fixed':'both-wrong'),newUnsafe:!a.unsafe&&b.unsafe};});
  return {id:c.id,task:c.task,lineage:c.lineage,expected:c.acceptedTargets??[c.target],reviewReason:c.reviewReason??null,input:JSON.parse(c.messages.at(-1).content),outputs,changes};
 });
 const failureCounts={};for(const a of arms){const counts={};for(const r of rows){const k=r.outputs[a.name].failureKind;if(k)counts[k]=(counts[k]??0)+1;}failureCounts[a.name]=counts;}
 return {schema:'ggd-forge-paired-error-report@1',casesSha256:digest(cases),arms:arms.map(a=>({name:a.name,metadata:a.raw.metadata})),scores,comparisons,failureCounts,rows,checkpointSelected:false,releaseQualified:false,trainingDataCreated:false,scope:'Strict paired source-reading/template classification only. Error types are deterministic output categories, not inferred root causes. Full hero generation and unlisted source requirements remain unproven.'};
}
const cell=v=>String(v??'').replaceAll('|','\\|').replaceAll('\n',' ');
export function renderReport(r){
 const names=r.arms.map(a=>a.name),lines=['# 逐題模型對照與錯誤清單','','本報告只整理實際輸出，不挑選checkpoint、不批准模型、不自動建立訓練資料。英雄設定與技能機制分開看，特效分數不得抵銷它們。','','| 任務／模型 | 正確 | 錯誤放行 | 格式通過 |','| --- | ---: | ---: | ---: |'];
 const tasks=[...new Set(['hero-source','owner-mechanism','mechanism-template',...names.flatMap(n=>Object.keys(r.scores[n].tasks))])];
 for(const task of tasks)for(const name of names){const t=r.scores[name].tasks[task];if(t)lines.push(`| ${task} / ${name} | ${t.passed}/${t.total} | ${t.unsafe} | ${t.schema}/${t.total} |`);}
 lines.push('','## 配對修正與退步','','同一題、同一請求摘要、相同base／runtime／seed／非推理設定；只比較已提供模型臂，不把尚未跑的R3寫成結果。','','| 對照／任務 | 修正 | 退步 | 兩者正確 | 兩者錯誤 |','| --- | ---: | ---: | ---: | ---: |');
 for(const p of r.comparisons)for(const [task,t] of Object.entries(p.byTask))lines.push(`| ${p.before} → ${p.after} / ${task} | ${t.fixed} | ${t.regressed} | ${t.bothCorrect} | ${t.bothWrong} |`);
 lines.push('','## 需要逐案審查','','下表包含任一模型出錯的全部題目。完整來源、預期答案、原始模型值及摘要見同目錄 `report.json`；分類只是輸出錯誤類型，不代表已確定訓練缺陷根因。','','| ID | 任務 | 預期 | '+names.map(cell).join(' | ')+' |','| --- | --- | --- | '+names.map(()=>'---').join(' | ')+' |');
 for(const row of r.rows.filter(row=>names.some(n=>!row.outputs[n].score.pass)))lines.push('| '+[row.id,row.task,JSON.stringify(row.expected),...names.map(n=>`${JSON.stringify(row.outputs[n].value)} / ${row.outputs[n].failureKind??'pass'}`)].map(cell).join(' | ')+' |');
 lines.push('','以上不是Owner Gold、不是完整英雄技能生成驗收，也不是16GB實機證明。保留所有錯誤，不以總平均分或loss掩蓋英雄設定／技能用途的退步。');return lines.join('\n')+'\n';
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [casesPath,split,out,...specs]=process.argv.slice(2);assert(casesPath&&out&&['dev','test','all'].includes(split));assert(!fs.existsSync(out),'REFUSE_OVERWRITE');
 const read=p=>JSON.parse(fs.readFileSync(p)),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 const cases=read(casesPath).filter(c=>split==='all'||c.split===split),arms=specs.map(s=>{const i=s.indexOf('=');assert(i>0);const file=path.resolve(s.slice(i+1));return{name:s.slice(0,i),file,raw:read(file)};});
 const r=compareArms(cases,arms);r.inputFiles=[{path:path.resolve(casesPath),sha256:hash(casesPath)},...arms.map(a=>({arm:a.name,path:a.file,sha256:hash(a.file)}))];r.split=split;
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(r,null,2)+'\n',{flag:'wx'});fs.writeFileSync(path.join(out,'REPORT.md'),renderReport(r),{flag:'wx'});
 console.log(JSON.stringify({out,arms:arms.map(a=>a.name),scores:Object.fromEntries(Object.entries(r.scores).map(([n,s])=>[n,{total:s.total,passed:s.passed,unsafe:s.unsafe}])),failureCounts:r.failureCounts}));
}
