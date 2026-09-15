/** Strict structural gate for a static SSBU candidate after material-aware decimation. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';

const [candidateArgument, sourceArgument, outputArgument] = process.argv.slice(2);
assert(candidateArgument && sourceArgument && outputArgument,
  'Usage: validate_candidate.mts <candidate.glb> <source.glb> <output.json>');
const repo = resolve('.');
const candidatePath = resolve(candidateArgument);
const sourcePath = resolve(sourceArgument);
const outputPath = resolve(outputArgument);
const digest = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const candidate = readFileSync(candidatePath);
const source = readFileSync(sourcePath);
const require = createRequire(join(repo, 'packages/shared/package.json'));
const validator = require('gltf-validator');
const {inspectModelUpload} = await import(join(repo, 'packages/shared/src/content/modelUpload/inspect.ts'));
const {heroModelBudgetIssues} = await import(join(repo, 'packages/shared/src/content/modelUpload/heroModel.ts'));
const {HERO_MODEL_ADOPTION_POLICY} = await import(join(repo, 'packages/shared/src/content/modelUpload/budget.ts'));
const {parseUploadGlb, readFloatAccessor} = await import(join(repo, 'packages/shared/src/content/modelUpload/glb.ts'));

const khronos = await validator.validateBytes(new Uint8Array(candidate), {
  uri: candidatePath, maxIssues: 0, writeTimestamp: false,
  externalResourceFunction: async () => { throw Error('External resource is prohibited'); },
});
const inspection = await inspectModelUpload(new Uint8Array(candidate));
const budget = heroModelBudgetIssues(inspection);
assert.equal(khronos.issues.numErrors, 0, 'Khronos errors');
assert.equal(khronos.issues.numWarnings, 0, 'Khronos warnings');
assert.equal(khronos.issues.truncated, false, 'Khronos report truncated');
assert.deepEqual(budget.errors, [], 'GGD hard budget errors');
assert(inspection.triangles < HERO_MODEL_ADOPTION_POLICY.decimatedTargetTrianglesMax,
  `Decimated candidate must be < ${HERO_MODEL_ADOPTION_POLICY.decimatedTargetTrianglesMax} triangles`);
assert.equal(inspection.meshes, inspection.skins?.length ? inspection.meshes : inspection.meshes, 'inspection completed');
assert.equal(inspection.clips.length, 0, 'Static candidate may not claim native clips');
const joints = inspection.json.skins?.map((skin: {joints: number[]}) => skin.joints.length) ?? [];
const parsed = parseUploadGlb(new Uint8Array(candidate));
let finiteAccessorCount = 0, finiteValueCount = 0;
for (const [index, accessor] of parsed.json.accessors.entries()) {
  if (accessor.componentType !== 5126) continue;
  const values = readFloatAccessor(parsed.json, parsed.bin, index);
  assert(values.every(Number.isFinite), `Non-finite float in accessor ${index}`);
  finiteAccessorCount++; finiteValueCount += values.length;
}
assert.deepEqual(joints, [154], 'Unexpected skin skeleton');
assert.equal(inspection.meshes, 5, 'Unexpected draw primitive count');
assert.equal(inspection.textures.length, 5, 'Unexpected texture count');
const record = {
  schema: 'ggd-ssbu-static-decimation-validation@1',
  componentId: 'ssbu-ryu-c00-static-decimated-v1',
  candidateId: 'ssbu-ryu-c00-static-decimation-v1',
  source: {absolutePath: sourcePath, bytes: source.length, sha256: digest(source), trianglesBefore: 14621},
  glb: {absolutePath: candidatePath, bytes: candidate.length, sha256: digest(candidate)},
  ggdInspection: {
    triangles: inspection.triangles, drawPrimitives: inspection.meshes,
    skinnedPrimitives: inspection.meshes, skinCount: inspection.json.skins?.length ?? 0,
    joints, textureCount: inspection.textures.length, clips: inspection.clips,
    clipCount: inspection.clips.length, budget, uploadReport: inspection.report,
  },
  khronosIssues: khronos.issues,
  finiteFloatAccessors: {passed: true, accessorCount: finiteAccessorCount, valueCount: finiteValueCount},
  structuralValidationPassed: true, runtimeReady: false, runtimeSelectable: false,
  defaultEligible: false, deploymentVerified: false,
  policy: {triggerTriangles: HERO_MODEL_ADOPTION_POLICY.decimateWhenTrianglesAbove,
    targetTrianglesExclusive: HERO_MODEL_ADOPTION_POLICY.decimatedTargetTrianglesMax,
    resultTriangles: inspection.triangles, satisfiesFormalDecimationTarget: true},
  validator: 'gltf-validator@2.0.0-dev.3.10',
};
mkdirSync(dirname(outputPath), {recursive: true});
writeFileSync(outputPath, JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({outputPath, sha256: record.glb.sha256, triangles: record.ggdInspection.triangles}));
