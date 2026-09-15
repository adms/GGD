/**
 * 🧮 一顆 GLB **畫出來的東西**的簽章 —— 給 `register-normalized-version.mts --reason gltf-valid` 證明
 * 「新版本只修了 metadata（accessor 界）／只合併了畫法相同的塊，⛔ 沒有換掉任何看得見的東西」。GH#1173
 *
 * ⚠️ 兩個方向都要成立才算一把尺（CLAUDE.md「一把只驗過單邊的尺，不算自證過」）：
 *   同內容不同佈局 ⇒ 相同；任何一個頂點位元組／一張貼圖／一個關鍵影格變了 ⇒ 不同。
 */
import { createHash } from "node:crypto";
import { parseUploadGlb, type GlbDocument } from "../../packages/shared/src/content/modelUpload/glb";

const WIDTH: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
const UNIT: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
export const canon = (value: unknown): string => JSON.stringify(value, (_k, v) =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : 1)) : v);

/**
 * 一顆 GLB **畫出來的東西**的簽章 —— ⛔ 不含 accessor 的 min/max、⛔ 不含 buffer 佈局。
 * 網格以「畫法（材質去掉 name/extras）＋模式＋屬性集合」分組，組內按 primitive 順序把**展開後的三角形頂點位元組**接起來；
 * ⇒ 合併畫法相同的 primitive（normalize 的①）簽章不變，而任何一個頂點、一張貼圖、一個關鍵影格變了都會變。
 * `perPrimitive` ⇒ 不分組、逐塊比（hiddenPrimitives 依賴塊的索引時用）。
 */
export function renderSignature(bytes: Uint8Array, perPrimitive: boolean): Record<string, string> {
  const { json, bin } = parseUploadGlb(bytes) as { json: GlbDocument & Record<string, any>; bin: Uint8Array };
  const element = (i: number) => {
    const a = json.accessors[i]!;
    const width = WIDTH[a.type], unit = UNIT[a.componentType];
    if (a.sparse || a.bufferView === undefined || !width || !unit) return null;
    const view = json.bufferViews[a.bufferView]!, stride = view.byteStride ?? width * unit;
    const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return { head: `${a.type}/${a.componentType}/${a.normalized === true}`, componentType: a.componentType, count: a.count,
      at: (k: number) => bin.subarray(start + k * stride, start + k * stride + width * unit) };
  };
  const data = (i: number | undefined) => {
    if (i === undefined) return "-";
    const e = element(i);
    if (!e) return `unreadable:${canon(json.accessors[i])}`;
    const h = createHash("sha256").update(e.head);
    for (let k = 0; k < e.count; k++) h.update(e.at(k));
    return h.digest("hex");
  };
  const out: Record<string, string> = {};
  const materials: Record<string, unknown>[] = json.materials ?? [];
  const hashers = new Map<string, ReturnType<typeof createHash>>();
  for (const [n, node] of (json.nodes ?? []).entries()) {
    if (node.mesh === undefined) continue;
    for (const [p, prim] of json.meshes![node.mesh]!.primitives.entries()) {
      const m = typeof (prim as { material?: number }).material === "number" ? materials[(prim as { material?: number }).material!] ?? {} : {};
      const names = Object.keys(prim.attributes).sort();
      const key = `${n}|${perPrimitive ? p : ""}|${canon(Object.fromEntries(Object.entries(m).filter(([k]) => k !== "name" && k !== "extras")))}|${prim.mode ?? 4}|${names}|${canon(prim.targets ?? null)}`;
      const h = hashers.get(key) ?? createHash("sha256");
      hashers.set(key, h);
      const streams = names.map((name) => element(prim.attributes[name]!));
      if (streams.some((s) => !s)) { h.update(`unreadable:${p}`); continue; }
      const idx = prim.indices === undefined ? null : element(prim.indices);
      const count = idx ? idx.count : streams[0]!.count;
      for (let k = 0; k < count; k++) {
        const raw = idx?.at(k), dv = raw && new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
        const v = !dv ? k : idx!.componentType === 5125 ? dv.getUint32(0, true) : idx!.componentType === 5123 ? dv.getUint16(0, true) : dv.getUint8(0);
        for (const s of streams) h.update(s!.at(v));
      }
    }
  }
  // ⚠️ 鍵用完整分組字串的雜湊（⛔ 不截斷字串：兩種畫法前綴相同時會互相蓋掉，差異就量不到了）
  for (const [key, h] of hashers) out[`draw ${createHash("sha256").update(key).digest("hex").slice(0, 16)} ${key.slice(0, 40)}`] = h.digest("hex");
  out.nodes = canon(json.nodes ?? []);
  out.skins = canon((json.skins ?? []).map((s) => ({ ...s, inverseBindMatrices: data(s.inverseBindMatrices) })));
  out.animations = canon((json.animations ?? []).map((a) => ({ name: a.name, channels: a.channels,
    samplers: a.samplers.map((s) => ({ interpolation: s.interpolation ?? "LINEAR", input: data(s.input), output: data(s.output) })) })));
  out.images = canon((json.images ?? []).map((im) => {
    const view = im.bufferView === undefined ? null : json.bufferViews[im.bufferView]!;
    return { mimeType: im.mimeType, bytes: view ? createHash("sha256").update(bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)).digest("hex") : null };
  }));
  out.textures = canon([json.textures ?? [], json.samplers ?? []]);
  return out;
}

export const primitiveCounts = (bytes: Uint8Array) => {
  const { json } = parseUploadGlb(bytes);
  return canon((json.nodes ?? []).map((n) => n.mesh === undefined ? 0 : json.meshes![n.mesh]!.primitives.length));
};
