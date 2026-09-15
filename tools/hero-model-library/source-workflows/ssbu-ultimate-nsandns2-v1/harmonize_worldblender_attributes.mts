/** Add neutral vertex-colour attributes where Worldblender omitted them.
 *
 * The offline atlas merger requires primitives using one material to expose the
 * same attribute set. A primitive with no colour attribute is equivalent to a
 * white vertex colour in glTF. Adding normalized white COLOR_0/COLOR_1 values
 * therefore preserves its rendered value while making safe same-material
 * merging possible. Existing attributes and all geometry/skin accessors stay
 * byte-for-byte unchanged.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const [inputArgument, outputArgument, receiptArgument, candidateId] = process.argv.slice(2);
if (!inputArgument || !outputArgument || !receiptArgument || !candidateId) {
  throw new Error('Usage: harmonize_worldblender_attributes.mts <input.glb> <output.glb> <receipt.json> <candidate-id>');
}
const inputPath = resolve(inputArgument);
const outputPath = resolve(outputArgument);
const receiptPath = resolve(receiptArgument);
const inputBytes = new Uint8Array(readFileSync(inputPath));
const sha = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const {parseUploadGlb, encodeUploadGlb} = await import(resolve('packages/shared/src/content/modelUpload/glb.ts'));
const {inspectModelUpload} = await import(resolve('packages/shared/src/content/modelUpload/inspect.ts'));
const parsed = parseUploadGlb(inputBytes);
const document = parsed.json;
const before = await inspectModelUpload(inputBytes);
const templates = Object.fromEntries((['COLOR_0', 'COLOR_1'] as const).map((semantic) => {
  const index = document.meshes!
    .flatMap((mesh) => mesh.primitives)
    .map((primitive) => primitive.attributes[semantic])
    .find((value) => value !== undefined);
  assert.notEqual(index, undefined, `No Worldblender ${semantic} template accessor`);
  const accessor = document.accessors[index!];
  assert.equal(accessor.type, 'VEC4', `${semantic} template is not VEC4`);
  assert.equal(accessor.normalized, true, `${semantic} template is not normalized`);
  assert([5121, 5123].includes(accessor.componentType), `${semantic} template is not an unsigned integer colour`);
  return [semantic, accessor];
})) as Record<'COLOR_0' | 'COLOR_1', (typeof document.accessors)[number]>;

let binary = parsed.bin;
const additions: {meshIndex: number; primitiveIndex: number; semantic: string; count: number; accessorIndex: number}[] = [];
function appendAligned(chunk: Uint8Array): number {
  const padding = (4 - binary.length % 4) % 4;
  const next = new Uint8Array(binary.length + padding + chunk.length);
  next.set(binary);
  next.set(chunk, binary.length + padding);
  const offset = binary.length + padding;
  binary = next;
  return offset;
}
for (const [meshIndex, mesh] of document.meshes!.entries()) {
  for (const [primitiveIndex, primitive] of mesh.primitives.entries()) {
    const position = document.accessors[primitive.attributes.POSITION]!;
    for (const semantic of ['COLOR_0', 'COLOR_1'] as const) {
      if (primitive.attributes[semantic] !== undefined) continue;
      const template = templates[semantic];
      const componentBytes = template.componentType === 5121 ? 1 : 2;
      const raw = new ArrayBuffer(position.count * 4 * componentBytes);
      if (componentBytes === 1) new Uint8Array(raw).fill(255);
      else new Uint16Array(raw).fill(65535);
      const bytes = new Uint8Array(raw);
      const byteOffset = appendAligned(bytes);
      document.bufferViews.push({buffer: 0, byteOffset, byteLength: bytes.length, target: 34962});
      document.accessors.push({
        bufferView: document.bufferViews.length - 1,
        componentType: template.componentType,
        count: position.count,
        type: 'VEC4',
        normalized: true,
      });
      const accessorIndex = document.accessors.length - 1;
      primitive.attributes[semantic] = accessorIndex;
      additions.push({meshIndex, primitiveIndex, semantic, count: position.count, accessorIndex});
    }
  }
}
assert(additions.length > 0, 'No missing colour attributes were found');
document.asset = {
  ...document.asset,
  generator: 'GGD harmonize_worldblender_attributes.mts',
  extras: {
    ...(document.asset?.extras && typeof document.asset.extras === 'object' ? document.asset.extras : {}),
    sourceSha256: sha(inputBytes),
    transform: 'added normalized white COLOR_0/COLOR_1 only where absent',
  },
};
const outputBytes = encodeUploadGlb(document, binary);
writeFileSync(outputPath, outputBytes);
const after = await inspectModelUpload(outputBytes);
assert.equal(after.triangles, before.triangles, 'Attribute harmonization changed triangle count');
assert.equal(after.meshes, before.meshes, 'Attribute harmonization changed primitive count');
assert.equal(after.skins, before.skins, 'Attribute harmonization changed skin count');
assert.equal(after.skinnedPrimitives, before.skinnedPrimitives, 'Attribute harmonization changed skin coverage');
assert.deepEqual(after.clips, before.clips, 'Attribute harmonization changed animations');
const receipt = {
  schema: 'ggd-worldblender-neutral-attribute-harmonization@1',
  candidateId,
  input: {path: inputPath, bytes: inputBytes.length, sha256: sha(inputBytes)},
  output: {path: outputPath, bytes: outputBytes.length, sha256: sha(outputBytes)},
  additions,
  neutralMeaning: 'normalized unsigned RGBA maximum values multiply material colour by one; component type follows each source semantic template',
  existingAccessorBytesUnchanged: true,
  geometrySkeletonAndAnimationsUnchanged: true,
};
writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
