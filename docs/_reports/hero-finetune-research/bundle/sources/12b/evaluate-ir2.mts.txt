import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { normalizeFinal } from './normalize.mjs';
import { validateIR2, compileIR2 } from './ir-v2.mts';
import { currentCatalog, checkEnginePins, hash } from './ir-compiler.mts';
import { runIRProbes } from './ir-behavior.mts';
const here = path.dirname(fileURLToPath(import.meta.url));
assert.equal(process.argv.length, 4); const run = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
assert.equal(path.dirname(run), here); assert.equal(path.dirname(out), here); assert(!fs.existsSync(out), 'REFUSE_OVERWRITE');
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(run, p), 'utf8'));
const raw = read('raw.json'), protocol = read('manifest.json'), state = read('state.json'), requests = read('requests.json');
assert.equal(state.status, 'completed-inference-only'); assert.equal(state.workerPid, null);
assert(raw.complete && raw.results.length === protocol.heroCount && requests.length === protocol.heroCount);
assert.equal(hash(JSON.stringify(requests)), protocol.requestSha256);
assert.equal(raw.metadata.manifestSha256, hash(fs.readFileSync(path.join(run, 'manifest.json'))));
assert.deepEqual(state.checkerPinsBeforeInference, protocol.checkerPins);
for (const [f, h] of Object.entries(protocol.checkerPins)) assert.equal(hash(fs.readFileSync(path.join(here, f))), h, `CHECKER_DRIFT:${f}`);
checkEnginePins(); const catalog = currentCatalog(), rows: any[] = [], artifacts: any[] = [];
for (let i = 0; i < requests.length; i++) {
  const req = requests[i], res = raw.results[i]; assert.equal(res.id, req.id); assert.equal(res.requestDigest, req.requestDigest);
  const source = JSON.parse(req.messages[1].content).source, n = normalizeFinal(res.envelope);
  const row: any = { id: req.id, jsonValid: n.ok, normalizationError: n.error ?? null, irValid: false,
    compilerAttempted: false, compiled: false, behaviorAttempted: false, automaticallyAccepted: false, releaseQualified: false };
  if (n.ok) {
    try { const r = validateIR2(n.value, source); row.irValid = true; row.gaps = r.gaps; }
    catch (e) { row.irError = String(e); }
    if (row.irValid) {
      row.compilerAttempted = true;
      try {
        const built = compileIR2(n.value, source, catalog); row.compiled = true;
        const artifact: any = { id: req.id, ...built }; artifacts.push(artifact);
        row.behaviorAttempted = true;
        try { artifact.probes = runIRProbes(built.compiled, req.id, catalog);
          row.probes = { total: artifact.probes.total, passed: artifact.probes.passed,
            failures: artifact.probes.cases.filter((c: any) => !c.passed).map(({ name, error }: any) => ({ name, error })) }; }
        catch (e) { row.behaviorError = String(e); }
      } catch (e) { row.compilerError = String(e); }
    }
  }
  rows.push(row);
}
checkEnginePins(); fs.mkdirSync(out, { recursive: true });
const put = (p: string, v: any) => fs.writeFileSync(path.join(out, p), JSON.stringify(v, null, 2) + '\n', { flag: 'wx' });
put('results.json', rows); put('unvalidated-projects.private.json', artifacts);
const summary = { schema: 'ggd-hero12b-ir2-assessment@1', generatedAt: new Date().toISOString(), run: path.basename(run),
  rawSha256: hash(fs.readFileSync(path.join(run, 'raw.json'))), checkerPins: protocol.checkerPins,
  counts: { heroes: rows.length, jsonValid: rows.filter(r => r.jsonValid).length, irValid: rows.filter(r => r.irValid).length,
    compiled: rows.filter(r => r.compiled).length, targetedBehaviorPassed: rows.reduce((n, r) => n + (r.probes?.passed ?? 0), 0),
    targetedBehaviorAttempted: rows.reduce((n, r) => n + (r.probes?.total ?? 0), 0), completeHeroSemanticsVerified: 0, automaticallyAccepted: 0 },
  manualAdjudication: 'separate report; not applied to mechanical scores', releaseQualified: false,
  noSemanticRepair: true, training: false, notBlind: true, completeHeroCoverage: false };
put('manifest.json', summary); console.log(JSON.stringify({ ...summary, rows }, null, 2));
