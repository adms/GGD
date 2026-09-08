import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { checkInventory } from './hero-status-inventory-check.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const directory = path.join(root, 'docs/_reports/hero-character-status-20260909');
const original = JSON.parse(fs.readFileSync(path.join(directory, 'inventory.json'), 'utf8'));
const markdown = fs.readFileSync(path.join(directory, '全角色狀態清單.md'), 'utf8');
const cache = new Map();
const source = item => {
  if (!cache.has(item.path)) cache.set(item.path, execFileSync('git', ['show', `${item.commit}:${item.path}`], { cwd: root }));
  return cache.get(item.path);
};
test('all 163 rows, 159 pinned Git sources and Markdown agree; local/production evidence remains unverified', () => {
  const result = checkInventory(original, markdown, source);
  assert.equal(result.verifiedGitSources, 159);
  assert.equal(result.localEvidenceNotIndependentlyRevalidated, 2);
});
test('cannot promote the snapshot to production verification', () => {
  assert.throws(() => checkInventory({ ...original, productionVerified: true }, markdown, source), /SNAPSHOT_IS_NOT_PRODUCTION_VERIFICATION/);
});
test('duplicate IDs fail', () => {
  const changed = structuredClone(original);
  changed.rows[1].id = changed.rows[0].id;
  assert.throws(() => checkInventory(changed, markdown, source), /DUPLICATE_ID/);
});
test('hidden-versus-listed swap cannot pass by preserving aggregate counts', () => {
  const changed = structuredClone(original);
  const listed = changed.rows.find(row => row.category === 'listed');
  const hidden = changed.rows.find(row => row.category === 'hidden');
  [listed.category, hidden.category] = [hidden.category, listed.category];
  [listed.status, hidden.status] = [hidden.status, listed.status];
  assert.throws(() => checkInventory(changed, markdown, source), /WRONG_STATUS/);
});
test('source tampering and incomplete Markdown fail', () => {
  assert.throws(() => checkInventory(original, markdown, () => Buffer.from('{}')), /content\/config\/roster.json/);
  assert.throws(() => checkInventory(original, markdown.replace('蟬在叫人壞掉 - 龍宮禮奈', '另一角色'), source), /MARKDOWN_ROW_MISMATCH/);
});
