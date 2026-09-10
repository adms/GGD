import { encodeUploadGlb, MODEL_UPLOAD_LIMITS, type GlbDocument, type GlbNode } from "./glb";
import { inspectModelUpload, type InspectedModelUpload } from "./inspect";

function parents(nodes: GlbNode[]): Map<number, number> {
  const result = new Map<number, number>();
  nodes.forEach((node, index) => node.children?.forEach((child) => result.set(child, index)));
  return result;
}

/** Compatible rigs only: no heuristic matching or implicit retargeting. */
function rigMapping(body: InspectedModelUpload, library: InspectedModelUpload, selected: readonly number[]): Map<number, number> {
  if (body.sha256 === library.sha256) return new Map((library.json.nodes ?? []).map((_, i) => [i, i]));
  const indexNames = (nodes: GlbNode[]) => {
    const names = new Map<string, number[]>();
    nodes.forEach((node, index) => { if (node.name) names.set(node.name, [...names.get(node.name) ?? [], index]); });
    return names;
  };
  const bn = body.json.nodes ?? [], sn = library.json.nodes ?? [];
  const baseNames = indexNames(bn), sourceNames = indexNames(sn), bp = parents(bn), sp = parents(sn), mapping = new Map<number, number>();
  const required = new Set(selected.flatMap((index) => library.json.animations![index]!.channels.map((channel) => channel.target.node)));
  for (const node of [...required]) {
    let parent = node === undefined ? undefined : sp.get(node), depth = 0;
    while (parent !== undefined) {
      if (++depth > MODEL_UPLOAD_LIMITS.nodes) throw new Error("動作庫骨架階層循環。");
      required.add(parent); parent = sp.get(parent);
    }
  }
  const transform = (node: GlbNode) => node.matrix ?? [...node.translation ?? [0, 0, 0], ...node.rotation ?? [0, 0, 0, 1], ...node.scale ?? [1, 1, 1]];
  for (const index of required) {
    if (index === undefined) throw new Error("動作庫使用尚未支援的擴充動畫目標。");
    const source = sn[index]!, name = source.name;
    if (!name || sourceNames.get(name)?.length !== 1 || baseNames.get(name)?.length !== 1) throw new Error(`動作庫骨架名稱缺少或不唯一：${name ?? index}`);
    const dest = baseNames.get(name)![0]!, a = transform(source), b = transform(bn[dest]!);
    if (a.length !== b.length || a.some((x, i) => Math.abs(x - b[i]!) > 1e-5)) throw new Error(`骨架基準姿勢不同，需先轉換動作：${name}`);
    mapping.set(index, dest);
  }
  for (const [src, dst] of mapping) if ((sp.has(src) ? mapping.get(sp.get(src)!) : undefined) !== bp.get(dst)) throw new Error(`骨架階層不同，需先轉換動作：${sn[src]!.name}`);
  return mapping;
}

function selectedClips(length: number, selected: readonly number[], max: number): void {
  if (!Array.isArray(selected) || !selected.length || selected.length > max || new Set(selected).size !== selected.length || selected.some((index) => !Number.isInteger(index) || index < 0 || index >= length)) throw new Error("請選擇不重複的有效動作片段。");
}

export async function mergeModelAnimations(bodyBytes: Uint8Array, libraryBytes: Uint8Array, selected: readonly number[]) {
  const body = await inspectModelUpload(bodyBytes), library = await inspectModelUpload(libraryBytes, "animations");
  selectedClips(library.clips.length, selected, 32);
  const mapping = rigMapping(body, library, selected), json = structuredClone(body.json);
  json.animations ??= [];
  json.animations.forEach((clip, index) => { clip.name = body.clips[index]!.name; });
  const chunks = [body.bin], views = new Map<number, number>(), accessors = new Map<number, number>(); let total = body.bin.length;
  const copyView = (index: number): number => {
    if (views.has(index)) return views.get(index)!;
    const source = library.json.bufferViews[index]!, start = source.byteOffset ?? 0;
    const pad = (4 - total % 4) % 4; if (pad) { chunks.push(new Uint8Array(pad)); total += pad; }
    if (total + source.byteLength > MODEL_UPLOAD_LIMITS.fileBytes) throw new Error("合併後的動作資料超過 32 MiB。");
    const bytes = library.bin.subarray(start, start + source.byteLength), dest = json.bufferViews.length;
    json.bufferViews.push({ ...structuredClone(source), buffer: 0, byteOffset: total }); chunks.push(bytes); total += bytes.length; views.set(index, dest); return dest;
  };
  const copyAccessor = (index: number): number => {
    if (accessors.has(index)) return accessors.get(index)!;
    const source = structuredClone(library.json.accessors[index]!);
    if (source.bufferView !== undefined) source.bufferView = copyView(source.bufferView);
    if (source.sparse) { source.sparse.indices.bufferView = copyView(source.sparse.indices.bufferView); source.sparse.values.bufferView = copyView(source.sparse.values.bufferView); }
    const dest = json.accessors.length; json.accessors.push(source); accessors.set(index, dest); return dest;
  };
  const names = new Set(body.clips.map((clip) => clip.name));
  const added: { sourceIndex: number; index: number; name: string }[] = [];
  for (const index of selected) {
    const animation = structuredClone(library.json.animations![index]!);
    for (const channel of animation.channels) {
      if (!["translation", "rotation", "scale"].includes(channel.target.path)) throw new Error("獨立動作庫目前只支援骨架位置、旋轉及縮放。");
      channel.target.node = mapping.get(channel.target.node!);
    }
    for (const sampler of animation.samplers) { sampler.input = copyAccessor(sampler.input); sampler.output = copyAccessor(sampler.output); }
    const prefix = library.clips[index]!.name; let name = prefix, n = 2; while (names.has(name)) name = `${prefix} (${n++})`;
    animation.name = name; names.add(name);
    added.push({ sourceIndex: index, index: json.animations.length, name }); json.animations.push(animation);
  }
  const bin = new Uint8Array(total); let at = 0; for (const chunk of chunks) { bin.set(chunk, at); at += chunk.length; }
  const bytes = encodeUploadGlb(json, bin);
  return { bytes, added, inspected: await inspectModelUpload(bytes) };
}

/** Remove unselected clips AND their unreferenced binary storage. Preserve every render/skin accessor. */
export async function selectModelAnimations(sourceBytes: Uint8Array, selected: readonly number[]) {
  const source = await inspectModelUpload(sourceBytes);
  selectedClips(source.clips.length, selected, 9);
  const json = structuredClone(source.json);
  json.animations = selected.map((index) => ({ ...json.animations![index]!, name: source.clips[index]!.name }));
  const kept = new Map<number, number>(), accessors: GlbDocument["accessors"] = [];
  const accessor = (index: number) => {
    if (!kept.has(index)) { kept.set(index, accessors.length); accessors.push(structuredClone(json.accessors[index]!)); }
    return kept.get(index)!;
  };
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives) {
    if (primitive.indices !== undefined) primitive.indices = accessor(primitive.indices);
    for (const attributes of [primitive.attributes, ...primitive.targets ?? []]) for (const key of Object.keys(attributes)) attributes[key] = accessor(attributes[key]!);
  }
  for (const skin of json.skins ?? []) if (skin.inverseBindMatrices !== undefined) skin.inverseBindMatrices = accessor(skin.inverseBindMatrices);
  for (const animation of json.animations) for (const sampler of animation.samplers) { sampler.input = accessor(sampler.input); sampler.output = accessor(sampler.output); }
  const views = new Map<number, number>(), bufferViews: GlbDocument["bufferViews"] = [], chunks: Uint8Array[] = []; let size = 0;
  const view = (index: number): number => {
    if (views.has(index)) return views.get(index)!;
    const original = json.bufferViews[index]!;
    const pad = (4 - size % 4) % 4; if (pad) { chunks.push(new Uint8Array(pad)); size += pad; }
    const id = bufferViews.length; views.set(index, id);
    bufferViews.push({ ...original, buffer: 0, byteOffset: size });
    chunks.push(source.bin.subarray(original.byteOffset ?? 0, (original.byteOffset ?? 0) + original.byteLength)); size += original.byteLength;
    return id;
  };
  for (const entry of accessors) {
    if (entry.bufferView !== undefined) entry.bufferView = view(entry.bufferView);
    if (entry.sparse) { entry.sparse.indices.bufferView = view(entry.sparse.indices.bufferView); entry.sparse.values.bufferView = view(entry.sparse.values.bufferView); }
  }
  for (const image of json.images ?? []) if (image.bufferView !== undefined) image.bufferView = view(image.bufferView);
  json.accessors = accessors; json.bufferViews = bufferViews;
  const bin = new Uint8Array(size); let at = 0; for (const chunk of chunks) { bin.set(chunk, at); at += chunk.length; }
  const bytes = encodeUploadGlb(json, bin);
  return { bytes, inspected: await inspectModelUpload(bytes) };
}
