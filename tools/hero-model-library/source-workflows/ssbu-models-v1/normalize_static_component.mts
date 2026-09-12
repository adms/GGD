/** Coalesce identity skinned nodes, then run GGD's official model normalizer. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';

const [rawArgument, blenderReceiptArgument, outputArgument, receiptArgument] = process.argv.slice(2);
if (!rawArgument || !blenderReceiptArgument || !outputArgument || !receiptArgument) {
  throw new Error(
    'Usage: normalize_static_component.mts <blender-export.glb> <blender-conversion.json> <body.glb> <conversion.json>',
  );
}

const repo = resolve('.');
const rawPath = resolve(rawArgument);
const blenderReceiptPath = resolve(blenderReceiptArgument);
const outputPath = resolve(outputArgument);
const receiptPath = resolve(receiptArgument);
const rawBytes = new Uint8Array(readFileSync(rawPath));
const blenderReceipt = JSON.parse(readFileSync(blenderReceiptPath, 'utf8'));
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

assert.equal(sha256(rawBytes), blenderReceipt.output.sha256, 'Blender GLB differs from its conversion receipt');
assert.equal(rawBytes.length, blenderReceipt.output.bytes, 'Blender GLB size differs from its conversion receipt');
assert.equal(blenderReceipt.sourceActionCount, 0, 'Static component source unexpectedly contains actions');

const {parseUploadGlb, encodeUploadGlb} = await import(
  join(repo, 'packages/shared/src/content/modelUpload/glb.ts')
);
const {inspectModelUpload} = await import(
  join(repo, 'packages/shared/src/content/modelUpload/inspect.ts')
);
const {normalizeUploadedModel} = await import(
  join(repo, 'packages/shared/src/content/modelUpload/normalize.ts')
);
const {heroModelBudgetIssues} = await import(
  join(repo, 'packages/shared/src/content/modelUpload/heroModel.ts')
);

const before = await inspectModelUpload(rawBytes);
assert.equal(before.clips.length, 0, 'Blender export unexpectedly contains animation clips');
assert(before.skins > 0, 'Blender export has no skin');
assert.equal(before.skinnedPrimitives, before.meshes, 'Every Blender primitive must be skinned');

const parsed = parseUploadGlb(rawBytes);
const document = parsed.json;
const meshNodes = (document.nodes ?? [])
  .map((node, nodeIndex) => ({node, nodeIndex}))
  .filter(({node}) => node.mesh !== undefined);
assert(meshNodes.length > 1, 'Expected more than one mesh node before coalescing');

const parentByChild = new Map<number, number>();
for (const [parentIndex, node] of (document.nodes ?? []).entries()) {
  for (const child of node.children ?? []) parentByChild.set(child, parentIndex);
}
const skinIndices = new Set(meshNodes.map(({node}) => node.skin));
assert.equal(skinIndices.size, 1, 'Mesh nodes do not share one skin');
const skinIndex = meshNodes[0]!.node.skin;
assert.notEqual(skinIndex, undefined, 'Mesh nodes are not skinned');

const transformKeys = ['matrix', 'translation', 'rotation', 'scale', 'weights'] as const;
for (const {node, nodeIndex} of meshNodes) {
  assert.equal(parentByChild.has(nodeIndex), false, `Mesh node ${nodeIndex} is not a scene root`);
  assert.equal(node.children?.length ?? 0, 0, `Mesh node ${nodeIndex} has children`);
  for (const key of transformKeys) {
    assert.equal(key in node, false, `Mesh node ${nodeIndex} has ${key}; coalescing would change its meaning`);
  }
}

const originalMeshIndices = meshNodes.map(({node}) => node.mesh!);
assert.equal(new Set(originalMeshIndices).size, originalMeshIndices.length, 'Mesh nodes share mesh definitions');
const originalMeshes = originalMeshIndices.map((index) => document.meshes![index]!);
for (const [index, mesh] of originalMeshes.entries()) {
  assert.equal('weights' in mesh, false, `Mesh ${originalMeshIndices[index]} has default morph weights`);
}
const combinedPrimitives = originalMeshes.flatMap((mesh) => mesh.primitives);
assert.equal(combinedPrimitives.length, before.meshes, 'Primitive inventory changed before coalescing');

document.meshes = [{
  name: 'GGD combined render-visible skinned source meshes',
  primitives: combinedPrimitives,
}];
for (const {node} of meshNodes.slice(1)) {
  delete node.mesh;
  delete node.skin;
}
meshNodes[0]!.node.mesh = 0;
meshNodes[0]!.node.skin = skinIndex;
document.asset = {
  ...document.asset,
  generator: 'GGD normalize_static_component.mts',
  extras: {
    ...(document.asset?.extras && typeof document.asset.extras === 'object' ? document.asset.extras : {}),
    sourceBlenderExportSha256: sha256(rawBytes),
    transform: 'coalesced identity-transform render-visible mesh nodes sharing one skin before official normalization',
  },
};

const coalesced = encodeUploadGlb(document, parsed.bin);
const coalescedInspection = await inspectModelUpload(coalesced);
assert.equal(coalescedInspection.triangles, before.triangles, 'Coalescing changed triangle count');
assert.equal(coalescedInspection.meshes, before.meshes, 'Coalescing changed primitive count');
assert.equal(coalescedInspection.skinnedPrimitives, before.skinnedPrimitives, 'Coalescing changed skin coverage');
assert.equal(coalescedInspection.clips.length, 0, 'Coalescing added animation clips');

const normalized = await normalizeUploadedModel(coalesced);
const after = await inspectModelUpload(normalized.bytes);
assert.equal(after.triangles, before.triangles, 'Official normalization changed triangle count');
assert.equal(after.clips.length, 0, 'Official normalization added animation clips');
assert.equal(after.skinnedPrimitives, after.meshes, 'Official normalization left an unskinned primitive');
assert.deepEqual(heroModelBudgetIssues(after).errors, [], 'Normalized component still violates GGD budget');
assert(
  normalized.report.drawCalls.after < normalized.report.drawCalls.before ||
    heroModelBudgetIssues(before).errors.length === 0,
  'Official normalizer did not merge draw calls and the Blender export was not already within budget',
);
assert.deepEqual(normalized.report.droppedZeroClips, [], 'Static component unexpectedly dropped clips');
assert.deepEqual(normalized.report.texturesOverCap, [], 'Normalized component retains oversized textures');

mkdirSync(dirname(outputPath), {recursive: true});
writeFileSync(outputPath, normalized.bytes);
const receipt = {
  schema: 'ggd-ssbu-static-component-normalization@1',
  candidateId: blenderReceipt.candidateId,
  sourceId: blenderReceipt.sourceId,
  input: blenderReceipt.input,
  sourceActionCount: blenderReceipt.sourceActionCount,
  blenderExport: {
    path: rawPath,
    bytes: rawBytes.length,
    sha256: sha256(rawBytes),
    conversionReceipt: {
      path: blenderReceiptPath,
      bytes: readFileSync(blenderReceiptPath).length,
      sha256: sha256(readFileSync(blenderReceiptPath)),
    },
    drawPrimitives: before.meshes,
    triangles: before.triangles,
    skins: before.skins,
  },
  structuralCoalescing: {
    meshNodesBefore: meshNodes.length,
    meshNodesAfter: 1,
    primitivesBefore: before.meshes,
    primitivesAfter: coalescedInspection.meshes,
    sharedSkinIndex: skinIndex,
    sourceTransformsRequired: 'identity',
    geometryBinaryReencoded: false,
  },
  officialNormalization: normalized.report,
  output: {
    path: outputPath,
    bytes: normalized.bytes.length,
    sha256: sha256(normalized.bytes),
    drawPrimitives: after.meshes,
    triangles: after.triangles,
    skins: after.skins,
    skinnedPrimitives: after.skinnedPrimitives,
    textures: after.textures,
    clips: after.clips,
    budget: heroModelBudgetIssues(after),
  },
  sourceBytesUnchanged: sha256(rawBytes) === blenderReceipt.output.sha256,
  runtimeReady: false,
  runtimeSelectable: false,
  defaultEligible: false,
  limitations: [
    'This applies GGD normalization to an independent static skinned component; it does not create a complete hero model.',
    'The source and output contain zero animation clips, so six-state gameplay readiness is not established.',
    'Hero binding, backend dropdown registration, runtime switching and deployment were not performed.',
  ],
};
mkdirSync(dirname(receiptPath), {recursive: true});
writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({
  output: outputPath,
  sha256: receipt.output.sha256,
  bytes: receipt.output.bytes,
  triangles: receipt.output.triangles,
  drawPrimitives: receipt.output.drawPrimitives,
  drawCalls: normalized.report.drawCalls,
  skins: receipt.output.skins,
  clips: receipt.output.clips.length,
}));
