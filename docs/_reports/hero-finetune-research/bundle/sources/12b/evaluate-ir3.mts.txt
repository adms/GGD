import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { normalizeFinal } from './normalize.mjs';
import { validateIR3, compileIR3 } from './ir-v3.mts';
import { currentCatalog, checkEnginePins, hash } from './ir-compiler.mts';
import { runIRProbes } from './ir-behavior.mts';
import { sourceNegativeProbes } from './source-negative-probes.mts';
const here = path.dirname(fileURLToPath(import.meta.url));
assert.equal(process.argv.length, 4); const run = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
assert.equal(path.dirname(run), here); assert.equal(path.dirname(out), here); assert(!fs.existsSync(out));
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(run, p), 'utf8'));
const p = read('manifest.json'), state = read('state.json'), raw = read('raw.json'), requests = read('requests.json');
assert.equal(state.status, 'completed-inference-only'); assert.equal(state.workerPid, null);
assert(raw.complete); assert.equal(raw.results.length, p.heroCount); assert.equal(requests.length, p.heroCount);
assert.equal(hash(JSON.stringify(requests)), p.requestSha256);
assert.equal(raw.metadata.manifestSha256, hash(fs.readFileSync(path.join(run, 'manifest.json'))));
assert.deepEqual(state.checkerPinsBeforeInference, p.checkerPins);
for (const [f, h] of Object.entries(p.checkerPins)) assert.equal(hash(fs.readFileSync(path.join(here, f))), h);
checkEnginePins(); const catalog = currentCatalog(), rows: any[] = [], artifacts: any[] = [];
for (let i = 0; i < requests.length; i++) {
  const req = requests[i], res = raw.results[i]; assert.equal(req.id, res.id); assert.equal(req.requestDigest, res.requestDigest);
  const source = JSON.parse(req.messages[1].content).source, n = normalizeFinal(res.envelope);
  const row: any = { id: req.id, jsonValid: n.ok, irValid: false, compiled: false, sourceEntailmentVerified: false, automaticallyAccepted: false };
  if (!n.ok) row.error = n.error;
  else {
    try { const c = validateIR3(n.value, source); row.irValid = true; row.gaps = c.gaps; }
    catch (e) { row.irError = String(e); }
    if (row.irValid) {
      try {
        const built = compileIR3(n.value, source, catalog); row.compiled = true;
        const artifact: any = { id: req.id, ...built }; artifacts.push(artifact);
        try { artifact.probes = runIRProbes(built.compiled, req.id, catalog);
          row.probes = { passed: artifact.probes.passed, total: artifact.probes.total,
            failures: artifact.probes.cases.filter((x: any) => !x.passed).map(({name, error}: any) => ({name, error})) }; }
        catch(e) { row.probeHarnessError = String(e); }
        try { artifact.negatives = sourceNegativeProbes(built.compiled, source, catalog);
          row.negatives = { passed: artifact.negatives.passed, total: artifact.negatives.total,
            failures: artifact.negatives.cases.filter((x: any) => !x.passed).map(({name, error}: any) => ({name, error})) }; }
        catch(e) { row.negativeHarnessError = String(e); }
      } catch(e) { row.compilerError = String(e); }
    }
  }
  rows.push(row);
}
checkEnginePins(); fs.mkdirSync(out);
const summary = { schema: 'ggd-hero12b-ir3-assessment@1', createdAt: new Date().toISOString(), run: path.basename(run),
  counts: { heroes: rows.length, jsonValid: rows.filter(x => x.jsonValid).length, irValid: rows.filter(x => x.irValid).length,
    compiled: rows.filter(x => x.compiled).length, partialProbesPassed: rows.reduce((n, x) => n + (x.probes?.passed ?? 0), 0),
    partialProbesAttempted: rows.reduce((n, x) => n + (x.probes?.total ?? 0), 0),
    negativeProbesPassed: rows.reduce((n, x) => n + (x.negatives?.passed ?? 0), 0),
    negativeProbesAttempted: rows.reduce((n, x) => n + (x.negatives?.total ?? 0), 0), wholeHeroQualified: 0, automaticallyAccepted: 0 },
  rawSha256: hash(fs.readFileSync(path.join(run, 'raw.json'))), checkerPins: p.checkerPins,
  originalMechanicsNotInferredByExpansion: true, actionProvenanceIsNotEntailment: true,
  manualReviewRequired: true, training: false, freshBlind: false, releaseQualified: false };
for (const [f, v] of Object.entries({ 'manifest.json': summary, 'cases.json': rows, 'unvalidated-projects.private.json': artifacts }))
  fs.writeFileSync(path.join(out, f), JSON.stringify(v, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ ...summary, rows }, null, 2));
