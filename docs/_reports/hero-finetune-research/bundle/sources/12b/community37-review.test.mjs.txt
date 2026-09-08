import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommunityReviews } from './community37-review.mjs';
import { REVIEWS37 } from './community37-review-seeds.mjs';
import { sha } from './intake.mjs';
const records = JSON.parse(fs.readFileSync(new URL('./intake-v1/review-queue.private.json', import.meta.url)));
const clone = structuredClone;
test('37 complete source reads, 222 annotated slots, no old mapping or training promotion', () => {
  const r = buildCommunityReviews(records);
  assert.equal(r.rows.length, 37); assert.equal(r.quarantine.length, 222);
  assert.equal(r.rows.flatMap(h => h.slots).length, 222); assert.equal(r.candidates.length, 36);
  for (const h of r.rows) {
    assert(h.status.fullHeroTextRead && h.status.globalReviewNotesRead);
    assert(!h.status.trainingAdmitted && !h.status.mappingAdmitted && !h.status.freshBlindEligible);
    assert(h.source.text.endsWith(h.globalReview.original));
    for (const s of h.slots) for (const span of s.source.evidence.spans) {
      assert.equal(h.source.text.slice(span.startUtf16, span.endUtf16), s.source.text);
    }
  }
  assert(!r.candidates.some(h => h.heroId === 'community37-32'));
  assert(r.quarantine.every(r => !r.trainingAdmitted));
});
test('model inputs preserve originals but exclude all review and answer fields', () => {
  for (const input of buildCommunityReviews(records).inputs) {
    assert.deepEqual(Object.keys(input).sort(), ['hero', 'id', 'slots']);
    assert.deepEqual(Object.keys(input.hero).sort(), ['name', 'originalText', 'sourceSha256']);
    for (const s of input.slots) assert.deepEqual(Object.keys(s).sort(), ['name', 'originalText', 'slot', 'sourceSha256']);
  }
});
test('missing hero review fails closed', () => { const x = clone(REVIEWS37); delete x['37']; assert.throws(() => buildCommunityReviews(records, x), /REVIEW_SET_INCOMPLETE/); });
test('five-slot annotation fails closed', () => { const x = clone(REVIEWS37); x['01'].slots.pop(); assert.throws(() => buildCommunityReviews(records, x), /SIX_SEED_SLOTS_REQUIRED/); });
test('swapped annotation is not silently paired to another source slot', () => {
  const x = clone(REVIEWS37); [x['01'].slots[1], x['01'].slots[2]] = [x['01'].slots[2], x['01'].slots[1]];
  assert.throws(() => buildCommunityReviews(records, x), /REVIEW_ANNOTATIONS_DRIFT/);
});
test('source hash drift is rejected, even if changed text is rehashed', () => {
  const x = clone(records); x[0].originalText += 'unreviewed'; x[0].originalSha256 = sha(x[0].originalText);
  assert.throws(() => buildCommunityReviews(x), /REVIEW_RECORDS_DRIFT/);
});
test('legacy mapping cannot be promoted upstream', () => {
  const x = clone(records); x[0].slots[0].review.mapping = 'approved';
  assert.throws(() => buildCommunityReviews(x), /MAPPING_PROMOTED/);
});
test('concepts never make an engine support claim; ambiguous cases remain questions', () => {
  const r = buildCommunityReviews(records);
  assert(r.rows.every(h => h.status.currentEngineCapability === 'pending-adjudication'));
  assert.equal(r.rows.flatMap(h => h.slots).flatMap(s => s.adjudicationQuestions).length, 4);
});
