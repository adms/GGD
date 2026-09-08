import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { REVIEWS, RELATIONS } from './review-seeds-v1.mjs';
import { buildReviews, reviewInput, anchor, sectionM10 } from './source-review.mjs';
import { sha } from './intake.mjs';

const records = JSON.parse(fs.readFileSync(new URL('./intake-v1/review-queue.private.json', import.meta.url), 'utf8'));
const doc = fs.readFileSync(new URL('../../GGD社群英雄上傳內容_37名/機制補強與驗收.md', import.meta.url), 'utf8');
const supplemental = { ...sectionM10(doc), documentSha256: sha(doc) };
test('eight hero source review anchors every quote and covers all six slots without Gold promotion', () => {
  const result = buildReviews(records, supplemental);
  assert.equal(result.length, 8);
  assert(result.flatMap(r => r.atoms).length > 150);
  assert.equal(result.flatMap(r => r.relations).length, 4);
  for (const r of result) {
    assert.equal(r.trainingAdmitted, false); assert.equal(r.ownerApproved, false);
    assert.equal(r.completeConstraintCoverageCertified, false); assert.equal(r.freshBlindEligible, false);
    for (const a of r.atoms) {
      const source = r.sources.find(s => s.id === a.sourceId);
      for (const span of a.evidence.spans) assert.equal(source.text.slice(span.startUtf16, span.endUtf16), a.evidence.quote);
    }
  }
});
test('source spelling changes fail closed', () => {
  const changed = structuredClone(records); changed[0].originalText += '新增';
  assert.throws(() => buildReviews(changed, supplemental), /HERO_SOURCE_CHANGED/);
});
test('source claims must actually occur inside their assigned slot', () => {
  const seeds = structuredClone(REVIEWS); seeds['community7-lux'].slots.E.push('鎖足 0.8 秒');
  assert.throws(() => buildReviews(records, supplemental, seeds), /SOURCE_QUOTE_NOT_FOUND/);
});
test('missing a complete slot or hero identity is rejected', () => {
  const seeds = structuredClone(REVIEWS); delete seeds['community7-lux'].slots.EX;
  assert.throws(() => buildReviews(records, supplemental, seeds), /SIX_REVIEW_SLOTS_REQUIRED/);
  const seeds2 = structuredClone(REVIEWS); seeds2['community7-lux'].identity = [];
  assert.throws(() => buildReviews(records, supplemental, seeds2), /IDENTITY_REQUIREMENTS_MISSING/);
});
test('critical cross-slot dependencies cannot silently disappear', () => {
  assert.throws(() => buildReviews(records, supplemental, REVIEWS, RELATIONS.slice(0, -1)), /SOURCE_RELATION_DROPPED/);
});
test('M10 input is mandatory for M10-only criteria', () => {
  assert.throws(() => buildReviews(records, null), /M10_SUPPLEMENT_MISSING/);
  const review = buildReviews(records, supplemental).find(r => r.id === 'community37-32');
  const h = records.find(r => r.id === review.id);
  const input = reviewInput(h, review);
  assert(input.sources.some(s => s.text.includes('同一來源 R 萎靡')));
  assert.equal(review.atoms.filter(a => a.dimension === 'parameter-proposal').length, 2);
  assert(review.atoms.filter(a => a.dimension === 'parameter-proposal').every(a => a.mandatory === false));
  const tampered = structuredClone(review); tampered.sources = tampered.sources.slice(0, 1);
  assert.throws(() => reviewInput(h, tampered), /HIDDEN_OR_CHANGED_REQUIREMENT_SOURCE/);
});
test('model inputs exclude old answers, review labels and compiled references', () => {
  const review = buildReviews(records, supplemental).find(r => r.id === 'community7-lux');
  const input = reviewInput(records.find(h => h.id === review.id), review);
  assert.deepEqual(Object.keys(input).sort(), ['hero', 'id', 'slots', 'sources']);
  assert(!JSON.stringify(input).includes('tpl-'));
  for (const field of ['cautions', 'atoms', 'relations', 'legacyTemplate', 'reviewNotes', 'trainingAdmitted']) assert(!(field in input));
});
test('anchors expose UTF-16 offsets and all occurrences rather than guessing one', () => {
  assert.deepEqual(anchor('😀甲乙甲', '甲').spans, [{ startUtf16: 2, endUtf16: 3 }, { startUtf16: 4, endUtf16: 5 }]);
  assert.throws(() => anchor('甲', ''), /EMPTY_QUOTE/);
  assert.throws(() => anchor('甲', '乙'), /SOURCE_QUOTE_NOT_FOUND/);
  assert.throws(() => sectionM10('M10 無標題'), /M10_SECTION_BOUNDARY_MISSING/);
});
