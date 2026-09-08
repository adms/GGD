import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { factDataset, scoreFacts } from './semantic-facts.mjs';
import { FACT_SEEDS } from './semantic-fact-seeds.mjs';
const records = JSON.parse(fs.readFileSync(new URL('./intake-v1/review-queue.private.json', import.meta.url)));
const rows = factDataset(records);
test('96 source-anchored facts, 12 train and 4 source-family dev heroes; no current four dev', () => {
  assert.equal(rows.length, 16); assert.equal(rows.filter(r => r.split === 'train').length, 12);
  assert.equal(rows.filter(r => r.split === 'dev').length, 4);
  assert(rows.every(r => !['community37-32', 'community7-warwick', 'community7-leesin', 'community7-missfortune'].includes(r.heroId)));
  for (const r of rows) assert.equal(scoreFacts(r.target, r).correct, 6);
});
test('input claim objects exclude expected verdict/evidence; full original preserved', () => {
  for (const r of rows) {
    const input = JSON.parse(r.messages[1].content);
    assert(input.claims.every(c => Object.keys(c).sort().join(',') === 'id,text'));
    assert.equal(input.source.originalText, records.find(h => h.id === r.heroId).originalText);
  }
});
test('different output order is accepted but repeated or unknown claims are not', () => {
  const r = rows[0], v = structuredClone(r.target); v.claims.reverse(); assert.equal(scoreFacts(v, r).correct, 6);
  v.claims[0] = v.claims[1]; assert.throws(() => scoreFacts(v, r), /DUPLICATE/);
});
test('unanchored target or output evidence fails closed', () => {
  const seeds = structuredClone(FACT_SEEDS); seeds['02'][0][2] = 'not in source'; assert.throws(() => factDataset(records, seeds), /SOURCE_QUOTE_NOT_FOUND/);
  const r = rows[0], v = structuredClone(r.target), c = v.claims.find(c => c.verdict !== 'not_specified');
  c.evidence = ['invented words']; assert.throws(() => scoreFacts(v, r), /UNANCHORED/);
});
test('supported wrong claims count as wrong support, never auto acceptance', () => {
  const r = rows[0], v = structuredClone(r.target); v.claims.find(c => c.verdict === 'refuted').verdict = 'supported';
  const s = scoreFacts(v, r); assert.equal(s.wrongSupport, 1); assert.equal(s.automaticAccept, false);
});
