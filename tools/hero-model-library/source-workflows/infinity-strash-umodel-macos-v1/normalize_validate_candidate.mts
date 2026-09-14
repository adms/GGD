/** Normalize one assembled candidate through the unchanged current GGD upload pipeline. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const [repoArg, inputArg, outputArg] = process.argv.slice(2);
if (!outputArg) throw Error('usage: node --import tsx normalize_validate_candidate.mts <GGD repo> <candidate GLB> <new output directory>');
const repo = resolve(repoArg), inputPath = resolve(inputArg), output = resolve(outputArg);
mkdirSync(output, {recursive: false});
const bytes = readFileSync(inputPath);
const sha = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const save = (name: string, value: unknown) => writeFileSync(join(output, name), JSON.stringify(value, null, 2) + '\n', {flag: 'wx'});
const imp = (path: string) => import(pathToFileURL(join(repo, path)).href);

const [{normalizeUploadedModel}, {inspectModelUpload}, {resizeImageWithFfmpeg}, {heroModelBudgetIssues}, {HERO_MODEL_BUDGET}] = await Promise.all([
  imp('packages/shared/src/content/modelUpload/normalize.ts'),
  imp('packages/shared/src/content/modelUpload/inspect.ts'),
  imp('apps/content-api/src/resizeImage.node.ts'),
  imp('packages/shared/src/content/modelUpload/heroModel.ts'),
  imp('packages/shared/src/content/modelUpload/budget.ts'),
]);
const shared = createRequire(join(repo, 'packages/shared/package.json'));
const validator = shared('gltf-validator');
const khronos = await validator.validateBytes(new Uint8Array(bytes), {
  format: 'glb', maxIssues: 10000, writeTimestamp: false,
  externalResourceFunction: async () => { throw Error('external GLB resource rejected'); },
});
save('khronos-input.json', khronos);
assert.equal(khronos.issues.numErrors, 0, JSON.stringify(khronos.issues));
assert.equal(khronos.issues.truncated, false);

const before = await inspectModelUpload(new Uint8Array(bytes), 'model');
const normalized = await normalizeUploadedModel(new Uint8Array(bytes), {
  maxTextureEdge: HERO_MODEL_BUDGET.texEdge.limit,
  resizeImage: resizeImageWithFfmpeg,
});
const after = await inspectModelUpload(normalized.bytes, 'model');
const normalizedPath = join(output, basename(inputPath, '.glb') + '-ggd-normalized.glb');
writeFileSync(normalizedPath, normalized.bytes, {flag: 'wx'});
const budget = heroModelBudgetIssues(after);
const hasNativeAnimations = after.clips.length > 0;
save('ggd-upload.json', {
  schema: 'ggd.infinity-strash-current-upload-validation@1',
  input: {path: inputPath, bytes: bytes.length, sha256: sha(bytes)},
  output: {path: normalizedPath, bytes: normalized.bytes.length, sha256: sha(normalized.bytes)},
  inputInspection: {meshes: before.meshes, triangles: before.triangles, clips: before.clips, textures: before.textures, report: before.report},
  outputInspection: {meshes: after.meshes, triangles: after.triangles, clips: after.clips, textures: after.textures, report: after.report},
  normalization: normalized.report,
  heroBudget: budget,
  staticCandidateOnly: !hasNativeAnimations,
  nativeAnimationEmbedded: hasNativeAnimations,
  runtimeRegistration: false,
  deploymentVerified: false,
});

const client = createRequire(join(repo, 'apps/client/package.json'));
const moduleOf = (name: string) => import(pathToFileURL(client.resolve(name)).href);
const [{NullEngine}, {Engine}, {Scene}, {LoadAssetContainerAsync}] = await Promise.all([
  moduleOf('@babylonjs/core/Engines/nullEngine.js'),
  moduleOf('@babylonjs/core/Engines/engine.js'),
  moduleOf('@babylonjs/core/scene.js'),
  moduleOf('@babylonjs/core/Loading/sceneLoader.js'),
]);
await moduleOf('@babylonjs/loaders/glTF/index.js');
const engine = new NullEngine(), scene = new Scene(engine);
scene.useRightHandedSystem = true;
try {
  const container = await LoadAssetContainerAsync(new Uint8Array(normalized.bytes), scene, {
    pluginExtension: '.glb', pluginOptions: {gltf: {skipMaterials: true, animationStartMode: 0}},
  });
  container.addAllToScene();
  const meshes = container.meshes.filter((mesh: any) => mesh.getTotalVertices() > 0);
  const meshRows = meshes.map((mesh: any) => {
    const positions = Array.from(mesh.getVerticesData('position') ?? []) as number[];
    assert.ok(positions.length > 0 && positions.every(Number.isFinite), 'Babylon mesh positions must be finite');
    return {name: mesh.name, vertices: mesh.getTotalVertices(), positionCoordinates: positions.length};
  });
  save('babylon-nullengine.json', {
    schema: 'ggd.infinity-strash-babylon-static-load@1',
    modelSha256: sha(normalized.bytes),
    babylonVersion: Engine.Version,
    meshes: meshRows,
    skeletonBoneCounts: container.skeletons.map((skeleton: any) => skeleton.bones.length),
    animationGroups: container.animationGroups.map((animation: any) => animation.name),
    finiteRestPosePositions: true,
    materialsSkippedForCpuValidation: true,
    webglVisualReview: 'pending-test-mechanism-recovery',
    runtimeRegistration: false,
    deploymentVerified: false,
  });
  console.log(JSON.stringify({
    inputSha256: sha(bytes), outputSha256: sha(normalized.bytes),
    khronosErrors: khronos.issues.numErrors, meshes: meshRows.length,
    bones: container.skeletons.map((skeleton: any) => skeleton.bones.length),
    clips: after.clips.length, textures: after.textures.length,
    uploadErrors: after.report.issues.numErrors, heroBudget: budget,
  }));
} finally {
  scene.dispose(); engine.dispose();
}
