/**
 * pngRead — a dependency-free PNG DECODER, the local half of 特徵生成 batch two.
 *
 * WHY THIS EXISTS NEXT TO `@ggd/shared/voxel/pngWrite`.
 * `pngWrite` is the WRITER and it deliberately emits only one shape: RGBA8,
 * non-interlaced, stored-DEFLATE. The reference images this module has to read
 * are not ours — they came out of a w3x map through a converter, and the corpus
 * on disk already contains 8-bit RGBA, palette and greyscale variants. A decoder
 * that only understood what our own writer emits would fail on the real inputs
 * and, worse, would fail on the ONE case that matters most for the audit: an
 * icon someone re-saved with a different tool.
 *
 * WHY `inflateSync` IS ALLOWED HERE WHEN `deflateSync` IS BANNED IN `pngWrite`.
 * They are not symmetric. DEFLATE *compression* is a heuristic — a Node upgrade
 * changes the bytes for no visual reason, which is why `pngWrite` hand-rolls
 * stored blocks to keep its sha256 pins. INFLATE is a total function defined by
 * RFC 1951: the same stream decodes to the same bytes in every version, forever.
 * So reading is safe where writing is not.
 *
 * 地端 ONLY. Nothing here ships to the server (規格 §5: 讀圖必須在地端).
 */
import { inflateSync } from "node:zlib";

const PNG_SIG = Object.freeze([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A decoded image, always widened to RGBA8 row-major regardless of its
 *  on-disk colour type — the extractor should never branch on encoding. */
export interface DecodedImage {
  width: number;
  height: number;
  /** `width * height * 4` bytes, row-major, R G B A. */
  rgba: Uint8Array;
}

/** Cheap signature test so a caller can report "not a PNG" instead of throwing
 *  a parse error from three functions deep. */
export function looksLikePng(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIG.length) return false;
  for (let i = 0; i < PNG_SIG.length; i++) if (bytes[i] !== PNG_SIG[i]) return false;
  return true;
}

interface Chunk {
  type: string;
  data: Uint8Array;
}

function readChunks(bytes: Uint8Array): Chunk[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Chunk[] = [];
  let off = 8;
  while (off + 8 <= bytes.length) {
    const len = view.getUint32(off);
    const type = String.fromCharCode(bytes[off + 4]!, bytes[off + 5]!, bytes[off + 6]!, bytes[off + 7]!);
    const start = off + 8;
    const end = start + len;
    if (end + 4 > bytes.length) throw new Error(`png: chunk ${type} runs past end of file`);
    out.push({ type, data: bytes.subarray(start, end) });
    off = end + 4; // skip the CRC
    if (type === "IEND") break;
  }
  return out;
}

/** Channels carried per pixel by each PNG colour type. */
const CHANNELS: Readonly<Record<number, number>> = Object.freeze({
  0: 1, // greyscale
  2: 3, // truecolour
  3: 1, // palette index
  4: 2, // greyscale + alpha
  6: 4, // truecolour + alpha
});

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Undo the per-scanline filters (RFC 2083 §6) in place, returning the raw
 * scanline bytes with the filter-type byte removed.
 */
function unfilter(raw: Uint8Array, height: number, stride: number, bpp: number): Uint8Array {
  const out = new Uint8Array(height * stride);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    const row = y * stride;
    const prev = row - stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i]!;
      const a = i >= bpp ? out[row + i - bpp]! : 0;
      const b = y > 0 ? out[prev + i]! : 0;
      const c = y > 0 && i >= bpp ? out[prev + i - bpp]! : 0;
      let v: number;
      switch (filter) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: v = x + paeth(a, b, c); break;
        default: throw new Error(`png: unknown scanline filter ${filter} on row ${y}`);
      }
      out[row + i] = v & 0xff;
    }
    src += stride;
  }
  return out;
}

/** Read the `i`-th sample of a scanline at an arbitrary bit depth, scaled to
 *  0..255 for depths below 8 (palette indices are returned unscaled). */
function sampleAt(row: Uint8Array, i: number, depth: number, isIndex: boolean): number {
  if (depth === 8) return row[i]!;
  if (depth === 16) return row[i * 2]!; // high byte; 8 bits is all the audit needs
  const perByte = 8 / depth;
  const byte = row[Math.floor(i / perByte)]!;
  const shift = 8 - depth * ((i % perByte) + 1);
  const raw = (byte >> shift) & ((1 << depth) - 1);
  if (isIndex) return raw;
  // scale 1/2/4-bit greyscale onto the full 0..255 range
  return Math.round((raw * 255) / ((1 << depth) - 1));
}

/**
 * Decode a PNG to RGBA8.
 *
 * Throws — never returns a blank image — on anything it cannot represent
 * faithfully (interlaced, unknown colour type). A silent blank would sail
 * through the extractor and come out as a confident all-background FAIL, which
 * looks like a verdict about the artwork when it is really a verdict about the
 * decoder.
 */
export function decodePng(bytes: Uint8Array): DecodedImage {
  if (!looksLikePng(bytes)) throw new Error("png: bad signature (not a PNG file)");
  const chunks = readChunks(bytes);
  const ihdr = chunks.find((c) => c.type === "IHDR");
  if (!ihdr || ihdr.data.length < 13) throw new Error("png: missing IHDR");
  const hv = new DataView(ihdr.data.buffer, ihdr.data.byteOffset, ihdr.data.byteLength);
  const width = hv.getUint32(0);
  const height = hv.getUint32(4);
  const depth = ihdr.data[8]!;
  const colorType = ihdr.data[9]!;
  const interlace = ihdr.data[12]!;
  if (width <= 0 || height <= 0) throw new Error(`png: degenerate size ${width}x${height}`);
  if (interlace !== 0) throw new Error("png: interlaced (Adam7) images are not supported");
  const channels = CHANNELS[colorType];
  if (!channels) throw new Error(`png: unsupported colour type ${colorType}`);
  if (![1, 2, 4, 8, 16].includes(depth)) throw new Error(`png: unsupported bit depth ${depth}`);
  if (colorType !== 0 && colorType !== 3 && depth < 8) {
    throw new Error(`png: bit depth ${depth} is not legal for colour type ${colorType}`);
  }

  const idat = chunks.filter((c) => c.type === "IDAT");
  if (idat.length === 0) throw new Error("png: no IDAT data");
  let total = 0;
  for (const c of idat) total += c.data.length;
  const joined = new Uint8Array(total);
  let at = 0;
  for (const c of idat) {
    joined.set(c.data, at);
    at += c.data.length;
  }
  const inflated = new Uint8Array(inflateSync(joined));

  const bitsPerPixel = channels * depth;
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, Math.ceil(bitsPerPixel / 8));
  if (inflated.length < height * (stride + 1)) {
    throw new Error(
      `png: truncated image data (${inflated.length} bytes, expected ${height * (stride + 1)})`,
    );
  }
  const rows = unfilter(inflated, height, stride, bpp);

  // palette + its optional per-entry alpha
  let plte: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  for (const c of chunks) {
    if (c.type === "PLTE") plte = c.data;
    if (c.type === "tRNS") trns = c.data;
  }
  if (colorType === 3 && !plte) throw new Error("png: colour type 3 without a PLTE chunk");

  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = rows.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      switch (colorType) {
        case 0: {
          const g = sampleAt(row, x, depth, false);
          rgba[o] = g; rgba[o + 1] = g; rgba[o + 2] = g; rgba[o + 3] = 255;
          break;
        }
        case 2: {
          rgba[o] = sampleAt(row, x * 3, depth, false);
          rgba[o + 1] = sampleAt(row, x * 3 + 1, depth, false);
          rgba[o + 2] = sampleAt(row, x * 3 + 2, depth, false);
          rgba[o + 3] = 255;
          break;
        }
        case 3: {
          const idx = sampleAt(row, x, depth, true);
          const p = idx * 3;
          rgba[o] = plte![p] ?? 0;
          rgba[o + 1] = plte![p + 1] ?? 0;
          rgba[o + 2] = plte![p + 2] ?? 0;
          rgba[o + 3] = trns && idx < trns.length ? trns[idx]! : 255;
          break;
        }
        case 4: {
          const g = sampleAt(row, x * 2, depth, false);
          rgba[o] = g; rgba[o + 1] = g; rgba[o + 2] = g;
          rgba[o + 3] = sampleAt(row, x * 2 + 1, depth, false);
          break;
        }
        default: {
          rgba[o] = sampleAt(row, x * 4, depth, false);
          rgba[o + 1] = sampleAt(row, x * 4 + 1, depth, false);
          rgba[o + 2] = sampleAt(row, x * 4 + 2, depth, false);
          rgba[o + 3] = sampleAt(row, x * 4 + 3, depth, false);
          break;
        }
      }
    }
  }
  return { width, height, rgba };
}
