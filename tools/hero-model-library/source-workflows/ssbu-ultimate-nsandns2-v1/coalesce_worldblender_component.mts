/**
 * Coalesce identity-transform skinned mesh nodes before the offline atlas stage.
 *
 * Worldblender sources keep each material as a separate mesh node. GGD's atlas
 * worker deliberately refuses multi-node inputs because arbitrary node transforms
 * cannot be merged safely. The Blender converter makes these nodes scene roots
 * without local transforms, so this narrow stage can prove that invariant and
 * combine only their primitive declarations. Accessor and binary bytes remain
 * untouched.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const [inputArgument, outputArgument, receiptArgument, candidateId] = process.argv.slice(2);
if (!inputArgument || !outputArgument || !receiptArgument || !candidateId) {
  throw new Error('Usage: coalesce_worldblender_component.mts <input.glb> <output.glb> <receipt.json> <candidate-id>');
}
const inputPath = resolve(inputArgument);
const outputPath = resolve(outputArgument);
const receiptPath = resolve(receiptArgument);
const inputBytes = new Uint8Array(readFileSync(inputPath));
const digest = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const {parseUploadGlb, encodeUploadGlb} = await import(
  resolve('packages/shared/src/content/modelUpload/glb.ts')
);
const {inspectModelUpload} = await import(
  resolve('packages/shared/src/content/modelUpload/inspect.ts')
);

const before = await inspectModelUpload(inputBytes);
const parsed = parseUploadGlb(inputBytes);
const document = parsed.json;
const nodes = document.nodes ?? [];
const meshNodes = nodes
  .map((node, nodeIndex) => ({node, nodeIndex}))
  .filter(({node}) => node.mesh !== undefined);
assert(meshNodes.length > 1, 'Expected multiple Worldblender mesh nodes');
const parents = new Map<number, number>();
for (const [parentIndex, node] of nodes.entries()) {
  for (const child of node.children ?? []) parents.set(child, parentIndex);
}
const transforms = ['matrix', 'translation', 'rotation', 'scale', 'weights'] as const;
for (const {node, nodeIndex} of meshNodes) {
  assert.equal(parents.has(nodeIndex), false, `mesh node ${nodeIndex} is not a scene root`);
  assert.equal(node.children?.length ?? 0, 0, `mesh node ${nodeIndex} has children`);
  for (const field of transforms) assert.equal(field in node, false, `mesh node ${nodeIndex} has ${field}`);
}
const skinIndices = new Set(meshNodes.map(({node}) => node.skin));
assert.equal(skinIndices.size, 1, 'Worldblender mesh nodes do not share one skin');
const skinIndex = meshNodes[0]!.node.skin;
assert.notEqual(skinIndex, undefined, 'Worldblender mesh nodes are not skinned');
const meshIndices = meshNodes.map(({node}) => node.mesh!);
assert.equal(new Set(meshIndices).size, meshIndices.length, 'Worldblender nodes share mesh definitions');
const primitives = meshIndices.flatMap((index) => document.meshes![index]!.primitives);
assert.equal(primitives.length, before.meshes, 'Primitive inventory changed before coalescing');
document.meshes = [{name: 'GGD coalesced Worldblender c00 primitives', primitives}];
for (const {node} of meshNodes.slice(1)) {
  delete node.mesh;
  delete node.skin;
}
meshNodes[0]!.node.mesh = 0;
meshNodes[0]!.node.skin = skinIndex;
document.asset = {
  ...document.asset,
  generator: 'GGD coalesce_worldblender_component.mts',
  extras: {
    ...(document.asset?.extras && typeof document.asset.extras === 'object' ? document.asset.extras : {}),
    sourceSha256: digest(inputBytes),
    transform: 'coalesced scene-root identity-transform mesh nodes sharing one skin; binary accessors unchanged',
  },
};
const outputBytes = encodeUploadGlb(document, parsed.bin);
writeFileSync(outputPath, outputBytes);
const after = await inspectModelUpload(outputBytes);
assert.equal(after.triangles, before.triangles, 'Coalescing changed triangle count');
assert.equal(after.meshes, before.meshes, 'Coalescing changed primitive count');
assert.equal(after.skinnedPrimitives, before.skinnedPrimitives, 'Coalescing changed skin coverage');
assert.equal(after.skins, before.skins, 'Coalescing changed skin count');
assert.deepEqual(after.clips, before.clips, 'Coalescing changed animations');
const receipt = {
  schema: 'ggd-worldblender-skinned-node-coalescing@1',
  candidateId,
  input: {path: inputPath, bytes: inputBytes.length, sha256: digest(inputBytes)},
  output: {path: outputPath, bytes: outputBytes.length, sha256: digest(outputBytes)},
  meshNodesBefore: meshNodes.length,
  meshNodesAfter: 1,
  primitiveCount: before.meshes,
  triangles: before.triangles,
  skinCount: before.skins,
  skinnedPrimitives: before.skinnedPrimitives,
  binaryChunkSha256Before: digest(parsed.bin),
  binaryAccessorBytesUnchanged: true,
  animationCount: before.clips.length,
};
writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
