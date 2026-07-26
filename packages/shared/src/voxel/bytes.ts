/**
 * bytes — the tiny binary primitives the generator's writers are built on,
 * expressed in `Uint8Array` / `DataView` so ONE writer serves the CLI bake, the
 * admin page and vitest.
 *
 * ── WHY THIS FILE EXISTS (task #229, the production-bundle requirement) ──────
 * `tools/voxel-gen/{glbWrite,png}.ts` wrote GLB and PNG bytes with node's
 * `Buffer`. That is invisible in a CLI and fatal in a browser bundle: `Buffer`
 * is not a web global, so the generator's OUTPUT half could never cross into
 * `apps/admin`. The consequence was the one the owner actually noticed — the
 * 後台 voxel page could preview a character but not PRODUCE one, so the file
 * still came out of a terminal.
 *
 * Porting is not a rewrite of the format: every offset, every padding rule and
 * every checksum below is the same arithmetic the `Buffer` version did. The
 * proof is mechanical rather than argued — `tools/voxel-gen/gen.test.ts` pins
 * each shipped .glb's sha256, and those pins did not change when the writers
 * moved here. If a single byte had shifted, five hashes would have gone red.
 *
 * BYTE-DETERMINISM IS THE CONTRACT. Nothing here consults a locale, a clock, a
 * random source or a platform-dependent library. `sha256` is implemented in
 * full for the same reason: `node:crypto` is node-only and `crypto.subtle` is
 * async and unavailable on insecure origins, so a shared, synchronous, pure
 * implementation is the only one all three consumers can call identically.
 */

/** Zero-filled `Uint8Array` — the `Buffer.alloc` this file replaced. */
export function alloc(n: number): Uint8Array {
  return new Uint8Array(n);
}

/** Concatenate, in order. */
export function concat(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** ASCII bytes of a tag such as `"IHDR"`. Throws on any non-ASCII input. */
export function ascii(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c > 0x7f) throw new Error(`ascii(): non-ASCII char at ${i} in ${JSON.stringify(s)}`);
    out[i] = c;
  }
  return out;
}

/**
 * UTF-8 bytes. `TextEncoder` is a web + node global (node ≥ 11), so this needs
 * no polyfill and no `Buffer`.
 */
export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** A `DataView` over the whole array — the read/write half of every helper. */
export function view(a: Uint8Array): DataView {
  return new DataView(a.buffer, a.byteOffset, a.byteLength);
}

export function u32be(a: Uint8Array, off: number, v: number): void {
  view(a).setUint32(off, v >>> 0, false);
}

export function u32le(a: Uint8Array, off: number, v: number): void {
  view(a).setUint32(off, v >>> 0, true);
}

export function u16le(a: Uint8Array, off: number, v: number): void {
  view(a).setUint16(off, v & 0xffff, true);
}

/**
 * Write a float32. `DataView.setFloat32` performs the IEEE-754 round-to-nearest
 * that `Math.fround` + `Buffer.writeFloatLE` did in two steps, so the emitted
 * four bytes are identical.
 */
export function f32le(a: Uint8Array, off: number, v: number): void {
  view(a).setFloat32(off, v, true);
}

/** Read back a float32 — used to compute accessor min/max on ROUNDED values. */
export function readF32le(a: Uint8Array, off: number): number {
  return view(a).getFloat32(off, true);
}

// ---------------------------------------------------------------------------
// checksums
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32, the PNG chunk checksum. */
export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Adler-32, the zlib stream checksum. */
export function adler32(buf: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

// ---------------------------------------------------------------------------
// sha256
// ---------------------------------------------------------------------------

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number): number => ((x >>> n) | (x << (32 - n))) >>> 0;

/**
 * SHA-256 → lowercase hex. Synchronous and dependency-free on purpose: the page
 * shows the same digest `gen.test.ts` pins and `pnpm voxel:check` compares, and
 * a digest an operator cannot see is a claim rather than a check.
 */
export function sha256Hex(data: Uint8Array): string {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const bitLen = data.length * 8;
  // message + 0x80 + zero pad to 56 mod 64 + 8-byte big-endian length
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  padded.set(data, 0);
  padded[data.length] = 0x80;
  const dv = new DataView(padded.buffer);
  // bit length fits in 53 bits of a double for any realistic model file
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000), false);
  dv.setUint32(padded.length - 4, bitLen >>> 0, false);

  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = (rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3)) >>> 0;
      const s1 = (rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10)) >>> 0;
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!];
    for (let i = 0; i < 64; i++) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }
  let out = "";
  for (let i = 0; i < 8; i++) out += h[i]!.toString(16).padStart(8, "0");
  return out;
}
