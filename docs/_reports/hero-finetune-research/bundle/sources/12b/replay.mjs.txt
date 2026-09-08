import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { sha } from './intake.mjs';
import { normalizeFinal } from './normalize.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p)));
export async function replay() {
  const folder = 'outputs/mid-model-comparison-20260907';
  const manifest = read(`${folder}/manifest.json`);
  for (const pin of manifest.scorerPins) assert.equal(sha(fs.readFileSync(path.join(root, pin.path))), pin.sha256, 'SCORER_CHANGED');
  assert.equal(sha(fs.readFileSync(path.join(root, folder, 'requests.json'))), manifest.requestSha256, 'REQUESTS_CHANGED');
  const cases = read(`${folder}/cases.private.json`), requests = read(`${folder}/requests.json`);
  assert.equal(cases.length, 96); assert.equal(requests.length, 96);
  const { score } = await import(path.join(root, manifest.scorerPins[0].path));
  const arms = {};
  const sources = [`${folder}/manifest.json`, `${folder}/cases.private.json`, `${folder}/requests.json`, ...manifest.scorerPins.map(p => p.path)];
  for (const name of ['9b', '12b', '27b']) {
    const file = `${name === '27b' ? 'outputs/qwen38-local-comparison-20260907' : folder}/${name}-plain-raw.json`;
    sources.push(file);
    const raw = read(file); assert.equal(raw.complete, true); assert.equal(raw.results.length, 96);
    assert.equal(raw.metadata.thinking, false, 'PLAIN_ONLY_PROVIDER_ADAPTER');
    const rows = raw.results.map((r, i) => {
      const c = cases[i]; assert.equal(c.id, r.id); assert.equal(r.requestDigest, c.requestDigest);
      assert.equal(requests[i].id, c.id); assert.equal(sha(requests[i].messages), c.requestDigest);
      assert.deepEqual(c.messages, requests[i].messages);
      // This adapter is restricted to archived, explicitly non-thinking generation.
      // For thinking providers a separate tested final-channel adapter is required.
      const normalized = normalizeFinal({ text: r.text, channel: 'final', finishReason: r.finishReason });
      const original = score(c, r.value), after = score(c, normalized.ok ? normalized.value : null);
      if (!r.error && normalized.ok) assert.deepEqual(normalized.value, r.value, 'VALID_OUTPUT_CHANGED');
      return { id: c.id, requestDigest: c.requestDigest, original, after,
        normalized: { ok: normalized.ok, error: normalized.error, unwrapped: normalized.unwrapped },
        originalValue: r.value, normalizedValue: normalized.value };
    });
    const summary = key => ({ passed: rows.filter(r => r[key].pass).length, unsafe: rows.filter(r => r[key].unsafe).length });
    arms[name] = { count: rows.length, original: summary('original'), normalized: summary('after'),
      unwrapped: rows.filter(r => r.normalized.unwrapped).length,
      schemaFailuresAfter: rows.filter(r => !r.after.schema).length,
      regressions: rows.filter(r => r.original.pass && !r.after.pass).map(r => r.id), rows };
  }
  return { schema: 'ggd-hero12b-final-normalization-replay@1', generatedAt: new Date().toISOString(),
    scope: 'CPU-only replay of 288 archived plain-mode calls, no new inference; frozen historical scorer.',
    sourcePins: sources.map(p => ({ path: p, sha256: sha(fs.readFileSync(path.join(root, p))) })),
    normalizerSha256: sha(fs.readFileSync(path.join(here, 'normalize.mjs'))),
    arms, newInferenceCalls: 0, trainingCalls: 0, editorIntegrated: false, releaseQualified: false,
    limitations: ['Source labels historically exposed, not independent Owner Gold.',
      'JSON normalization does not repair semantic errors, illegal IDs, unsupported plans or missing requirements.',
      'Plain-mode replay only; no generic reasoning delimiter parser.',
      'Whole-hero generation and current engine behavior are not tested by this replay.'] };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3, 'USAGE: node replay.mjs NEW_OUTPUT_FILE');
  const out = path.resolve(process.argv[2]); assert(!fs.existsSync(out), 'REFUSE_OVERWRITE_OUTPUT');
  const report = await replay();
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(Object.fromEntries(Object.entries(report.arms).map(([k, { rows, ...v }]) => [k, v])), null, 2));
}
