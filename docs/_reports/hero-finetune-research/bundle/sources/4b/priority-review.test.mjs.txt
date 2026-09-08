import test from 'node:test';import assert from 'node:assert/strict';
import {rankCandidates,auditMechanisms,checkPairMetadata} from './priority-review.mjs';
const policy={schema:'ggd-forge-user-priority@1',mechanismEligibility:{minAccuracyPct:95},heroSettingStatus:'not-validated-in-current-curriculum'};
const score=(m,v=100)=>({tasks:{'mechanism-template':{total:100,passed:m,schemaPassed:100,decisionPassed:100,unsafe:0},'vfx-semantic':{total:100,passed:v}}});
test('mechanism accuracy wins over higher VFX and macro; safety eligibility comes first',()=>{
 const candidates=[{epoch:1,score:score(98,60)},{epoch:2,score:score(96,100)}];
 assert.equal(rankCandidates(candidates,policy)[0].epoch,1);
 candidates[0].score.tasks['mechanism-template'].unsafe=1;assert.equal(rankCandidates(candidates,policy)[0].epoch,2);
 assert.throws(()=>rankCandidates(candidates,{...policy,mechanismEligibility:{minAccuracyPct:1}}));
});
test('VFX-only gains never prove mechanism improvement or hero fidelity',()=>{
 const rows=Array.from({length:100},(_,i)=>({id:String(i),task:'mechanism-template',pass:true,schemaPass:true,decisionPass:true,unsafe:false}));
 const A={...score(100,50),rows},B={...score(100,100),rows};const r=auditMechanisms(A,B,B,policy);
 assert.equal(r.mechanismResearchGate,false);assert.equal(r.wholeGoalQualified,false);
});
test('paired mechanism regression prevents promotion despite net gains',()=>{
 const rows=Array.from({length:100},(_,i)=>({id:String(i),task:'mechanism-template',pass:i>=2,schemaPass:true,decisionPass:true,unsafe:false}));
 const A={...score(98),rows},B={...score(99),rows:rows.map((r,i)=>({...r,pass:i!==2}))};
 const r=auditMechanisms(A,B,B,policy);assert.equal(r.pairs.fixed,2);assert.equal(r.pairs.regressed,1);assert.equal(r.mechanismResearchGate,false);
 assert.throws(()=>auditMechanisms(A,{...B,rows:[]},B,policy));
});
test('worker metadata binds the base, non-thinking mode and selected adapter',()=>{
 const a={metadata:{modelPath:'/base',adapter:null,thinking:false}},b={metadata:{modelPath:'/base',adapter:'/epoch-1',thinking:false}};
 assert.doesNotThrow(()=>checkPairMetadata(a,b,'/epoch-1'));
 assert.throws(()=>checkPairMetadata(a,b,'/epoch-2'));
 assert.throws(()=>checkPairMetadata(a,{...b,metadata:{...b.metadata,thinking:true}},'/epoch-1'));
 assert.throws(()=>checkPairMetadata(a,{...b,metadata:{...b.metadata,modelPath:'/other'}},'/epoch-1'));
});
