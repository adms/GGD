import assert from 'node:assert/strict';
import {score as oldScore,paired} from './r3-score.mjs';
import {validateCompositionValue} from './composition-client.mjs';
export const priority=['hero-source','owner-mechanism','mechanism-template','mechanism-stack'];
export function score(c,value){
 const s=oldScore(c,value);
 if(c.task==='mechanism-stack'){
  const input=JSON.parse(c.messages[1].content),contract=validateCompositionValue({allowedPlans:input.allowedPlans},value);
  s.schema=s.schema&&contract.pass;s.pass=s.semantic&&s.schema&&s.decision;s.unsafe=value?.decision==='accept'&&!s.pass;
 }
 return s;
}
export function summarize(cases,raw){
 assert.equal(raw.complete,true);assert.equal(raw.results.length,cases.length);const tasks={};
 const rows=cases.map((c,i)=>{const r=raw.results[i];assert.equal(r.id,c.id);assert.equal(r.requestDigest,c.requestDigest);const s=score(c,r.value);if(r.error!==null)assert(!s.pass,'ERROR_WITH_PASS');const t=tasks[c.task]??={total:0,passed:0,semantic:0,schema:0,decision:0,unsafe:0};t.total++;t.passed+=+s.pass;for(const k of ['semantic','schema','decision','unsafe'])t[k]+=+s[k];return{id:c.id,task:c.task,...s};});
 for(const t of Object.values(tasks))t.pct=100*t.passed/t.total;
 return{total:rows.length,passed:rows.filter(r=>r.pass).length,unsafe:rows.filter(r=>r.unsafe).length,tasks,rows};
}
export function preservation(control,candidate){
 assert.equal(control.rows.length,candidate.rows.length);const sourceRegressions=[],newUnsafe=[];
 for(let i=0;i<control.rows.length;i++){const a=control.rows[i],b=candidate.rows[i];assert.equal(a.id,b.id);if(['hero-source','owner-mechanism'].includes(a.task)&&a.pass&&!b.pass)sourceRegressions.push(a.id);if(!a.unsafe&&b.unsafe)newUnsafe.push(a.id);}
 const taskRegressions=priority.filter(k=>candidate.tasks[k].passed<control.tasks[k].passed||candidate.tasks[k].unsafe>control.tasks[k].unsafe);
 return{pass:sourceRegressions.length===0&&newUnsafe.length===0&&taskRegressions.length===0,sourceRegressions,newUnsafe,taskRegressions};
}
export function eligible(s){return priority.every(k=>s.tasks[k]&&s.tasks[k].pct>=95&&s.tasks[k].unsafe===0&&s.tasks[k].schema===s.tasks[k].total);}
export function rank(a,b){
 const p=Number(b.preservation.pass)-Number(a.preservation.pass);if(p)return p;
 for(const k of priority){const x=a.score.tasks[k],y=b.score.tasks[k];const d=x.unsafe-y.unsafe||y.passed-x.passed||y.schema-x.schema;if(d)return d;}
 // Unchanged control wins a tie; earlier checkpoints win ties among new models.
 return a.step-b.step;
}
export function compare(cases,arms){
 const first=arms[0].raw;for(const a of arms){assert.equal(a.raw.metadata.thinking,false);assert.equal(a.raw.metadata.modelPath,first.metadata.modelPath);assert.deepEqual(a.raw.metadata.versions,first.metadata.versions);assert.equal(a.raw.metadata.grammar,first.metadata.grammar);assert.deepEqual(a.raw.results.map(r=>r.seed),first.results.map(r=>r.seed));}
 const scores=Object.fromEntries(arms.map(a=>[a.name,summarize(cases,a.raw)])),comparisons=[];
 for(let i=0;i<arms.length;i++)for(let j=i+1;j<arms.length;j++)comparisons.push({before:arms[i].name,after:arms[j].name,byTask:paired(scores[arms[i].name],scores[arms[j].name])});
 const rows=cases.map((c,i)=>({id:c.id,task:c.task,input:JSON.parse(c.messages[1].content),expected:c.acceptedTargets,reason:c.reviewReason,outputs:Object.fromEntries(arms.map(a=>[a.name,{value:a.raw.results[i].value,score:score(c,a.raw.results[i].value),error:a.raw.results[i].error,seconds:a.raw.results[i].seconds}]))}));
 return{scores,comparisons,rows,strictStackContract:true,releaseQualified:false,scope:'Identical new zero-presence-penalty decoding across arms; historical 1.5-penalty scores remain separate.'};
}
export function render(report){
 const lines=['# R6 同條件逐題對照','','所有模型使用相同輸入與新解碼設定（presence penalty=0）。舊1.5設定分數不覆寫、不混算。多卡格式包含明列計畫契約檢查；高分不取代零錯誤放行或完整範圍驗收。','','| 任務／模型 | 正確 | 錯誤放行 | 格式／計畫合法 |','| --- | ---: | ---: | ---: |'];
 for(const [name,s] of Object.entries(report.scores))for(const [task,t] of Object.entries(s.tasks))lines.push(`| ${task} / ${name} | ${t.passed}/${t.total} | ${t.unsafe} | ${t.schema}/${t.total} |`);
 lines.push('','逐題完整來源、需求、預期、原始模型值與修正／退步統計見對應JSON。來源／既有測試多已曝光；新多卡題亦是已知計畫家族，不冒稱独立新來源泛化。','');return lines.join('\n');
}
