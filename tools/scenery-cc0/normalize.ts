/**
 * scenery-cc0/normalize — 把下載來的 CC0 GLB 的世界 bbox 最低點推到 y = 0。
 *
 * ⭐ 為什麼**必須**動這些位元組（不是「順手整理」）：
 * `zDecor`（packages/shared/src/content/schema/arena.ts）只有
 * `model / x / z / rotQuarter / scale` —— **沒有 y**。而 `dressArena()` 把每一件
 * 放在 y=0 之後只做「太高就壓扁」，⛔ 不會重新座地。所以一個 bbox 最低點是
 * −0.74 的屋頂，在 GGD 裡**沒有任何內容側的槓桿**可以把它拉上來 ——
 * 它就是會陷進地板（失敗形態①：算出來但畫在地板下）。
 *
 * ⭐ 動的是**唯一一種**不影響外觀的東西：scene 根節點的 `translation[1]`
 * （或 `matrix[13]`）。BIN chunk **逐位元組原封不動** —— 幾何、UV、貼圖、
 * accessor 一個 bit 都沒被碰過，所以這個轉換不可能弄壞模型，只可能把它上下移動。
 *
 * ⭐ Provenance 不會因此變弱：`PROVENANCE.md` 同時記了**上游 sha256**、
 * 套用的 dy、以及**本地 sha256**。任何人可以重新 curl 上游、比對上游 sha、
 * 再跑這支腳本，得到磁碟上這一份。dy = 0 的檔案**逐位元組等於上游**。
 *
 *   npx tsx tools/scenery-cc0/normalize.ts            # 就地正規化 + 印出 dy
 *   npx tsx tools/scenery-cc0/normalize.ts --check    # 只檢查，有一件沒座地就回 1
 *
 * ⚠️ 收斂到 |minY| < 1e-6 而**不是逐位元組 0**：這裡的 y 是把 accessor 的
 * min/max 八個角乘上節點矩陣算出來的，浮點加法不保證 a + (−a) 在下一輪重算時
 * 精確歸零。生成物件（tools/scenery-gen）可以做到逐位元組 0，因為它在**產生
 * 頂點之前**就把整件推好了；下載來的做不到，所以這裡誠實地用容差。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../content/assets/models/scenery-cc0",
);
/** 座地容差（公尺）。1e-6 u = 1 微米，遠小於任何人看得見的東西。 */
export const GROUND_EPS = 1e-6;

type M4 = number[];
const IDENT: M4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function mul(a: M4, b: M4): M4 {
  const o: M4 = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!;
      o[c * 4 + r] = s;
    }
  return o;
}

/** glTF node → column-major matrix. TRS order is M = T · R · S (spec §3.5). */
function nodeMatrix(n: any): M4 {
  if (n.matrix) return n.matrix as M4;
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const s = n.scale ?? [1, 1, 1];
  const m: M4 = [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    tx, ty, tz, 1,
  ];
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) m[c * 4 + r] = m[c * 4 + r]! * s[c]!;
  return m;
}

/** 12-byte header + length-prefixed chunks. Returns the raw pieces so BIN can be re-emitted verbatim. */
export function splitGlb(buf: Buffer): { json: any; jsonRaw: Buffer; rest: Buffer } {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not a glb (magic)");
  const jsonLen = buf.readUInt32LE(12);
  const jsonRaw = buf.subarray(20, 20 + jsonLen);
  return { json: JSON.parse(jsonRaw.toString("utf8")), jsonRaw, rest: buf.subarray(20 + jsonLen) };
}

/** World-space AABB of every mesh primitive, via the node hierarchy. */
export function worldBox(json: any): { lo: number[]; hi: number[] } {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  const walk = (ni: number, parent: M4) => {
    const n = json.nodes[ni];
    const m = mul(parent, nodeMatrix(n));
    if (n.mesh !== undefined)
      for (const p of json.meshes[n.mesh].primitives ?? []) {
        const a = json.accessors[p.attributes?.POSITION];
        if (!a?.min || !a?.max) continue;
        for (let i = 0; i < 8; i++) {
          const q = [i & 1 ? a.max[0] : a.min[0], i & 2 ? a.max[1] : a.min[1], i & 4 ? a.max[2] : a.min[2]];
          for (let k = 0; k < 3; k++) {
            const v = m[k]! * q[0]! + m[4 + k]! * q[1]! + m[8 + k]! * q[2]! + m[12 + k]!;
            if (v < lo[k]!) lo[k] = v;
            if (v > hi[k]!) hi[k] = v;
          }
        }
      }
    for (const c of n.children ?? []) walk(c, m);
  };
  for (const r of json.scenes?.[json.scene ?? 0]?.nodes ?? []) walk(r, IDENT);
  return { lo, hi };
}

/** Shift every scene root by `dy` on world Y. Touches ONLY node transforms. */
function shift(json: any, dy: number): void {
  for (const ri of json.scenes?.[json.scene ?? 0]?.nodes ?? []) {
    const n = json.nodes[ri];
    if (n.matrix) n.matrix[13] += dy;
    else n.translation = [(n.translation ?? [0, 0, 0])[0], (n.translation ?? [0, 0, 0])[1] + dy, (n.translation ?? [0, 0, 0])[2]];
  }
}

function reassemble(json: any, rest: Buffer): Buffer {
  let js = Buffer.from(JSON.stringify(json), "utf8");
  while (js.length % 4 !== 0) js = Buffer.concat([js, Buffer.from(" ")]); // spec: JSON chunk pads with 0x20
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(20 + js.length + rest.length, 8);
  head.writeUInt32LE(js.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([head, js, rest]);
}

export interface NormRow {
  file: string;
  dy: number;
  minYBefore: number;
  minYAfter: number;
}

/**
 * `write = false` is INSPECT-ONLY: it does not shift, so `minYAfter === minYBefore`
 * and a model that is not grounded stays visible to the caller.
 *
 * ⚠️ 這裡曾經寫成「照樣在記憶體裡推，只是不寫檔」—— 那樣 `--check` **永遠不會紅**
 * （被測的是推完的記憶體物件，不是磁碟上出貨的那一份 = 失敗形態⑤）。
 */
export function normalizeAll(dir = DIR, write = true): NormRow[] {
  const out: NormRow[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".glb")).sort()) {
    const file = path.join(dir, f);
    const { json, rest } = splitGlb(fs.readFileSync(file));
    const before = worldBox(json).lo[1]!;
    if (!write) {
      out.push({ file: f, dy: 0, minYBefore: before, minYAfter: before });
      continue;
    }
    let dy = 0;
    // Iterate: one shift leaves a float residue, a second pass kills it.
    for (let pass = 0; pass < 4; pass++) {
      const m = worldBox(json).lo[1]!;
      if (Math.abs(m) < GROUND_EPS) break;
      shift(json, -m);
      dy -= m;
    }
    const after = worldBox(json).lo[1]!;
    if (dy !== 0) fs.writeFileSync(file, reassemble(json, rest));
    out.push({ file: f, dy, minYBefore: before, minYAfter: after });
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes("--check");
  const rows = normalizeAll(DIR, !check);
  let bad = 0;
  for (const r of rows) {
    const flag = Math.abs(r.minYAfter) < GROUND_EPS ? "ok " : "BAD";
    if (flag === "BAD") bad++;
    if (r.dy !== 0 || flag === "BAD")
      console.log(`${flag} ${r.file.padEnd(46)} minY ${r.minYBefore.toFixed(6)} → ${r.minYAfter.toExponential(1)}  dy=${r.dy.toFixed(6)}`);
  }
  const moved = rows.filter((r) => r.dy !== 0).length;
  console.log(`${rows.length} model(s) — ${moved} shifted, ${rows.length - moved} already grounded (bytes identical to upstream), ${bad} bad`);
  process.exit(bad ? 1 : 0);
}
