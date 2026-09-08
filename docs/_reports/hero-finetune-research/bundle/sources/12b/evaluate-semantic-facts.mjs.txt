import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { normalizeFinal } from './normalize.mjs';
import { scoreFacts } from './semantic-facts.mjs';
import { sha } from './intake.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
assert.equal(process.argv.length, 4); const run = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
assert.equal(path.dirname(run), here); assert.equal(path.dirname(out), here); assert(!fs.existsSync(out), 'REFUSE_OVERWRITE');
const read = f => JSON.parse(fs.readFileSync(path.join(run, f), 'utf8'));
const protocol = read('manifest.json'), rows = read('dataset.private.json'), raw = read('raw.json'), state = read('state.json');
assert.equal(state.status, 'completed-inference-only'); assert.equal(state.workerPid, null); assert(raw.complete);
assert.equal(sha(rows), protocol.datasetSha256); assert.equal(raw.metadata.manifestSha256, sha(fs.readFileSync(path.join(run, 'manifest.json'))));
assert.equal(raw.results.length, rows.length); assert.equal(sha(read('requests.json')), protocol.requestSha256);
for (const [f, h] of Object.entries(protocol.checkerPins)) assert.equal(sha(fs.readFileSync(path.join(here, f))), h, `CHECKER_DRIFT:${f}`);
const results = rows.map((row, i) => {
  const r = raw.results[i]; assert.equal(r.id, row.id); assert.equal(r.requestDigest, row.requestDigest);
  const n = normalizeFinal(r.envelope), result = { id: row.id, split: row.split, jsonValid: n.ok,
    strictContractValid: false, allClaims: 6, verdictCorrect: 0, wrongSupport: 0, diagnostics: [], automaticAccept: false };
  if (n.ok) {
    try { scoreFacts(n.value, row); result.strictContractValid = true; } catch (e) { result.error = String(e); }
    // Diagnostic counts do not repair or execute a rejected answer. Every expected
    // claim stays in the denominator; duplicates and omissions cannot count correct.
    for (const gold of row.target.claims) {
      const matches = Array.isArray(n.value?.claims) ? n.value.claims.filter(c => c?.id === gold.id) : [];
      const actual = matches.length === 1 ? matches[0].verdict : null;
      const correct = actual === gold.verdict;
      const wrongSupport = actual === 'supported' && gold.verdict !== 'supported';
      result.verdictCorrect += Number(correct); result.wrongSupport += Number(wrongSupport);
      result.diagnostics.push({ id: gold.id, expected: gold.verdict, actual, correct, wrongSupport });
    }
  } else result.error = n.error;
  return result;
});
const summarize = rs => ({ heroes: rs.length, allClaims: rs.length * 6,
  jsonValidHeroes: rs.filter(r => r.jsonValid).length, strictContractValidHeroes: rs.filter(r => r.strictContractValid).length,
  verdictCorrect: rs.reduce((n, r) => n + r.verdictCorrect, 0), wrongSupport: rs.reduce((n, r) => n + r.wrongSupport, 0) });
const summary = { schema: 'ggd-hero12b-semantic-fact-assessment@1', createdAt: new Date().toISOString(),
  counts: summarize(results), train: summarize(results.filter(r => r.split === 'train')), dev: summarize(results.filter(r => r.split === 'dev')),
  rawSha256: sha(fs.readFileSync(path.join(run, 'raw.json'))), datasetSha256: protocol.datasetSha256,
  checkerPins: protocol.checkerPins, freshBlind: false, wholeHeroQualityMeasured: false,
  evidenceEntailmentReviewRequired: true, modelPromoted: false, releaseQualified: false };
fs.mkdirSync(out);
for (const [f, v] of Object.entries({ 'manifest.json': summary, 'cases.json': results })) fs.writeFileSync(path.join(out, f), JSON.stringify(v, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(summary, null, 2));
