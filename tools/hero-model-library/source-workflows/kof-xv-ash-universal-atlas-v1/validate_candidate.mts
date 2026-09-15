/** Validate one KOF XV Ash universal-atlas candidate without promoting a hero. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const [candidateArgument, sourceArgument, outputArgument, componentId] = process.argv.slice(2);
assert(candidateArgument && sourceArgument && outputArgument && componentId,
  'Usage: validate_candidate.mts <candidate.glb> <source.glb> <output.json> <component-id>');
const repo = resolve('.');
const candidatePath = resolve(candidateArgument);
const sourcePath = resolve(sourceArgument);
const digest = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const candidate = readFileSync(candidatePath);
const source = readFileSync(sourcePath);
const require = createRequire(join(repo, 'packages/shared/package.json'));
const validator = require('gltf-validator');
const { inspectModelUpload } = await import(join(repo, 'packages/shared/src/content/modelUpload/inspect.ts'));
const { heroModelBudgetIssues } = await import(join(repo, 'packages/shared/src/content/modelUpload/heroModel.ts'));
const { parseUploadGlb, readFloatAccessor } = await import(join(repo, 'packages/shared/src/content/modelUpload/glb.ts'));

const khronos = await validator.validateBytes(new Uint8Array(candidate), {
  uri: candidatePath, maxIssues: 0, writeTimestamp: false,
  externalResourceFunction: async () => { throw new Error('External resource is prohibited'); },
});
const inspection = await inspectModelUpload(new Uint8Array(candidate));
const parsed = parseUploadGlb(new Uint8Array(candidate));
const budget = heroModelBudgetIssues(inspection);
const joints = parsed.json.skins?.map((skin: {joints: number[]}) => skin.joints.length) ?? [];
const meshNodes = (parsed.json.nodes ?? []).filter((node: any) => typeof node.mesh === 'number');
const primitiveCount = (parsed.json.meshes ?? []).reduce((total: number, mesh: any) => total + (mesh.primitives?.length ?? 0), 0);
let finiteAccessorCount = 0;
let finiteValueCount = 0;
for (const [index, accessor] of parsed.json.accessors.entries()) {
  if (accessor.componentType !== 5126) continue;
  const values = readFloatAccessor(parsed.json, parsed.bin, index);
  assert(values.every(Number.isFinite), `Non-finite float in accessor ${index}`);
  finiteAccessorCount++; finiteValueCount += values.length;
}
assert.equal(khronos.issues.numErrors, 0, 'Khronos errors');
assert.equal(khronos.issues.truncated, false, 'Khronos result truncated');
assert.deepEqual(budget.errors, [], 'GGD hard budget errors');
assert.equal(inspection.triangles <= 8000, true, 'formal Ash triangle target');
assert.equal(primitiveCount, 5, 'unexpected Ash draw primitive count');
assert.equal(meshNodes.length, 2, 'unexpected Ash mesh-node count');
assert(meshNodes.every((node: any) => node.skin === 0), 'each Ash mesh node must remain bound to skin 0');
assert.deepEqual(joints, [258], 'unexpected Ash skeleton');
assert.equal(inspection.clips.length, 0, 'static candidate may not claim native clips');
const issueCodeCounts = Object.fromEntries([...new Set(khronos.issues.messages.map((issue: any) => issue.code))]
  .sort().map((code) => [code, khronos.issues.messages.filter((issue: any) => issue.code === code).length]));
const record = {
  schema: 'ggd.kof-xv-ash-universal-atlas-component-validation@1', componentId,
  source: { absolutePath: sourcePath, bytes: source.length, sha256: digest(source) },
  glb: { absolutePath: candidatePath, bytes: candidate.length, sha256: digest(candidate) },
  ggdInspection: {
    triangles: inspection.triangles, drawPrimitives: primitiveCount, skinnedPrimitives: primitiveCount,
    skinCount: parsed.json.skins?.length ?? 0, joints, textureCount: parsed.json.images?.length ?? 0,
    clipCount: inspection.clips.length, budget, uploadReport: inspection.report,
  },
  khronosIssues: { ...khronos.issues, issueCodeCounts },
  finiteFloatAccessors: { passed: true, accessorCount: finiteAccessorCount, valueCount: finiteValueCount },
  structuralValidationPassed: true,
  runtimeReady: false, runtimeSelectable: false, defaultEligible: false, deploymentVerified: false,
  limitations: [
    'This is an independently reusable static skinned component, not a complete hero.',
    'The source has zero native animation clips; no gameplay motion, backend dropdown registration, runtime switch or deployment is claimed.',
    'Five draw primitives pass the current hard six-draw ceiling but exceed the three-draw warning threshold.',
  ],
  validator: 'gltf-validator@2.0.0-dev.3.10',
};
mkdirSync(dirname(resolve(outputArgument)), { recursive: true });
writeFileSync(resolve(outputArgument), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ componentId, sha256: record.glb.sha256, triangles: record.ggdInspection.triangles,
  drawPrimitives: record.ggdInspection.drawPrimitives, khronosWarnings: record.khronosIssues.numWarnings }));
