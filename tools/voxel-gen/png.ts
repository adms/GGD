/**
 * png — a dependency-free, BYTE-DETERMINISTIC RGBA8 PNG writer.
 *
 * WHY NOT `zlib.deflateSync`. The generator's contract is that
 * `pnpm voxel:gen` re-emits the five .glb files byte-for-byte, and
 * `gen.test.ts` pins their sha256. zlib's compressed output is a function of
 * the linked zlib version's heuristics, so a Node upgrade would silently break
 * that pin for no visual reason. This writer therefore emits the DEFLATE
 * "stored" (BTYPE=00) block form: a valid zlib stream that every PNG decoder
 * accepts, with no entropy coding and no version-dependent choices.
 *
 * The cost is zero here: the palette image is 16x16 = 1,040 raw bytes, so the
 * whole PNG is ~1 KB either way. Compression would save bytes that do not
 * exist.
 */

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** CRC-32 (PNG chunk checksum), table built once. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Adler-32 (zlib stream checksum). */
export function adler32(buf: Buffer): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * Wrap raw bytes in a zlib stream made of DEFLATE stored blocks.
 * CMF/FLG = 0x78 0x01 (32 KiB window, fastest level) — 0x7801 % 31 === 0, the
 * header check every inflater applies.
 */
function zlibStored(raw: Buffer): Buffer {
  const parts: Buffer[] = [Buffer.from([0x78, 0x01])];
  const MAX = 0xffff;
  if (raw.length === 0) {
    parts.push(Buffer.from([0x01, 0x00, 0x00, 0xff, 0xff]));
  }
  for (let off = 0; off < raw.length; off += MAX) {
    const slice = raw.subarray(off, Math.min(off + MAX, raw.length));
    const last = off + MAX >= raw.length ? 1 : 0;
    const head = Buffer.alloc(5);
    head.writeUInt8(last, 0);
    head.writeUInt16LE(slice.length, 1);
    head.writeUInt16LE(~slice.length & 0xffff, 3);
    parts.push(head, slice);
  }
  const ad = Buffer.alloc(4);
  ad.writeUInt32BE(adler32(raw), 0);
  parts.push(ad);
  return Buffer.concat(parts);
}

/**
 * Encode `w`x`h` RGBA8 pixels (row-major, 4 bytes per pixel) as a PNG.
 * Every scanline uses filter type 0 (None) — deliberate: a palette image has
 * no gradients for a predictor to exploit, and filter 0 keeps the bytes
 * trivially re-derivable by a reader of this file.
 */
export function encodePng(w: number, h: number, rgba: Uint8Array): Buffer {
  if (rgba.length !== w * h * 4) throw new Error(`rgba length ${rgba.length} != ${w * h * 4}`);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // colour type 6 = truecolour + alpha
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter method
  ihdr.writeUInt8(0, 12); // interlace: none
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const dst = y * (1 + w * 4);
    raw[dst] = 0; // filter: None
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, dst + 1);
  }
  return Buffer.concat([
    PNG_SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibStored(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
