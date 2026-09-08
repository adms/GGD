import assert from 'node:assert/strict';
import {isDeepStrictEqual as equal} from 'node:util';
import {scoreClassification} from './classification-score.mjs';
export function score(c,value){
 const object=value!==null&&typeof value==='object'&&!Array.isArray(value);
 let semantic,schema,unsafe,decision;
 if(['hero-source','owner-mechanism'].includes(c.task)){
  semantic=object&&value.verdict===c.target.verdict;
  schema=object&&equal(Object.keys(value),['verdict'])&&['supported','contradicted','not-stated'].includes(value.verdict);
  unsafe=object&&value.verdict==='supported'&&c.target.verdict!=='supported';decision=semantic;
 }else{
  const r=scoreClassification(c,value);semantic=r.pass;schema=r.schemaPass;decision=r.decisionPass;
  unsafe=object&&value.decision==='accept'&&(!semantic||!schema||!decision);
 }
 return {semantic:!!semantic,schema:!!schema,decision:!!decision,unsafe:!!unsafe,pass:!!semantic&&!!schema&&!!decision};
}
export function summarize(cases,raw){
 assert.equal(raw.complete,true);assert.equal(raw.results.length,cases.length);const tasks={};
 const rows=cases.map((c,i)=>{const r=raw.results[i];assert.equal(r.id,c.id);assert.equal(r.requestDigest,c.requestDigest);const s=score(c,r.value);const t=tasks[c.task]??={total:0,passed:0,semantic:0,schema:0,decision:0,unsafe:0};t.total++;for(const k of ['semantic','schema','decision','unsafe'])t[k]+=+s[k];t.passed+=+s.pass;return{id:c.id,task:c.task,...s};});
 for(const t of Object.values(tasks))t.pct=100*t.passed/t.total;
 return{total:rows.length,passed:rows.filter(r=>r.pass).length,unsafe:rows.filter(r=>r.unsafe).length,tasks,rows};
}
export function eligible(s){return ['hero-source','owner-mechanism','mechanism-template'].every(k=>{const t=s.tasks[k];return t&&t.pct>=95&&t.unsafe===0&&t.schema===t.total;});}
export function rankCandidates(a,b){
 const eligibleDifference=Number(eligible(b.score))-Number(eligible(a.score));if(eligibleDifference)return eligibleDifference;
 // Safety before accuracy WITHIN each priority tier. Never let VFX offset hero errors.
 for(const key of ['hero-source','owner-mechanism','mechanism-template']){const x=a.score.tasks[key],y=b.score.tasks[key];assert(x&&y);const d=x.unsafe-y.unsafe||y.pct-x.pct||y.schema-x.schema;if(d)return d;}
 return a.epoch-b.epoch;
}
export function paired(a,b){assert.equal(a.rows.length,b.rows.length);const tasks={};for(let i=0;i<a.rows.length;i++){const x=a.rows[i],y=b.rows[i];assert.equal(x.id,y.id);const t=tasks[x.task]??={fixed:0,regressed:0,bothCorrect:0,bothWrong:0};t[x.pass&&y.pass?'bothCorrect':!x.pass&&y.pass?'fixed':x.pass&&!y.pass?'regressed':'bothWrong']++;}return tasks;}
