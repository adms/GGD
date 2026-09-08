import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { SLOTS, sha, modelInput, validateRecords } from './intake.mjs';
import { REVIEWS, RELATIONS, M10_REQUIREMENTS } from './review-seeds-v1.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const M10_PATH = 'GGD社群英雄上傳內容_37名/機制補強與驗收.md';
export function sectionM10(text) {
  const start = text.indexOf('### M10｜');
  const end = text.indexOf('\n### M11｜', start);
  assert(start >= 0 && end > start, 'M10_SECTION_BOUNDARY_MISSING');
  return { text: text.slice(start, end), documentStartUtf16: start, documentEndUtf16: end };
}
export function anchor(text, quote) {
  assert.equal(typeof quote, 'string');
  assert(quote.length > 0, 'EMPTY_QUOTE');
  const spans = [];
  for (let at = text.indexOf(quote); at >= 0; at = text.indexOf(quote, at + quote.length)) {
    spans.push({ startUtf16: at, endUtf16: at + quote.length });
  }
  assert(spans.length, `SOURCE_QUOTE_NOT_FOUND: ${quote}`);
  return { quote, spans, offsetConvention: 'JavaScript UTF-16 code units; end exclusive' };
}

export function buildReviews(records, supplemental, seeds = REVIEWS, relations = RELATIONS, m10 = M10_REQUIREMENTS) {
  validateRecords(records);
  const index = new Map(records.map(h => [h.id, h]));
  const reviews = [];
  for (const [id, seed] of Object.entries(seeds)) {
    const h = index.get(id); assert(h, 'REVIEW_HERO_NOT_FOUND');
    assert(seed.identity.length, 'IDENTITY_REQUIREMENTS_MISSING');
    assert.deepEqual(Object.keys(seed.slots).sort(), [...SLOTS].sort(), 'SIX_REVIEW_SLOTS_REQUIRED');
    const sources = [{ id: 'hero-original', text: h.originalText, sha256: h.originalSha256,
      provenance: h.sourceReference, authority: 'historical GGD adaptation; not new Owner approval' }];
    const atoms = [];
    const add = (source, dimension, slot, quote, mandatory = true) => {
      atoms.push({ id: `${id}:${dimension}:${slot ?? 'HERO'}:${atoms.length + 1}`, dimension, slot,
        mandatory, sourceId: source.id, sourceSha256: source.sha256, evidence: anchor(source.text, quote),
        interpretationStatus: 'assistant-selected-source-obligation; not a template Gold label' });
    };
    for (const quote of seed.identity) add(sources[0], 'identity-and-adaptation', null, quote);
    for (const slot of SLOTS) {
      assert(seed.slots[slot].length, 'EMPTY_SLOT_REQUIREMENTS');
      const s = h.slots.find(s => s.slot === slot);
      for (const quote of seed.slots[slot]) {
        anchor(s.originalText, quote); // Evidence must be in this slot, not merely elsewhere in the hero.
        add(sources[0], 'slot-source-obligation', slot, quote);
      }
    }
    if (id === 'community37-32') {
      assert(supplemental?.text, 'M10_SUPPLEMENT_MISSING');
      const source = { id: 'm10-ggd-proposal', text: supplemental.text, sha256: sha(supplemental.text),
        provenance: `${M10_PATH}#M10`, authority: 'supplemental GGD proposal; not independently Owner-approved',
        documentSha256: supplemental.documentSha256, documentStartUtf16: supplemental.documentStartUtf16,
        documentEndUtf16: supplemental.documentEndUtf16 };
      sources.push(source);
      for (const [slot, quote, type] of m10) {
        assert(SLOTS.includes(slot), 'UNKNOWN_M10_SLOT');
        assert(['mechanics', 'proposal-not-mandatory'].includes(type), 'UNKNOWN_M10_REQUIREMENT_TYPE');
        add(source, type === 'mechanics' ? 'supplemental-mechanics' : 'parameter-proposal', slot, quote,
          type === 'mechanics');
      }
    }
    const links = relations.filter(r => r.heroId === id).map(r => {
      assert(SLOTS.includes(r.from) && SLOTS.includes(r.to) && r.from !== r.to, 'INVALID_CROSS_SLOT_RELATION');
      return { ...r, sourceId: 'hero-original', sourceSha256: h.originalSha256, evidence: anchor(h.originalText, r.quote) };
    });
    // Independent Q/EX and the explicit curse reversal are semantic controls, not optional metadata.
    const expectedLinks = RELATIONS.filter(r => r.heroId === id);
    for (const expected of expectedLinks) assert(links.some(r => r.from === expected.from && r.to === expected.to && r.kind === expected.kind), 'SOURCE_RELATION_DROPPED');
    reviews.push({ id, name: h.name, sourceFamily: h.sourceFamily, exposure: h.exposure,
      stage: 'assistant-source-atomization-v1', allSixSlotsRead: true,
      completeConstraintCoverageCertified: false, ownerApproved: false,
      mappingAdmitted: false, trainingAdmitted: false, freshBlindEligible: false,
      sources, atoms, relations: links, cautions: seed.cautions,
      unresolvedWork: ['Independent coverage review, including global review notes and presentation constraints',
        'Current capability adjudication and behavior probes', 'Template mapping review before training admission'],
    });
  }
  return reviews;
}

export function reviewInput(h, review) {
  assert.equal(h.id, review.id, 'INPUT_HERO_MISMATCH');
  assert.equal(h.originalSha256, review.sources[0].sha256, 'INPUT_SOURCE_MISMATCH');
  const input = { ...modelInput(h), sources: review.sources.map(s => ({ id: s.id, text: s.text,
    sha256: s.sha256, authority: s.authority })) };
  // A criterion cannot depend on a supplemental document hidden from the model.
  for (const a of review.atoms) {
    const source = input.sources.find(s => s.id === a.sourceId);
    assert(source && sha(source.text) === a.sourceSha256, 'HIDDEN_OR_CHANGED_REQUIREMENT_SOURCE');
    anchor(source.text, a.evidence.quote);
  }
  return input;
}

export function writeReviews(root, out) {
  assert(!fs.existsSync(out), 'REFUSE_OVERWRITE_OUTPUT');
  const queuePath = path.join(HERE, 'intake-v1/review-queue.private.json');
  const records = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  const doc = fs.readFileSync(path.join(root, M10_PATH), 'utf8');
  const reviews = buildReviews(records, { ...sectionM10(doc), documentSha256: sha(doc) });
  const inputs = reviews.map(r => reviewInput(records.find(h => h.id === r.id), r));
  const manifest = { schema: 'ggd-hero12b-source-review@1', generatedAt: new Date().toISOString(),
    counts: { heroes: reviews.length, slotsRead: reviews.length * 6,
      atoms: reviews.flatMap(r => r.atoms).length, relations: reviews.flatMap(r => r.relations).length,
      optionalParameterProposals: reviews.flatMap(r => r.atoms).filter(a => !a.mandatory).length,
      templateTrainingAdmitted: 0, freshBlindAdmitted: 0 },
    inputSha256: sha(inputs), reviewSha256: sha(reviews),
    pins: [queuePath, path.join(root, M10_PATH), fileURLToPath(import.meta.url), path.join(HERE, 'review-seeds-v1.mjs'), path.join(HERE, 'intake.mjs')]
      .map(p => ({ path: path.relative(root, p), sha256: sha(fs.readFileSync(p)) })),
    completeConstraintCoverageCertified: false, modelInferenceStarted: false, releaseQualified: false,
    limits: ['This is selected source obligation tracing, not a complete scoring specification.',
      'All eight heroes were historically exposed; none is new blind evidence.',
      'M10 proposal is supplied explicitly in the development input, not hidden in Gold.',
      'Anchored quotes and six-slot presence do not prove interpretation or recipe correctness.'],
  };
  fs.mkdirSync(out, { recursive: true });
  for (const [name, value] of Object.entries({ 'manifest.json': manifest, 'requirements.private.json': reviews, 'model-inputs.json': inputs })) {
    fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  }
  return manifest;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3, 'USAGE: node source-review.mjs NEW_OUTPUT_DIRECTORY');
  console.log(JSON.stringify(writeReviews(path.resolve(HERE, '../..'), path.resolve(process.argv[2])), null, 2));
}
