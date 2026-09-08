import test from 'node:test';
import assert from 'node:assert/strict';
import { replay } from './replay.mjs';
test('same frozen historical scores; packaging benefit without semantic repair', async () => {
  const r = await replay();
  assert.equal(r.newInferenceCalls, 0); assert.equal(r.editorIntegrated, false);
  assert.deepEqual(Object.fromEntries(Object.entries(r.arms).map(([k, a]) => [k, [a.original.passed, a.normalized.passed]])), {
    '9b': [81, 81], '12b': [60, 92], '27b': [91, 91],
  });
  for (const arm of Object.values(r.arms)) assert.equal(arm.regressions.length, 0);
  assert.equal(r.arms['12b'].normalized.unsafe, 0);
  assert.equal(r.arms['9b'].normalized.unsafe, 7);
});
