/**
 * pngWrite — a dependency-free, BYTE-DETERMINISTIC RGBA8 PNG writer.
 *
 * Re-homed from `tools/voxel-gen/png.ts` into @ggd/shared for task #229 and
 * ported from node `Buffer` to `Uint8Array` (see `bytes.ts` for why). Not one
 * emitted byte changed: `gen.test.ts`'s five sha256 pins are the proof, since
 * this image is embedded verbatim in every one of them.
 *
 * WHY NOT `zlib.deflateSync`. The generator's contract is that a re-bake
 * re-emits the shipped .glb files byte for byte. zlib's compressed output is a
 * function of the linked zlib version's heuristics, so a Node upgrade would
 * silently break that pin for no visual reason — and in a BROWSER there is no
 * synchronous deflate at all. This writer therefore emits the DEFLATE "stored"
 * (BTYPE=00) block form: a valid zlib stream every PNG decoder accepts, with no
 * entropy coding and no version-dependent choices.
 *
 * The cost is zero here: the palette image is 16×16 = 1,040 raw bytes, so the
 * whole PNG is ~1 KB either way. Compression would save bytes that do not exist.
 */
import { adler32, alloc, ascii, concat, crc32, u16le, u32be } from "./bytes";

const PNG_SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Uint8Array): Uint8Array {
  const len = alloc(4);
  u32be(len, 0, data.length);
  const body = concat([ascii(type), data]);
  const crc = alloc(4);
  u32be(crc, 0, crc32(body));
  return concat([len, body, crc]);
}

/**
 * Wrap raw bytes in a zlib stream made of DEFLATE stored blocks.
 * CMF/FLG = 0x78 0x01 (32 KiB window, fastest level) — 0x7801 % 31 === 0, the
 * header check every inflater applies.
 */
function zlibStored(raw: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  const MAX = 0xffff;
  if (raw.length === 0) {
    parts.push(new Uint8Array([0x01, 0x00, 0x00, 0xff, 0xff]));
  }
  for (let off = 0; off < raw.length; off += MAX) {
    const slice = raw.subarray(off, Math.min(off + MAX, raw.length));
    const last = off + MAX >= raw.length ? 1 : 0;
    const head = alloc(5);
    head[0] = last;
    u16le(head, 1, slice.length);
    u16le(head, 3, ~slice.length & 0xffff);
    parts.push(head, slice);
  }
  const ad = alloc(4);
  u32be(ad, 0, adler32(raw));
  parts.push(ad);
  return concat(parts);
}

/**
 * Encode `w`×`h` RGBA8 pixels (row-major, 4 bytes per pixel) as a PNG.
 * Every scanline uses filter type 0 (None) — deliberate: a palette image has no
 * gradients for a predictor to exploit, and filter 0 keeps the bytes trivially
 * re-derivable by a reader of this file.
 */
export function encodePng(w: number, h: number, rgba: Uint8Array): Uint8Array {
  if (rgba.length !== w * h * 4) throw new Error(`rgba length ${rgba.length} != ${w * h * 4}`);
  const ihdr = alloc(13);
  u32be(ihdr, 0, w);
  u32be(ihdr, 4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type 6 = truecolour + alpha
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace: none
  const raw = alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const dst = y * (1 + w * 4);
    raw[dst] = 0; // filter: None
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), dst + 1);
  }
  return concat([
    PNG_SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibStored(raw)),
    chunk("IEND", alloc(0)),
  ]);
}

export { adler32, crc32 };
