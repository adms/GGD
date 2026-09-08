import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { normalizeFinal } from './normalize.mjs';
import { validateIR } from './semantic-ir.mts';
import { currentCatalog, checkEnginePins, compileIR, hash } from './ir-compiler.mts';
import { runIRProbes } from './ir-behavior.mts';
const here = path.dirname(fileURLToPath(import.meta.url));
assert.equal(process.argv.length, 4, 'USAGE: node --import tsx evaluate-ir.mts RUN NEW_REPORT_DIRECTORY');
const run = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
assert.equal(path.dirname(run), here); assert.equal(path.dirname(out), here); assert(!fs.existsSync(out), 'REFUSE_OVERWRITE');
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(run, p), 'utf8'));
const raw = read('raw.json'), protocol = read('manifest.json'), state = read('state.json'), requests = read('requests.json');
assert.equal(state.status, 'completed-inference-only'); assert.equal(state.workerPid, null);
assert(raw.complete && raw.results.length === protocol.heroCount && requests.length === protocol.heroCount, 'ACCOUNTING');
assert.equal(hash(JSON.stringify(requests)), protocol.requestSha256);
assert.equal(raw.metadata.manifestSha256, hash(fs.readFileSync(path.join(run, 'manifest.json'))));
assert.deepEqual(state.checkerPinsBeforeInference, protocol.checkerPins);
for (const [f, h] of Object.entries(protocol.checkerPins)) assert.equal(hash(fs.readFileSync(path.join(here, f))), h, `CHECKER_DRIFT:${f}`);
checkEnginePins(); const catalog = currentCatalog(), rows: any[] = [], artifacts: any[] = [];
for (let i = 0; i < requests.length; i++) {
  const request = requests[i], response = raw.results[i]; assert.equal(response.id, request.id); assert.equal(response.requestDigest, request.requestDigest);
  const source = JSON.parse(request.messages[1].content).source;
  const n = normalizeFinal(response.envelope);
  const row: any = { id: request.id, normalization: { ok: n.ok, error: n.error ?? null, unwrapped: n.unwrapped ?? false },
    contract: { ok: false }, compiler: { attempted: false, ok: false }, behavior: { attempted: false },
    semanticAdjudication: 'pending-manual', automaticallyAccepted: false, releaseQualified: false };
  if (n.ok) {
    let checked: any;
    try { checked = validateIR(n.value, source); row.contract = { ok: true, gaps: checked.gaps, completeMechanismClaim: checked.completeMechanismClaim }; }
    catch (error) { row.contract.error = String(error); }
    if (checked) {
      row.compiler.attempted = true;
      try {
        const built = compileIR(n.value, source, catalog);
        row.compiler = { attempted: true, ok: true, runtimeDocuments: built.runtimeDocuments };
        const artifact: any = { id: request.id, ir: n.value, ...built, unvalidated: true }; artifacts.push(artifact);
        row.behavior.attempted = true;
        try { artifact.probes = runIRProbes(built.compiled, request.id, catalog);
          row.behavior = { attempted: true, total: artifact.probes.total, passed: artifact.probes.passed,
            failures: artifact.probes.cases.filter((c: any) => !c.passed).map(({ name, error }: any) => ({ name, error })), completeHeroCoverage: false }; }
        catch (error) { row.behavior.error = String(error); }
      } catch (error) { row.compiler.error = String(error); }
    }
  }
  rows.push(row);
}
checkEnginePins(); fs.mkdirSync(out, { recursive: true });
const put = (p: string, v: any) => fs.writeFileSync(path.join(out, p), JSON.stringify(v, null, 2) + '\n', { flag: 'wx' });
put('results.json', rows); put('unvalidated-projects.private.json', artifacts);
const summary = { schema: 'ggd-hero12b-ir-assessment@1', generatedAt: new Date().toISOString(), sourceRun: path.basename(run),
  rawSha256: hash(fs.readFileSync(path.join(run, 'raw.json'))), checkerPins: protocol.checkerPins,
  counts: { attemptedHeroes: rows.length, jsonValid: rows.filter(r => r.normalization.ok).length, irValid: rows.filter(r => r.contract.ok).length,
    compiled: rows.filter(r => r.compiler.ok).length, targetedBehaviorPassed: rows.reduce((n, r) => n + (r.behavior.passed ?? 0), 0),
    targetedBehaviorAttempted: rows.reduce((n, r) => n + (r.behavior.total ?? 0), 0), completeHeroSemanticsVerified: 0, automaticallyAccepted: 0 },
  noOutputRepair: true, notBlind: true, training: false, completeHeroCoverage: false, releaseQualified: false,
  limits: ['IR plus script is a system intervention, not a finetune comparison.', 'Partial behavior probes and literal quotes do not establish whole-hero correctness.',
    'Required semantic gaps keep a compiled project preview-only.', 'No inference on excluded or repaired responses.'] };
put('manifest.json', summary); console.log(JSON.stringify({ ...summary, rows }, null, 2));
