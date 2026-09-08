/** Frozen paired evaluation: auxiliary facts are never whole-hero success. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { normalizeFinal } from './normalize.mjs';
import { scoreFacts } from './semantic-facts.mjs';
import { validateIR2, compileIR2 } from './ir-v2.mts';
import { currentCatalog, checkEnginePins, hash } from './ir-compiler.mts';
import { runIRProbes } from './ir-behavior.mts';
import { sourceNegativeProbes } from './source-negative-probes.mts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
export function gradeFact(row: any, res: any) {
  assert.equal(res.id, row.id); assert.equal(res.requestDigest, row.requestDigest);
  const n = normalizeFinal(res.envelope), result: any = { id: row.id, split: row.split,
    jsonValid: n.ok, strictContractValid: false, allClaims: row.target.claims.length,
    verdictCorrect: 0, wrongSupport: 0, diagnostics: [], automaticAccept: false };
  if (!n.ok) { result.error = n.error; return result; }
  try { scoreFacts(n.value, row); result.strictContractValid = true; } catch (e) { result.error = String(e); }
  for (const gold of row.target.claims) {
    const matches = Array.isArray(n.value?.claims) ? n.value.claims.filter((c: any) => c?.id === gold.id) : [];
    const actual = matches.length === 1 ? matches[0].verdict : null;
    const correct = actual === gold.verdict, wrongSupport = actual === 'supported' && gold.verdict !== 'supported';
    result.verdictCorrect += Number(correct); result.wrongSupport += Number(wrongSupport);
    result.diagnostics.push({ id: gold.id, expected: gold.verdict, actual, correct, wrongSupport });
  }
  return result;
}
const factCounts = (rs: any[]) => ({ heroes: rs.length, allClaims: rs.reduce((n, r) => n + r.allClaims, 0),
  jsonValidHeroes: rs.filter(r => r.jsonValid).length, strictContractValidHeroes: rs.filter(r => r.strictContractValid).length,
  verdictCorrect: rs.reduce((n, r) => n + r.verdictCorrect, 0), wrongSupport: rs.reduce((n, r) => n + r.wrongSupport, 0) });

export function gradeHero(req: any, res: any, catalog: any) {
  assert.equal(res.id, req.id); assert.equal(res.requestDigest, req.requestDigest);
  const source = JSON.parse(req.messages[1].content).source, n = normalizeFinal(res.envelope);
  const row: any = { id: req.id, jsonValid: n.ok, normalizationError: n.error ?? null,
    irValid: false, compiled: false, completeHeroCoverage: false, automaticallyAccepted: false };
  let artifact: any = null;
  if (n.ok) {
    try { row.gaps = validateIR2(n.value, source).gaps; row.irValid = true; } catch (e) { row.irError = String(e); }
    if (row.irValid) {
      try {
        const built = compileIR2(n.value, source, catalog); row.compiled = true; artifact = { id: req.id, ...built };
        try {
          artifact.probes = runIRProbes(built.compiled, req.id, catalog);
          row.probes = { total: artifact.probes.total, passed: artifact.probes.passed,
            failures: artifact.probes.cases.filter((c: any) => !c.passed).map(({ name, error }: any) => ({ name, error })) };
        } catch (e) { row.behaviorError = String(e); }
        try {
          artifact.negatives = sourceNegativeProbes(built.compiled, source, catalog);
          row.negatives = { total: artifact.negatives.total, passed: artifact.negatives.passed,
            failures: artifact.negatives.cases.filter((c: any) => !c.passed).map(({ name, error }: any) => ({ name, error })) };
        } catch (e) { row.negativeHarnessError = String(e); }
      } catch (e) { row.compilerError = String(e); }
    }
  }
  return { row, artifact };
}
const heroCounts = (rs: any[]) => ({ heroes: rs.length, jsonValid: rs.filter(r => r.jsonValid).length,
  irValid: rs.filter(r => r.irValid).length, compiled: rs.filter(r => r.compiled).length,
  partialProbesAttempted: rs.reduce((n, r) => n + (r.probes?.total ?? 0), 0),
  partialProbesPassed: rs.reduce((n, r) => n + (r.probes?.passed ?? 0), 0),
  newNegativeProbesAttempted: rs.reduce((n, r) => n + (r.negatives?.total ?? 0), 0),
  newNegativeProbesPassed: rs.reduce((n, r) => n + (r.negatives?.passed ?? 0), 0),
  wholeHeroesQualified: 0, automaticallyAccepted: 0 });

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 4);
  const run = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
  assert.equal(path.dirname(run), here); assert.equal(path.dirname(out), here); assert(!fs.existsSync(out), 'REFUSE_OVERWRITE');
  const p = read(path.join(run, 'manifest.json')), state = read(path.join(run, 'state.json'));
  const trained = read(path.join(run, 'result.json')), evaluation = read(path.join(run, 'evaluation.private.json'));
  assert.equal(state.status, 'completed-pilot-not-promoted'); assert.equal(state.workerPid, null);
  assert.equal(trained.steps, p.steps); assert.equal(trained.checkpoint.step, p.steps);
  assert.equal(trained.manifestSha256, hash(fs.readFileSync(path.join(run, 'manifest.json'))));
  assert.equal(trained.workerSha256, p.workerSha256);
  assert.equal(hash(fs.readFileSync(path.join(here, 'lora-facts-pilot.py'))), p.workerSha256);
  assert.equal(hash(fs.readFileSync(path.join(here, 'gpu-smoke.py'))), p.baseSupervisorSha256);
  assert.equal(hash(JSON.stringify(evaluation)), p.evaluationSha256);
  assert.equal(hash(JSON.stringify(read(path.join(run, 'tokens.private.json')))), p.tokenizedTrainingSha256);
  assert.equal(hash(fs.readFileSync(path.join(run, trained.checkpoint.path, 'adapters.safetensors'))), trained.checkpoint.sha256);
  assert.equal(trained.adapterReloadVerified, true);
  assert.equal(read(path.join(run, 'training-trace.json')).length, p.steps);
  for (const [f, h] of Object.entries(p.checkerPins)) assert.equal(hash(fs.readFileSync(path.join(here, f))), h, `CHECKER_DRIFT:${f}`);
  checkEnginePins(); const catalog = currentCatalog();
  const paired: any = {}, details: any = {}, artifacts: any[] = [];
  for (const kind of ['facts', 'whole_hero']) {
    const e = evaluation[kind], baseDir = path.join(here, e.baseRun);
    const before = read(path.join(baseDir, 'raw.json')), after = read(path.join(run, `${kind}-raw.json`));
    assert.equal(read(path.join(baseDir, 'state.json')).status, 'completed-inference-only');
    assert(before.complete && after.complete);
    assert.deepEqual(e.requests, read(path.join(baseDir, 'requests.json')));
    assert.deepEqual(e.protocol, read(path.join(baseDir, 'manifest.json')));
    assert.equal(before.metadata.manifestSha256, hash(fs.readFileSync(path.join(baseDir, 'manifest.json'))));
    assert.equal(after.requestSha256, e.protocol.requestSha256);
    assert.equal(hash(JSON.stringify(e.requests)), e.protocol.requestSha256);
    assert.equal(before.results.length, e.requests.length); assert.equal(after.results.length, e.requests.length);
    const dataset = kind === 'facts' ? read(path.join(baseDir, 'dataset.private.json')) : null;
    if (dataset) assert.equal(hash(JSON.stringify(dataset)), p.datasetSha256);
    const result: any = { before: [], after: [] };
    for (const [label, raw] of [['before', before], ['after', after]] as const) {
      for (let i = 0; i < e.requests.length; i++) {
        const res = raw.results[i], req = e.requests[i];
        assert.equal(res.promptSha256, hash(e.prompts[i]));
        assert.equal(res.id, req.id); assert.equal(res.requestDigest, req.requestDigest);
        if (label === 'after') assert.equal(res.adapterSha256, trained.checkpoint.sha256);
        if (dataset) result[label].push(gradeFact(dataset[i], res));
        else {
          const scored = gradeHero(req, res, catalog); result[label].push(scored.row);
          if (scored.artifact) artifacts.push({ stage: label, ...scored.artifact });
        }
      }
    }
    paired[kind] = {};
    for (const label of ['before', 'after']) paired[kind][label] = dataset ? {
      counts: factCounts(result[label]), train: factCounts(result[label].filter((r: any) => r.split === 'train')),
      dev: factCounts(result[label].filter((r: any) => r.split === 'dev')) } : heroCounts(result[label]);
    details[kind] = result;
  }
  checkEnginePins(); fs.mkdirSync(out);
  const summary = { schema: 'ggd-hero12b-lora-fact-pilot-assessment@1', createdAt: new Date().toISOString(), run: path.basename(run),
    paired, training: trained, checkerPins: p.checkerPins,
    rawPins: Object.fromEntries(['facts-raw.json', 'whole_hero-raw.json'].map(f => [f, hash(fs.readFileSync(path.join(run, f)))])),
    sourceAndMechanismFamilyFinalHoldout: false, freshBlind: false, completeHeroCoverage: false,
    auxiliaryTaskIsNotWholeHeroQuality: true, manualReviewStillRequired: true,
    modelPromoted: false, releaseQualified: false, noSemanticRepair: true };
  for (const [f, v] of Object.entries({ 'manifest.json': summary, 'cases.json': details, 'unvalidated-projects.private.json': artifacts }))
    fs.writeFileSync(path.join(out, f), JSON.stringify(v, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ paired, training: trained, releaseQualified: false }, null, 2));
}
