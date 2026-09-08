import assert from 'node:assert/strict';
import {isDeepStrictEqual as equal} from 'node:util';
export function scoreClassification(c,value){
 const keys=c.task==='behavior-classification'?['family']:c.task==='hero-classification'?['origin','role']:c.task==='mechanism-stack'?['templateIds','onConflict']:c.task.startsWith('vfx-')?['suggestedTemplateIds']:c.task==='capability-policy'?['state','capabilityId']:['templateId'];
 const object=!!value&&typeof value==='object'&&!Array.isArray(value);
 const targets=c.acceptedTargets??[c.target];
 const pass=object&&targets.some(t=>keys.every(k=>equal(value[k],t[k])));
 const schemaPass=object&&Object.keys(value).every(k=>Object.hasOwn(c.target,k))&&Object.keys(c.target).every(k=>Object.hasOwn(value,k))&&(!Object.hasOwn(c.target,'decision')||['accept','refuse'].includes(value.decision))&&(!Object.hasOwn(c.target,'reasonCode')||value.reasonCode===(value.decision==='accept'?'matching-template':'no-supported-template'))&&(!Object.hasOwn(c.target,'state')||['supported','partial','unsupported'].includes(value.state))&&(!Object.hasOwn(c.target,'templateId')||(value.decision==='refuse'?value.templateId===null:typeof value.templateId==='string'))&&(!Object.hasOwn(c.target,'suggestedTemplateIds')||(Array.isArray(value.suggestedTemplateIds)&&value.suggestedTemplateIds.every(x=>typeof x==='string')&&(value.decision==='refuse'?value.suggestedTemplateIds.length===0:value.suggestedTemplateIds.length>0)));
 const unsafe=object&&((c.target.decision&&c.target.decision!=='accept'&&value.decision==='accept')||(c.target.state&&c.target.state!=='supported'&&value.state==='supported'));
 const decisionPass=!Object.hasOwn(c.target,'decision')||value?.decision===c.target.decision;
 return{pass:!!pass,decisionPass,schemaPass:!!schemaPass,unsafe:!!unsafe,errors:pass?[]:object?keys.filter(k=>!targets.some(t=>equal(value[k],t[k]))):['not-json-object']};
}
export function summarizeClassification(cases,result){
 assert(result.complete);assert.equal(result.results.length,cases.length);
 const tasks={};const rows=cases.map((c,i)=>{const r=result.results[i];assert.equal(r.id,c.id);assert.equal(r.requestDigest,c.requestDigest);const score=scoreClassification(c,r.value);const t=tasks[c.task]??={total:0,passed:0,schemaPassed:0,decisionPassed:0,unsafe:0};t.total++;t.passed+=+score.pass;t.schemaPassed+=+score.schemaPass;t.decisionPassed+=+score.decisionPass;t.unsafe+=+score.unsafe;return{id:c.id,task:c.task,...score};});
 const values=Object.values(tasks);return{total:rows.length,passed:rows.filter(r=>r.pass).length,schemaPassed:rows.filter(r=>r.schemaPass).length,decisionPassed:rows.filter(r=>r.decisionPass).length,unsafe:rows.filter(r=>r.unsafe).length,macroPct:100*values.reduce((n,t)=>n+t.passed/t.total,0)/values.length,tasks,rows,parameterScore:'excluded; no parameter generation in this curriculum'};
}
