/**
 * 圖集 stage 的承重守衛（GH#1174 · GH#1198）—— 它只問一件事：
 * ⭐ **每一個頂點看到的顏色，搬進圖集之後還是同一個顏色嗎**
 *    （原檔照 REPEAT 取樣 vs 輸出照它自己的 sampler 取樣 —— 取樣器寫在下面的檢查器裡，⛔ 不借 atlas_pack 的）。
 *
 * ⛔ 這一條壞掉的樣子**不會有任何東西紅**：draw call 更漂亮、模型照樣載得起來、面數一個都沒變 ——
 * 而畫面上一塊貼圖整片錯位（整格平移沒平移、tile 沒烘、emissive 還指著舊圖、BLEND 被畫成 OPAQUE）。
 *
 * 夾具：每張 32² 貼圖四個象限四種顏色，頂點落在象限中心 ⇒ 取錯地方一定換顏色。八個 primitive：
 *  P0 範圍內 · P1 V 整格平移 [-0.75,-0.25] · P2 BLEND · P3 U tile 1.5 格（與 P2 共圖）
 *  · P4 emissive 與 base 同圖（與 P1 共圖）· P5 emissive 是**另一張圖**（⛔ 不可併）
 *  · P6 另一種 BLEND · P7 與 P2 同畫法的 BLEND（隔著 P6 ⇒ ⛔ 不可以被接到 P2 前面去）
 *
 * 突變驗證（2026-09-15）：把 `_ineligible_why` 的同圖 emissive 判斷改成「有 emissive 就拒絕」
 * （`if em and (...)` → `if em and (True or ...)`）⇒ 紅：② P4 沒有進圖集。改回即綠。
 * 檢查器反方向校準（同日，直接跑 python）：畫布不照 wrap 烘 ⇒ ① 抓到 2 個錯色頂點；重映射不扣平移 ⇒ ① 抓到 2 個；
 * `blend_order=False` ⇒ ⑤ 得到 [2, 7, 6]。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";

const WORKER = path.join(import.meta.dirname, "optimize", "atlas_pack.py");

/** 32² RGBA，四個象限 [左上, 右上, 左下, 右下]。 */
function png(q: number[][]): Buffer {
  const row = (y: number) => Buffer.concat([Buffer.from([0]), ...Array.from({ length: 32 }, (_, x) => Buffer.from([...q[(y < 16 ? 0 : 2) + (x < 16 ? 0 : 1)]!, 255]))]);
  const chunk = (tag: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(tag), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(zlib.crc32(body) >>> 0, body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(32, 0); ihdr.writeUInt32BE(32, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(Array.from({ length: 32 }, (_, y) => row(y))))), chunk("IEND", Buffer.alloc(0))]);
}

const f32 = (a: number[]) => Buffer.from(new Float32Array(a).buffer);

function fixture(file: string): void {
  const uvs = [[0.25, 0.75, 0.25, 0.75], [0.25, 0.75, -0.75, -0.25], [0.25, 0.75, 0.25, 0.75], [0.25, 1.75, 0.25, 0.75], [0.25, 0.75, 0.25, 0.75], [0.25, 0.75, 0.25, 0.75],
    [0.25, 0.75, 0.25, 0.75], [0.25, 0.75, 0.25, 0.75]];
  const imgs = [
    png([[220, 40, 40], [40, 200, 40], [40, 40, 220], [230, 220, 40]]), png([[40, 220, 220], [220, 40, 220], [240, 240, 240], [90, 90, 90]]),
    png([[250, 140, 20], [130, 40, 180], [20, 130, 130], [120, 70, 20]]), png([[10, 10, 10], [255, 255, 255], [10, 10, 10], [255, 255, 255]]),
  ];
  const blobs: Buffer[] = [Buffer.from(new Uint16Array([0, 1, 2, 0, 2, 3]).buffer), ...imgs];
  uvs.forEach(([u0, u1, v0, v1], z) => blobs.push(f32([0, 0, z, 1, 0, z, 2, 1, z, 3, 1, z]), f32([u0!, v0!, u1!, v0!, u1!, v1!, u0!, v1!])));
  let at = 0;
  const views = blobs.map((b) => { const v = { buffer: 0, byteOffset: at, byteLength: b.length }; at += b.length + ((4 - b.length % 4) % 4); return v; });
  const mat = (tex: number, extra: object = {}) => ({ pbrMetallicRoughness: { baseColorTexture: { index: tex } }, ...extra });
  const json = {
    asset: { version: "2.0" }, scenes: [{ nodes: [0] }], scene: 0, nodes: [{ mesh: 0 }],
    meshes: [{ primitives: uvs.map((_, z) => ({ attributes: { POSITION: 1 + 2 * z, TEXCOORD_0: 2 + 2 * z }, indices: 0, material: z })) }],
    materials: [mat(0), mat(1), mat(2, { alphaMode: "BLEND" }), mat(2), mat(1, { emissiveTexture: { index: 1 }, emissiveFactor: [1, 1, 1] }),
      mat(0, { emissiveTexture: { index: 3 }, emissiveFactor: [1, 1, 1] }), mat(3, { alphaMode: "BLEND", doubleSided: true }), mat(0, { alphaMode: "BLEND" })],
    textures: [0, 1, 2, 3].map((s) => ({ source: s, sampler: 0 })), samplers: [{ wrapS: 10497, wrapT: 10497 }],
    images: [1, 2, 3, 4].map((v) => ({ bufferView: v, mimeType: "image/png" })),
    accessors: [{ bufferView: 0, componentType: 5123, count: 6, type: "SCALAR" },
      ...uvs.flatMap((_, z) => [{ bufferView: 5 + 2 * z, componentType: 5126, count: 4, type: "VEC3", min: [0, 0, z], max: [3, 1, z] },
        { bufferView: 6 + 2 * z, componentType: 5126, count: 4, type: "VEC2" }])],
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

/** 獨立的檢查器：兩個檔各自照自己的 sampler 取樣，逐頂點（往該 primitive 的 UV 重心內縮 10%）比顏色。 */
const CHECK = `
import io, json, math, struct, sys
from PIL import Image
def load(p):
    d = open(p, 'rb').read(); n = struct.unpack_from('<I', d, 12)[0]
    return json.loads(d[20:20 + n]), d[20 + n + (-n % 4) + 8:]
def acc(j, b, i):
    a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]; f = {5126: 'f', 5123: 'H', 5125: 'I'}[a['componentType']] * {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[a['type']]
    return [struct.unpack_from('<' + f, b, v.get('byteOffset', 0) + a.get('byteOffset', 0) + k * struct.calcsize(f)) for k in range(a['count'])]
def texture(j, b, ref):
    t = j['textures'][ref['index']]; im = j['images'][t['source']]; v = j['bufferViews'][im['bufferView']]; s = j['samplers'][t['sampler']]
    return Image.open(io.BytesIO(b[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']])).convert('RGBA'), s.get('wrapS', 10497), s.get('wrapT', 10497), im.get('name', '')
def sample(tx, u, v):
    img, ws, wt, _ = tx
    ax = lambda t, n, w: min(max(math.floor(t * n), 0), n - 1) if w == 33071 else math.floor(t * n) % n
    return img.getpixel((ax(u, img.width, ws), ax(v, img.height, wt)))
def verts(p):
    j, b = load(p); out = {}
    for pr in j['meshes'][0]['primitives']:
        m = j['materials'][pr['material']]; base = texture(j, b, m['pbrMetallicRoughness']['baseColorTexture'])
        for (x, _, z), uv in zip(acc(j, b, pr['attributes']['POSITION']), acc(j, b, pr['attributes']['TEXCOORD_0'])):
            out[(round(z), round(x))] = (uv, base, m)
    return out, len(j['meshes'][0]['primitives'])
src, _ = verts(sys.argv[1]); dst, draws = verts(sys.argv[2]); bad = []; moved = {}; emissive = {}
modes = [[z, x] for (z, x), v in src.items() if v[2].get('alphaMode') != dst[(z, x)][2].get('alphaMode')]
j, b = load(sys.argv[2]); seq = []
for pr in j['meshes'][0]['primitives']:
    if j['materials'][pr['material']].get('alphaMode') == 'BLEND':
        seq += [round(p[2]) for p in acc(j, b, pr['attributes']['POSITION'])]
seq = [z for n, z in enumerate(seq) if n == 0 or seq[n - 1] != z]
for (z, x), (uv, tx, _) in sorted(src.items()):
    cs = [sum(src[(z, k)][0][c] for k in range(4)) / 4 for c in (0, 1)]; cd = [sum(dst[(z, k)][0][c] for k in range(4)) / 4 for c in (0, 1)]
    duv, dtx, dm = dst[(z, x)]
    a = sample(tx, 0.9 * uv[0] + 0.1 * cs[0], 0.9 * uv[1] + 0.1 * cs[1]); b2 = sample(dtx, 0.9 * duv[0] + 0.1 * cd[0], 0.9 * duv[1] + 0.1 * cd[1])
    if max(abs(p - q) for p, q in zip(a, b2)) > 24: bad.append([z, x, a, b2])
    moved[z] = dtx[3].startswith('atlas'); emissive[z] = dm.get('emissiveTexture', {}).get('index') == dm['pbrMetallicRoughness']['baseColorTexture']['index'] if 'emissiveTexture' in dm else None
print(json.dumps({'bad': bad, 'draws': draws, 'moved': moved, 'emissiveSameAsBase': emissive, 'alphaModeChanged': modes, 'blendOrder': seq}))
`;

function python(): string[] {
  for (const c of [["python3"], ["arch", "-arm64", "python3"], ["/opt/homebrew/bin/python3"]]) {
    try { execFileSync(c[0]!, [...c.slice(1), "-c", "from PIL import Image; Image.new('RGBA',(2,2))"], { stdio: "ignore" }); return c; } catch { /* next */ }
  }
  throw new Error("no python3 with a working Pillow");
}

describe("atlas stage", () => {
  it("★ 整格平移／tile／同圖 emissive 都進圖集，逐頂點顏色不變；另一張圖的 emissive 與 BLEND 各自留著", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-test-"));
    const src = path.join(dir, "in.glb"), out = path.join(dir, "out.glb");
    fixture(src);
    const py = python();
    execFileSync(py[0]!, [...py.slice(1), WORKER, src, "--out", out, "--edge", "128", "--max-draws", "6"], { stdio: ["ignore", "pipe", "pipe"] });
    const r = JSON.parse(execFileSync(py[0]!, [...py.slice(1), "-c", CHECK, src, out], { encoding: "utf8" }));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(r.bad).toEqual([]);                                                   // ① 每一個頂點看到的顏色都沒變
    expect(r.moved).toMatchObject({ 0: true, 1: true, 2: true, 3: true, 4: true, 5: false }); // ② P0–P4 真的搬進圖集,P5 留著
    expect(r.emissiveSameAsBase).toMatchObject({ 4: true, 5: false });           // ③ 同圖 emissive 跟著改指圖集
    expect(r.alphaModeChanged).toEqual([]);                                      // ④ BLEND 沒有被併進 OPAQUE（反之亦然）
    expect(r.blendOrder).toEqual([2, 6, 7]);                                     // ⑤ 半透明的繪製順序沒有被 merge 換掉
    expect(r.draws).toBeLessThan(8);                                             // ⑥ 真的併掉了
  });
});
