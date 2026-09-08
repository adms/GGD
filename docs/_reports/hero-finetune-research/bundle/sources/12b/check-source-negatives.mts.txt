import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { fixtures } from './ir-fixtures.mts';
import { compileIR, currentCatalog, checkEnginePins, hash } from './ir-compiler.mts';
import { sourceNegativeProbes } from './source-negative-probes.mts';
const here = path.dirname(fileURLToPath(import.meta.url));
assert.equal(process.argv.length, 3); const out = path.resolve(process.argv[2]);
assert.equal(path.dirname(out), here); assert(!fs.existsSync(out), 'REFUSE_OVERWRITE');
checkEnginePins(); const catalog = currentCatalog(), rows: any[] = [];
for (const f of fixtures.filter(f => ['community7-leesin', 'community37-32'].includes(f.id))) {
  const built = compileIR(f.ir, f.source, catalog);
  rows.push({ candidate: 'manual-fixture', id: f.id, ...sourceNegativeProbes(built.compiled, f.source, catalog) });
}
const artifacts = JSON.parse(fs.readFileSync(path.join(here, 'ir2-jsonschema-smoke-v1-assessment/unvalidated-projects.private.json'), 'utf8'));
const built = artifacts.find((x: any) => x.id === 'community7-leesin'); assert(built);
rows.push({ candidate: 'actual-12b-base-IR2', id: built.id,
  ...sourceNegativeProbes(built.compiled, fixtures.find(f => f.id === built.id)!.source, catalog) });
checkEnginePins(); fs.mkdirSync(out);
fs.writeFileSync(path.join(out, 'cases.json'), JSON.stringify(rows, null, 2) + '\n', { flag: 'wx' });
const manifest = { schema: 'hero12b-source-negative-controls@1', generatedAt: new Date().toISOString(),
  rows: rows.map(({ cases, ...r }) => ({ ...r, failures: cases.filter((c: any) => !c.passed).map((c: any) => c.name) })),
  pins: ['probe-harness.mts', 'source-negative-probes.mts', 'check-source-negatives.mts',
    'ir2-jsonschema-smoke-v1-assessment/unvalidated-projects.private.json'].map(f => ({ file: f, sha256: hash(fs.readFileSync(path.join(here, f))) })),
  modelReinferred: false, historicalScoresChanged: false, releaseQualified: false };
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(manifest.rows, null, 2));
// Positive fixture should pass; the previously missed model mistakes MUST fail.
assert(rows.filter(r => r.candidate === 'manual-fixture').every(r => r.passed === r.total), 'POSITIVE_CONTROL_FAILED');
assert.equal(rows.at(-1).passed, 0, 'NEGATIVE_CONTROL_FAILED_TO_CATCH_REAL_MISTAKES');
