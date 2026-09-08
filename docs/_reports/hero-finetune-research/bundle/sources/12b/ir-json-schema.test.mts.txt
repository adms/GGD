import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Ajv2020 from '../../GGD-community-hero-forge/node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/dist/2020.js';
import { irJSONSchema } from './ir-json-schema.mts';
import { zIR2 } from './ir-v2.mts';
import { fixtures } from './ir-fixtures.mts';
import { normalizeFinal } from './normalize.mjs';
const ajv = new Ajv2020({ strict: true, allErrors: true, coerceTypes: false, useDefaults: false, removeAdditional: false });
const schema = irJSONSchema(), valid = ajv.compile(schema);
const v2 = (x: any) => { const v = structuredClone(x); v.schema = 'hero-semantic-ir@2';
  for (const s of Object.values(v.slots) as any[]) { delete s.sourceEvidence; delete s.vfxRecommendation; } return v; };
const both = (v: any, expected: boolean) => {
  const before = JSON.stringify(v); assert.equal(valid(v), expected, JSON.stringify(valid.errors));
  assert.equal(zIR2.safeParse(v).success, expected); assert.equal(JSON.stringify(v), before);
};
for (const f of fixtures) test(`schema agrees with IR2 fixture ${f.id}`, () => both(v2(f.ir), true));
const mutations: [string, (v: any) => void][] = [
  ['missing root schema', v => delete v.schema],
  ['wrong origin basis', v => v.hero.originBasis = '狂戰'],
  ['identity evidence string', v => v.hero.identityEvidence = '不是陣列'],
  ['string null', v => v.slots.PASSIVE.rangeTier = 'null'],
  ['string numeric', v => v.slots.Q.windup = '0.8'],
  ['string notes', v => v.slots.Q.tuningNotes = 'not array'],
  ['extra metadata', v => v.slots.Q.sourceEvidence = ['no']],
  ['missing nullable field', v => delete v.slots.PASSIVE.actions[0].targetHpBelow],
  ['out of range number', v => v.slots.PASSIVE.actions[0].cooldown = -1],
  ['extra nested action field', v => v.slots.Q.actions[0].engineCode = 'no'],
];
for (const [name, mutate] of mutations) test(name, () => { const v = v2(fixtures[0].ir); mutate(v); both(v, false); });
test('all observed IR2 raw structural errors fail both validators without repair', () => {
  const raw = JSON.parse(fs.readFileSync(new URL('./ir2-smoke-v1/raw.json', import.meta.url), 'utf8'));
  for (const r of raw.results) { const n = normalizeFinal(r.envelope); assert(n.ok); both(n.value, false); }
});
test('zero pulse delay, null radius, fractional count and invalid symbol are illegal', () => {
  for (const [field, value] of [['firstDelay', 0], ['radiusTier', null], ['count', 1.5]]) {
    const v = v2(fixtures[2].ir); v.slots.E.actions[0][field] = value; both(v, false);
  }
  const v = v2(fixtures[3].ir); v.slots.PASSIVE.actions[0].key = '不合法'; both(v, false);
});
test('single source contract has all 19 action shapes and six shared slots', () => {
  assert.equal(schema.$defs.action.oneOf.length, 19);
  assert.equal(schema.$defs.slot.properties.tuningNotes.type, 'array');
  assert.deepEqual(schema.properties.hero.properties.originBasis.enum, ['source', 'proposal']);
  assert.equal(Object.keys(schema.properties.slots.properties).length, 6);
});
