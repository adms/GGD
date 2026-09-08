import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceFacets,engineeringControl} from './ir5-evaluation.mts';
for(const id of ['community7-lux','community7-xerath','synthetic-spatial-5-required','synthetic-spatial-5-none'])test(`fixed facets control ${id}`,()=>{
  const f=engineeringControl(id),r=sourceFacets(f.ir,f.ir);assert.equal(r.passed,r.total);assert(r.total>50);
});
test('unknown numeric preview is ungraded but required timing is graded',()=>{
  const f=engineeringControl('community7-xerath'),a=structuredClone(f.ir);a.slots.Q.castTiming.seconds=0.5;
  let r=sourceFacets(a,f.ir);assert.equal(r.passed,r.total);a.slots.Q.castTiming.requirement='not_specified';
  r=sourceFacets(a,f.ir);assert.equal(r.total-r.passed,1);
});
test('missing result cannot satisfy any full known-field oracle',()=>{
  const f=engineeringControl('community7-lux'),r=sourceFacets(null,f.ir);assert.equal(r.passed,0);
});
test('extra actions and invented dependencies are rejected',()=>{
  const f=engineeringControl('community7-lux'),a=structuredClone(f.ir);a.slots.Q.actions.push(a.slots.Q.actions[0]);a.relations.push({});
  const r=sourceFacets(a,f.ir);assert.equal(r.total-r.passed,2);
});
