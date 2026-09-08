import { encodeUploadGlb, type GlbDocument } from "./glb";

/** Tiny authored test rig: one skinned triangle, two independent bone clips. */
export function modelUploadFixture(library = false) {
  const chunks: Uint8Array[] = [];
  const bufferViews: GlbDocument["bufferViews"] = [], accessors: GlbDocument["accessors"] = [];
  let size = 0;
  const add = (values: Float32Array | Uint8Array, type: string, width: number, extra: Record<string, unknown> = {}) => {
    const padding = (4 - size % 4) % 4; if (padding) { chunks.push(new Uint8Array(padding)); size += padding; }
    const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
    const bufferView = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset: size, byteLength: bytes.length }); chunks.push(bytes); size += bytes.length;
    const accessor = accessors.length;
    accessors.push({ bufferView, componentType: values instanceof Float32Array ? 5126 : 5121, count: values.length / width, type, ...extra });
    return accessor;
  };
  const position = add(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), "VEC3", 3, { min: [0, 0, 0], max: [1, 1, 0] });
  const normal = add(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), "VEC3", 3);
  const joints = add(new Uint8Array(12), "VEC4", 4);
  const weights = add(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]), "VEC4", 4);
  const inverseBind = add(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), "MAT4", 16);
  const times = add(new Float32Array([0, 1]), "SCALAR", 1, { min: [0], max: [1] });
  const move = add(new Float32Array([0, 0, 0, 0, 0.5, 0]), "VEC3", 3);
  const rotate = add(new Float32Array([0, 0, 0, 1, 0, 0, Math.SQRT1_2, Math.SQRT1_2]), "VEC4", 4);
  const json: GlbDocument & { scene: number; scenes: { nodes: number[] }[] } = {
    asset: { version: "2.0", generator: "GGD authored test fixture" }, scene: 0, scenes: [{ nodes: library ? [0] : [0, 2] }],
    buffers: [{ byteLength: size }], bufferViews, accessors,
    nodes: [{ name: "Rig", children: [1] }, { name: "Bone" }, ...library ? [] : [{ name: "Body", mesh: 0, skin: 0 }]],
    ...library ? {} : { meshes: [{ primitives: [{ attributes: { POSITION: position, NORMAL: normal, JOINTS_0: joints, WEIGHTS_0: weights } }] }], skins: [{ joints: [1], inverseBindMatrices: inverseBind }] },
    animations: [
      { name: "Motion", channels: [{ sampler: 0, target: { node: 1, path: "translation" } }], samplers: [{ input: times, output: move }] },
      { name: "Motion", channels: [{ sampler: 0, target: { node: 1, path: "rotation" } }], samplers: [{ input: times, output: rotate, interpolation: "STEP" }] },
    ],
  };
  const bin = new Uint8Array(size); let at = 0; for (const chunk of chunks) { bin.set(chunk, at); at += chunk.length; }
  return { bytes: encodeUploadGlb(json, bin), json, bin, position, times, move, rotate, inverseBind };
}
