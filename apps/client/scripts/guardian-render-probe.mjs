/**
 * guardian-render-probe (task #105, throwaway) — renders guardian_stone.glb from
 * the game's FIXED camera pitch (55°, from the south) to a PNG, plaster-grey on
 * sand, so a human can confirm it reads as 石頭人 before it ships. Task #22's
 * lesson: LOOK at the asset in the real view. Dependency-free (Babylon load +
 * software rasteriser + node:zlib PNG).
 */
import { NullEngine, Scene, SceneLoader, Vector3 } from "@babylonjs/core/index.js";
import "@babylonjs/loaders/glTF/index.js";
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join } from "node:path";

const CRCT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();

const MODEL = join(process.cwd(), "..", "..", "content", "assets", "models", "guardians", "guardian_stone.glb");
const OUT = process.argv[2] || "/tmp/guardian_stone_view.png";
const TARGET_H = Number(process.argv[3] || "2.4"); // rendered height in units
const YAW = Number(process.argv[4] || "0") * Math.PI / 180;
const W = 340, H = 460;

// ---- load real triangles (native), normalise base to y0=0, scale to TARGET_H ----
const buf = readFileSync(MODEL);
const engine = new NullEngine();
const scene = new Scene(engine);
const res = await SceneLoader.ImportMeshAsync("", "", "data:base64," + buf.toString("base64"), scene, undefined, ".glb");
let nmin = [Infinity, Infinity, Infinity], nmax = [-Infinity, -Infinity, -Infinity];
const raw = [];
for (const m of res.meshes) {
  if (!m.getTotalVertices || m.getTotalVertices() === 0) continue;
  m.computeWorldMatrix(true);
  const wm = m.getWorldMatrix();
  const pos = m.getVerticesData("position"), idx = m.getIndices();
  if (!pos || !idx) continue;
  const wp = [];
  for (let i = 0; i < pos.length; i += 3) {
    const v = Vector3.TransformCoordinates(new Vector3(pos[i], pos[i + 1], pos[i + 2]), wm);
    wp.push([v.x, v.y, v.z]);
    for (let k = 0; k < 3; k++) { const c = [v.x, v.y, v.z][k]; if (c < nmin[k]) nmin[k] = c; if (c > nmax[k]) nmax[k] = c; }
  }
  for (let i = 0; i < idx.length; i += 3) raw.push([wp[idx[i]], wp[idx[i + 1]], wp[idx[i + 2]]]);
}
engine.dispose?.();
const scale = TARGET_H / (nmax[1] - nmin[1]);
const cy = Math.cos(YAW), sy = Math.sin(YAW);
const tris = raw.map((t) => t.map(([x, y, z]) => {
  const X = x * scale, Y = (y - nmin[1]) * scale, Z = z * scale;
  return [X * cy + Z * sy, Y, -X * sy + Z * cy];
}));

// ---- camera: 55° pitch, from the south, framed on the statue ----
const pitch = 55 * Math.PI / 180;
const target = [0, TARGET_H * 0.5, 0];
const dist = TARGET_H * 1.35 + 1.6;
const eye = [0, target[1] + dist * Math.sin(pitch), target[2] - dist * Math.cos(pitch)];
// camera basis
const fwd = norm(sub(target, eye));
const right = norm(cross(fwd, [0, 1, 0]));
const up = cross(right, fwd);
const fov = 40 * Math.PI / 180, fpx = (H / 2) / Math.tan(fov / 2);
// key light from over the camera's shoulder (south/up) so a plaster statue reads pale
const light = norm([-0.25, 0.55, -0.8]);

const zbuf = new Float64Array(W * H).fill(Infinity);
const img = new Uint8Array(W * H * 3);
// sand background with a soft vertical gradient
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const t = y / H, i = (y * W + x) * 3;
  img[i] = 214 - t * 30; img[i + 1] = 190 - t * 34; img[i + 2] = 150 - t * 34;
}
function project(p) {
  const d = sub(p, eye);
  const cx = dot(d, right), cyv = dot(d, up), cz = dot(d, fwd);
  if (cz <= 0.01) return null;
  return [W / 2 + fpx * cx / cz, H / 2 - fpx * cyv / cz, cz];
}
for (const t of tris) {
  let n = norm(cross(sub(t[1], t[0]), sub(t[2], t[0])));
  if (dot(n, fwd) > 0) n = [-n[0], -n[1], -n[2]]; // face the camera (two-sided)
  let sh = Math.max(0, dot(n, light)) * 0.62 + 0.46; // plaster, strongly ambient-lifted
  if (sh > 1) sh = 1;
  const base = [228, 226, 219]; // bone-white plaster
  const col = base.map((c) => Math.min(255, c * sh));
  const P = t.map(project);
  if (P.some((p) => p === null)) continue;
  rasterize(P, col);
}
function rasterize(P, col) {
  const minx = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0])));
  const maxx = Math.min(W - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
  const miny = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1])));
  const maxy = Math.min(H - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
  const [x0, y0] = P[0], [x1, y1] = P[1], [x2, y2] = P[2];
  const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
  if (Math.abs(den) < 1e-9) return;
  for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
    const a = ((y1 - y2) * (x + 0.5 - x2) + (x2 - x1) * (y + 0.5 - y2)) / den;
    const b = ((y2 - y0) * (x + 0.5 - x2) + (x0 - x2) * (y + 0.5 - y2)) / den;
    const c = 1 - a - b;
    if (a < 0 || b < 0 || c < 0) continue;
    const z = a * P[0][2] + b * P[1][2] + c * P[2][2];
    const idx = y * W + x;
    if (z < zbuf[idx]) { zbuf[idx] = z; const i = idx * 3; img[i] = col[0]; img[i + 1] = col[1]; img[i + 2] = col[2]; }
  }
}
writeFileSync(OUT, encodePng(W, H, img));
console.log(`wrote ${OUT}  (${W}x${H}, height ${TARGET_H}u, yaw ${(YAW * 180 / Math.PI).toFixed(0)}°, ${tris.length} tris)`);

// ---- helpers ----
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function encodePng(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.subarray? 0 : 0; Buffer.from(rgb.subarray(y * w * 3, (y + 1) * w * 3)).copy(raw, y * (w * 3 + 1) + 1); }
  const idat = deflateSync(raw);
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const t = Buffer.from(type); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0); return Buffer.concat([len, t, data, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRCT[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return c ^ 0xffffffff; }
process.exit(0);
