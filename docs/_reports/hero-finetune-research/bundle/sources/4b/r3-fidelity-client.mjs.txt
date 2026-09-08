/** Bidirectional source checklist. All outputs remain research-only/manual review. */
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';import {digest,mechanicsText} from './dataset.mjs';import {system} from './r3-data.mjs';
const text=(v,max)=>{assert(typeof v==='string'&&v.trim()&&v.length<=max,'INVALID_TEXT');return v;};
export function buildFidelityPlan(input){
 assert(input&&['hero-source','owner-mechanism'].includes(input.task),'INVALID_TASK');
 const s=input.source;assert(s&&typeof s.id==='string'&&typeof s.version==='string','SOURCE_LOCK_REQUIRED');
 text(s.text,12000);assert.equal(s.sha256,digest(s.text),'SOURCE_HASH_MISMATCH');
 const requirements=input.requirements;assert(Array.isArray(requirements)&&requirements.length>0&&requirements.length<=24,'REQUIREMENTS_REQUIRED');
 assert.equal(input.requirementsSourceSha256,s.sha256,'REQUIREMENTS_SOURCE_MISMATCH');
 assert.equal(new Set(requirements.map(x=>x.id)).size,requirements.length,'DUPLICATE_REQUIREMENT_ID');
 const proposal=text(input.proposal,6000);for(const r of requirements){text(r.id,120);text(r.text,1800);}
 const clean=v=>input.task==='owner-mechanism'?mechanicsText(v):v;
 // Forward checks the WHOLE proposal, not a hand-picked subset of its claims.
 const checks=[{id:'forward',direction:'proposal-supported-by-source',evidence:clean(s.text),claim:clean(proposal)},...requirements.map(r=>({id:'coverage-'+r.id,direction:'required-source-claim-covered-by-proposal',requirementId:r.id,evidence:clean(proposal),claim:clean(r.text)}))];
 const requests=checks.map(c=>{
  text(c.evidence,12000);text(c.claim,6000);
  const source={id:s.id,name:s.name??s.id,snapshot:digest(c.evidence),text:c.evidence};
  const content={task:input.task,source,claim:c.claim,instruction:'只根據此份鎖定來源判斷 claim。輸出 {"verdict":"supported|contradicted|not-stated"}。不判斷整招是否已能用模板實現。'};
  const messages=[{role:'system',content:system},{role:'user',content:JSON.stringify(content)}];return{id:c.id,messages,requestDigest:digest(messages)};
 });
 const plan={schema:'ggd-forge-fidelity-checklist@1',task:input.task,sourceLock:{id:s.id,version:s.version,sha256:s.sha256},proposalSha256:digest(proposal),requirements,requirementsCoverage:input.requirementsCoverage==='reviewed-complete'?'caller-declared-complete-not-independently-proven':'partial',checks:checks.map(({evidence,claim,...c})=>c),requests,releaseQualified:false,automaticActivation:false};
 return{...plan,planDigest:digest(plan)};
}
export function validateFidelity(plan,raw){
 const {planDigest,...body}=plan;assert.equal(digest(body),planDigest,'PLAN_CHANGED');assert.equal(raw.complete,true,'INCOMPLETE_EVALUATION');assert.equal(raw.results.length,plan.requests.length,'MISSING_RESULT');
 const rows=plan.requests.map((r,i)=>{const out=raw.results[i];assert.equal(out.id,r.id,'RESULT_ORDER');assert.equal(out.requestDigest,r.requestDigest,'REQUEST_CHANGED');const value=out.value;
  const valid=value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&['supported','contradicted','not-stated'].includes(value.verdict);
  return{...plan.checks[i],verdict:valid?value.verdict:null,pass:!!valid&&value.verdict==='supported',error:valid?null:'INVALID_MODEL_OUTPUT'};
 });
 return{schema:'ggd-forge-fidelity-checklist-result@1',sourceLock:plan.sourceLock,proposalSha256:plan.proposalSha256,planDigest,modelChecklistPass:rows.every(r=>r.pass),proposalSupported:rows[0].pass,uncoveredRequirementIds:rows.slice(1).filter(r=>!r.pass).map(r=>r.requirementId),rows,requirementsCoverage:plan.requirementsCoverage,releaseQualified:false,automaticActivation:false,warning:'Model judgments may be wrong. Coverage only measures supplied reviewed requirements; never proves unlisted source facts or production template realizability. Human review required.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,a,b,c]=process.argv.slice(2),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
 if(mode==='build'){const plan=buildFidelityPlan(read(a));fs.writeFileSync(b,JSON.stringify(plan,null,2)+'\n',{flag:'wx'});fs.writeFileSync(b+'.requests.json',JSON.stringify(plan.requests,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({plan:b,requests:b+'.requests.json',checks:plan.requests.length}));}
 else if(mode==='validate'){const result=validateFidelity(read(a),read(b));fs.writeFileSync(c,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result));}
 else throw Error('usage: r3-fidelity-client.mjs build INPUT NEW_PLAN | validate PLAN RAW NEW_RESULT');
}
