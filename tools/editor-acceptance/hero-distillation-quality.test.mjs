import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { qualify } from './hero-distillation-quality.mjs';

const root = new URL('../../docs/_reports/hero-finetune-research/', import.meta.url);
const read = file => JSON.parse(fs.readFileSync(new URL(file, root)));
const reportBytes = fs.readFileSync(new URL('distillation-indexed-v1/projection-verified/report.json', root));
const reportHash = createHash('sha256').update(reportBytes).digest('hex');
const heroes = read('distillation-pairs-v1/heroes.json');
const examples = read('distillation-pairs-v1/examples.json');
const artifacts = read('distillation-pairs-v1/artifacts.json');
const compiled = read('distillation-indexed-v1/projection-verified/compiled.json');
const report = JSON.parse(reportBytes);

test('current fixed review reproduces the retained/excluded task ledger', () => {
  const actual = qualify(heroes, examples, artifacts, compiled, report, reportHash, reportHash);
  const expected = read('distillation-training-v1/quality-reviewed.json');
  for (const field of ['counts', 'rows', 'tasks']) assert.deepEqual(actual[field], expected[field]);
  assert.equal(actual.counts.totalEligible, 124);
  assert.equal(actual.counts.communitySlotsReviewed, 222);
  assert.equal(actual.counts.communitySlotsRetained, 22);
  const row = id => actual.tasks.find(t => t.id === id);
  assert.equal(row('community-review-01-20260907:R').trainingEligible, true);
  assert.equal(row('community-review-01-20260907:PASSIVE').trainingEligible, false);
  assert.equal(row('community-review-01-20260907:HERO').trainingEligible, false);
  assert.equal(row('community-review-32-20260907:HERO').trainingEligible, true);
});
test('different compiled teacher revision cannot inherit the old semantic review', () => {
  assert.throws(() => qualify([], [], {}, {}, {}, 'changed', 'changed'), /REVIEW_NOT_VALID_FOR_DIFFERENT_TEACHER_REVISION/);
  assert.throws(() => qualify([], [], {}, {}, {}, reportHash, 'changed'), /REVIEW_ENGINE_OUTPUT_DRIFT/);
});
test('teacher content changes fail instead of silently retaining eligibility', () => {
  const bad = {...artifacts, [heroes[0].id]: {changed: true}};
  assert.throws(() => qualify(heroes, examples, bad, compiled, report, reportHash, reportHash), /TEACHER_DRIFT/);
});
