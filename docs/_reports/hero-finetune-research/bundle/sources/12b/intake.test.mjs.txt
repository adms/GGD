import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { sha, communityRecords, sevenRecords, validateRecords, modelInput, auditPins, buildIntake } from './intake.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p)));
const base = 'outputs/community37-corrected-dataset-20260907-v1/data';
const heroes = read(`${base}/hero-reference.json`), refs = read(`${base}/corrected-reference.json`), q = read(`${base}/template-quarantine.json`);
const seven = read('outputs/forge-final-three-hours-20260906/seven-heroes-source-v1/heroes.json');
const original = () => communityRecords(heroes, refs, q);

test('44 complete hero sources; no implicit training or new blind-test admission', () => {
  const records = [...original(), ...sevenRecords(seven)], result = validateRecords(records);
  assert.equal(result.heroes, 44); assert.equal(result.slots, 264);
  assert.equal(result.quarantinedMappings, 222); assert.equal(result.pendingMappings, 42);
  assert.equal(result.trainingAdmitted, 0); assert.equal(result.freshBlindTestAdmitted, 0);
  assert.equal(new Set(sevenRecords(seven).map(h => h.sourceFamily)).size, 1);
});
test('source-only model input is an explicit allow-list with original line breaks', () => {
  for (const h of [...original(), ...sevenRecords(seven)]) {
    const input = modelInput(h);
    assert.deepEqual(Object.keys(input), ['id', 'hero', 'slots']);
    assert.equal(input.hero.originalText, h.originalText);
    for (const s of input.slots) assert.deepEqual(Object.keys(s), ['slot', 'name', 'originalText', 'sourceSha256']);
    const names = []; const walk = v => { if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { names.push(k); walk(x); } }; walk(input);
    for (const prohibited of ['target', 'acceptedTargets', 'legacyTemplate', 'reviewNotes', 'review', 'compiled', 'templateIds']) assert(!names.includes(prohibited));
  }
});
test('source or slot hash corruption is rejected', () => {
  const hs = structuredClone(heroes); hs[0].sourceOwnerText += '\n';
  assert.throws(() => communityRecords(hs, refs, q), /HERO_SOURCE_CHANGED/);
  const rs = structuredClone(refs); rs[0].ownerOriginal += '假的';
  assert.throws(() => communityRecords(heroes, rs, q), /SLOT_SOURCE_CHANGED/);
});
test('template promotion, invented Owner approval, missing or altered quarantine rejected', () => {
  const rs = structuredClone(refs); rs[0].templateTrainingAdmitted = true;
  assert.throws(() => communityRecords(heroes, rs, q), /QUARANTINE_PROMOTED/);
  rs[0].templateTrainingAdmitted = false; rs[0].ownerGold = true;
  assert.throws(() => communityRecords(heroes, rs, q), /OWNER_GOLD_FABRICATED/);
  assert.throws(() => communityRecords(heroes, refs, q.slice(1)), /QUARANTINE_COUNT/);
  const altered = structuredClone(q); altered[0].template.ref = 'made-up';
  assert.throws(() => communityRecords(heroes, refs, altered), /QUARANTINE_TEMPLATE_CHANGED/);
});
test('missing slots and duplicate IDs cannot pass a hero count', () => {
  const s = structuredClone(seven); delete s[0].recipe.moves.EX;
  assert.throws(() => sevenRecords(s), /SIX_SLOTS_REQUIRED/);
  const rows = original(); rows[1].id = rows[0].id;
  assert.throws(() => validateRecords(rows), /DUPLICATE_HERO/);
});
test('post-intake metadata cannot silently be upgraded into training approval', () => {
  const rows = original(); rows[0].slots[0].review.trainingAdmitted = true;
  assert.throws(() => validateRecords(rows), /UNREVIEWED_TRAINING_ADMISSION/);
});
test('upstream pin audit distinguishes changed/missing/matched and prohibits traversal', () => {
  const pins = auditPins(root, [
    { path: `${base}/hero-reference.json`, sha256: sha(fs.readFileSync(path.join(root, base, 'hero-reference.json'))) },
    { path: `${base}/hero-reference.json`, sha256: '0'.repeat(64) },
    { path: `${base}/not-a-real-file.json`, sha256: '0'.repeat(64) },
  ]);
  assert.deepEqual(pins.map(p => p.status), ['matches', 'changed', 'missing']);
  assert.throws(() => auditPins(root, [{ path: '../outside', sha256: '' }]), /PIN_OUTSIDE_WORKSPACE/);
});
test('generated bundle roundtrip, stable source pins and no overwrite', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ggd-12b-intake-test-'));
  try {
    const out = path.join(tmp, 'bundle'); const m = buildIntake(root, out);
    assert.equal(m.counts.heroes, 44); assert.equal(m.wholeHeroSemanticReviewCompleted, false);
    assert.equal(m.releaseQualified, false); assert.equal(m.splitFrozen, false);
    const rows = JSON.parse(fs.readFileSync(path.join(out, 'review-queue.private.json')));
    assert.deepEqual(validateRecords(rows), m.counts);
    assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'source-inputs.json'))).length, 44);
    assert.throws(() => buildIntake(root, out), /REFUSE_OVERWRITE_OUTPUT/);
  } finally { fs.rmSync(tmp, { recursive: true }); }
});
