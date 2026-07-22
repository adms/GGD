/**
 * scripts/png — a minimal, dependency-free RGBA → PNG encoder (raw pixels →
 * zlib → hand-rolled chunks). Extracted from gen-icons.ts when gen-cursors.ts
 * needed the same thing; the asset generators deliberately pull in NO image
 * library, so every checked-in raster is reproducible byte-for-byte from a
 * plain `tsx` run on any machine or CI box.
 */
import { deflateSync } from "node:zlib";

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let x = n;
  for (let k = 0; k < 8; k++) x = x & 1 ? 0xedb88320 ^ (x >>> 1) : x >>> 1;
  return x;
});

function crc32(buf: Buffer): number {
  let crc = -1;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * Encode an 8-bit RGB (`channels` 3) or RGBA (4) buffer with PER-SCANLINE
 * ADAPTIVE FILTERING — the standard minimum-sum-of-absolute-differences
 * heuristic over the five PNG filter types.
 *
 * encodePng() below writes every scanline with filter 0 (None), which is fine
 * for the flat-shaded cursor/icon art it was built for. Ground textures are
 * megapixel noise fields, and leaving them unfiltered roughly DOUBLES the file:
 * Paeth/Sub turn the smooth gradients of a normal map into near-zero residuals.
 * Kept separate so the existing generators' output stays byte-identical.
 */
export function encodeTexturePng(
  width: number,
  height: number,
  data: Buffer,
  channels: 3 | 4,
): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = channels === 3 ? 2 : 6; // color type: 2 = RGB, 6 = RGBA
  const bpp = channels;
  const stride = width * bpp;
  const raw = Buffer.alloc(height * (stride + 1));
  const cand = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride)];
  let prev = Buffer.alloc(stride);

  for (let y = 0; y < height; y++) {
    const row = data.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp]! : 0; // left
      const b = prev[i]!; // up
      const c = i >= bpp ? prev[i - bpp]! : 0; // upper-left
      const x = row[i]!;
      cand[0]![i] = x;
      cand[1]![i] = (x - a) & 0xff;
      cand[2]![i] = (x - b) & 0xff;
      cand[3]![i] = (x - ((a + b) >> 1)) & 0xff;
      // Paeth predictor
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      cand[4]![i] = (x - pred) & 0xff;
    }
    // pick the filter whose residuals have the smallest absolute sum (treating
    // bytes as signed) — the heuristic from the PNG spec's own encoder notes
    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      let score = 0;
      const buf = cand[f]!;
      for (let i = 0; i < stride; i++) {
        const s = buf[i]!;
        score += s < 128 ? s : 256 - s;
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    raw[y * (stride + 1)] = best;
    cand[best]!.copy(raw, y * (stride + 1) + 1);
    prev = Buffer.from(row);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Encode a straight (non-premultiplied) 8-bit RGBA buffer as a PNG. */
export function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // scanlines with filter byte 0
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
