/**
 * 圖集 stage 的承重守衛（GH#1174）—— 它只問一件事：
 * ⭐ **哪些 primitive 不可以被併進同一張圖集**，而 stage 有沒有真的放過它們。
 *
 * ⛔ 這一條壞掉的樣子**不會有任何東西紅**：draw call 會變得更漂亮、模型照樣載得起來、
 * 面數一個都沒變 —— 而畫面上會多出一塊整片錯位的貼圖（tile 的那一張被塞進格子裡），
 * 或是一個 BLEND 的部位被畫成 OPAQUE。⇒ 這裡把兩者都釘死。
 *
 * 突變驗證（2026-09-10）：把 `atlas_pack.py::analyse` 的 UV 越界那一行拿掉
 * （`if umin < -tol …` 改成 `if False`）⇒ 本檔第二條斷言紅：tiling 的 primitive
 * 被搬進圖集、UV 從 2.0 被壓成 0.x。改回來即綠。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";

const WORKER = path.join(import.meta.dirname, "optimize", "atlas_pack.py");

function png(edge: number, rgb: number[]): Buffer {
  const row = Buffer.concat([Buffer.from([0]), ...Array.from({ length: edge }, () => Buffer.from([...rgb, 255]))]);
  const chunk = (tag: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(tag), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(zlib.crc32(body) >>> 0, body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(edge, 0); ihdr.writeUInt32BE(edge, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(Array.from({ length: edge }, () => row)))), chunk("IEND", Buffer.alloc(0))]);
}

/** 四個 primitive：兩個只差貼圖的 OPAQUE、一個 BLEND、一個 UV 到 2.0 會 tile 的。 */
function fixture(file: string): void {
  const pos = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]).buffer);
  const uv = Buffer.from(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]).buffer);
  const tile = Buffer.from(new Float32Array([0, 0, 2, 0, 2, 2, 0, 2]).buffer);
  const idx = Buffer.from(new Uint16Array([0, 1, 2, 0, 2, 3]).buffer);
  const imgs = [png(32, [200, 40, 40]), png(32, [40, 200, 40]), png(32, [40, 40, 200])];
  const blobs = [pos, uv, tile, idx, ...imgs];
  let at = 0;
  const views = blobs.map((b) => { const v = { buffer: 0, byteOffset: at, byteLength: b.length }; at += b.length + ((4 - b.length % 4) % 4); return v; });
  const mat = (tex: number, blend: boolean) => ({ pbrMetallicRoughness: { baseColorTexture: { index: tex } }, ...(blend ? { alphaMode: "BLEND" } : {}) });
  const prim = (m: number, uvAcc: number) => ({ attributes: { POSITION: 0, TEXCOORD_0: uvAcc }, indices: 3, material: m });
  const json = {
    asset: { version: "2.0" }, scenes: [{ nodes: [0] }], scene: 0, nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [prim(0, 1), prim(1, 1), prim(2, 1), prim(3, 2)] }],
    materials: [mat(0, false), mat(1, false), mat(2, true), mat(2, false)],
    textures: [0, 1, 2].map((s) => ({ source: s, sampler: 0 })), samplers: [{ wrapS: 10497, wrapT: 10497 }],
    images: [4, 5, 6].map((v) => ({ bufferView: v, mimeType: "image/png" })),
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 4, type: "VEC2" },
      { bufferView: 2, componentType: 5126, count: 4, type: "VEC2" },
      { bufferView: 3, componentType: 5123, count: 6, type: "SCALAR" },
    ],
    bufferViews: views, buffers: [{ byteLength: at }],
  };
  const bin = Buffer.alloc(at);
  blobs.forEach((b, i) => b.copy(bin, views[i]!.byteOffset));
  const js = Buffer.from(JSON.stringify(json) + " ".repeat((4 - JSON.stringify(json).length % 4) % 4));
  const head = (len: number, tag: number) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(tag, 4); return b; };
  const body = Buffer.concat([head(js.length, 0x4e4f534a), js, head(bin.length, 0x004e4942), bin]);
  const glb = Buffer.alloc(12); glb.write("glTF", 0); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(12 + body.length, 8);
  fs.writeFileSync(file, Buffer.concat([glb, body]));
}

function python(): string[] {
  for (const c of [["python3"], ["arch", "-arm64", "python3"], ["/opt/homebrew/bin/python3"]]) {
    try { execFileSync(c[0]!, [...c.slice(1), "-c", "from PIL import Image; Image.new('RGBA',(2,2))"], { stdio: "ignore" }); return c; } catch { /* next */ }
  }
  throw new Error("no python3 with a working Pillow");
}

describe("atlas stage", () => {
  it("併掉只差貼圖的 primitive，⛔ 但放過 BLEND 與會 tile 的", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-test-"));
    const src = path.join(dir, "in.glb"), out = path.join(dir, "out.glb");
    fixture(src);
    const py = python();
    execFileSync(py[0]!, [...py.slice(1), WORKER, src, "--out", out, "--edge", "128", "--max-draws", "6"], { stdio: ["ignore", "pipe", "pipe"] });

    const raw = fs.readFileSync(out);
    const jsonLen = raw.readUInt32LE(12);
    const g = JSON.parse(raw.subarray(20, 20 + jsonLen).toString("utf8"));
    const prims = g.meshes[0].primitives;
    // ① 兩個只差貼圖的 OPAQUE 併成一個；BLEND 與 tiling 各自留著。
    expect(prims.length).toBe(3);
    // ② ⭐ 會 tile 的那一個**沒有被搬進圖集**：它的 UV 仍然到 2.0。
    const uvMax = prims.map((p: any) => {
      const a = g.accessors[p.attributes.TEXCOORD_0], v = g.bufferViews[a.bufferView];
      const base = 28 + jsonLen + (v.byteOffset ?? 0);
      let mx = -Infinity;
      for (let o = base; o + 4 <= base + v.byteLength; o += 4) mx = Math.max(mx, raw.readFloatLE(o));
      return mx;
    });
    expect(uvMax.filter((m: number) => m > 1.5)).toHaveLength(1);
    // ③ BLEND 沒有被畫法合併掉。
    expect(prims.map((p: any) => g.materials[p.material].alphaMode ?? "OPAQUE").filter((m: string) => m === "BLEND")).toHaveLength(1);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
