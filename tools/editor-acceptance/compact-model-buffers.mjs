/** Remove unreachable GLB buffer data; refuse any change to render or motion values. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
const { values } = parseArgs({ options: { input: { type: 'string' }, out: { type: 'string' }, 'gltf-modules': { type: 'string' } } });
assert(values.input && values.out && values['gltf-modules'], 'Required: --input file.glb --out new.glb --gltf-modules /path/to/node_modules (@gltf-transform 4.4.1)');
const input = resolve(values.input), output = resolve(values.out), modules = resolve(values['gltf-modules']);
await assert.rejects(fs.access(output), { code: 'ENOENT' });
const { NodeIO, PropertyType } = await import(pathToFileURL(join(modules, '@gltf-transform/core/dist/index.js')).href);
const { prune } = await import(pathToFileURL(join(modules, '@gltf-transform/functions/dist/index.js')).href);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const data = (accessor) => {
  if (!accessor) return null;
  const array = accessor.getArray();
  return { type: accessor.getType(), componentType: accessor.getComponentType(), normalized: accessor.getNormalized(), values: sha(Buffer.from(array.buffer, array.byteOffset, array.byteLength)) };
};
function snapshot(doc) {
  const r = doc.getRoot(), nodes = r.listNodes(), meshes = r.listMeshes(), skins = r.listSkins(), textures = r.listTextures(), materials = r.listMaterials();
  const attributes = (primitive) => Object.fromEntries(primitive.listSemantics().sort().map((key) => [key, data(primitive.getAttribute(key))]));
  return {
    nodes: nodes.map((n) => ({ name: n.getName(), matrix: n.getMatrix(), children: n.listChildren().map((v) => nodes.indexOf(v)), mesh: meshes.indexOf(n.getMesh()), skin: skins.indexOf(n.getSkin()), weights: n.getWeights(), extras: n.getExtras() })),
    scenes: r.listScenes().map((s) => ({ children: s.listChildren().map((n) => nodes.indexOf(n)), name: s.getName() })),
    meshes: meshes.map((m) => ({ name: m.getName(), weights: m.getWeights(), primitives: m.listPrimitives().map((p) => ({ mode: p.getMode(), material: materials.indexOf(p.getMaterial()), indices: data(p.getIndices()), attributes: attributes(p), targets: p.listTargets().map(attributes) })) })),
    skins: skins.map((s) => ({ name: s.getName(), skeleton: nodes.indexOf(s.getSkeleton()), joints: s.listJoints().map((n) => nodes.indexOf(n)), inverseBindMatrices: data(s.getInverseBindMatrices()) })),
    animations: r.listAnimations().map((a) => ({ name: a.getName(), channels: a.listChannels().map((c) => ({ node: nodes.indexOf(c.getTargetNode()), path: c.getTargetPath(), interpolation: c.getSampler().getInterpolation(), input: data(c.getSampler().getInput()), output: data(c.getSampler().getOutput()) })) })),
    textures: textures.map((t) => ({ name: t.getName(), mime: t.getMimeType(), image: sha(t.getImage()) })),
    materials: materials.map((m) => ({ name: m.getName(), baseColor: m.getBaseColorFactor(), emissive: m.getEmissiveFactor(), metallic: m.getMetallicFactor(), roughness: m.getRoughnessFactor(), alpha: [m.getAlphaMode(), m.getAlphaCutoff()], doubleSided: m.getDoubleSided(), textures: [m.getBaseColorTexture(), m.getNormalTexture(), m.getEmissiveTexture(), m.getMetallicRoughnessTexture(), m.getOcclusionTexture()].map((t) => textures.indexOf(t)) })),
  };
}
const io = new NodeIO(), doc = await io.read(input);
assert.equal(doc.getRoot().listExtensionsUsed().length, 0, 'This bounded compactor accepts only extension-free GLBs.');
const before = snapshot(doc);
await doc.transform(prune({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.BUFFER], keepLeaves: true, keepSolidTextures: true, keepExtras: true }));
const bytes = await io.writeBinary(doc);
assert.deepEqual(snapshot(await io.readBinary(bytes)), before, 'Compaction changed body, textures, skeleton or animation samples.');
await fs.writeFile(output, bytes, { flag: 'wx' });
const original = await fs.readFile(input);
const receipt = { schema: 'ggd-model-buffer-compaction@1', source: { path: input, bytes: original.length, sha256: sha(original) }, output: { path: output, bytes: bytes.length, sha256: sha(bytes) }, semanticSha256: sha(JSON.stringify(before)), exactSampleAndRenderValuesPreserved: true, removedBytes: original.length - bytes.length };
await fs.writeFile(output + '.receipt.json', JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(receipt));
