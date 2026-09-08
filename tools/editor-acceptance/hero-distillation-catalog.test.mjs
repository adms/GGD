import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catalogIndex, catalogLookup, createIndexBundle} from './hero-distillation-catalog.mjs';

const catalog = () => ({revision: 'rev', fingerprint: 'fp', bricks: [
  {layer: 'effect', id: 'damage', params: [{name: 'amount', type: 'number', min: 0, max: 500}]},
  {layer: 'template', id: 'buff-self', params: [{name: 'duration', type: 'number', default: 3}]},
], constraints: {planned: [{key: 'effect.damage@1', state: 'partial', caveat: '必須查閱，不能省略。'}],
  unsupported: ['not-available'], knownBroken: [{token: 'danger', what: '已知限制'}], deprecatedFields: [{field: 'old', useInstead: 'new'}]}});

test('index covers every key, exposes caveats, and does not copy full parameters', () => {
  const index = catalogIndex(catalog());
  assert.deepEqual(index.bricksByLayer.effect, ['damage']);
  assert.deepEqual(index.bricksByLayer.template, ['buff-self']);
  assert.equal(index.capabilities[0].hasCaveat, true);
  assert.deepEqual(index.unsupported, ['not-available']);
  assert(!JSON.stringify(index).includes('500'));
});
test('lookup returns exact parameter and caveat bytes', () => {
  const c = catalog(), i = catalogIndex(c);
  const r = catalogLookup(c, i, {bricks: [['effect', 'damage']], capabilities: ['effect.damage@1']});
  assert.deepEqual(r.bricks, [c.bricks[0]]);
  assert.deepEqual(r.capabilities, c.constraints.planned);
  assert.equal(r.semanticQualified, false);
  r.bricks[0].params[0].max = 1;
  assert.equal(c.bricks[0].params[0].max, 500);
});
test('unknown, duplicate, empty and malformed lookups fail closed', () => {
  const c = catalog(), i = catalogIndex(c);
  for (const q of [
    {bricks: [['effect', 'fake']], capabilities: []},
    {bricks: [], capabilities: ['fake']},
    {bricks: [['effect', 'damage'], ['effect', 'damage']], capabilities: []},
    {bricks: [], capabilities: []},
    {bricks: ['damage'], capabilities: []},
    {bricks: [['effect', 'damage']], capabilities: [], answer: 'leak'},
  ]) assert.throws(() => catalogLookup(c, i, q));
});
test('changed catalog or revision invalidates the index', () => {
  const c = catalog(), i = catalogIndex(c); c.bricks[0].params[0].max = 999;
  assert.throws(() => catalogLookup(c, i, {bricks: [['effect', 'damage']], capabilities: []}), /CATALOG_DRIFT/);
  const clean = catalog(), other = {...catalogIndex(clean), revision: 'other'};
  assert.throws(() => catalogLookup(clean, other, {bricks: [['effect', 'damage']], capabilities: []}), /REVISION/);
});
test('bounded lookups and exact revision bundle keys', () => {
  const c = catalog();
  assert.throws(() => catalogLookup(c, catalogIndex(c), {bricks: Array(49).fill(['effect', 'damage']), capabilities: []}), /LIMIT/);
  assert.throws(() => createIndexBundle({wrong: c}, 'hash'), /REVISION/);
  assert.equal(createIndexBundle({rev: c}, 'hash').sourceCatalogsSha256, 'hash');
});
test('every indexed contract is retrievable without loss', () => {
  const c = catalog(), i = catalogIndex(c);
  for (const b of c.bricks) assert.deepEqual(catalogLookup(c, i, {bricks: [[b.layer, b.id]], capabilities: []}).bricks[0], b);
});
