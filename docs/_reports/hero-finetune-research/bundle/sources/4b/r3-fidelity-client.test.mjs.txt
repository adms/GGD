import test from 'node:test';import assert from 'node:assert/strict';import {digest} from './dataset.mjs';import {buildFidelityPlan,validateFidelity} from './r3-fidelity-client.mjs';
const original='先無敵兩秒，再回血。';
const input={task:'owner-mechanism',source:{id:'test-hero.passive',version:'fixture',text:original,sha256:digest(original)},proposal:'進入無敵。',requirementsSourceSha256:digest(original),requirements:[{id:'delay',text:'先無敵兩秒，再回血。'}]};
const raw=(p,verdicts)=>({complete:true,results:p.requests.map((r,i)=>({...r,value:{verdict:verdicts[i]}}))});
test('forward support alone cannot hide omitted required mechanics',()=>{
 const p=buildFidelityPlan(input),r=validateFidelity(p,raw(p,['supported','not-stated']));assert.equal(r.proposalSupported,true);assert.equal(r.modelChecklistPass,false);assert.deepEqual(r.uncoveredRequirementIds,['delay']);assert.equal(r.releaseQualified,false);
});
test('even all supported is not production qualification; full proposal checked',()=>{
 const p=buildFidelityPlan({...input,proposal:original});const r=validateFidelity(p,raw(p,['supported','supported']));assert.equal(r.modelChecklistPass,true);assert.equal(r.releaseQualified,false);assert.equal(JSON.parse(p.requests[0].messages[1].content).claim,original);
});
test('source version, completeness and raw alignment fail closed',()=>{
 assert.throws(()=>buildFidelityPlan({...input,source:{...input.source,text:'偷偷換版'}}),/SOURCE_HASH/);
 const p=buildFidelityPlan(input),o=raw(p,['supported','supported']);o.results[0].requestDigest='wrong';assert.throws(()=>validateFidelity(p,o),/REQUEST_CHANGED/);
 p.requirements=[];assert.throws(()=>validateFidelity(p,raw(p,[])),/PLAN_CHANGED/);
});
