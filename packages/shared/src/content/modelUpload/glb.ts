/** The uncompressed glTF subset used by community bodies and animation libraries. */
export interface GlbAccessor {
  bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string;
  /** glTF 規範的逐分量精確界。⚠️ POSITION **必填**；合併幾何時一定要用真資料重算，⛔ 沿用任何一段的界都會讓真實資料「超界」。 */
  min?: number[]; max?: number[];
  sparse?: { count: number; indices: { bufferView: number; byteOffset?: number; componentType: number }; values: { bufferView: number; byteOffset?: number } };
}
export interface GlbAnimation {
  name?: string;
  channels: { sampler: number; target: { node?: number; path: string } }[];
  samplers: { input: number; output: number; interpolation?: string }[];
}
export interface GlbNode {
  name?: string; children?: number[]; mesh?: number; skin?: number;
  matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[];
}
export interface GlbPrimitive { attributes: Record<string, number>; indices?: number; mode?: number; targets?: Record<string, number>[] }
export interface GlbDocument {
  asset: { version: string; generator?: string };
  buffers: { byteLength: number }[];
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number; target?: number }[];
  accessors: GlbAccessor[];
  nodes?: GlbNode[];
  meshes?: { primitives: GlbPrimitive[] }[];
  skins?: { joints: number[]; inverseBindMatrices?: number }[];
  animations?: GlbAnimation[];
  images?: { bufferView?: number; mimeType?: string }[];
}

export const MODEL_UPLOAD_LIMITS = {
  fileBytes: 32 * 1024 * 1024,
  jsonBytes: 4 * 1024 * 1024,
  jsonValues: 500_000,
  depth: 64,
  nodes: 1024,
  clips: 256,
  accessors: 32_768,
  accessorValues: 8_000_000,
  channels: 32_768,
  clipChannels: 2048,
  clipSeconds: 300,
} as const;
const extensions = new Set(["KHR_materials_unlit", "KHR_texture_transform", "KHR_materials_emissive_strength"]);
const dimensions: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

/** Bound work before calling the official validator or allocating accessor arrays. */
export function parseUploadGlb(bytes: Uint8Array): { json: GlbDocument; bin: Uint8Array } {
  if (!(bytes instanceof Uint8Array) || bytes.length < 20 || bytes.length > MODEL_UPLOAD_LIMITS.fileBytes) throw new Error("GLB 單檔最多 32 MiB，且必須包含完整資料。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length) throw new Error("請選擇完整的 glTF 2.0 GLB。");
  let json: unknown; let bin: Uint8Array | undefined;
  for (let at = 12; at < bytes.length;) {
    if (at + 8 > bytes.length) throw new Error("GLB 區段被截斷。");
    const size = view.getUint32(at, true), type = view.getUint32(at + 4, true);
    if (size % 4 || at + 8 + size > bytes.length) throw new Error("GLB 區段長度不符。");
    const data = bytes.subarray(at + 8, at + 8 + size);
    if (type === 0x4e4f534a) {
      if (at !== 12 || size > MODEL_UPLOAD_LIMITS.jsonBytes) throw new Error("GLB 描述區段不合法或太大。");
      json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data));
    } else if (type === 0x004e4942) {
      if (!json || bin) throw new Error("GLB 二進位區段重複或順序錯誤。");
      bin = data;
    } else throw new Error("請匯出標準 GLB，不使用額外的二進位區段。");
    at += size + 8;
  }
  if (!json || typeof json !== "object" || Array.isArray(json) || !bin) throw new Error("GLB 必須自含二進位資料。");
  const stack: { value: unknown; depth: number }[] = [{ value: json, depth: 0 }]; let visited = 0;
  while (stack.length) {
    const { value, depth } = stack.pop()!;
    if (++visited > MODEL_UPLOAD_LIMITS.jsonValues || depth > MODEL_UPLOAD_LIMITS.depth) throw new Error("GLB 描述過於複雜。");
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("GLB 含有無效數值。");
    if (!value || typeof value !== "object") continue;
    for (const [key, child] of Object.entries(value)) {
      if (key === "uri" || key === "url") throw new Error("請把貼圖與 buffer 嵌入 GLB，不使用外部連結或 data URI。");
      if (key === "extensions" && (!child || typeof child !== "object" || Array.isArray(child) || Object.keys(child).some((name) => !extensions.has(name)))) throw new Error("GLB 使用尚未支援的擴充，請匯出未壓縮的標準模型與動畫。");
      if ((key === "extensionsUsed" || key === "extensionsRequired") && (!Array.isArray(child) || child.some((name) => typeof name !== "string" || !extensions.has(name)))) throw new Error("GLB 宣告尚未支援的擴充。");
      // Count primitive array members too, without allocating a second huge stack.
      if (stack.length + visited >= MODEL_UPLOAD_LIMITS.jsonValues) throw new Error("GLB 描述過於複雜。");
      stack.push({ value: child, depth: depth + 1 });
    }
  }
  const doc = json as GlbDocument;
  if (doc.asset?.version !== "2.0") throw new Error("僅支援 glTF 2.0。");
  const arrays = ["nodes", "animations", "accessors", "bufferViews", "buffers", "images", "meshes", "skins"] as const;
  for (const key of arrays) if (doc[key] !== undefined && !Array.isArray(doc[key])) throw new Error(`GLB ${key} 集合不合法。`);
  if (!doc.accessors || !doc.bufferViews || doc.buffers?.length !== 1 || !Number.isSafeInteger(doc.buffers[0]!.byteLength) || doc.buffers[0]!.byteLength > bin.length || doc.buffers[0]!.byteLength < bin.length - 3) throw new Error("GLB 必須使用單一內嵌 buffer。");
  if ((doc.nodes?.length ?? 0) > MODEL_UPLOAD_LIMITS.nodes || (doc.animations?.length ?? 0) > MODEL_UPLOAD_LIMITS.clips || doc.accessors.length > MODEL_UPLOAD_LIMITS.accessors) throw new Error("節點、動作或 accessor 數超過匯入上限。");
  let values = 0;
  for (const accessor of doc.accessors) {
    if (!accessor || !Number.isSafeInteger(accessor.count) || accessor.count <= 0 || !Object.hasOwn(dimensions, accessor.type)) throw new Error("GLB accessor 大小不合法。");
    values += accessor.count * dimensions[accessor.type]!;
    if (values > MODEL_UPLOAD_LIMITS.accessorValues) throw new Error("GLB 解碼資料量超過匯入上限。");
  }
  let channels = 0;
  for (const clip of doc.animations ?? []) {
    if (!clip || !Array.isArray(clip.channels) || !Array.isArray(clip.samplers) || clip.channels.length > MODEL_UPLOAD_LIMITS.clipChannels || clip.samplers.length > MODEL_UPLOAD_LIMITS.clipChannels) throw new Error("單段動作超過來源上限。");
    channels += clip.channels.length;
  }
  if (channels > MODEL_UPLOAD_LIMITS.channels) throw new Error("動作庫總通道數超過匯入上限。");
  return { json: doc, bin };
}

/** Call only after structural validation; preflight still prevents oversized arrays. */
export function readFloatAccessor(json: GlbDocument, bin: Uint8Array, index: number): Float32Array {
  const accessor = json.accessors[index];
  if (!accessor || accessor.componentType !== 5126 || !Object.hasOwn(dimensions, accessor.type) || !Number.isSafeInteger(accessor.count) || accessor.count <= 0 || accessor.count * dimensions[accessor.type]! > MODEL_UPLOAD_LIMITS.accessorValues) throw new Error("動作與骨架必須使用有界浮點資料。");
  const width = dimensions[accessor.type]!;
  const values = new Float32Array(accessor.count * width);
  const raw = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const read = (viewId: number, offset: number, count: number, callback: (i: number, d: number, value: number) => void) => {
    const bufferView = json.bufferViews[viewId]!;
    const start = (bufferView.byteOffset ?? 0) + offset, stride = bufferView.byteStride ?? width * 4;
    for (let i = 0; i < count; i++) for (let d = 0; d < width; d++) callback(i, d, raw.getFloat32(start + i * stride + d * 4, true));
  };
  if (accessor.bufferView !== undefined) read(accessor.bufferView, accessor.byteOffset ?? 0, accessor.count, (i, d, value) => { values[i * width + d] = value; });
  if (accessor.sparse) {
    const sparse = accessor.sparse, indices = json.bufferViews[sparse.indices.bufferView]!;
    const base = (indices.byteOffset ?? 0) + (sparse.indices.byteOffset ?? 0), component = sparse.indices.componentType;
    const at = (i: number) => component === 5121 ? raw.getUint8(base + i) : component === 5123 ? raw.getUint16(base + i * 2, true) : raw.getUint32(base + i * 4, true);
    read(sparse.values.bufferView, sparse.values.byteOffset ?? 0, sparse.count, (i, d, value) => { const index = at(i); if (index >= accessor.count) throw new Error("稀疏資料索引超界。"); values[index * width + d] = value; });
  }
  return values;
}

export function encodeUploadGlb(document: GlbDocument, bin: Uint8Array): Uint8Array {
  const json = { ...document, buffers: [{ ...document.buffers[0], byteLength: bin.byteLength }] };
  const raw = new TextEncoder().encode(JSON.stringify(json)), jsonSize = Math.ceil(raw.length / 4) * 4, binSize = Math.ceil(bin.length / 4) * 4;
  const total = 28 + jsonSize + binSize;
  if (total > MODEL_UPLOAD_LIMITS.fileBytes || jsonSize > MODEL_UPLOAD_LIMITS.jsonBytes) throw new Error("合併後 GLB 超過匯入大小上限。");
  const output = new Uint8Array(total), view = new DataView(output.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, total, true);
  view.setUint32(12, jsonSize, true); view.setUint32(16, 0x4e4f534a, true); output.fill(32, 20, 20 + jsonSize); output.set(raw, 20);
  view.setUint32(20 + jsonSize, binSize, true); view.setUint32(24 + jsonSize, 0x004e4942, true); output.set(bin, 28 + jsonSize);
  return output;
}
