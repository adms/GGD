import test from 'node:test';import assert from 'node:assert/strict';import {correctSummon} from './main-summon-correction.mjs';import {digest} from './dataset.mjs';
function fixture(){
 const rows=[{templateId:'tpl-summon-agent',status:'enabled'},...Array.from({length:29},(_,i)=>({templateId:'enabled-'+i,status:'enabled'})),...Array.from({length:5},(_,i)=>({templateId:'quarantine-'+i,status:'quarantined'})),...Array.from({length:11},(_,i)=>({templateId:'draft-'+i,status:'draft'}))];
 const cases=[0,1].map(i=>({id:'main-diagnostic-v3-summon-'+i,messages:[{role:'system',content:'fixture'},{role:'user',content:JSON.stringify({request:'summon '+i})}],acceptedTargets:[{decision:'accept',templateId:'tpl-summon-agent'}]}));
 const probe={revision:'fixture',defaults:{castResult:'ok',countImmediately:0},twoDefaultCap:{castResult:'ok',countImmediately:0},positiveCap:{castResult:'ok',countImmediately:2,bodies:[{hp:10,maxHp:10}]},omittedCap:{castResult:'ok',countImmediately:2}};
 return [{reviewVersion:3,revision:'fixture',rows},cases,{casesSha256:digest(cases)},probe];
}
test('new availability labels have new inputs; preserves original audit',()=>{const args=fixture(),before=JSON.stringify(args);const r=correctSummon(...args);assert.equal(JSON.stringify(args),before);assert.equal(r.review.counts.enabled,29);assert.equal(r.manifest.changedLabels,2);for(const c of r.cases){assert.equal(c.target.decision,'refuse');assert(c.id.includes('v4'));assert(!JSON.parse(c.messages[1].content).catalog.some(x=>x.templateId==='tpl-summon-agent'));}});
test('quarantine requires successful positive control',()=>{const args=fixture();args[3].positiveCap.countImmediately=0;assert.throws(()=>correctSummon(...args));});
