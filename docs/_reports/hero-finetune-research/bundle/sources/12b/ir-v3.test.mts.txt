import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtures } from './ir-fixtures.mts';
import { compileIR, checkEnginePins, currentCatalog } from './ir-compiler.mts';
import { compactIR2, expandIR3, validateIR3, compileIR3, shortContract, sourceReferences } from './ir-v3.mts';
import { runIRProbes } from './ir-behavior.mts';
import { sourceNegativeProbes } from './source-negative-probes.mts';
const catalog = currentCatalog(); checkEnginePins();
for (const fixture of fixtures) test(`six-slot project and engine output unchanged: ${fixture.id}`, () => {
  const short = compactIR2(fixture.ir, fixture.source), expanded = expandIR3(short, fixture.source);
  const old = compileIR(fixture.ir, fixture.source, catalog), actual = compileIR3(short, fixture.source, catalog);
  assert.deepEqual(actual.project, old.project); assert.deepEqual(actual.compiled, old.compiled);
  assert.equal(actual.sourceEntailmentVerified, false);
  assert.equal(Object.keys(expanded.slots).length, 6);
  assert(JSON.stringify(short).length < JSON.stringify(fixture.ir).length);
  const probes = runIRProbes(actual.compiled, fixture.id, catalog);
  assert.equal(probes.passed, probes.total);
  const negatives = sourceNegativeProbes(actual.compiled, fixture.source, catalog);
  assert.equal(negatives.passed, negatives.total);
});
const f = fixtures.find(f => f.id === 'community7-leesin')!;
const sample = () => compactIR2(f.ir, f.source);
test('required mechanic values cannot be omitted', () => {
  const a = sample(); delete a.slots.PASSIVE.actions[0].cooldown;
  assert.throws(() => validateIR3(a, f.source));
});
test('unknown fields / phantom action / extra slot are rejected', () => {
  for (const mutate of [(a: any) => { a.slots.Q.cheat = true; }, (a: any) => { a.slots.Q.actions[0].op = 'auto_win'; },
    (a: any) => { a.slots.EXTRA = a.slots.EX; }]) { const a = sample(); mutate(a); assert.throws(() => validateIR3(a, f.source)); }
});
test('absent nullable values become null and do not imply damage tiers', () => {
  const a = sample(), full = expandIR3(a, f.source);
  assert.equal(full.slots.Q.actions[0].tier, null); assert.equal(full.slots.Q.actions[0].damageType, null);
  assert.equal(full.slots.EX.actions[0].pushOnLand, null);
});
test('foreign or duplicate source IDs are rejected', () => {
  for (const mutate of [(a: any) => { a.hero.identityRefs = ['H9999']; },
    (a: any) => { a.hero.identityRefs.push(a.hero.identityRefs[0]); }, (a: any) => { a.relations[0].ref = 'Q0'; }]) {
    const a = sample(); mutate(a); assert.throws(() => validateIR3(a, f.source));
  }
});
test('shape-valid wrong delivery still fails semantic checker', () => {
  const a = sample(); a.slots.R.delivery = 'targeted'; assert.throws(() => validateIR3(a, f.source), /GROUND_DELIVERY_REQUIRED/);
});
test('missing skill is not silently filled', () => {
  const a = sample(); delete a.slots.E; assert.throws(() => validateIR3(a, f.source));
  const b = sample(); b.slots.E.actions = []; assert.throws(() => validateIR3(b, f.source), /EMPTY_SLOT_UNDECLARED/);
});
test('omitting a real mechanic is not called source-faithful by serializer', () => {
  const a = sample(); a.slots.R = { delivery: 'targeted', actions: [{ op: 'knockback', direction: 'facing', subtractGap: true }] };
  const built = compileIR3(a, f.source, catalog);
  assert.equal(built.sourceEntailmentVerified, false);
  const checks = sourceNegativeProbes(built.compiled, f.source, catalog);
  assert.equal(checks.cases.filter(c => c.name === 'Lee-R-moves-then-damages-and-pushes' && !c.passed).length, 2);
});
test('short contract lists every existing operation, all six slots, and typed required fields', () => {
  const c = shortContract(); assert.equal(Object.keys(c.actions).length, 19);
  assert.equal(Object.keys(c.root.slots).length, 6); assert('cooldown' in c.actions.attack_proc);
});
test('reference text remains contiguous original source and never contains answers', () => {
  const refs = sourceReferences(f.source), full = f.source.hero.originalText + '\n' + (f.source.sources ?? []).map((s: any) => s.text).join('\n');
  assert(refs.every(r => full.includes(r.text))); assert(refs.every(r => Object.keys(r).sort().join(',') === 'id,text'));
});
test('deep input is bounded before recursive validation', () => {
  const a: any = sample(); let p = a; for (let i = 0; i < 30; i++) p = p.extra = {};
  assert.throws(() => validateIR3(a, f.source), /IR_SIZE_DEPTH/);
});
test('all engine pins still hold', () => checkEnginePins());
