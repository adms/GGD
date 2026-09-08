import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nearDuplicateGroups, splitExamples, prefixTable, learningTarget } from './hero-distillation-freeze.mjs';

const read = name => JSON.parse(fs.readFileSync(new URL('../../docs/_reports/hero-finetune-research/' + name, import.meta.url)));
function hero(id, groupId, heroName, description) {
  return { id: id + ':HERO', heroId: id, groupId, slot: 'HERO', request: { heroName, slots: { Q: { description } } } };
}
test('declared families and normalized names group transitively', () => {
  const rows = [hero('a', 'a-family', 'ＨＥＲＯ', 'first'), hero('b', 'b-family', 'hero', 'second'), hero('c', 'b-family', 'other', 'third')];
  assert.equal(new Set(Object.values(nearDuplicateGroups(rows, rows).groupByHero)).size, 1);
});
test('long near-duplicate sources cannot cross groups', () => {
  const description = Array.from({length: 300}, (_, i) => String.fromCodePoint(0x4e00 + i)).join('');
  const rows = [hero('a', 'a', '甲', description), hero('b', 'b', '乙', description.slice(0, -2) + '變更')];
  const result = nearDuplicateGroups(rows, rows);
  assert.equal(result.groupByHero.a, result.groupByHero.b);
  assert(result.edges.some(edge => edge.reason.includes('jaccard')));
});
test('generic template reuse alone does not group independent heroes', () => {
  const rows = [hero('a', 'a', '甲', '遠程發射'), hero('b', 'b', '乙', '友軍治療')];
  for (const row of rows) row.target = {template: 'same-template'};
  assert.notEqual(nearDuplicateGroups(rows, rows).groupByHero.a, nearDuplicateGroups(rows, rows).groupByHero.b);
});
test('exact prefix compression roundtrips without allowing wildcard asset IDs', () => {
  const ids = ['assets/icons/a.q.webp', 'assets/icons/a.w.webp', 'hero.glb', 'model:hero', 'assets/a.webp'];
  const result = Object.entries(prefixTable([...ids, ids[0]])).flatMap(([prefix, suffixes]) => suffixes.map(suffix => prefix + suffix));
  assert.deepEqual(result.sort(), ids.sort());
});
test('learning target removes only deterministic template hash and never changes source object', () => {
  const original = {format: 'hero-slot', slot: {products: [{template: {ref: 'tpl', contentSha256: 'hash', params: {damage: 5}}}]}};
  const result = learningTarget(original);
  assert.deepEqual(result.slot.products[0].template, {ref: 'tpl', params: {damage: 5}});
  assert.equal(original.slot.products[0].template.contentSha256, 'hash');
});
test('real eligible pool keeps all 124 tasks, source groups isolated, both formats represented in training', () => {
  const examples = read('distillation-pairs-v1/examples.json');
  const quality = read('distillation-training-v1/quality-reviewed.json');
  const result = splitExamples(examples, quality);
  const train = result.rows.filter(row => row.split === 'train'), dev = result.rows.filter(row => row.split === 'dev');
  assert.equal(train.length, 110); assert.equal(dev.length, 14);
  assert.equal(train.filter(row => row.slot === 'HERO').length, 12);
  assert.equal(dev.filter(row => row.slot === 'HERO').length, 2);
  assert.deepEqual(result.devGroups, ['godie-edem', 'godie-h02v']);
  assert(!train.some(row => dev.some(other => other.groupId === row.groupId)));
  assert.equal(new Set(train.filter(row => row.slot === 'HERO').map(row => row.target.format)).size, 2);
  const eligible = new Set(quality.tasks.filter(row => row.trainingEligible).map(row => row.id));
  assert.deepEqual(new Set(result.rows.map(row => row.id)), eligible);
});
