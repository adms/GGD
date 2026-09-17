/** Validate one FateUBW native-motion pilot against Khronos and GGD contracts. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve, join} from 'node:path';

const [repoArg, conversionArg] = process.argv.slice(2);
if (!repoArg || !conversionArg) throw Error('usage: validate_native_animation.mts <repo> <conversion-root>');
const repo = resolve(repoArg), root = resolve(conversionArg);
const conversion = JSON.parse(readFileSync(join(root, 'conversion-report.json'), 'utf8'));
assert.equal(conversion.schema, 'ggd-bedrock-native-animation-glb-conversion@1');
const modelPath = join(root, 'body.glb');
const bytes = readFileSync(modelPath);
const digest = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
assert.equal(digest(bytes), conversion.output.sha256);
assert.equal(bytes.length, conversion.output.bytes);

const require = createRequire(join(repo, 'packages/shared/package.json'));
const validator = require('gltf-validator');
const khronos = await validator.validateBytes(new Uint8Array(bytes), {
  uri: conversion.candidateId + '/body.glb', maxIssues: 0, writeTimestamp: false,
  externalResourceFunction: async () => { throw Error('external resources prohibited'); },
});
const {inspectModelUpload} = await import(join(repo, 'packages/shared/src/content/modelUpload/inspect.ts'));
const {heroModelBudgetIssues} = await import(join(repo, 'packages/shared/src/content/modelUpload/heroModel.ts'));
const inspection = await inspectModelUpload(new Uint8Array(bytes));
const budget = heroModelBudgetIssues(inspection);
const expectedNames = conversion.clips.filter((row: {converted: boolean}) => row.converted)
  .map((row: {name: string}) => row.name);
const actualNames = inspection.clips.map((row: {name: string}) => row.name);
assert.equal(khronos.issues.numErrors, 0, 'Khronos errors');
assert.equal(khronos.issues.truncated, false, 'Khronos validation truncated');
assert.deepEqual(budget.errors, [], 'GGD model budget errors');
assert.deepEqual(actualNames, expectedNames, 'native clip names/order changed');
assert.equal(inspection.json.skins?.length ?? 0, 1, 'expected one rigid Bedrock skin');
assert.equal(inspection.json.animations?.length ?? 0, conversion.output.animationCount);
assert.equal(inspection.json.images?.length ?? 0, 1, 'expected embedded source texture');
assert.equal(inspection.json.buffers?.length ?? 0, 1, 'external buffers prohibited');

const report = {
  schema: 'ggd-fateubw-native-motion-contract-validation@1',
  candidateId: conversion.candidateId,
  sourceId: conversion.sourceId,
  path: modelPath,
  sha256: digest(bytes),
  bytes: bytes.length,
  validator: 'gltf-validator@2.0.0-dev.3.10',
  khronos,
  ggdInspection: {
    triangles: inspection.triangles,
    meshes: inspection.meshes,
    textures: inspection.textures,
    clips: inspection.clips,
    report: inspection.report,
    budget,
  },
  assertions: {
    allKhronosErrorsZero: true,
    khronosWarningsZero: khronos.issues.numWarnings === 0,
    allGgdBudgetErrorsZero: true,
    exactNativeClipNames: true,
    oneSkin: true,
    oneEmbeddedTexture: true,
  },
  scope: 'Structural validation only. Source-engine curve parity, rendered motion quality, action/event mapping, rights, backend selection and deployment remain unverified.',
};
writeFileSync(join(root, 'contract-validation.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({candidateId: report.candidateId, sha256: report.sha256,
  clips: actualNames.length, khronosErrors: khronos.issues.numErrors,
  khronosWarnings: khronos.issues.numWarnings, budgetErrors: budget.errors.length}));
