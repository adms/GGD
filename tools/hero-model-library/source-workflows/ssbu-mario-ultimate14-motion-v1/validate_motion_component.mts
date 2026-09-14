/** Validate the Mario GLB carrying five pinned Ultimate14 Transform animations. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';

const [glbArgument, blenderReceiptArgument, importReceiptArgument, normalizationReceiptArgument, outputArgument] = process.argv.slice(2);
if (!glbArgument || !blenderReceiptArgument || !importReceiptArgument || !normalizationReceiptArgument || !outputArgument) {
  throw new Error(
    'Usage: validate_motion_component.mts <component.glb> <conversion.json> <import-receipt.json> <normalization.json> <validation.json>',
  );
}

const repo = resolve('.');
const glbPath = resolve(glbArgument);
const blenderReceiptPath = resolve(blenderReceiptArgument);
const importReceiptPath = resolve(importReceiptArgument);
const normalizationReceiptPath = resolve(normalizationReceiptArgument);
const outputPath = resolve(outputArgument);
const bytes = readFileSync(glbPath);
const blenderReceipt = JSON.parse(readFileSync(blenderReceiptPath, 'utf8'));
const importReceipt = JSON.parse(readFileSync(importReceiptPath, 'utf8'));
const normalizationReceipt = JSON.parse(readFileSync(normalizationReceiptPath, 'utf8'));
const digest = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');

assert.equal(digest(bytes), normalizationReceipt.output.sha256, 'GLB differs from normalization receipt');
assert.equal(bytes.length, normalizationReceipt.output.bytes, 'GLB size differs from normalization receipt');
assert.equal(normalizationReceipt.source.sha256, blenderReceipt.output.sha256, 'Normalizer did not use Blender output');
assert.equal(normalizationReceipt.source.bytes, blenderReceipt.output.bytes, 'Normalizer input size differs from Blender output');
assert.equal(normalizationReceipt.binaryChunkByteIdentical, true);
assert.equal(normalizationReceipt.nonMaterialJsonSemanticIdentical, true);
assert.equal(normalizationReceipt.animationJsonSemanticIdentical, true);
assert.equal(
  blenderReceipt.input.sha256,
  importReceipt.output.sha256,
  'Blender export did not use the pinned animated intermediate',
);

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

const expectedClips = importReceipt.imports.map((row: {action: string}) => row.action).sort();
const actualClips = inspection.clips.map((row: {name: string}) => row.name).sort();
assert.deepEqual(actualClips, expectedClips, 'Exported clips differ from pinned NUANMB imports');
assert.equal(actualClips.length, 5, 'Expected exactly five distinct Mario body motions');

const document = inspection.json as typeof inspection.json & {
  animations?: {
    name?: string;
    channels: {sampler: number; target: {node?: number; path: string}}[];
    samplers: {input: number; output: number; interpolation?: string}[];
  }[];
  skins?: {joints: number[]}[];
};
assert.equal(document.skins?.length, 1, 'Expected one skin');
const jointIndices = new Set(document.skins![0]!.joints);
const animationChecks = [];
for (const animation of document.animations ?? []) {
  const targetPaths = new Map<number, Set<string>>();
  const timeAccessors = new Set<number>();
  for (const channel of animation.channels) {
    assert.notEqual(channel.target.node, undefined, `${animation.name} has a channel without a node`);
    assert(jointIndices.has(channel.target.node!), `${animation.name} targets a node outside the skin`);
    assert(
      ['translation', 'rotation', 'scale'].includes(channel.target.path),
      `${animation.name} has a non-TRS channel`,
    );
    const paths = targetPaths.get(channel.target.node!) ?? new Set<string>();
    assert(!paths.has(channel.target.path), `${animation.name} repeats a TRS channel`);
    paths.add(channel.target.path);
    targetPaths.set(channel.target.node!, paths);
    timeAccessors.add(animation.samplers[channel.sampler]!.input);
  }
  assert.deepEqual(new Set(targetPaths.keys()), jointIndices, `${animation.name} does not target every skin joint`);
  for (const paths of targetPaths.values()) {
    assert.deepEqual([...paths].sort(), ['rotation', 'scale', 'translation']);
  }
  const timeChecks = [];
  for (const accessorIndex of [...timeAccessors].sort((a, b) => a - b)) {
    const values = readFloatAccessor(inspection.json, inspection.bin, accessorIndex);
    assert(values.length > 1, `${animation.name} has no time extent`);
    for (let index = 0; index < values.length; index++) {
      assert(Number.isFinite(values[index]), `${animation.name} has non-finite time values`);
      if (index > 0) assert(values[index]! > values[index - 1]!, `${animation.name} times are not increasing`);
    }
    timeChecks.push({
      accessor: accessorIndex,
      count: values.length,
      minimum: values[0],
      maximum: values[values.length - 1],
    });
  }
  animationChecks.push({
    name: animation.name,
    channelCount: animation.channels.length,
    targetedJointCount: targetPaths.size,
    timeAccessors: timeChecks,
  });
}

let floatAccessorCount = 0;
let floatValueCount = 0;
for (let index = 0; index < inspection.json.accessors.length; index++) {
  const accessor = inspection.json.accessors[index]!;
  if (accessor.componentType !== 5126) continue;
  const values = readFloatAccessor(inspection.json, inspection.bin, index);
  for (const value of values) assert(Number.isFinite(value), `Accessor ${index} contains a non-finite float`);
  floatAccessorCount++;
  floatValueCount += values.length;
}

const result = {
  schema: 'ggd-ssbu-mario-ultimate14-motion-validation@1',
  candidateId: blenderReceipt.candidateId,
  sourceIds: ['gitlab-ssbu-models', 'parallel-ns-ultimate14'],
  glb: {path: glbPath, bytes: bytes.length, sha256: digest(bytes)},
  blenderReceipt: {path: blenderReceiptPath, sha256: digest(readFileSync(blenderReceiptPath))},
  importReceipt: {path: importReceiptPath, sha256: digest(readFileSync(importReceiptPath))},
  normalizationReceipt: {path: normalizationReceiptPath, sha256: digest(readFileSync(normalizationReceiptPath))},
  validator: 'gltf-validator@2.0.0-dev.3.10',
  khronosIssues: khronos.issues,
  ggdInspection: {
    triangles: inspection.triangles,
    drawPrimitives: inspection.meshes,
    skinnedPrimitives: inspection.skinnedPrimitives,
    skinCount: inspection.skins,
    jointCount: jointIndices.size,
    textureCount: inspection.textures.length,
    textures: inspection.textures,
    clips: inspection.clips,
    budget,
  },
  animationChecks,
  finiteFloatAccessors: {passed: true, accessorCount: floatAccessorCount, valueCount: floatValueCount},
  structuralValidationPassed: true,
  visualPlaybackValidationPassed: false,
  completeGameplayActionSet: false,
  runtimeReady: false,
  runtimeSelectable: false,
  defaultEligible: false,
  limitations: [
    'Five Ultimate14 community MOD body motions are preserved; this is not Mario\'s complete original action set.',
    'TRS channels target all 98 skin joints and pass structural checks, but visual playback acceptance is separate.',
    'Visibility and material tracks were not imported into this body-motion GLB.',
    'No GGD semantic action mapping, hero definition, backend registration, runtime switching or deployment was performed.',
  ],
};
mkdirSync(dirname(outputPath), {recursive: true});
writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({
  output: outputPath,
  sha256: result.glb.sha256,
  khronosErrors: khronos.issues.numErrors,
  khronosWarnings: khronos.issues.numWarnings,
  clips: inspection.clips,
  joints: jointIndices.size,
  animationChannels: animationChecks.map(row => [row.name, row.channelCount]),
  floatValuesChecked: floatValueCount,
  budgetErrors: budget.errors.length,
  budgetWarnings: budget.warnings,
}));
