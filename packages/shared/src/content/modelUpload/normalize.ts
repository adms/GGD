import { encodeUploadGlb, parseUploadGlb, readFloatAccessor, type GlbDocument, type GlbPrimitive } from "./glb";
import { HERO_MODEL_BUDGET } from "./budget";

/**
 * 匯入模型的**正規化＋自動修正** —— ⭐ 後台與編輯器兩條匯入路徑都自動帶它。
 *
 * > owner 2026-09-10（逐字）：「類似這種錯誤 請你**寫成 script 把每個模型都掃過合併
 * >  並檢查沒問題**吧 也寫到守則裡 **匯入模型都要跑一次檢查**」
 * > owner 2026-09-10（逐字）：「**後台設定跟編輯器都要自動帶入這個檢查與修正 script**」
 *
 * 它修兩件事，⛔ 兩件都是 2026-09-10 真的擋住上架的缺陷：
 *
 * ① **合併「畫起來一樣」的 primitive** —— 判準是**內容**（材質 JSON 去掉 `name`
 *    與 `extras`，那兩格是溯源資料⛔不是渲染狀態），⛔ 不是材質索引。
 *    量到的：`imported.doraemon-cat` **22 個 draw 而只有 3 種畫法**、
 *    `ou99.472112` **21 個 draw 而只有 1 種**。而每支英雄的 draw call 上限是 6
 *    ⇒ 不合併就整顆上不了架。
 *
 * ② **丟掉長度為零的動作片段** —— WC3 modeler 把署名塞進 sequence 清單
 *    （「未经允许禁止分享与使用」「动作：金皮蛋」這種），轉出來是 duration=0 的
 *    glTF animation，而 `inspectModelUpload` 逐字擋「動作長度必須大於零」
 *    ⇒ 一段署名就讓整顆註冊不進去（41 顆裡中 6 顆）。
 *    ⭐ 判準是**長度**⛔不是名字 —— 用名字比對署名等於維護一張會過期的黑名單，
 *    而長度為零的片段本來就播不出任何東西。
 *
 * ⛔ 它**不做**的事：減面、貼圖縮放、貼圖圖集。那些會改變畫面，屬於
 * `tools/model-budget/optimize.ts` 的離線批次（人工採用），⛔ 不是匯入時的自動修正。
 */
/**
 * ⭐ 縮圖器由**宿主注入** —— 因為兩個宿主的環境不一樣，⛔ 而共用碼不可以假設其中一個：
 * · 編輯器跑在**瀏覽器 worker** ⇒ `createImageBitmap` + `OffscreenCanvas`（都有）
 * · 後台 content-api 跑在 **Node** ⇒ 兩個都**沒有**（實測 undefined）⇒ 走 ffmpeg
 *
 * ⛔ 沒有注入時**不會**靜默放行：報告裡的 `texturesOverCap` 會列出超標的貼圖，
 * 而 `heroModelBudgetIssues` 的 `texEdge` 那一條會把它擋成錯誤。
 */
export type ResizeImage = (bytes: Uint8Array, maxEdge: number) => Promise<Uint8Array | null>;

export interface NormalizeReport {
  /** 合併前後的 draw call 數；相等代表沒有可合併的。 */
  drawCalls: { before: number; after: number };
  /** 被丟掉的零長度片段名（多半是作者署名）。 */
  droppedZeroClips: string[];
  /** 縮過的貼圖：`[原邊長, 新邊長]`。 */
  resizedTextures: [number, number][];
  /** ⛔ 仍然超過上限的貼圖邊長（沒有注入縮圖器，或縮不動）。 */
  texturesOverCap: number[];
  /** 位元組有沒有真的變 —— ⛔ false 時呼叫端應該沿用原本的 bytes。 */
  changed: boolean;
}

/** PNG / JPEG 的像素尺寸 —— ⭐ 只讀檔頭，⛔ 不解碼。 */
export function imageSize(bytes: Uint8Array): { w: number; h: number } | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length > 24 && v.getUint32(0) === 0x89504e47) return { w: v.getUint32(16), h: v.getUint32(20) };
  if (bytes.length > 4 && v.getUint16(0) === 0xffd8) {
    for (let at = 2; at + 9 < bytes.length;) {
      if (v.getUint8(at) !== 0xff) { at++; continue; }
      const marker = v.getUint8(at + 1);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: v.getUint16(at + 5), w: v.getUint16(at + 7) };
      }
      at += 2 + v.getUint16(at + 2);
    }
  }
  return null;
}

/** 材質的**渲染狀態**指紋：⛔ `name` 與 `extras` 是溯源資料，不進指紋。 */
function renderKey(json: GlbDocument, material: number | undefined): string {
  const list = (json as { materials?: Record<string, unknown>[] }).materials ?? [];
  const m = typeof material === "number" && material >= 0 && material < list.length ? list[material]! : {};
  return JSON.stringify(Object.fromEntries(
    Object.entries(m).filter(([k]) => k !== "name" && k !== "extras").sort(([a], [b]) => a < b ? -1 : 1)));
}

function clipSpanSeconds(json: GlbDocument, bin: Uint8Array, clip: GlbDocument["animations"] extends (infer T)[] | undefined ? T : never): number {
  let span = 0;
  for (const sampler of clip.samplers) {
    const declared = json.accessors[sampler.input]?.max?.[0];
    // ⭐ `max` 是選填 —— 缺了就真的把時間軸讀出來，⛔ 不要當成 0（那會誤刪合法片段）。
    span = Math.max(span, typeof declared === "number" ? declared
      : (readFloatAccessor(json, bin, sampler.input).at(-1) ?? 0));
  }
  return span;
}

export async function normalizeUploadedModel(
  bytes: Uint8Array,
  options: { maxTextureEdge?: number; resizeImage?: ResizeImage } = {},
): Promise<{ bytes: Uint8Array; report: NormalizeReport }> {
  const cap = options.maxTextureEdge ?? HERO_MODEL_BUDGET.texEdge.limit;
  const { json, bin } = parseUploadGlb(bytes);
  const before = (json.nodes ?? []).reduce((n, node) =>
    n + (node.mesh === undefined ? 0 : json.meshes![node.mesh]!.primitives.length), 0);

  // ── ② 零長度片段 ────────────────────────────────────────────────────────
  const dropped: string[] = [];
  if (json.animations?.length) {
    const kept = json.animations.filter((clip) => {
      if (clipSpanSeconds(json, bin, clip) > 0) return true;
      dropped.push(clip.name ?? "(未命名)");
      return false;
    });
    if (dropped.length) json.animations = kept;
  }

  // ── ③ 貼圖縮到上限 ────────────────────────────────────────────────────────
  // ⭐ owner 2026-09-10 逐字：「這個應該變成**上架前 後台＆編輯器的內建 script** 吧
  //    避免上架到過大的貼圖」「**場景也是阿 不應該有貼圖超過256**」
  // ⚠️ 縮圖只換 image 的位元組,⛔ 幾何、骨架、動畫一個位元組都不碰。
  const resized: [number, number][] = [];
  const overCap: number[] = [];
  let texBin = bin;
  const images = json.images ?? [];
  if (images.length) {
    const replacements = new Map<number, Uint8Array>();
    for (const [i, image] of images.entries()) {
      if (image.bufferView === undefined) continue;
      const view = json.bufferViews[image.bufferView];
      if (!view) continue;
      const at = view.byteOffset ?? 0;
      const raw = texBin.subarray(at, at + view.byteLength);
      const size = imageSize(raw);
      if (!size || Math.max(size.w, size.h) <= cap) continue;
      const next = options.resizeImage ? await options.resizeImage(raw, cap) : null;
      const got = next ? imageSize(next) : null;
      if (!next || !got || Math.max(got.w, got.h) > cap) { overCap.push(Math.max(size.w, size.h)); continue; }
      replacements.set(i, next);
      resized.push([Math.max(size.w, size.h), Math.max(got.w, got.h)]);
    }
    if (replacements.size) texBin = rebuildWithImages(json, texBin, replacements);
  }

  // ── ① 依「畫起來一樣」合併 primitive ──────────────────────────────────────
  // ⚠️ 只處理「單一 mesh 節點」的常見形狀：多個 mesh 節點各有自己的變換，
  //    幾何接起來會跑位 ⇒ ⛔ 不合併（回報裡看得出來 before===after）。
  const bin2 = texBin;
  const meshNodes = (json.nodes ?? []).filter((n) => n.mesh !== undefined);
  const singleMesh = new Set(meshNodes.map((n) => n.mesh)).size === 1 && meshNodes.length === 1;
  if (singleMesh && json.meshes) {
    const mesh = json.meshes[meshNodes[0]!.mesh!]!;
    const groups = new Map<string, GlbPrimitive[]>();
    for (const prim of mesh.primitives) {
      const key = renderKey(json, (prim as { material?: number }).material);
      groups.set(key, [...groups.get(key) ?? [], prim]);
    }
    if (groups.size < mesh.primitives.length) {
      const merged = mergeGroups(json, bin2, [...groups.values()]);
      if (merged) { mesh.primitives = merged.primitives; return finish(json, merged.bin); }
    }
  }
  return finish(json, bin2);

  function finish(doc: GlbDocument, buffer: Uint8Array) {
    const after = (doc.nodes ?? []).reduce((n, node) =>
      n + (node.mesh === undefined ? 0 : doc.meshes![node.mesh]!.primitives.length), 0);
    const changed = after !== before || dropped.length > 0 || resized.length > 0;
    return {
      bytes: changed ? encodeUploadGlb(doc, buffer) : bytes,
      report: { drawCalls: { before, after }, droppedZeroClips: dropped,
                resizedTextures: resized, texturesOverCap: overCap, changed },
    };
  }
}

const WIDTH: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

/** 把每一組（同一種畫法）的幾何接成一個 primitive；接不了就回 null（⛔ 保持原樣）。 */
function mergeGroups(json: GlbDocument, bin: Uint8Array, groups: GlbPrimitive[][]): { primitives: GlbPrimitive[]; bin: Uint8Array } | null {
  const tail: Uint8Array[] = [];
  let offset = bin.byteLength;
  const push = (blob: Uint8Array, target?: number): number => {
    const pad = (4 - offset % 4) % 4;
    if (pad) { tail.push(new Uint8Array(pad)); offset += pad; }
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: blob.byteLength, ...(target ? { target } : {}) });
    tail.push(blob); offset += blob.byteLength;
    return json.bufferViews.length - 1;
  };
  const raw = (index: number): { bytes: Uint8Array; count: number; width: number; unit: number; componentType: number; type: string } | null => {
    const a = json.accessors[index];
    if (!a || a.sparse || a.bufferView === undefined) return null;              // ⛔ 稀疏資料不接
    const width = WIDTH[a.type], unit = BYTES[a.componentType];
    if (!width || !unit) return null;
    const view = json.bufferViews[a.bufferView]!;
    if (view.byteStride && view.byteStride !== width * unit) return null;        // ⛔ 交錯排列不接
    const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return { bytes: bin.subarray(start, start + a.count * width * unit), count: a.count, width, unit, componentType: a.componentType, type: a.type };
  };
  const primitives: GlbPrimitive[] = [];
  for (const group of groups) {
    if (group.length === 1) { primitives.push(group[0]!); continue; }
    const names = [...new Set(group.flatMap((p) => Object.keys(p.attributes)))].sort();
    if (group.some((p) => names.some((n) => p.attributes[n] === undefined) || p.indices === undefined)) return null;
    const attributes: Record<string, number> = {};
    let total = 0;
    for (const name of names) {
      const parts = group.map((p) => raw(p.attributes[name]!));
      if (parts.some((x) => x === null)) return null;
      const first = parts[0]!;
      if (parts.some((x) => x!.componentType !== first.componentType || x!.type !== first.type)) return null;
      const blob = new Uint8Array(parts.reduce((n, x) => n + x!.bytes.byteLength, 0));
      let at = 0;
      for (const part of parts) { blob.set(part!.bytes, at); at += part!.bytes.byteLength; }
      const count = parts.reduce((n, x) => n + x!.count, 0);
      const accessor: GlbDocument["accessors"][number] = { bufferView: push(blob, 34962), componentType: first.componentType, count, type: first.type };
      if (name === "POSITION") {
        // ⭐ 邊界要用真的資料重算 —— ⛔ 沿用任何一段的 min/max 都會「超界」。
        const values = new Float32Array(blob.buffer, blob.byteOffset, count * 3);
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < count; i++) for (let d = 0; d < 3; d++) {
          const v = values[i * 3 + d]!;
          if (v < min[d]!) min[d] = v;
          if (v > max[d]!) max[d] = v;
        }
        accessor.min = min; accessor.max = max;
      }
      json.accessors.push(accessor);
      attributes[name] = json.accessors.length - 1;
      total = count;
    }
    const faces: number[] = [];
    let base = 0;
    for (const prim of group) {
      const idx = raw(prim.indices!), pos = raw(prim.attributes.POSITION!);
      if (!idx || !pos) return null;
      const view = idx.componentType === 5125 ? new Uint32Array(idx.bytes.buffer, idx.bytes.byteOffset, idx.count)
        : idx.componentType === 5123 ? new Uint16Array(idx.bytes.buffer, idx.bytes.byteOffset, idx.count)
          : new Uint8Array(idx.bytes.buffer, idx.bytes.byteOffset, idx.count);
      for (const v of view) faces.push(v + base);
      base += pos.count;
    }
    // ⚠️ 合併後頂點數會超過 65535 ⇒ uint16 索引**存不下**（靜默溢位成破圖）。
    const wide = total > 0xffff;
    const blob = wide ? new Uint8Array(new Uint32Array(faces).buffer) : new Uint8Array(new Uint16Array(faces).buffer);
    json.accessors.push({ bufferView: push(blob, 34963), componentType: wide ? 5125 : 5123, count: faces.length, type: "SCALAR" });
    primitives.push({ attributes, indices: json.accessors.length - 1, ...(("material" in group[0]!) ? { material: (group[0] as { material?: number }).material } : {}) });
  }
  const merged = new Uint8Array(offset);
  merged.set(bin, 0);
  let at = bin.byteLength;
  for (const chunk of tail) { merged.set(chunk, at); at += chunk.byteLength; }
  return { primitives, bin: merged };
}

/**
 * 換掉指定 image 的位元組並重建 buffer。
 *
 * ⭐ 逐個 bufferView 原樣搬過去（只有被換掉的那幾個換內容）⇒ **每一個 accessor 的
 * byteOffset 都要跟著新的 view 位移走**。⛔ 直接把新位元組塞回原位會讓後面所有
 * view 的位移全錯，而那**不會有任何東西報錯** —— 它只是把模型畫成一團碎片。
 */
function rebuildWithImages(json: GlbDocument, bin: Uint8Array, replacements: Map<number, Uint8Array>): Uint8Array {
  const byImage = new Map<number, Uint8Array>();
  for (const [i, bytes] of replacements) {
    const view = (json.images ?? [])[i]?.bufferView;
    if (view !== undefined) byImage.set(view, bytes);
  }
  const chunks: Uint8Array[] = [];
  let at = 0;
  const views = json.bufferViews.map((view) => {
    const swap = byImage.get(json.bufferViews.indexOf(view));
    const data = swap ?? bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const pad = (4 - at % 4) % 4;
    if (pad) { chunks.push(new Uint8Array(pad)); at += pad; }
    const next = { ...view, byteOffset: at, byteLength: data.byteLength };
    chunks.push(data); at += data.byteLength;
    return next;
  });
  json.bufferViews = views;
  json.buffers = [{ byteLength: at }];
  const out = new Uint8Array(at);
  let cursor = 0;
  for (const chunk of chunks) { out.set(chunk, cursor); cursor += chunk.byteLength; }
  return out;
}
