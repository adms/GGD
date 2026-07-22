/**
 * glb — the dependency-free GLB primitives shared by the import guard and the
 * offline optimiser.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM emit_report.ts. emit_report is the
 * cross-checked MEASUREMENT tool (its numbers were agreed against two other
 * parsers and a Babylon NullEngine run and are pinned by report.test.ts); it is
 * deliberately left untouched. Rather than edit that hot, verified file, the
 * guard and the optimiser use THIS module, and glb.test.ts asserts that its
 * measurement reproduces emit_report's report.json to the byte for all 203
 * models. Two implementations, one conformance test — a stronger guarantee than
 * a shared function, and no risk to the page task #102 already reads.
 *
 * A GLB is a 12-byte header + length-prefixed chunks; triangles are
 * `indices.count` per primitive read through the primitive `mode`; texture VRAM
 * is decoded RGBA8 + a full mip chain. No glTF library, so every number here can
 * be re-derived by reading this file rather than trusting a version range —
 * exactly the property emit_report was built to keep.
 *
 * It also carries `rebuildGlb`, which the optimiser uses to write a NEW glb with
 * resized image chunks swapped in and EVERY OTHER BYTE preserved: geometry,
 * skinning and animation accessors are copied verbatim, so a texture-resize can
 * never corrupt a rig. `assertGeometryIdentical` proves that invariant after the
 * fact.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";

export const GLB_MAGIC = 0x46546c67;
export const CHUNK_JSON = 0x4e4f534a;
export const CHUNK_BIN = 0x004e4942;

export interface Img {
  /** index into gltf.images */
  index: number;
  w: number;
  h: number;
  /** container as sniffed from the bytes (png/webp/jpeg), or the declared mime */
  format: string;
  mimeType: string;
  /** the bufferView that holds this image's bytes (images here are always embedded) */
  bufferView: number;
  diskBytes: number;
}

export interface GlbMetrics {
  fileBytes: number;
  triangles: number;
  vertices: number;
  /** one Babylon mesh per node×primitive — one draw call each, nothing instanced */
  meshes: number;
  materials: number;
  skins: number;
  joints: number;
  clips: number;
  /** channels of the single heaviest clip: only one clip plays at a time */
  channelsPerFrame: number;
  images: Img[];
  textureDiskBytes: number;
  /** RGBA8 + full mip chain (Babylon mips everything; no sampler opts out) */
  vramBytes: number;
  maxTextureEdge: number;
}

export interface Glb {
  json: any;
  bin: Buffer | null;
  bytes: number;
}

export function readGlb(file: string): Glb {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`not a glb: ${file}`);
  const total = buf.readUInt32LE(8);
  let off = 12;
  let json: any = null;
  let bin: Buffer | null = null;
  while (off + 8 <= Math.min(total, buf.length)) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const start = off + 8;
    if (type === CHUNK_JSON) json = JSON.parse(buf.subarray(start, start + len).toString("utf8"));
    else if (type === CHUNK_BIN) bin = buf.subarray(start, start + len);
    off = start + len;
    while (off % 4 !== 0) off++;
  }
  if (!json) throw new Error(`glb has no JSON chunk: ${file}`);
  return { json, bin, bytes: buf.length };
}

/** glTF primitive modes: 4 TRIANGLES, 5 STRIP, 6 FAN; points/lines draw none. */
export function trisFor(mode: number | undefined, elements: number): number {
  const m = mode ?? 4;
  if (m === 4) return Math.floor(elements / 3);
  if (m === 5 || m === 6) return Math.max(0, elements - 2);
  return 0;
}

/** Pixel dimensions straight out of the container header — no decode, no deps. */
export function sniff(b: Buffer): { w: number; h: number; format: string } | null {
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) {
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), format: "png" };
  }
  if (b.length >= 16 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const kind = b.toString("ascii", 12, 16);
    if (kind === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3), format: "webp" };
    if (kind === "VP8L") {
      const bits = b.readUInt32LE(21);
      return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff), format: "webp" };
    }
    if (kind === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff, format: "webp" };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1]!;
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5), format: "jpeg" };
      }
      i += 2 + len;
    }
  }
  return null;
}

/** RGBA8 (Babylon decodes every compressed source to RGBA8) × 4/3 for mips. */
export function vramOf(w: number, h: number): number {
  return Math.round(w * h * 4 * (4 / 3));
}

/** Raw bytes of one embedded image, straight out of its bufferView. */
export function imageBytes(glb: Glb, img: Img): Buffer {
  if (!glb.bin) throw new Error("glb has no BIN chunk");
  const v = glb.json.bufferViews[img.bufferView];
  const start = v.byteOffset ?? 0;
  return glb.bin.subarray(start, start + v.byteLength);
}

/** Every embedded image with its dimensions and owning bufferView. */
export function readImages(glb: Glb): Img[] {
  const views: any[] = glb.json.bufferViews ?? [];
  const out: Img[] = [];
  (glb.json.images ?? []).forEach((im: any, index: number) => {
    if (typeof im.bufferView !== "number" || !glb.bin) return; // URI images not embedded — out of scope
    const v = views[im.bufferView];
    if (!v) return;
    const slice = glb.bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
    const s = sniff(slice);
    out.push({
      index,
      w: s?.w ?? 0,
      h: s?.h ?? 0,
      format: s?.format ?? String(im.mimeType ?? "?"),
      mimeType: String(im.mimeType ?? (s ? `image/${s.format}` : "?")),
      bufferView: im.bufferView,
      diskBytes: slice.length,
    });
  });
  return out;
}

/**
 * Measure one glb. This mirrors emit_report.analyse EXACTLY (triangles/meshes
 * counted through node references, one clip resident, RGBA8+mip VRAM), and
 * glb.test.ts pins that equivalence against the generated report.
 */
export function measureGlb(file: string): GlbMetrics {
  const glb = readGlb(file);
  const g = glb.json;
  const acc: any[] = g.accessors ?? [];
  const meshes: any[] = g.meshes ?? [];
  const nodes: any[] = g.nodes ?? [];

  const refs = new Array<number>(meshes.length).fill(0);
  for (const n of nodes) if (typeof n.mesh === "number") refs[n.mesh]! += 1;

  let triangles = 0;
  let vertices = 0;
  let meshCount = 0;
  const mats = new Set<number>();
  meshes.forEach((m: any, mi: number) => {
    const uses = refs[mi] ?? 0;
    if (uses === 0) return;
    for (const p of m.primitives ?? []) {
      const posIdx = p.attributes?.POSITION;
      const vcount = typeof posIdx === "number" ? acc[posIdx]?.count ?? 0 : 0;
      const elements = typeof p.indices === "number" ? acc[p.indices]?.count ?? 0 : vcount;
      triangles += trisFor(p.mode, elements) * uses;
      vertices += vcount * uses;
      meshCount += uses;
      if (typeof p.material === "number") mats.add(p.material);
    }
  });

  const clips: any[] = g.animations ?? [];
  let channelsPerFrame = 0;
  for (const a of clips) channelsPerFrame = Math.max(channelsPerFrame, (a.channels ?? []).length);

  const images = readImages(glb);
  const skins: any[] = g.skins ?? [];
  return {
    fileBytes: glb.bytes,
    triangles,
    vertices,
    meshes: meshCount,
    materials: mats.size,
    skins: skins.length,
    joints: skins.reduce((n, s) => n + (s.joints?.length ?? 0), 0),
    clips: clips.length,
    channelsPerFrame,
    images,
    textureDiskBytes: images.reduce((n, i) => n + i.diskBytes, 0),
    vramBytes: images.reduce((n, i) => n + vramOf(i.w, i.h), 0),
    maxTextureEdge: images.reduce((n, i) => Math.max(n, i.w, i.h), 0),
  };
}

const pad4 = (n: number): number => (n + 3) & ~3;

/**
 * Rebuild a glb with some image bufferViews' bytes replaced, and NOTHING else
 * touched. Every bufferView keeps its index, order and properties; only the
 * replaced views change content, and all view byteOffsets are recomputed with
 * 4-byte alignment (the alignment the source already used, so every accessor's
 * absolute component offset is preserved — verified by loading the output
 * through Babylon). Accessors, meshes, skins and animations reference views by
 * index and are copied verbatim, so a resize cannot move a vertex or a weight.
 *
 * `replacements` is keyed by bufferView index. The caller guarantees each
 * replaced view is image-only (no accessor points at it) — true for every glb
 * in this project, where images and geometry never share a bufferView.
 */
export function rebuildGlb(json: any, bin: Buffer, replacements: Map<number, Buffer>): Buffer {
  const views: any[] = json.bufferViews;
  const parts: Buffer[] = [];
  let offset = 0;
  const newViews = views.map((v, i) => {
    const data = replacements.has(i)
      ? replacements.get(i)!
      : bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
    const start = offset;
    parts.push(data);
    offset += data.length;
    const padded = pad4(offset);
    if (padded > offset) {
      parts.push(Buffer.alloc(padded - offset));
      offset = padded;
    }
    return { ...v, byteOffset: start, byteLength: data.length };
  });

  const outJson = { ...json, bufferViews: newViews, buffers: [{ byteLength: offset }] };
  const newBin = Buffer.concat(parts);
  const jsonStr = Buffer.from(JSON.stringify(outJson), "utf8");
  const jsonChunk = Buffer.concat([jsonStr, Buffer.alloc(pad4(jsonStr.length) - jsonStr.length, 0x20)]);
  const binChunk = Buffer.concat([newBin, Buffer.alloc(pad4(newBin.length) - newBin.length, 0)]);
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;

  const head = Buffer.alloc(12);
  head.writeUInt32LE(GLB_MAGIC, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(jsonChunk.length, 0);
  jh.writeUInt32LE(CHUNK_JSON, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(binChunk.length, 0);
  bh.writeUInt32LE(CHUNK_BIN, 4);
  return Buffer.concat([head, jh, jsonChunk, bh, binChunk]);
}

/**
 * The geometry/rig invariant the texture stage promises: everything that
 * describes shape, skinning and motion is byte-for-byte the same between two
 * glbs. Compares the JSON that drives geometry (meshes/accessors/skins/
 * animations/nodes/materials) AND the actual bytes of every NON-image
 * bufferView. Returns the first difference, or null when identical.
 */
export function geometryDiff(a: string, b: string): string | null {
  const ga = readGlb(a);
  const gb = readGlb(b);
  const keys = ["meshes", "accessors", "skins", "animations", "nodes", "materials"];
  for (const k of keys) {
    if (JSON.stringify(ga.json[k] ?? null) !== JSON.stringify(gb.json[k] ?? null)) {
      return `${k} differs`;
    }
  }
  const imgViewsA = new Set<number>((ga.json.images ?? []).map((im: any) => im.bufferView));
  const va: any[] = ga.json.bufferViews ?? [];
  const vb: any[] = gb.json.bufferViews ?? [];
  if (va.length !== vb.length) return `bufferView count differs (${va.length} vs ${vb.length})`;
  for (let i = 0; i < va.length; i++) {
    if (imgViewsA.has(i)) continue; // image views are allowed to differ — that is the point
    const da = ga.bin!.subarray(va[i].byteOffset ?? 0, (va[i].byteOffset ?? 0) + va[i].byteLength);
    const db = gb.bin!.subarray(vb[i].byteOffset ?? 0, (vb[i].byteOffset ?? 0) + vb[i].byteLength);
    if (!da.equals(db)) return `non-image bufferView ${i} bytes differ`;
  }
  return null;
}

export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function sha256File(file: string): string {
  return sha256(fs.readFileSync(file));
}
