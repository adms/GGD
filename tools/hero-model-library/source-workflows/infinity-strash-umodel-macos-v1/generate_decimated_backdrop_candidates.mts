/** Build append-only <=8,000-triangle derivatives of the repaired Strash GLBs. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [repoArg, workspaceArg] = process.argv.slice(2);
if (!workspaceArg) throw Error('usage: node --import tsx generate_decimated_backdrop_candidates.mts <repo> <workspace>');
const repo = path.resolve(repoArg), workspace = path.resolve(workspaceArg);
const evidence = path.join(repo, 'materials/hero-model-library/priority-evidence/infinity-strash-texture-backdrop-decimation-v1');
const localRoot = path.join(workspace, 'GGD-Asset-Library/conversions/infinity-strash-texture-backdrop-decimation-v1');
const worker = path.join(repo, 'tools/model-budget/optimize/decimate-emissive-lock.mjs');
const target = 7900;
const previousGenerationPath = path.join(evidence, 'generation.json');
const previousGeneration = fs.existsSync(previousGenerationPath) ? JSON.parse(fs.readFileSync(previousGenerationPath, 'utf8')) : null;
const specs = [
  {
    candidateId: 'dai-pn010-02', heroId: 'godie-nbbc', character: '小呆', form: 'PN010/02',
    sourceSha256: '4d040f955d9b6f190b0a622034941d8685491670d4cfab81ea43d1fbf758e63f',
    outputSha256: 'bdf77de4789523c132c4e620f49ead67d70fd8374a9ed5613196695960fa02c6',
    worker: 'emissive-lock',
    modelTemplate: path.join(workspace, 'GGD-Asset-Library/converted/infinity-strash-umodel-macos-v1/runtime-candidates-v1/dai-pn010-02/uploaded-model.json'),
  },
  {
    candidateId: 'dai-pn010-05-daino-tsurugi', heroId: 'godie-nbbc', character: '小呆', form: 'PN010/05 + Dai no Tsurugi',
    sourceSha256: '93ccf92a021851f98acb28213cdc78f5349482f90f0c90cad75de01962465e7a',
    outputSha256: '5eb4e1322b17cd53b2a791af6c6728af26101c88e3b94f81e3104ccab9b31540',
    worker: 'emissive-lock',
    modelTemplate: path.join(workspace, 'GGD-Asset-Library/converted/infinity-strash-umodel-macos-v1/runtime-candidates-dai-pn010-05-daino-v2/dai-pn010-05-daino-tsurugi/uploaded-model.json'),
  },
  {
    candidateId: 'vearn-en801-pre-transformation', heroId: 'godie-ubal', character: '老巴恩', form: 'EN801 變身前',
    sourceSha256: 'aa8e1f03f69f6586befb1527178f2c7029c0f0a2c92b96b5ebdad8a1b2f32882',
    outputSha256: '97d9fb78fec6abbf162a75223132e92485e51958306a2563fe4f7189dab8dd00',
    worker: 'material-weighted',
    materialTargets: {GGD_body: 6420, GGD_faceDecal1: 40, GGD_faceDecal2: 50, GGD_face: 250, GGD_hair: 150, GGD_faceDecal3: 50},
    materialErrors: {GGD_body: 0.05, GGD_face: 0.2, GGD_hair: 0.2, GGD_faceDecal2: 0.1, GGD_faceDecal3: 0.1},
    modelTemplate: path.join(workspace, 'GGD-Asset-Library/converted/infinity-strash-umodel-macos-v1/runtime-candidates-v1/vearn-en801-pre-transformation/uploaded-model.json'),
  },
];
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const pin = (file: string) => ({path: file, bytes: fs.statSync(file).size, sha256: sha(fs.readFileSync(file))});
function writeExact(file: string, bytes: Uint8Array | string) {
  const value = typeof bytes === 'string' ? Buffer.from(bytes) : Buffer.from(bytes);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  if (fs.existsSync(file)) {
    assert.deepEqual(fs.readFileSync(file), value, `refusing to overwrite non-identical ${file}`);
    return;
  }
  fs.writeFileSync(file, value);
}
const records = [];
for (const spec of specs) {
  const sourceBase = path.join(repo, `content/assets/models/community/${spec.sourceSha256}.glb`);
  const sourceFrozen = path.join(repo, `content/assets/models/community/versions/${spec.sourceSha256}.glb`);
  assert.equal(pin(sourceBase).sha256, spec.sourceSha256, `${spec.candidateId}: repaired source SHA drift`);
  assert.deepEqual(fs.readFileSync(sourceFrozen), fs.readFileSync(sourceBase), `${spec.candidateId}: repaired base/frozen differ`);
  const local = path.join(localRoot, spec.candidateId);
  const rebuild = path.join(local, 'rebuild', `${spec.outputSha256}.glb`);
  let workerResult;
  if (!fs.existsSync(rebuild)) {
    fs.mkdirSync(path.dirname(rebuild), {recursive: true});
    if (spec.worker === 'material-weighted') {
      const weightedWorker = path.join(repo, 'tools/model-budget/optimize/decimate-material-weighted.mjs');
      workerResult = JSON.parse(execFileSync(process.execPath, [weightedWorker, sourceBase, rebuild,
        '--material-targets', JSON.stringify(spec.materialTargets), '--material-errors', JSON.stringify(spec.materialErrors), '--error', '0.02'], {encoding: 'utf8'}));
    } else {
      workerResult = JSON.parse(execFileSync(process.execPath, [worker, sourceBase, rebuild, '--target', String(target), '--emissive-threshold', '192', '--error', '0.02'], {encoding: 'utf8'}));
    }
  } else {
    assert.equal(pin(rebuild).sha256, spec.outputSha256, `${spec.candidateId}: stale rebuild output`);
    const previous = previousGeneration?.records?.find((row: any) => row.candidateId === spec.candidateId && row.outputSha256 === spec.outputSha256);
    workerResult = previous?.workerResult ?? {tool: spec.worker === 'material-weighted' ? 'model-budget/decimate-material-weighted@1' : 'model-budget/decimate-emissive-lock@1',
      skipped: 'receipt-and-sha-verified', input: sourceBase, output: rebuild};
  }
  assert.equal(pin(rebuild).sha256, spec.outputSha256, `${spec.candidateId}: non-deterministic output`);
  const bytes = fs.readFileSync(rebuild);
  const base = path.join(repo, `content/assets/models/community/${spec.outputSha256}.glb`);
  const frozen = path.join(repo, `content/assets/models/community/versions/${spec.outputSha256}.glb`);
  const final = path.join(local, 'final', `${spec.outputSha256}.glb`);
  for (const output of [base, frozen, final]) writeExact(output, bytes);
  const template = JSON.parse(fs.readFileSync(spec.modelTemplate, 'utf8'));
  const sourceReview = {...template, sha256: spec.sourceSha256, byteSize: fs.statSync(sourceBase).size};
  const candidateReview = {...template, sha256: spec.outputSha256, byteSize: bytes.length};
  const sourceReviewPath = path.join(local, 'source-review-model.json');
  const candidateReviewPath = path.join(local, 'candidate-final-review-model.json');
  writeExact(sourceReviewPath, JSON.stringify(sourceReview, null, 2) + '\n');
  writeExact(candidateReviewPath, JSON.stringify(candidateReview, null, 2) + '\n');
  records.push({
    ...spec, modelTemplate: pin(spec.modelTemplate),
    source: {base: pin(sourceBase), frozen: pin(sourceFrozen), baseFrozenByteIdentical: true},
    output: {base: pin(base), frozen: pin(frozen), local: pin(final), baseFrozenByteIdentical: true},
    reviewModels: {source: pin(sourceReviewPath), candidate: pin(candidateReviewPath)},
    parameters: spec.worker === 'material-weighted'
      ? {worker: 'tools/model-budget/optimize/decimate-material-weighted.mjs', targetTrianglesMax: 8000,
         materialTargets: spec.materialTargets, materialErrors: spec.materialErrors, baseErrorBound: 0.02,
         preservedSimplificationAttributes: ['NORMAL', 'TEXCOORD_0', 'WEIGHTS_0', 'JOINTS_0'], lockBorder: true}
      : {worker: path.relative(repo, worker), targetTriangles: target, emissiveThreshold: 192, errorBound: 0.02, lockBorder: true},
    workerResult,
    status: 'generated-pending-visual-and-structural-validation', runtimeSelectable: false, productionDeploymentVerified: false,
  });
}
const receipt = {
  schema: 'ggd.infinity-strash-texture-backdrop-decimation-generation@1', records,
  counts: {sources: 3, generatedBaseFiles: 3, generatedFrozenFiles: 3},
  supersededExperimentsRetained: [{candidateId: 'vearn-en801-pre-transformation', sha256: 'da6d43f1990275eeae6091c16d99370b164d74de261699ea4416a969ed787e14',
    reason: 'proportional position-only simplification passed numeric limits but showed visible cloth holes and exceeded the conservative changed-pixel metric'}],
  boundaries: {backdropRepairedSourcesRetained: true, originalPreRepairSourcesRetained: true, centralIndexesModified: false,
               championPointersModified: false, runtimeSelectable: false, productionDeploymentVerified: false},
};
fs.mkdirSync(evidence, {recursive: true});
fs.writeFileSync(path.join(evidence, 'generation.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt.counts));
