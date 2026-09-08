import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { sha, validateRecords, SLOTS } from './intake.mjs';
import { INTENT_SEEDS } from './whole-intent-seeds-v1.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
export function buildWholeIntent(records) {
  validateRecords(records);
  return Object.entries(INTENT_SEEDS).map(([key, reviewed]) => {
    const source = records.find(h => h.id === `community37-${key}`); assert(source);
    assert.equal(sha(source.originalText), source.originalSha256);
    for (const text of reviewed.identity) assert(source.originalText.includes(text), `IDENTITY_QUOTE:${source.id}:${text}`);
    assert.deepEqual(Object.keys(reviewed.slots).sort(), [...SLOTS].sort());
    const slots = SLOTS.map(slot => {
      const s = source.slots.find(s => s.slot === slot), intent = reviewed.slots[slot];
      assert.equal(sha(s.originalText), s.originalSha256);
      assert(intent.steps.length && intent.limits.length && intent.forbidden.length && intent.unknown.length);
      for (const a of Object.values(intent)) assert(Array.isArray(a) && a.every(x => typeof x === 'string' && /^[a-zA-Z0-9_]+$/.test(x)));
      return { slot, name: s.name, originalText: s.originalText, sourceSha256: s.originalSha256,
        sourceContext: { start: source.originalText.indexOf(s.originalText), text: s.originalText }, ...intent,
        reviewMeaning: 'assistant source-intent annotation; tags are not engine identifiers or execution recipes',
        negativePolicy: 'forbidden combines explicit prohibitions and closed-world warnings against unlicensed additions; not all are literal source negatives',
        semanticQualification: 'needs atom-to-source entailment adjudication and exact mechanism lowering',
        compilerVerified: false, behaviorVerified: false, trainingAdmitted: false };
    });
    assert(slots.every(s => s.sourceContext.start >= 0));
    for (const r of reviewed.relations) assert(SLOTS.includes(r.from) && SLOTS.includes(r.to) && r.from !== r.to);
    return { id: source.id, name: source.name, sourceFamily: source.sourceFamily, sourceSha256: source.originalSha256,
      originalText: source.originalText, identityEvidence: reviewed.identity, slots, relations: reviewed.relations,
      reviewScope: reviewed.reviewScope, fullSourceReadByAssistant: true, ownerApproved: false,
      allSixSlotsAnnotated: true, completeExecutableGold: false, historicallyExposed: true,
      split: 'candidate-review-only', freshBlind: false, trainingAdmitted: false,
      reasoning: 'capture full interdependent mechanics before admitting whole-hero SFT; never substitute legacy templates or six independent fact cards' };
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(process.argv[2]); assert.equal(path.dirname(out), here); assert(!fs.existsSync(out));
  const data = buildWholeIntent(JSON.parse(fs.readFileSync(path.join(here,'intake-v1/review-queue.private.json'),'utf8')));
  const count = field => data.reduce((sum,h) => sum+h.slots.reduce((n,s)=>n+s[field].length,0),0);
  const summary = { schema: 'ggd-whole-hero-intent-review@1', createdAt: new Date().toISOString(),
    heroes: data.length, slots: data.length*6, sourceFamilies: new Set(data.map(h=>h.sourceFamily)).size,
    steps: count('steps'), constraints: count('limits'), negativeWarnings: count('forbidden'), unknowns: count('unknown'),
    explicitRelations: data.flatMap(h=>h.relations).filter(r=>r.certainty==='explicit').length,
    inferredCategoryRelations: data.flatMap(h=>h.relations).filter(r=>r.certainty!=='explicit').length,
    datasetSha256: sha(data), generatorSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))),
    reviewSeedSha256: sha(fs.readFileSync(path.join(here,'whole-intent-seeds-v1.mjs'))),
    allOriginalBytesVerified: true, oldMappingsCopied: false, trainingAdmitted: 0, completeExecutableGold: 0, freshBlind: false,
    limitations: ['tags are provisional concepts, not legal engine identifiers',
      'six-slot structural coverage is not proof every atom is semantically adjudicated',
      'explicit vs inferred relations separated; inferred category edges are not asserted source slot dependencies',
      'unprovided rules remain unknown; no numeric filling or template-default ground truth'] };
  fs.mkdirSync(out);
  for(const [f,v] of Object.entries({'manifest.json':summary,'whole-heroes.private.json':data}))
    fs.writeFileSync(path.join(out,f),JSON.stringify(v,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(summary,null,2));
}
