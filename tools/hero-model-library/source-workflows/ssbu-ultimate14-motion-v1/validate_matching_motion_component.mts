/** Validate matching-rig SSBU GLBs carrying pinned Ultimate14 Transform tracks. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join, resolve} from 'node:path';

const [glbArgument, blenderReceiptArgument, importReceiptArgument, outputArgument] = process.argv.slice(2);
if (!glbArgument || !blenderReceiptArgument || !importReceiptArgument || !outputArgument) {
  throw new Error('Usage: validate_matching_motion_component.mts <component.glb> <conversion.json> <import-receipt.json> <validation.json>');
}

const repo = resolve('.');
const glbPath = resolve(glbArgument);
const blenderReceiptPath = resolve(blenderReceiptArgument);
const importReceiptPath = resolve(importReceiptArgument);
const outputPath = resolve(outputArgument);
const bytes = readFileSync(glbPath);
const blenderReceipt = JSON.parse(readFileSync(blenderReceiptPath, 'utf8'));
const importReceipt = JSON.parse(readFileSync(importReceiptPath, 'utf8'));
const motionIndex = JSON.parse(readFileSync(importReceipt.motionIndex.path, 'utf8'));
const digest = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');

assert.equal(digest(bytes), blenderReceipt.output.sha256, 'GLB differs from conversion-chain receipt');
assert.equal(bytes.length, blenderReceipt.output.bytes, 'GLB size differs from conversion-chain receipt');
if (blenderReceipt.schema === 'ggd-ssbu-ultimate14-motion-optimization@1') {
  const rawConversion = JSON.parse(readFileSync(blenderReceipt.inputConversion.path, 'utf8'));
  assert.equal(blenderReceipt.input.sha256, rawConversion.output.sha256, 'Optimization input differs from Blender output');
  assert.equal(rawConversion.input.sha256, importReceipt.output.sha256, 'Blender export did not use the pinned animated intermediate');
} else {
  assert.equal(blenderReceipt.input.sha256, importReceipt.output.sha256, 'Export did not use the pinned animated intermediate');
}
assert.equal(importReceipt.schema, 'ggd-ssbu-ultimate14-action-import@1');
assert(importReceipt.imports.length > 0, 'No pinned motion was imported');
assert.equal(new Set(importReceipt.imports.map((row: {sha256: string}) => row.sha256)).size, importReceipt.imports.length, 'Duplicate motion payloads');

const payloadBySha = new Map(motionIndex.payloads.map((row: {sha256: string; transformNodeNames: string[]}) => [row.sha256, row]));
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
assert.deepEqual(budget.errors, [], 'Current GGD hard policy errors');
assert(inspection.skins > 0, 'No skin in exported component');
assert.equal(inspection.skinnedPrimitives, inspection.meshes, 'Every rendered primitive must be skinned');
const expectedClips = importReceipt.imports.map((row: {action: string}) => row.action).sort();
const actualClips = inspection.clips.map((row: {name: string}) => row.name).sort();
assert.deepEqual(actualClips, expectedClips, 'Exported clips differ from pinned NUANMB imports');

const document = inspection.json as typeof inspection.json & {
  nodes?: {name?: string}[];
  animations?: {name?: string; channels: {sampler: number; target: {node?: number; path: string}}[]; samplers: {input: number; output: number}[]}[];
  skins?: {joints: number[]}[];
};
assert.equal(document.skins?.length, 1, 'Expected one skin');
const jointIndices = new Set(document.skins![0]!.joints);
assert.equal(jointIndices.size, importReceipt.armature.boneCount, 'Exported skin differs from matching source armature');
const nodeByName = new Map((document.nodes ?? []).map((row, index) => [row.name, index]));
const importByAction = new Map(importReceipt.imports.map((row: {action: string; sha256: string}) => [row.action, row]));
const animationChecks = [];
for (const animation of document.animations ?? []) {
  const imported = importByAction.get(animation.name!);
  assert(imported, `Unpinned animation ${animation.name}`);
  const payload = payloadBySha.get((imported as {sha256: string}).sha256) as {transformNodeNames: string[]} | undefined;
  assert(payload, `Motion index lacks ${animation.name}`);
  const expectedTargetIndices = new Set(payload.transformNodeNames.map(name => {
    const index = nodeByName.get(name);
    assert.notEqual(index, undefined, `${animation.name} target node missing from GLB: ${name}`);
    return index!;
  }));
  const targetPaths = new Map<number, Set<string>>();
  const timeAccessors = new Set<number>();
  for (const channel of animation.channels) {
    assert.notEqual(channel.target.node, undefined, `${animation.name} has a channel without a node`);
    assert(jointIndices.has(channel.target.node!), `${animation.name} targets a node outside the skin`);
    assert(['translation', 'rotation', 'scale'].includes(channel.target.path), `${animation.name} has a non-TRS channel`);
    const paths = targetPaths.get(channel.target.node!) ?? new Set<string>();
    assert(!paths.has(channel.target.path), `${animation.name} repeats a TRS channel`);
    paths.add(channel.target.path);
    targetPaths.set(channel.target.node!, paths);
    timeAccessors.add(animation.samplers[channel.sampler]!.input);
  }
  for (const expected of expectedTargetIndices) assert(targetPaths.has(expected), `${animation.name} omits a pinned Transform node`);
  assert.deepEqual(new Set(targetPaths.keys()), jointIndices, `${animation.name} must contain sampled TRS channels for the complete skin`);
  for (const paths of targetPaths.values()) assert.deepEqual([...paths].sort(), ['rotation', 'scale', 'translation']);
  const timeChecks = [];
  for (const accessorIndex of [...timeAccessors].sort((a, b) => a - b)) {
    const values = readFloatAccessor(inspection.json, inspection.bin, accessorIndex);
    assert(values.length > 1, `${animation.name} has no time extent`);
    for (let index = 0; index < values.length; index++) {
      assert(Number.isFinite(values[index]), `${animation.name} has non-finite time values`);
      if (index > 0) assert(values[index]! > values[index - 1]!, `${animation.name} times are not increasing`);
    }
    timeChecks.push({accessor: accessorIndex, count: values.length, minimum: values[0], maximum: values.at(-1)});
  }
  animationChecks.push({
    name: animation.name,
    channelCount: animation.channels.length,
    targetedJointCount: targetPaths.size,
    pinnedTransformNodeCount: expectedTargetIndices.size,
    exporterEvaluatedAdditionalJointCount: targetPaths.size - expectedTargetIndices.size,
    timeAccessors: timeChecks,
  });
}

let floatAccessorCount = 0;
let floatValueCount = 0;
for (let index = 0; index < inspection.json.accessors.length; index++) {
  if (inspection.json.accessors[index]!.componentType !== 5126) continue;
  const values = readFloatAccessor(inspection.json, inspection.bin, index);
  for (const value of values) assert(Number.isFinite(value), `Accessor ${index} contains a non-finite float`);
  floatAccessorCount++;
  floatValueCount += values.length;
}

const result = {
  schema: 'ggd-ssbu-ultimate14-matching-motion-validation@1',
  candidateId: blenderReceipt.candidateId,
  fighterId: importReceipt.fighterId,
  sourceIds: ['gitlab-ssbu-models', 'parallel-ns-ultimate14'],
  glb: {path: glbPath, bytes: bytes.length, sha256: digest(bytes)},
  blenderReceipt: {path: blenderReceiptPath, sha256: digest(readFileSync(blenderReceiptPath))},
  importReceipt: {path: importReceiptPath, sha256: digest(readFileSync(importReceiptPath))},
  motionIndex: {path: importReceipt.motionIndex.path, sha256: importReceipt.motionIndex.sha256},
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
    `The ${importReceipt.imports.length} Transform motions are native to the acquired Ultimate14 community MOD, not verified Nintendo-original animations and not retargeted animations.`,
    'This is an incomplete gameplay action set and has no GGD semantic action mapping.',
    'Visibility and material tracks were not imported into this body-motion GLB.',
    'No hero binding, backend registration, runtime switching or deployment was performed.',
  ],
};
mkdirSync(dirname(outputPath), {recursive: true});
writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({output: outputPath, fighterId: result.fighterId, sha256: result.glb.sha256, khronosErrors: khronos.issues.numErrors, khronosWarnings: khronos.issues.numWarnings, clips: inspection.clips.length, joints: jointIndices.size, triangles: inspection.triangles, draws: inspection.meshes, textures: inspection.textures.length, budgetErrors: budget.errors.length, budgetWarnings: budget.warnings}));
