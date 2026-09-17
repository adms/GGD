/** Validate Bojji crown policy and byte preservation against the approved source. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const [repoArg, sourceArg, candidateArg, outputArg] = process.argv.slice(2);
if (!outputArg) throw Error('usage: validate_candidate.mts <repo> <source.glb> <candidate.glb> <output.json>');
const repo = path.resolve(repoArg), sourcePath = path.resolve(sourceArg), candidatePath = path.resolve(candidateArg), outputPath = path.resolve(outputArg);
const imp = (name: string) => import(pathToFileURL(path.join(repo, name)).href);
const [{inspectModelUpload}, {heroModelBudgetIssues}, {HERO_MODEL_BUDGET, HERO_MODEL_ADOPTION_POLICY}, glb] = await Promise.all([
  imp('packages/shared/src/content/modelUpload/inspect.ts'),
  imp('packages/shared/src/content/modelUpload/heroModel.ts'),
  imp('packages/shared/src/content/modelUpload/budget.ts'),
  imp('tools/model-budget/glb.ts'),
]);
const validator = createRequire(path.join(repo, 'packages/shared/package.json'))('gltf-validator');
const digest = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const sourceBytes = fs.readFileSync(sourcePath), candidateBytes = fs.readFileSync(candidatePath);
assert.equal(digest(sourceBytes), '745fe9a31c9ed44098f7d92984de88e81f5ddf6605c7327f327ddcd82ee96581', 'approved Bojji source changed');
const [source, candidate] = await Promise.all([inspectModelUpload(sourceBytes), inspectModelUpload(candidateBytes)]);
const khronos = await validator.validateBytes(new Uint8Array(candidateBytes), {
  uri: 'bojji-crown-v1.glb', maxIssues: 10000, writeTimestamp: false,
  externalResourceFunction: async () => { throw Error('external resource rejected'); },
});
const budget = heroModelBudgetIssues(candidate);
assert.equal(khronos.issues.numErrors, 0, 'Khronos errors');
assert.equal(khronos.issues.truncated, false, 'Khronos validation truncated');
assert.deepEqual(budget.errors, [], 'GGD budget errors');
assert(candidate.triangles <= 8000, 'owner target must remain at or below 8,000 triangles');
assert(candidate.meshes <= 6, 'draw primitive limit exceeded');
assert.equal(Math.max(...candidate.textures.flatMap((t: {width: number, height: number}) => [t.width, t.height])), 256, 'texture edge changed');
assert.deepEqual(candidate.clips, source.clips, 'source-native clip metadata changed');
assert.equal(candidate.json.skins?.length, source.json.skins?.length, 'skin count changed');
assert.deepEqual(candidate.json.skins, source.json.skins, 'skin definitions changed');
assert.deepEqual(candidate.json.animations, source.json.animations, 'animation definitions changed');
assert.deepEqual(candidate.json.images, source.json.images, 'embedded image definitions changed');
assert.deepEqual(candidate.json.textures, source.json.textures, 'texture definitions changed');
assert.deepEqual(candidate.json.meshes.slice(0, source.json.meshes.length), source.json.meshes, 'source meshes changed');
assert.deepEqual(candidate.json.materials.slice(0, source.json.materials.length), source.json.materials, 'source materials changed');

const sourceGlb = glb.readGlb(sourcePath), candidateGlb = glb.readGlb(candidatePath);
assert(candidateGlb.bin.subarray(0, sourceGlb.bin.length).equals(sourceGlb.bin), 'source BIN prefix changed');
const crownNodeIndex = candidate.json.nodes.findIndex((node: {name?: string}) => node.name === 'GGD Bojji Crown');
const headNodeIndex = candidate.json.nodes.findIndex((node: {name?: string}) => node.name === 'Bip001 Head');
assert(crownNodeIndex >= 0 && headNodeIndex >= 0, 'crown/head node missing');
const crownNode = candidate.json.nodes[crownNodeIndex];
assert.equal(crownNode.skin, 0, 'crown must use the source skin');
assert(candidate.json.scenes[candidate.json.scene ?? 0].nodes?.includes(crownNodeIndex), 'crown node is not in the default scene');
const crownMesh = candidate.json.meshes[crownNode.mesh];
assert.equal(crownMesh.primitives.length, 1, 'crown must use one draw primitive');
const crownIndices = candidate.json.accessors[crownMesh.primitives[0].indices];
assert.equal(crownIndices.count / 3, 64, 'crown topology changed');
assert.equal(crownMesh.primitives[0].attributes.JOINTS_0 !== undefined, true, 'crown joints missing');
assert.equal(crownMesh.primitives[0].attributes.WEIGHTS_0 !== undefined, true, 'crown weights missing');
assert.equal(crownNode.extras?.headJointSlot, candidate.json.skins[0].joints.indexOf(headNodeIndex), 'head joint slot mismatch');
const jointsAccessor = candidate.json.accessors[crownMesh.primitives[0].attributes.JOINTS_0];
const weightsAccessor = candidate.json.accessors[crownMesh.primitives[0].attributes.WEIGHTS_0];
const jointsView = candidate.json.bufferViews[jointsAccessor.bufferView];
const weightsView = candidate.json.bufferViews[weightsAccessor.bufferView];
const jointsStart = (jointsView.byteOffset ?? 0) + (jointsAccessor.byteOffset ?? 0);
const weightsStart = (weightsView.byteOffset ?? 0) + (weightsAccessor.byteOffset ?? 0);
for (let vertex = 0; vertex < jointsAccessor.count; vertex++) {
  const jointsOffset = jointsStart + vertex * (jointsView.byteStride ?? 8);
  const weightsOffset = weightsStart + vertex * (weightsView.byteStride ?? 16);
  assert.deepEqual([0, 1, 2, 3].map(i => candidateGlb.bin.readUInt16LE(jointsOffset + i * 2)), [crownNode.extras.headJointSlot, 0, 0, 0], `crown joint weights changed at vertex ${vertex}`);
  assert.deepEqual([0, 1, 2, 3].map(i => candidateGlb.bin.readFloatLE(weightsOffset + i * 4)), [1, 0, 0, 0], `crown float weights changed at vertex ${vertex}`);
}
const maxChannels = Math.max(...candidate.clips.map((clip: {channels: number}) => clip.channels));
assert(maxChannels <= 300, 'animation channel policy exceeded');

const result = {
  schema: 'ggd.bojji-crown-validation@1',
  source: {path: sourcePath, bytes: sourceBytes.length, sha256: digest(sourceBytes)},
  candidate: {path: candidatePath, bytes: candidateBytes.length, sha256: digest(candidateBytes)},
  metrics: {
    triangles: candidate.triangles,
    sourceTriangles: source.triangles,
    crownTriangles: candidate.triangles - source.triangles,
    drawPrimitives: candidate.meshes,
    maxTextureEdge: Math.max(...candidate.textures.flatMap((t: {width: number, height: number}) => [t.width, t.height])),
    skinCount: candidate.json.skins?.length ?? 0,
    jointCount: candidate.json.skins?.[0]?.joints?.length ?? 0,
    sourceNativeClipCount: candidate.clips.length,
    maxChannelsPerClip: maxChannels,
  },
  currentLimits: {hardBudget: HERO_MODEL_BUDGET, adoption: HERO_MODEL_ADOPTION_POLICY, ownerCandidateTrianglesMax: 8000, drawPrimitivesMax: 6, maxTextureEdge: 256, maxChannelsPerClip: 300},
  khronos: {errors: khronos.issues.numErrors, warnings: khronos.issues.numWarnings, infos: khronos.issues.numInfos, truncated: khronos.issues.truncated},
  ggdBudget: budget,
  preservation: {
    originalBinaryPrefixExact: true,
    sourceMeshesExact: true,
    sourceMaterialsExact: true,
    sourceImagesAndTexturesExact: true,
    sourceSkinExact: true,
    sourceAnimationsExact: true,
    sourceClipMetadataExact: true,
  },
  attachment: {nodeName: 'GGD Bojji Crown', weightedJointName: 'Bip001 Head', headJointSlot: crownNode.extras.headJointSlot, followsHeadAnimations: true, fullySkinned: true, allVerticesWeightOneToHead: true, vertexCount: jointsAccessor.count, drawPrimitives: 1, triangles: 64},
  status: {converted: true, currentPolicyPassed: true, visualReviewPending: true, runtimeRegistered: false, productionDeployed: false},
};
fs.mkdirSync(path.dirname(outputPath), {recursive: true});
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({candidate: result.candidate, metrics: result.metrics, khronos: result.khronos}));
