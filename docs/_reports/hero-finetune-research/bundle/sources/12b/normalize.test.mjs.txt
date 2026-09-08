import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFinal } from './normalize.mjs';
const run = (text, extra = {}) => normalizeFinal({ text, channel: 'final', finishReason: 'stop', ...extra });
for (const text of ['{"verdict":"supported"}', '```json\n{"verdict":"supported"}\n```', '```\r\n{"verdict":"supported"}\r\n```']) {
  test(`whole final only: ${JSON.stringify(text)}`, () => {
    assert.deepEqual(run(text).value, { verdict: 'supported' });
    assert.equal(run(text).semanticQualified, false);
  });
}
for (const text of [
  '說明：{"verdict":"supported"}', '{"verdict":"supported"} 完成',
  '{"a":1}{"b":2}', '```json\n{"a":1}\n```\n```json\n{"b":2}\n```',
  '<think>{"verdict":"supported"}</think>', '```javascript\n{"a":1}\n```',
  '```json\n{"a":1}', '{"a":1,}', "{'a':1}", '{}\n更多解釋',
  'null', '[]', '"text"', '{"a":1,"a":2}', '{"x":{"a":1,"a":2}}',
  '{"a":1,"\\u0061":2}', '{"__proto__":{"admin":true}}',
  '{"x":[{"constructor":1}]}', '{"n":1e999}',
]) test(`reject rather than repair: ${JSON.stringify(text)}`, () => assert.equal(run(text).ok, false));
for (const finishReason of ['length', 'cancelled', 'timeout', null, 'unknown'])
  test(`reject finish=${finishReason}`, () => assert.equal(run('{}', { finishReason }).ok, false));
test('channel separation is upstream, never guessed from text', () => {
  for (const channel of ['reasoning', 'mixed', undefined]) assert.equal(run('{}', { channel }).ok, false);
});
test('strings, Unicode keys, escaped quotes and arrays survive unchanged', () => {
  const value = { 台詞: '「給我倒下！」', refs: ['Q', 'EX'], nested: [{ a: 1 }, { a: 2 }], s: '{"fake":2}', escaped: '\\"' };
  assert.deepEqual(run(JSON.stringify(value)).value, value);
});
test('valid JSON remains unchanged even if its schema or semantics are wrong', () => {
  const value = { decision: 'accept', templateIds: ['invented-id'], onConflict: 'reject' };
  assert.deepEqual(run(JSON.stringify(value)).value, value);
});
test('depth and byte limits fail closed', () => {
  assert.equal(run('{"x":' + '['.repeat(65) + '0' + ']'.repeat(65) + '}').ok, false);
  assert.equal(normalizeFinal({ text: '{}', channel: 'final', finishReason: 'stop' }, { maxBytes: 1 }).ok, false);
});
