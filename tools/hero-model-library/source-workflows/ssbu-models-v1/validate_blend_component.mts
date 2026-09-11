/** Validate one Blender-exported SSBU GLB against Khronos and current GGD contracts. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';

const [glbArgument, conversionArgument, outputArgument] = process.argv.slice(2);
if (!glbArgument || !conversionArgument || !outputArgument) {
  throw new Error('Usage: validate_blend_component.mts <body.glb> <conversion.json> <output.json>');
}
const repo = resolve('.');
const glbPath = resolve(glbArgument);
const conversionPath = resolve(conversionArgument);
const outputPath = resolve(outputArgument);
const bytes = readFileSync(glbPath);
const conversion = JSON.parse(readFileSync(conversionPath, 'utf8'));
const digest = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');

assert.equal(digest(bytes), conversion.output.sha256, 'GLB differs from conversion receipt');
assert.equal(bytes.length, conversion.output.bytes, 'GLB size differs from conversion receipt');

const require = createRequire(join(repo, 'packages/shared/package.json'));
const validator = require('gltf-validator');
const {inspectModelUpload} = await import(join(repo, 'packages/shared/src/content/modelUpload/inspect.ts'));
const {heroModelBudgetIssues} = await import(join(repo, 'packages/shared/src/content/modelUpload/heroModel.ts'));
const {readFloatAccessor} = await import(join(repo, 'packages/shared/src/content/modelUpload/glb.ts'));

const khronos = await validator.validateBytes(new Uint8Array(bytes), {
  uri: glbPath,
  maxIssues: 0,
  writeTimestamp: false,
  externalResourceFunction: async () => { throw new Error('External resources prohibited'); },
});
assert.equal(khronos.issues.numErrors, 0, 'Khronos validation errors');
assert.equal(khronos.issues.truncated, false, 'Khronos validation report truncated');

const inspection = await inspectModelUpload(new Uint8Array(bytes));
const budget = heroModelBudgetIssues(inspection);
assert.deepEqual(budget.errors, [], 'Current GGD model budget errors');
assert(inspection.skins > 0, 'No skin in exported component');
assert.equal(inspection.skinnedPrimitives, inspection.meshes, 'Every rendered primitive must be skinned');
assert.equal(inspection.clips.length, conversion.sourceActionCount, 'Exported clip count differs from source action count');

let floatAccessorCount = 0;
let floatValueCount = 0;
const accessorChecks = [];
for (let index = 0; index < inspection.json.accessors.length; index++) {
  const accessor = inspection.json.accessors[index]!;
  if (accessor.componentType !== 5126) continue;
  const values = readFloatAccessor(inspection.json, inspection.bin, index);
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const value of values) {
    assert(Number.isFinite(value), `Accessor ${index} contains a non-finite float`);
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  floatAccessorCount++;
  floatValueCount += values.length;
  accessorChecks.push({index, type: accessor.type, count: accessor.count, values: values.length, minimum, maximum});
}

const json = inspection.json as typeof inspection.json & {
  materials?: {name?: string; alphaMode?: string; doubleSided?: boolean}[];
  meshes?: {name?: string; primitives: {attributes: Record<string, number>; material?: number}[]}[];
};
const primitives = (json.meshes ?? []).flatMap((mesh, meshIndex) =>
  mesh.primitives.map((primitive, primitiveIndex) => ({
    meshIndex,
    meshName: mesh.name ?? null,
    primitiveIndex,
    attributes: Object.keys(primitive.attributes).sort(),
    materialIndex: primitive.material ?? null,
  })),
);

const result = {
  schema: 'ggd-ssbu-blend-component-validation@1',
  candidateId: conversion.candidateId,
  sourceId: conversion.sourceId,
  input: conversion.input,
  glb: {path: glbPath, bytes: bytes.length, sha256: digest(bytes)},
  conversionReceipt: {path: conversionPath, sha256: digest(readFileSync(conversionPath))},
  validator: 'gltf-validator@2.0.0-dev.3.10',
  khronosIssues: khronos.issues,
  ggdInspection: {
    triangles: inspection.triangles,
    drawPrimitives: inspection.meshes,
    skinnedPrimitives: inspection.skinnedPrimitives,
    skinCount: inspection.skins,
    joints: inspection.json.skins?.map((skin: {joints: number[]}) => skin.joints.length) ?? [],
    textureCount: inspection.textures.length,
    textures: inspection.textures,
    clipCount: inspection.clips.length,
    clips: inspection.clips,
    budget,
    uploadReport: inspection.report,
  },
  finiteFloatAccessors: {
    passed: true,
    accessorCount: floatAccessorCount,
    valueCount: floatValueCount,
    accessors: accessorChecks,
  },
  materials: (json.materials ?? []).map((material, index) => ({index, ...material})),
  primitives,
  structuralValidationPassed: true,
  visualValidationPassed: false,
  runtimeReady: false,
  runtimeSelectable: false,
  defaultEligible: false,
  limitations: [
    'Structural validation does not establish visual identity or source-game shader parity.',
    'The source contains no actions; no native, procedural, or retargeted action was added.',
    'Backend registration and runtime switching were not performed.',
  ],
};
mkdirSync(dirname(outputPath), {recursive: true});
writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({
  output: outputPath,
  sha256: result.glb.sha256,
  khronosErrors: khronos.issues.numErrors,
  khronosWarnings: khronos.issues.numWarnings,
  triangles: inspection.triangles,
  drawPrimitives: inspection.meshes,
  skins: inspection.skins,
  floatValuesChecked: floatValueCount,
  clips: inspection.clips.length,
  budgetErrors: budget.errors.length,
}));
