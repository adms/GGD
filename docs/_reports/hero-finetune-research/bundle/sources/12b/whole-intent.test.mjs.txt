import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { buildWholeIntent } from './build-whole-intent.mjs';
const records = JSON.parse(fs.readFileSync(new URL('./intake-v1/review-queue.private.json',import.meta.url),'utf8'));
test('nine complete sources and all54 slots retain original text and stay out of training',()=>{
  const data=buildWholeIntent(records); assert.equal(data.length,9);
  assert.equal(data.flatMap(h=>h.slots).length,54);
  assert(data.every(h=>h.allSixSlotsAnnotated&&!h.trainingAdmitted&&!h.completeExecutableGold&&!h.freshBlind));
  assert(data.flatMap(h=>h.slots).every(s=>!('legacyTemplate' in s)));
});
test('source mutation rejected rather than laundering through annotations',()=>{
  const copy=structuredClone(records); copy.find(h=>h.id==='community37-30').originalText+='changed';
  assert.throws(()=>buildWholeIntent(copy));
});
test('explicit dependencies and inferred category edges remain distinct',()=>{
  const data=buildWholeIntent(records), mai=data.find(h=>h.id==='community37-03'), shirou=data.find(h=>h.id==='community37-12');
  assert(mai.relations.every(r=>r.certainty!=='explicit'));
  assert(shirou.relations.some(r=>r.from==='R'&&r.to==='W'&&r.certainty==='explicit'));
});
test('unprovided behavior kept as unknown; previous template is not truth',()=>{
  const cat=buildWholeIntent(records).find(h=>h.id==='community37-30');
  assert(cat.slots.find(s=>s.slot==='W').unknown.includes('hit_interference_rule'));
  assert(cat.slots.find(s=>s.slot==='E').forbidden.includes('invented_enemy_knockback'));
  assert(cat.slots.find(s=>s.slot==='EX').unknown.includes('spend_count'));
});
