/** Validate five FateUBW durationless-source derivatives without native claims. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join, resolve} from 'node:path';

const [repoArg, batchArg] = process.argv.slice(2);
if (!repoArg || !batchArg) throw Error('usage: validate_static_pose_derivatives.mts <repo> <batch-root>');
const repo = resolve(repoArg), batch = resolve(batchArg);
const manifest = JSON.parse(readFileSync(join(batch, 'batch-manifest.json'), 'utf8'));
assert.equal(manifest.schema, 'ggd-fateubw-static-pose-derivative-batch@1');

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const requireFromRepo = createRequire(join(repo, 'packages/shared/package.json'));
const khronosValidator = requireFromRepo('gltf-validator');
const {inspectModelUpload} = await import(join(repo, 'packages/shared/src/content/modelUpload/inspect.ts'));
const {heroModelBudgetIssues} = await import(join(repo, 'packages/shared/src/content/modelUpload/heroModel.ts'));

function parseGlb(bytes: Buffer) {
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  let offset = 12, document: any = null, binary: Buffer | null = null;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset), kind = bytes.readUInt32LE(offset + 4);
    const payload = bytes.subarray(offset + 8, offset + 8 + length);
    assert.equal(payload.length, length);
    if (kind === 0x4e4f534a) document = JSON.parse(payload.toString('utf8').replace(/[ \0]+$/, ''));
    if (kind === 0x004e4942) binary = payload;
    offset += 8 + length;
  }
  assert.ok(document && binary);
  return {document, binary};
}

const componentBytes: Record<number, number> = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4};
const components: Record<string, number> = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16};
function accessorValues(document: any, binary: Buffer, index: number): number[][] {
  const accessor = document.accessors[index], view = document.bufferViews[accessor.bufferView];
  assert.equal(accessor.componentType, 5126, 'animation accessor must use float32');
  const width = components[accessor.type], stride = view.byteStride ?? width * componentBytes[accessor.componentType];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return Array.from({length: accessor.count}, (_, row) =>
    Array.from({length: width}, (_, column) => binary.readFloatLE(start + row * stride + column * 4)));
}

function maxDelta(rows: number[][]) {
  let result = 0;
  for (let row = 1; row < rows.length; row++)
    for (let column = 0; column < rows[row].length; column++)
      result = Math.max(result, Math.abs(rows[row][column] - rows[0][column]));
  return result;
}

const records = [];
for (const summary of manifest.records) {
  const root = join(batch, summary.candidateId);
  const report = JSON.parse(readFileSync(join(root, 'derivative-report.json'), 'utf8'));
  const bytes = readFileSync(join(root, 'body.glb'));
  assert.equal(report.schema, 'ggd-fateubw-static-pose-derivative@1');
  assert.equal(report.sourceAnimationLengthProvided, false);
  assert.equal(report.nativeDurationClaim, false);
  assert.equal(digest(bytes), report.output.sha256);
  assert.equal(bytes.length, report.output.bytes);
  const {document, binary} = parseGlb(bytes);
  assert.equal(document.animations.length, 1);
  assert.equal(document.animations[0].name, report.derivedClip);
  assert.equal(document.extras.ggd.nativeAnimationIncluded, false);
  assert.equal(document.extras.ggd.derivedAnimationIncluded, true);
  assert.equal(document.extras.ggd.derivedAnimationClassification, report.classification);
  assert.equal(document.extras.ggd.sourceAnimationLengthProvided, false);
  assert.equal(document.extras.ggd.nativeDurationClaim, false);
  assert.equal(document.animations[0].extras.ggd.nativeClassification, report.classification);
  const samplerEvidence = document.animations[0].samplers.map((sampler: any) => {
    const times = accessorValues(document, binary, sampler.input).map(row => row[0]);
    const values = accessorValues(document, binary, sampler.output);
    assert.ok(Math.abs(times[0]) < 1e-7);
    assert.ok(Math.abs(times.at(-1)! - report.derivedDurationSeconds) < 1e-5);
    return {keyCount: times.length, start: times[0], end: times.at(-1),
      startEndDelta: Math.max(...values[0].map((value, index) => Math.abs(value - values.at(-1)![index]))),
      maxDeltaFromStart: maxDelta(values)};
  });
  if (report.classification === 'derived-static-pose-hold') {
    assert.ok(samplerEvidence.every((row: any) => row.keyCount === 2));
    assert.ok(samplerEvidence.every((row: any) => row.maxDeltaFromStart < 1e-6));
  } else {
    assert.ok(report.formulaPeriodEvidence);
    assert.ok(samplerEvidence.some((row: any) => row.maxDeltaFromStart > 1e-4), 'formula loop did not move');
    assert.ok(samplerEvidence.every((row: any) => row.startEndDelta < 1e-4), 'formula loop does not close');
  }
  const khronos = await khronosValidator.validateBytes(new Uint8Array(bytes), {
    uri: summary.candidateId + '/body.glb', maxIssues: 0, writeTimestamp: false,
    externalResourceFunction: async () => { throw Error('external resources prohibited'); },
  });
  const inspection = await inspectModelUpload(new Uint8Array(bytes));
  const budget = heroModelBudgetIssues(inspection);
  assert.equal(khronos.issues.numErrors, 0);
  assert.equal(khronos.issues.truncated, false);
  assert.deepEqual(budget.errors, []);
  assert.equal(inspection.json.skins?.length ?? 0, 1);
  assert.equal(inspection.json.images?.length ?? 0, 1);
  assert.equal(inspection.json.animations?.length ?? 0, 1);
  assert.deepEqual(inspection.clips.map((clip: any) => clip.name), [report.derivedClip]);
  records.push({candidateId: report.candidateId, sourceClip: report.sourceClip,
    derivedClip: report.derivedClip, classification: report.classification,
    durationSeconds: report.derivedDurationSeconds, sha256: digest(bytes), bytes: bytes.length,
    samplerEvidence, khronosErrors: khronos.issues.numErrors,
    khronosWarnings: khronos.issues.numWarnings, ggdBudgetErrors: budget.errors.length,
    ggdInspection: {triangles: inspection.triangles, meshes: inspection.meshes,
      textures: inspection.textures, clips: inspection.clips, report: inspection.report, budget}});
}
assert.equal(records.length, 5);
assert.equal(records.filter(row => row.classification === 'derived-static-pose-hold').length, 3);
assert.equal(records.filter(row => row.classification === 'derived-procedural-formula-loop').length, 2);
const result = {
  schema: 'ggd-fateubw-static-pose-derivative-validation@1',
  records,
  counts: {candidates: 5, holds: 3, formulaLoops: 2,
    khronosErrors: records.reduce((sum, row) => sum + row.khronosErrors, 0),
    khronosWarnings: records.reduce((sum, row) => sum + row.khronosWarnings, 0),
    ggdBudgetErrors: records.reduce((sum, row) => sum + row.ggdBudgetErrors, 0)},
  assertions: {allOutputsClearlyDerived: true, noNativeDurationClaim: true,
    holdsHaveTwoIdenticalEndpointKeys: true, formulaLoopsMoveAndClose: true,
    allKhronosErrorsZero: true, allGgdBudgetErrorsZero: true},
  scope: 'GLB structure, derivative metadata, hold/loop sample behavior, Khronos validation, and GGD upload budgets only. Visual quality, action mapping, rights, backend selection, and deployment remain unverified.',
};
writeFileSync(join(batch, 'validation.json'), JSON.stringify(result, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify(result.counts));
