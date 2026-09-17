/** Validate the flat-colour Bojji crown v2 candidate and v1 preservation. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const [repoArg, sourceArg, candidateArg, outputArg] = process.argv.slice(2);
if (!outputArg) throw Error('usage: validate_candidate.mts <repo> <v1-source.glb> <v2-candidate.glb> <output.json>');
const repo = path.resolve(repoArg);
const sourcePath = path.resolve(sourceArg), candidatePath = path.resolve(candidateArg), outputPath = path.resolve(outputArg);
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
assert.equal(digest(sourceBytes), '16ffc917be1fc86a9710c1e35bd181659292f17d7c54f3285026e204cd7f0e28', 'Bojji crown v1 changed');
assert.equal(digest(candidateBytes), 'bf74313802c832c3cdb78908484f8c8e5e76065607c27767110557304b80ed03', 'Bojji crown v2 changed');
const [source, candidate] = await Promise.all([inspectModelUpload(sourceBytes), inspectModelUpload(candidateBytes)]);
const khronos = await validator.validateBytes(new Uint8Array(candidateBytes), {
  uri: 'bojji-crown-v2-flat-storybook.glb', maxIssues: 10000, writeTimestamp: false,
  externalResourceFunction: async () => { throw Error('external resource rejected'); },
});
const budget = heroModelBudgetIssues(candidate);
assert.equal(khronos.issues.numErrors, 0, 'Khronos errors');
assert.equal(khronos.issues.truncated, false, 'Khronos validation truncated');
assert.deepEqual(budget.errors, [], 'GGD budget errors');
assert(candidate.triangles <= 8000, 'owner triangle target exceeded');
assert(candidate.meshes <= 6, 'draw primitive limit exceeded');
assert.equal(Math.max(...candidate.textures.flatMap((t: {width: number, height: number}) => [t.width, t.height])), 256, 'texture edge changed');
assert.deepEqual(candidate.clips, source.clips, 'clip metadata changed');
assert.equal(candidate.triangles, source.triangles, 'triangle count changed');
assert.deepEqual(candidate.json.meshes[0], source.json.meshes[0], 'weapon mesh changed');
assert.deepEqual(candidate.json.meshes[2], source.json.meshes[2], 'crown mesh changed');
assert.deepEqual(candidate.json.meshes[1].primitives[0].attributes, source.json.meshes[1].primitives[0].attributes, 'body attributes/UV changed');
assert.deepEqual(candidate.json.meshes[1].primitives[1].attributes, source.json.meshes[1].primitives[0].attributes, 'head attributes/UV changed');
assert.equal(candidate.json.meshes[1].primitives[1].extras?.ggdPart, 'bojji-head-material-split');
assert.deepEqual(candidate.json.materials.slice(0, source.json.materials.length), source.json.materials, 'source materials changed');
assert.deepEqual(candidate.json.nodes, source.json.nodes, 'nodes/crown attachment changed');
assert.deepEqual(candidate.json.skins, source.json.skins, 'skin changed');
assert.deepEqual(candidate.json.animations, source.json.animations, 'animations changed');
assert.deepEqual(candidate.json.textures.slice(0, source.json.textures.length), source.json.textures, 'source texture bindings changed');
assert.equal(candidate.json.images.length, 3, 'image count changed');
assert.deepEqual(candidate.json.images[0], source.json.images[0], 'weapon atlas image changed');
assert.equal(candidate.json.images[1].mimeType, source.json.images[1].mimeType, 'body atlas mime type changed');
assert.notEqual(candidate.json.images[1].bufferView, source.json.images[1].bufferView, 'body atlas was not replaced');

const sourceGlb = glb.readGlb(sourcePath), candidateGlb = glb.readGlb(candidatePath);
assert(candidateGlb.bin.subarray(0, sourceGlb.bin.length).equals(sourceGlb.bin), 'v1 BIN prefix changed');
const bodyImage = candidate.json.images[1];
const bodyView = candidate.json.bufferViews[bodyImage.bufferView];
const bodyStart = bodyView.byteOffset ?? 0;
const bodyAtlas = candidateGlb.bin.subarray(bodyStart, bodyStart + bodyView.byteLength);
assert.equal(digest(bodyAtlas), '5fdd4632e1d7255ebc3ed92fdf2b39f872773466915f0402cdf9d38320a23474', 'flat body atlas changed');
const weaponView = candidate.json.bufferViews[candidate.json.images[0].bufferView];
const weaponStart = weaponView.byteOffset ?? 0;
const weaponAtlas = candidateGlb.bin.subarray(weaponStart, weaponStart + weaponView.byteLength);
const sourceWeaponView = source.json.bufferViews[source.json.images[0].bufferView];
const sourceWeaponStart = sourceWeaponView.byteOffset ?? 0;
const sourceWeaponAtlas = sourceGlb.bin.subarray(sourceWeaponStart, sourceWeaponStart + sourceWeaponView.byteLength);
assert(weaponAtlas.equals(sourceWeaponAtlas), 'weapon atlas changed');
const headImage = candidate.json.images[2];
const headView = candidate.json.bufferViews[headImage.bufferView];
const headStart = headView.byteOffset ?? 0;
const headAtlas = candidateGlb.bin.subarray(headStart, headStart + headView.byteLength);
assert.equal(digest(headAtlas), 'b319b8e1ae50f1f39f460b5eaff974de10fddfa04f7ad57283bd6ef0c3639820', 'head atlas changed');
function indices(document: any, binary: Buffer, accessorIndex: number): number[] {
  const accessor = document.accessors[accessorIndex], view = document.bufferViews[accessor.bufferView];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0), stride = view.byteStride ?? 2;
  assert.equal(accessor.componentType, 5123);
  return Array.from({length: accessor.count}, (_, index) => binary.readUInt16LE(start + index * stride));
}
const sourceIndices = indices(source.json, sourceGlb.bin, source.json.meshes[1].primitives[0].indices).sort((a, b) => a - b);
const partitionedIndices = candidate.json.meshes[1].primitives
  .flatMap((primitive: any) => indices(candidate.json, candidateGlb.bin, primitive.indices))
  .sort((a: number, b: number) => a - b);
assert.deepEqual(partitionedIndices, sourceIndices, 'head/body partition changed geometry');
assert.equal(candidate.json.accessors[candidate.json.meshes[1].primitives[1].indices].count / 3, 1474, 'head triangle count changed');
const maxChannels = Math.max(...candidate.clips.map((clip: {channels: number}) => clip.channels));
assert(maxChannels <= 300, 'animation channel policy exceeded');

const result = {
  schema: 'ggd.bojji-crown-v2-validation@1',
  source: {path: sourcePath, bytes: sourceBytes.length, sha256: digest(sourceBytes)},
  candidate: {path: candidatePath, bytes: candidateBytes.length, sha256: digest(candidateBytes)},
  bodyAtlas: {imageIndex: 1, bytes: bodyAtlas.length, sha256: digest(bodyAtlas), width: 256, height: 128},
  metrics: {
    triangles: candidate.triangles,
    drawPrimitives: candidate.meshes,
    maxTextureEdge: Math.max(...candidate.textures.flatMap((t: {width: number, height: number}) => [t.width, t.height])),
    skinCount: candidate.json.skins?.length ?? 0,
    jointCount: candidate.json.skins?.[0]?.joints?.length ?? 0,
    clipCount: candidate.clips.length,
    maxChannelsPerClip: maxChannels,
  },
  currentLimits: {hardBudget: HERO_MODEL_BUDGET, adoption: HERO_MODEL_ADOPTION_POLICY, ownerCandidateTrianglesMax: 8000},
  khronos: {errors: khronos.issues.numErrors, warnings: khronos.issues.numWarnings, infos: khronos.issues.numInfos, truncated: khronos.issues.truncated},
  ggdBudget: budget,
  preservation: {
    v1BinaryPrefixExact: true,
    geometryAndUvExact: true,
    bodyIndicesPartitionedWithoutTriangleLoss: true,
    weaponAtlasExact: true,
    materialsExact: true,
    nodesSkinAnimationsAndCrownExact: true,
    sourceClipMetadataExact: true,
  },
  appearance: {
    ownerLiteralApplied: ['black-hair', 'skin-face-and-hands', 'blue-upper-and-hem', 'white-belt-and-trousers', 'black-shoes', 'gold-crown'],
    style: 'flat-storybook-palette',
    ownerVisualReviewPending: true,
  },
  status: {converted: true, currentPolicyPassed: true, visualReviewPending: true, runtimeRegistered: false, productionDeployed: false},
};
fs.mkdirSync(path.dirname(outputPath), {recursive: true});
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({candidate: result.candidate, metrics: result.metrics, khronos: result.khronos}));
