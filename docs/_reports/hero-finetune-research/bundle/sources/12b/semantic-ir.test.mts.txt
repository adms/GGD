import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtures } from './ir-fixtures.mts';
import { actionCatalog, validateIR } from './semantic-ir.mts';
import { lowerIR } from './ir-compiler.mts';
const fixture = (i: number) => structuredClone(fixtures[i]);
for (const f of fixtures) test(`strict IR accepts manually reviewed ${f.id} but never qualifies`, () => {
  const r = validateIR(f.ir, f.source); assert.equal(r.releaseQualified, false);
  assert.equal(r.gaps.length, f.id === 'community37-32' ? 1 : 0);
});
const invalid: [string, number, (ir: any) => void][] = [
  ['unknown root field', 0, x => x.template = 'made-up'],
  ['unknown engine-like parameter', 0, x => x.slots.Q.actions[0].ticks = 3],
  ['missing slot', 0, x => delete x.slots.EX],
  ['passive forged as active', 0, x => x.slots.PASSIVE.delivery = 'self'],
  ['zero shield', 0, x => x.slots.EX.actions[0].amount = 0],
  ['foreign evidence', 0, x => x.slots.Q.actions[0].evidence = '我發明的新句子'],
  ['cross-slot evidence laundering', 0, x => x.slots.Q.sourceEvidence = x.slots.R.sourceEvidence],
  ['source origin replaced with another role', 0, x => x.hero.origin = '法師'],
  ['percent unit wrong', 0, x => x.slots.PASSIVE.actions[0].targetHpBelow = 35],
  ['resource undeclared', 3, x => x.slots.EX.cost.key = 'unknown'],
  ['impossible resource cost', 3, x => x.slots.EX.cost.count = 4],
  ['status undeclared', 3, x => x.slots.EX.actions[0].key = 'unknown'],
  ['symbol namespace collision', 3, x => x.slots.R.actions[1].onHit[1].key = 'energy'],
  ['required relationship omitted', 3, x => x.relations = []],
  ['false independence', 3, x => x.relations.push({ ...x.relations[1], kind: 'independent' })],
  ['unbounded counter', 3, x => x.slots.E.actions[0].maxTriggers = 100],
  ['spending health inside projectile', 3, x => x.slots.R.actions[1].onHit.unshift(x.slots.R.actions.shift())],
  ['slow without magnitude', 0, x => x.slots.E.actions[1].control = 'slow'],
  ['targeted self-shield', 0, x => x.slots.EX.delivery = 'targeted'],
  ['empty active hidden', 0, x => x.slots.EX.actions = []],
];
for (const [name, index, mutate] of invalid) test(`reject ${name}`, () => {
  const f = fixture(index); mutate(f.ir); assert.throws(() => validateIR(f.ir, f.source));
});
test('tuning notes do not become missing mechanisms', () => {
  const f = fixture(0); f.ir.slots.EX.tuningNotes.push('護盾量待調整');
  const r = lowerIR(f.ir, f.source); assert.equal(r.gaps.length, 0);
  assert(r.proposals.some(p => p.field === 'amount' && p.value > 0));
});
test('counter broad attack eligibility remains a blocking gap', () => {
  const f = fixture(3); const r = lowerIR(f.ir, f.source);
  assert.equal(r.completeMechanismClaim, false); assert.equal(r.automaticAccept, false);
});
test('no silent alteration of passives, root, fear, branches or resources', () => {
  const w = lowerIR(fixtures[0].ir, fixtures[0].source);
  const p = w.slots.PASSIVE.products[0].params.hooks[0];
  assert.equal(p.condition.op, '<'); assert.equal(p.condition.value, 0.35); assert.equal(p.internalCooldown, 2);
  assert.equal(w.slots.E.products[0].params.effects[1].feared, true);
  assert.equal(w.slots.R.products[0].params.effects[0].root, true);
  assert(!w.slots.R.products[0].params.effects.some((e: any) => e.kind === 'invulnerable'));
  const a = lowerIR(fixtures[3].ir, fixtures[3].source), ex = a.slots.EX.products[0].params.effects[0];
  assert.equal(a.slots.EX.abilityOverrides.statusCost.count, 3); assert.equal(ex.appliedBy, 'self');
  assert(!ex.onConsumed.some((e: any) => e.kind === 'damage'));
  assert.equal(ex.onConsumed[0].modifiers[0].value, 0.1); assert.equal(ex.onMissing[1].modifiers[0].value, -0.2);
});
test('semantic catalog has real structured nullable push schema', () => {
  assert.equal(Object.keys(actionCatalog()).length, 19);
  assert.equal(actionCatalog().leap.pushOnLand.nullable, true);
  assert.equal(actionCatalog().leap.pushOnLand.type.subtractGap, 'boolean');
});
