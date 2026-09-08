import test from 'node:test';
import assert from 'node:assert/strict';
import {triage,confusion} from './r7-result-audit.mjs';
test('new unsafe on both-wrong row is visible and never automatically marked reviewed',()=>{
 const report={rows:[{id:'case',task:'owner-mechanism',input:{},expected:[{verdict:'contradicted'}],outputs:{r3:{value:{verdict:'not-stated'},score:{pass:false,unsafe:false,schema:true}},selected:{value:{verdict:'supported'},score:{pass:false,unsafe:true,schema:true}}}}]};
 const r=triage(report);assert.equal(r.counts['new-unsafe'],1);assert.equal(r.counts.regression,0);assert.equal(r.rows[0].personalReviewStatus,'pending');assert.equal(r.personalReviewComplete,false);
 const c=confusion(report,'selected','owner-mechanism');assert.equal(c.matrix.contradicted.supported,1);assert.equal(c.perClass.supported.precision,0);assert.equal(c.perClass['not-stated'].precision,null);
});
test('invalid schema is not a correct source verdict in the confusion matrix',()=>{
 const report={rows:[{id:'case',task:'hero-source',input:{},expected:[{verdict:'supported'}],outputs:{selected:{value:{verdict:'supported',extra:1},score:{pass:false,unsafe:false,schema:false}}}}]};
 const c=confusion(report,'selected','hero-source');assert.equal(c.matrix.supported.invalid,1);assert.equal(c.perClass.supported.recall,0);
});
