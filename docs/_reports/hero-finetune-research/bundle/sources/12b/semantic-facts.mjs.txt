import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { sha, validateRecords } from './intake.mjs';
import { anchor } from './source-review.mjs';
import { FACT_SEEDS, FACT_DEV } from './semantic-fact-seeds.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FACT_SYSTEM = '只依提供的完整 GGD 改編英雄原文判定每項 claim。不要套用其他版本或原作常識。supported=原文明確支持；refuted=與明示機制或限制相反；not_specified=原文沒有足夠資訊，例如未定義的數值。合理猜測不能算 supported。這是來源語意檢查，不是在判斷引擎能否實作。只輸出一個完整 JSON：{"claims":[{"id":"原claim id","verdict":"supported|refuted|not_specified","evidence":["原文連續逐字片段"]}]}。全部 id 各一次、不漏項、不多欄位。supported/refuted 至少一段能支持判斷的引文；not_specified 的 evidence 為 []。不輸出推理或 Markdown。';
const labels = { s: 'supported', r: 'refuted', u: 'not_specified' };

export function factDataset(records, seeds = FACT_SEEDS) {
  validateRecords(records);
  const rows = Object.entries(seeds).map(([key, cards]) => {
    const h = records.find(h => h.id === `community37-${key}`); assert(h && !h.id.endsWith('-32'));
    assert.equal(cards.length, 6);
    const claims = cards.map(([claim, label, quote]) => {
      assert(labels[label], 'UNKNOWN_LABEL');
      assert(label === 'u' ? quote === '' : quote.length >= 2, 'EVIDENCE_CONTRACT');
      if (label !== 'u') anchor(h.originalText, quote);
      return { id: `c-${sha([h.id, claim]).slice(0, 12)}`, text: claim,
        verdict: labels[label], evidence: label === 'u' ? [] : [quote] };
    }).sort((a, b) => a.id.localeCompare(b.id)); // Deterministic label-blind order, not s/r/s/r/u templates.
    assert.equal(new Set(claims.map(c => c.id)).size, 6);
    const source = { id: h.id, name: h.name, originalText: h.originalText, sourceSha256: h.originalSha256 };
    const input = { source, claims: claims.map(({ id, text }) => ({ id, text })) };
    const target = { claims: claims.map(({ id, verdict, evidence }) => ({ id, verdict, evidence })) };
    const messages = [{ role: 'system', content: FACT_SYSTEM }, { role: 'user', content: JSON.stringify(input) }];
    return { id: `facts-${h.id}`, heroId: h.id, sourceFamily: h.sourceFamily, sourceSha256: h.originalSha256,
      split: FACT_DEV.includes(key) ? 'dev' : 'train', messages, requestDigest: sha(messages), target,
      authority: 'assistant-reviewed source entailment task; no new Owner approval or runtime mapping admission',
      historicallyExposed: true, freshBlind: false, fullHeroRecipeTrainingAdmitted: false };
  });
  const trainFamilies = new Set(rows.filter(r => r.split === 'train').map(r => r.sourceFamily));
  assert(rows.filter(r => r.split === 'dev').every(r => !trainFamilies.has(r.sourceFamily)), 'SOURCE_FAMILY_LEAK');
  return rows;
}

export function scoreFacts(value, row) {
  assert(value && Object.keys(value).length === 1 && Array.isArray(value.claims), 'RESPONSE_SHAPE');
  assert.equal(value.claims.length, row.target.claims.length, 'CLAIM_COUNT');
  const ids = new Set(), source = JSON.parse(row.messages[1].content).source.originalText;
  const results = value.claims.map(c => {
    assert.deepEqual(Object.keys(c).sort(), ['evidence', 'id', 'verdict']);
    assert(!ids.has(c.id), 'DUPLICATE_CLAIM'); ids.add(c.id);
    const gold = row.target.claims.find(g => g.id === c.id); assert(gold, 'UNKNOWN_CLAIM');
    assert(Object.values(labels).includes(c.verdict) && Array.isArray(c.evidence));
    assert(c.evidence.every(q => typeof q === 'string' && q.length >= 2 && source.includes(q)), 'UNANCHORED_EVIDENCE');
    assert(c.verdict === 'not_specified' ? c.evidence.length === 0 : c.evidence.length > 0, 'EVIDENCE_CARDINALITY');
    return { id: c.id, expected: gold.verdict, actual: c.verdict, correct: c.verdict === gold.verdict,
      wrongSupport: c.verdict === 'supported' && gold.verdict !== 'supported',
      evidenceEntailmentHumanReviewRequired: true };
  });
  return { results, total: results.length, correct: results.filter(r => r.correct).length,
    wrongSupport: results.filter(r => r.wrongSupport).length, automaticAccept: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3); const out = path.resolve(process.argv[2]);
  assert.equal(path.dirname(out), HERE); assert(!fs.existsSync(out), 'REFUSE_OVERWRITE');
  const records = JSON.parse(fs.readFileSync(path.join(HERE, 'intake-v1/review-queue.private.json'), 'utf8'));
  const rows = factDataset(records), old = JSON.parse(fs.readFileSync(path.join(HERE, 'ir2-jsonschema-smoke-v1/manifest.json'), 'utf8'));
  const requests = rows.map(({ id, messages, requestDigest }) => ({ id, messages, requestDigest }));
  const checkerFiles = ['semantic-facts.mjs', 'semantic-fact-seeds.mjs', 'evaluate-semantic-facts.mjs', 'normalize.mjs', 'intake.mjs'];
  const execution = Object.fromEntries(['seed', 'thinking', 'temperature', 'maxPromptTokens', 'maxContextTokens',
    'prefillStepSize', 'repairAttempts', 'quantization', 'model', 'revision', 'modelDirectory', 'metalLimitGiB',
    'caseSeconds', 'workerMinutes', 'loadSeconds', 'guard'].map(k => [k, old[k]]));
  const manifest = { ...execution, schema: 'ggd-hero12b-semantic-facts-protocol@1', createdAt: new Date().toISOString(),
    purpose: 'source-understanding diagnostic and possible auxiliary SFT; NOT whole-hero recipe success',
    selected: requests.map(r => r.id), heroCount: rows.length, maxTokens: 2048,
    requestSha256: sha(requests), datasetSha256: sha(rows), checkerFiles,
    checkerPins: Object.fromEntries(checkerFiles.map(f => [f, sha(fs.readFileSync(path.join(HERE, f)))])),
    generatorSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))),
    counts: { heroes: rows.length, claims: rows.length * 6, trainHeroes: rows.filter(r => r.split === 'train').length,
      devHeroes: rows.filter(r => r.split === 'dev').length, sourceFamilies: new Set(rows.map(r => r.sourceFamily)).size },
    sourcePins: rows.map(r => ({ id: r.heroId, sha256: r.sourceSha256 })),
    notTraining: true, notBlind: true, canPromoteModel: false, releaseQualified: false,
    mechanismFamiliesIndependent: false, fullHeroRecipeTrainingAdmitted: false,
    predeclaredMetrics: ['all-16 accounting', 'strict final JSON', 'all-96 verdicts including missing/invalid claims in denominator',
      'strict complete claim set and anchored evidence', 'wrong-supported claims', 'manual entailment review'],
    limits: ['All sources historically exposed; dev is source-franchise-held-out for this small auxiliary task only.',
      'Mechanism families intentionally overlap to test transfer; NOT an independent final holdout.',
      'The four current full-hero development sources are excluded completely.',
      'Training admissions here apply only to reviewed factual labels, not whole-hero IR recipes or engine support.',
      'Anchored generated evidence still needs entailment review. Verdict accuracy is not whole-hero quality.'] };
  fs.mkdirSync(out);
  for (const [f, v] of Object.entries({ 'manifest.json': manifest, 'requests.json': requests, 'dataset.private.json': rows })) fs.writeFileSync(path.join(out, f), JSON.stringify(v, null, 2) + '\n', { flag: 'wx' });
  for (const split of ['train', 'dev']) fs.writeFileSync(path.join(out, `${split}.private.jsonl`), rows.filter(r => r.split === split).map(r => JSON.stringify({
    id: r.id, heroId: r.heroId, sourceFamily: r.sourceFamily, sourceSha256: r.sourceSha256,
    messages: [...r.messages, { role: 'assistant', content: JSON.stringify(r.target) }],
    admission: 'reviewed-source-entailment-only', freshBlind: false,
  })).join('\n') + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ counts: manifest.counts, requestSha256: manifest.requestSha256 }, null, 2));
}
