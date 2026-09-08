import test from 'node:test';import assert from 'node:assert/strict';
import {buildDiagnostic,validateDiagnostic,reviewedRequirements} from './r3-fidelity-diagnostic.mjs';
import {revision} from './main-catalog-review.mjs';
function fixture(){
 const snapshot={sources:reviewedRequirements.filter(s=>s.version!==revision).map(s=>({id:s.id,name:s.key,ownerOriginal:s.req.join('\n')}))};
 const mainDocs=Object.fromEntries(reviewedRequirements.filter(s=>s.version===revision).map(s=>[s.id,{name:s.key,description:s.req.join('\n')}]));
 return buildDiagnostic(snapshot,mainDocs);
}
function oracle(b){const expected=new Map(b.cases.map(c=>[c.id,c.target]));return {complete:true,results:b.requests.map(r=>({...r,value:expected.get(r.id)}))};}
test('oracle exercises both full-proposal truth and reverse omission gates',()=>{
 const b=fixture(),r=validateDiagnostic(b,oracle(b));assert.equal(b.plans.length,18);assert.equal(r.counts.correctGates,18);assert.equal(r.counts.correctClaims,114);assert.equal(r.counts.unsafeWholeProposalAccepts,0);
 for(const p of r.results.filter(p=>p.key.endsWith('-omitted'))){assert.equal(p.actual.proposalSupported,true);assert.equal(p.actual.modelChecklistPass,false);assert.equal(p.actual.uncoveredRequirementIds.length,1);}
});
test('always-supported model fails twelve proposals even though forward can look good',()=>{
 const b=fixture(),raw=oracle(b);raw.results.forEach(r=>r.value={verdict:'supported'});const result=validateDiagnostic(b,raw);
 assert.equal(result.counts.unsafeWholeProposalAccepts,12);assert.equal(result.releaseQualified,false);
});
test('missing and modified request responses fail closed',()=>{
 const b=fixture(),raw=oracle(b);raw.results.pop();assert.throws(()=>validateDiagnostic(b,raw));
 const altered=oracle(b);altered.results[0].requestDigest='changed';assert.throws(()=>validateDiagnostic(b,altered));
});
