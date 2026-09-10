import { encodeUploadGlb, parseUploadGlb, readFloatAccessor, type GlbDocument, type GlbPrimitive } from "./glb";

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
export interface NormalizeReport {
  /** 合併前後的 draw call 數；相等代表沒有可合併的。 */
  drawCalls: { before: number; after: number };
  /** 被丟掉的零長度片段名（多半是作者署名）。 */
  droppedZeroClips: string[];
  /** 位元組有沒有真的變 —— ⛔ false 時呼叫端應該沿用原本的 bytes。 */
  changed: boolean;
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

export function normalizeUploadedModel(bytes: Uint8Array): { bytes: Uint8Array; report: NormalizeReport } {
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

  // ── ① 依「畫起來一樣」合併 primitive ──────────────────────────────────────
  // ⚠️ 只處理「單一 mesh 節點」的常見形狀：多個 mesh 節點各有自己的變換，
  //    幾何接起來會跑位 ⇒ ⛔ 不合併（回報裡看得出來 before===after）。
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
      const merged = mergeGroups(json, bin, [...groups.values()]);
      if (merged) { mesh.primitives = merged.primitives; return finish(json, merged.bin); }
    }
  }
  return finish(json, bin);

  function finish(doc: GlbDocument, buffer: Uint8Array) {
    const after = (doc.nodes ?? []).reduce((n, node) =>
      n + (node.mesh === undefined ? 0 : doc.meshes![node.mesh]!.primitives.length), 0);
    const changed = after !== before || dropped.length > 0;
    return {
      bytes: changed ? encodeUploadGlb(doc, buffer) : bytes,
      report: { drawCalls: { before, after }, droppedZeroClips: dropped, changed },
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
