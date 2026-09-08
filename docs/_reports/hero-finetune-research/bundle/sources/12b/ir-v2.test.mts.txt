import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtures } from './ir-fixtures.mts';
import { validateIR2, toIR1 } from './ir-v2.mts';
const asV2 = (value: any) => { const v = structuredClone(value); v.schema = 'hero-semantic-ir@2';
  for (const s of Object.values(v.slots) as any[]) { delete s.sourceEvidence; delete s.vfxRecommendation; } return v; };
for (const f of fixtures) test(`metadata delegated without changing ${f.id} actions`, () => {
  const v = asV2(f.ir), r = validateIR2(v, f.source); assert.equal(r.releaseQualified, false);
  assert.deepEqual(toIR1(v, f.source), f.ir);
});
test('action evidence is still required and anchored', () => {
  const f = fixtures[0], v = asV2(f.ir); v.slots.Q.actions[0].evidence = '外部拼湊的不符來源文字';
  assert.throws(() => validateIR2(v, f.source), /UNANCHORED/);
});
test('metadata cannot be supplied by model', () => {
  const f = fixtures[0], v = asV2(f.ir); v.slots.Q.sourceEvidence = ['test']; assert.throws(() => validateIR2(v, f.source));
});
test('invented W to passive relation rejected in reverse direction', () => {
  const f = fixtures[1], v = asV2(f.ir);
  v.relations.push({ from: 'W', to: 'PASSIVE', kind: 'conditional', evidence: '技能後兩次普攻改為有冷卻的普攻追加' });
  assert.throws(() => validateIR2(v, f.source), /UNBACKED_RELATION/);
});
test('duplicate relation rejected', () => {
  const f = fixtures[3], v = asV2(f.ir); v.relations.push(v.relations[0]); assert.throws(() => validateIR2(v, f.source), /DUPLICATE_RELATION/);
});
test('cannot rewrite targeted self effects or missing resource costs', () => {
  const f = fixtures[0], v = asV2(f.ir); v.slots.W.delivery = 'targeted'; assert.throws(() => validateIR2(v, f.source), /SELF_DELIVERY/);
  const a = fixtures[3], w = asV2(a.ir); w.slots.EX.cost = null; assert.throws(() => validateIR2(w, a.source), /UNBACKED_RELATION/);
});
