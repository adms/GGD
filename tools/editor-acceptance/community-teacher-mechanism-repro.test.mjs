import test from 'node:test';
import assert from 'node:assert/strict';
import { reproduce, matchesKnownGap } from './community-teacher-mechanism-repro.mjs';

test('six current recipes reproduce the original full-compiler gameplay exactly', () => {
  const rows = reproduce();
  assert.equal(rows.length, 6);
  assert(rows.every(row => row.reproduced && row.runtimeTested === false));
});

test('a resource mutation cannot pass as the known damage-only placeholder', () => {
  const row = reproduce('resource-state')[0];
  const changed = structuredClone(row.compiled);
  changed.passive.ranks[0].hooks[0].effects.push({ kind: 'applyStatus', statusId: 'test-only' });
  assert.equal(matchesKnownGap(changed, 'resource-state'), false);
});

test('a targeted shield cannot pass as the known self-only placeholder', () => {
  const row = reproduce('ally-shield')[0];
  const changed = structuredClone(row.compiled);
  changed.castType = 'targeted';
  changed.targetsEnemies = false;
  assert.equal(matchesKnownGap(changed, 'ally-shield'), false);
});

test('unknown family fails closed rather than producing an empty success', () => {
  assert.throws(() => reproduce('unknown'), /BAD_FAMILY/);
});
