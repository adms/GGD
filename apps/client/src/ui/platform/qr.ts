/**
 * qr.ts — a SELF-CONTAINED QR Code generator (byte mode, ECC level M, versions
 * 1–10). No CDN, no runtime dependency, no network: the login QR must render on
 * a keyboard-less handheld that may be offline, and a strict CSP forbids pulling
 * an encoder library at runtime. So the whole algorithm lives here.
 *
 * Scope is deliberately small — the only thing this ever encodes is a short
 * verification URL like `https://ggd.adms.ai/link?code=WXYZ-2345` (~40 chars),
 * which fits comfortably in a version-3 symbol at ECC level M. Versions up to 10
 * are supported for headroom; anything larger throws rather than silently
 * producing a code a phone camera cannot read.
 *
 * Implementation follows the ISO/IEC 18004 steps: byte-mode segment → error
 * correction (Reed–Solomon over GF(256)) → interleave → matrix (finder /
 * timing / alignment / format / version) → the 8 data masks, scored by the
 * standard penalty and the lowest-penalty mask chosen.
 *
 * NOTE on the `!` non-null assertions below: this package compiles under
 * `noUncheckedIndexedAccess`, so every array read is `T | undefined`. The QR
 * algorithm indexes only within bounds it just established (grid dimensions,
 * per-version tables it looked up), so the assertions state a fact the checker
 * cannot see rather than paper over a real gap.
 */

// ECC LEVEL M ONLY. The 2-bit format indicator for M is 0b00.
const EC_LEVEL_M_BITS = 0b00;

// Per version (index = version-1): EC codewords per block.
const EC_PER_BLOCK_M = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26];

// Per version: block groups as [blockCount, dataCodewordsPerBlock][].
const BLOCKS_M: [number, number][][] = [
  [[1, 16]], // v1
  [[1, 28]], // v2
  [[1, 44]], // v3
  [[2, 32]], // v4
  [[2, 43]], // v5
  [[4, 27]], // v6
  [[4, 31]], // v7
  [[2, 38], [2, 39]], // v8
  [[3, 36], [2, 37]], // v9
  [[4, 43], [1, 44]], // v10
];

// Alignment-pattern center coordinates per version (empty for v1).
const ALIGN_POS: number[][] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30],
  [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

// ---- GF(256) arithmetic (primitive polynomial 0x11D) ----------------------
// Uint8Array index access is typed `number` (not number|undefined) even under
// noUncheckedIndexedAccess, so the tables read cleanly.
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255]!;
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!;
}

/** Reed–Solomon EC codewords for `data` using `ecLen` check symbols. */
function rsEncode(data: number[], ecLen: number): number[] {
  const gen = new Array<number>(ecLen + 1).fill(0);
  gen[0] = 1;
  for (let i = 0; i < ecLen; i++) {
    for (let j = i + 1; j > 0; j--) {
      gen[j] = gen[j - 1]! ^ gfMul(gen[j]!, GF_EXP[i]!);
    }
    gen[0] = gfMul(gen[0]!, GF_EXP[i]!);
  }
  const res = new Array<number>(ecLen).fill(0);
  for (const d of data) {
    const factor = d ^ res[0]!;
    res.shift();
    res.push(0);
    for (let j = 0; j < ecLen; j++) res[j] = res[j]! ^ gfMul(gen[ecLen - 1 - j]!, factor);
  }
  return res;
}

// ---- bit buffer ------------------------------------------------------------
class BitBuffer {
  bits: number[] = [];
  put(value: number, len: number): void {
    for (let i = len - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
}

/** Smallest supported version whose level-M capacity holds `byteLen` bytes. */
function chooseVersion(byteLen: number): number {
  for (let v = 1; v <= 10; v++) {
    const totalData = BLOCKS_M[v - 1]!.reduce((n, g) => n + g[0] * g[1], 0);
    const countBits = v < 10 ? 8 : 16;
    const needBits = 4 + countBits + byteLen * 8;
    if (needBits <= totalData * 8) return v;
  }
  throw new Error("qr: payload too large for versions 1–10");
}

/** Byte-mode payload → interleaved data+EC codewords for the chosen version. */
function makeCodewords(bytes: number[], version: number): number[] {
  const groups = BLOCKS_M[version - 1]!;
  const ecLen = EC_PER_BLOCK_M[version - 1]!;
  const totalData = groups.reduce((n, g) => n + g[0] * g[1], 0);
  const countBits = version < 10 ? 8 : 16;

  const bb = new BitBuffer();
  bb.put(0b0100, 4); // byte mode
  bb.put(bytes.length, countBits);
  for (const b of bytes) bb.put(b, 8);
  // Terminator (up to 4 bits) then pad to a byte boundary.
  const capacityBits = totalData * 8;
  for (let i = 0; i < 4 && bb.bits.length < capacityBits; i++) bb.bits.push(0);
  while (bb.bits.length % 8 !== 0) bb.bits.push(0);
  // Pad bytes alternate 0xEC / 0x11.
  const padBytes = [0xec, 0x11];
  let pi = 0;
  while (bb.bits.length < capacityBits) {
    bb.put(padBytes[pi++ % 2]!, 8);
  }

  // Split into codewords, then into the version's data blocks.
  const dataCw: number[] = [];
  for (let i = 0; i < bb.bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bb.bits[i + j]!;
    dataCw.push(v);
  }

  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let idx = 0;
  for (const [count, dlen] of groups) {
    for (let b = 0; b < count; b++) {
      const block = dataCw.slice(idx, idx + dlen);
      idx += dlen;
      dataBlocks.push(block);
      ecBlocks.push(rsEncode(block, ecLen));
    }
  }

  // Interleave data codewords column-wise, then EC codewords column-wise.
  const maxData = Math.max(...dataBlocks.map((b) => b.length));
  const out: number[] = [];
  for (let i = 0; i < maxData; i++) {
    for (const blk of dataBlocks) if (i < blk.length) out.push(blk[i]!);
  }
  for (let i = 0; i < ecLen; i++) {
    for (const blk of ecBlocks) out.push(blk[i]!);
  }
  return out;
}

// ---- matrix ----------------------------------------------------------------
type Grid = { size: number; mods: boolean[][]; reserved: boolean[][] };

function newGrid(version: number): Grid {
  const size = version * 4 + 17;
  const mods: boolean[][] = [];
  const reserved: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    mods.push(new Array<boolean>(size).fill(false));
    reserved.push(new Array<boolean>(size).fill(false));
  }
  return { size, mods, reserved };
}

function place(g: Grid, r: number, c: number, dark: boolean, reserve = true): void {
  g.mods[r]![c] = dark;
  if (reserve) g.reserved[r]![c] = true;
}

function drawFinder(g: Grid, r: number, c: number): void {
  for (let dr = -1; dr <= 7; dr++) {
    for (let dc = -1; dc <= 7; dc++) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || rr >= g.size || cc < 0 || cc >= g.size) continue;
      const inRing =
        (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) ||
        (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6));
      const inCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
      place(g, rr, cc, inRing || inCore);
    }
  }
}

function drawAlignment(g: Grid, cr: number, cc: number): void {
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const ring = Math.max(Math.abs(dr), Math.abs(dc));
      place(g, cr + dr, cc + dc, ring !== 1);
    }
  }
}

function drawFunctionPatterns(g: Grid, version: number): void {
  const n = g.size;
  drawFinder(g, 0, 0);
  drawFinder(g, 0, n - 7);
  drawFinder(g, n - 7, 0);
  // Timing patterns.
  for (let i = 8; i < n - 8; i++) {
    place(g, 6, i, i % 2 === 0);
    place(g, i, 6, i % 2 === 0);
  }
  // Alignment patterns (skip those overlapping finders).
  const pos = ALIGN_POS[version - 1]!;
  for (const r of pos) {
    for (const c of pos) {
      if ((r <= 7 && c <= 7) || (r <= 7 && c >= n - 8) || (r >= n - 8 && c <= 7)) continue;
      drawAlignment(g, r, c);
    }
  }
  // Dark module.
  place(g, n - 8, 8, true);
  // Reserve format-info areas (filled later).
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      g.reserved[8]![i] = true;
      g.reserved[i]![8] = true;
    }
  }
  for (let i = 0; i < 8; i++) {
    g.reserved[8]![n - 1 - i] = true;
    g.reserved[n - 1 - i]![8] = true;
  }
  // Reserve version-info areas (v7+).
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        g.reserved[i]![n - 11 + j] = true;
        g.reserved[n - 11 + j]![i] = true;
      }
    }
  }
}

/** Zig-zag data placement (standard column-pair, upward/downward alternation). */
function placeData(g: Grid, codewords: number[]): void {
  const n = g.size;
  const bits: number[] = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push((cw >>> i) & 1);
  let bi = 0;
  let upward = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col = 5; // skip the vertical timing column
    for (let i = 0; i < n; i++) {
      const row = upward ? n - 1 - i : i;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (g.reserved[row]![c]) continue;
        const dark = bi < bits.length ? bits[bi++] === 1 : false;
        g.mods[row]![c] = dark;
      }
    }
    upward = !upward;
  }
}

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(g: Grid, mask: number): Grid {
  const fn = MASKS[mask]!;
  const out = newGrid((g.size - 17) / 4);
  for (let r = 0; r < g.size; r++) {
    for (let c = 0; c < g.size; c++) {
      const reserved = g.reserved[r]![c]!;
      out.reserved[r]![c] = reserved;
      const v = g.mods[r]![c]!;
      out.mods[r]![c] = reserved ? v : v !== fn(r, c);
    }
  }
  return out;
}

// BCH-encoded format info (15 bits) for level M + mask, XOR-masked per spec.
function formatBits(mask: number): number {
  const data = (EC_LEVEL_M_BITS << 3) | mask; // 5 bits
  let rem = data << 10;
  for (let i = 14; i >= 10; i--) {
    if ((rem >>> i) & 1) rem ^= 0b10100110111 << (i - 10);
  }
  return ((data << 10) | rem) ^ 0b101010000010010;
}

function drawFormat(g: Grid, mask: number): void {
  const n = g.size;
  const bits = formatBits(mask);
  for (let i = 0; i <= 5; i++) place(g, 8, i, ((bits >>> i) & 1) === 1);
  place(g, 8, 7, ((bits >>> 6) & 1) === 1);
  place(g, 8, 8, ((bits >>> 7) & 1) === 1);
  place(g, 7, 8, ((bits >>> 8) & 1) === 1);
  for (let i = 9; i <= 14; i++) place(g, 14 - i, 8, ((bits >>> i) & 1) === 1);
  for (let i = 0; i <= 7; i++) place(g, n - 1 - i, 8, ((bits >>> i) & 1) === 1);
  for (let i = 8; i <= 14; i++) place(g, 8, n - 15 + i, ((bits >>> i) & 1) === 1);
}

// BCH-encoded version info (18 bits), v7+.
function versionBits(version: number): number {
  let rem = version << 12;
  for (let i = 17; i >= 12; i--) {
    if ((rem >>> i) & 1) rem ^= 0b1111100100101 << (i - 12);
  }
  return (version << 12) | rem;
}

function drawVersion(g: Grid, version: number): void {
  if (version < 7) return;
  const n = g.size;
  const bits = versionBits(version);
  for (let i = 0; i < 18; i++) {
    const b = ((bits >>> i) & 1) === 1;
    const r = Math.floor(i / 3);
    const c = i % 3;
    place(g, r, n - 11 + c, b);
    place(g, n - 11 + c, r, b);
  }
}

/** Standard mask-penalty score (lower is better). */
function penalty(g: Grid): number {
  const n = g.size;
  const m = g.mods;
  let score = 0;
  // Rule 1: runs of 5+ same-color in a row/column.
  for (let r = 0; r < n; r++) {
    const rowLine = m[r]!;
    const colLine = m.map((row) => row[r]!);
    for (const line of [rowLine, colLine]) {
      let run = 1;
      for (let i = 1; i < n; i++) {
        if (line[i] === line[i - 1]) {
          run++;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else run = 1;
      }
    }
  }
  // Rule 2: 2x2 blocks of the same color.
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      const v = m[r]![c];
      if (v === m[r]![c + 1] && v === m[r + 1]![c] && v === m[r + 1]![c + 1]) score += 3;
    }
  }
  // Rule 3: finder-like 1:1:3:1:1 patterns in rows and columns.
  const pat1 = [true, false, true, true, true, false, true, false, false, false, false];
  const pat2 = [false, false, false, false, true, false, true, true, true, false, true];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matches(m, r, c, pat1, true) || matches(m, r, c, pat2, true)) score += 40;
      if (matches(m, r, c, pat1, false) || matches(m, r, c, pat2, false)) score += 40;
    }
  }
  // Rule 4: proportion of dark modules.
  let dark = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r]![c]) dark++;
  const ratio = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(ratio - 50) / 5) * 10;
  return score;
}

function matches(m: boolean[][], r: number, c: number, pat: boolean[], horiz: boolean): boolean {
  const n = m.length;
  for (let i = 0; i < pat.length; i++) {
    const rr = horiz ? r : r + i;
    const cc = horiz ? c + i : c;
    if (rr >= n || cc >= n) return false;
    if (m[rr]![cc] !== pat[i]) return false;
  }
  return true;
}

function toBytes(text: string): number[] {
  // UTF-8 encode (the payload is ASCII, but be correct regardless).
  return Array.from(new TextEncoder().encode(text));
}

/**
 * Encode `text` as a QR matrix of booleans (true = dark module). Chooses the
 * smallest version 1–10 that fits, level M, and the lowest-penalty mask.
 */
export function encodeQR(text: string): boolean[][] {
  const bytes = toBytes(text);
  const version = chooseVersion(bytes.length);
  const codewords = makeCodewords(bytes, version);

  const base = newGrid(version);
  drawFunctionPatterns(base, version);
  placeData(base, codewords);

  let best: Grid | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const masked = applyMask(base, mask);
    drawFormat(masked, mask);
    drawVersion(masked, version);
    const p = penalty(masked);
    if (p < bestScore) {
      bestScore = p;
      best = masked;
    }
  }
  return best!.mods.map((row) => row.map((v) => v === true));
}

/** Convenience: the chosen symbol version for a payload (for tests/sizing). */
export function qrVersionFor(text: string): number {
  return chooseVersion(toBytes(text).length);
}
