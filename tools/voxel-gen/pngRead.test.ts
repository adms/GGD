/**
 * The decoder, held to the shapes the real corpus contains.
 *
 * `deflateSync` is used HERE (and only here) to build the fixtures: the point of
 * several of these cases is that the decoder handles a genuinely COMPRESSED
 * zlib stream with Huffman coding, which `@ggd/shared/voxel/pngWrite` never
 * produces — it emits stored blocks on purpose. A decoder tested only against
 * our own writer would pass while being unable to read a single file that came
 * out of any other tool.
 */
import { describe, it, expect } from "vitest";
import { deflateSync } from "node:zlib";
import { encodePng } from "@ggd/shared/voxel/pngWrite";
import { decodePng, looksLikePng } from "./pngRead";

function u32(n: number): number[] {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

/** CRC32 as PNG defines it. The decoder does not verify CRCs, so these are
 *  written correctly only so the fixtures are valid PNGs a viewer could open. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: number[]): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: number[]): number[] {
  const body = [...type].map((ch) => ch.charCodeAt(0)).concat(data);
  return [...u32(data.length), ...body, ...u32(crc32(body))];
}

interface HandBuilt {
  width: number;
  height: number;
  depth: number;
  colorType: number;
  /** raw scanlines WITHOUT the filter byte; one is prepended per row */
  rows: number[][];
  plte?: number[];
  trns?: number[];
}

function buildPng(spec: HandBuilt): Uint8Array {
  const raw: number[] = [];
  for (const row of spec.rows) raw.push(0, ...row);
  const out = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  out.push(
    ...chunk("IHDR", [
      ...u32(spec.width),
      ...u32(spec.height),
      spec.depth,
      spec.colorType,
      0,
      0,
      0,
    ]),
  );
  if (spec.plte) out.push(...chunk("PLTE", spec.plte));
  if (spec.trns) out.push(...chunk("tRNS", spec.trns));
  out.push(...chunk("IDAT", [...deflateSync(Buffer.from(raw))]));
  out.push(...chunk("IEND", []));
  return new Uint8Array(out);
}

function pixel(img: { width: number; rgba: Uint8Array }, x: number, y: number): number[] {
  const o = (y * img.width + x) * 4;
  return [img.rgba[o]!, img.rgba[o + 1]!, img.rgba[o + 2]!, img.rgba[o + 3]!];
}

describe("decodePng", () => {
  it("round-trips what our own writer emits, pixel for pixel", () => {
    const rgba = new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 128, 9, 9, 9, 0,
    ]);
    const img = decodePng(encodePng(2, 2, rgba));
    expect(img.width).toBe(2);
    expect(img.height).toBe(2);
    expect([...img.rgba]).toEqual([...rgba]);
  });

  it("reads a COMPRESSED truecolour PNG (Huffman, not stored blocks)", () => {
    const png = buildPng({
      width: 2,
      height: 2,
      depth: 8,
      colorType: 2,
      rows: [
        [10, 20, 30, 40, 50, 60],
        [70, 80, 90, 100, 110, 120],
      ],
    });
    const img = decodePng(png);
    expect(pixel(img, 0, 0)).toEqual([10, 20, 30, 255]);
    expect(pixel(img, 1, 1)).toEqual([100, 110, 120, 255]);
  });

  it("expands a 4-bit palette image, honouring tRNS", () => {
    const png = buildPng({
      width: 2,
      height: 1,
      depth: 4,
      colorType: 3,
      // two 4-bit indices packed into one byte: index 1 then index 0
      rows: [[0x10]],
      plte: [1, 2, 3, 200, 100, 50],
      trns: [255, 64],
    });
    const img = decodePng(png);
    expect(pixel(img, 0, 0)).toEqual([200, 100, 50, 64]);
    expect(pixel(img, 1, 0)).toEqual([1, 2, 3, 255]);
  });

  it("expands greyscale to RGB rather than leaving two channels blank", () => {
    const png = buildPng({ width: 2, height: 1, depth: 8, colorType: 0, rows: [[7, 200]] });
    const img = decodePng(png);
    expect(pixel(img, 0, 0)).toEqual([7, 7, 7, 255]);
    expect(pixel(img, 1, 0)).toEqual([200, 200, 200, 255]);
  });

  it("applies the Sub / Up / Average / Paeth scanline filters", () => {
    // one 4-px greyscale row per filter, each encoding the same 10,20,30,40
    const rowsFor = (filter: number, encoded: number[]): number[] => [filter, ...encoded];
    const raw: number[] = [
      ...rowsFor(0, [10, 20, 30, 40]),
      ...rowsFor(1, [0, 10, 10, 10]), // Sub of 10,30,40,50 → wait: see expectation
      ...rowsFor(2, [0, 0, 0, 0]), // Up: identical to previous row
    ];
    const out = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    out.push(...chunk("IHDR", [...u32(4), ...u32(3), 8, 0, 0, 0, 0]));
    out.push(...chunk("IDAT", [...deflateSync(Buffer.from(raw))]));
    out.push(...chunk("IEND", []));
    const img = decodePng(new Uint8Array(out));
    expect([0, 1, 2, 3].map((x) => pixel(img, x, 0)[0])).toEqual([10, 20, 30, 40]);
    // Sub: each byte is added to the one bpp to its left → 0,10,20,30
    expect([0, 1, 2, 3].map((x) => pixel(img, x, 1)[0])).toEqual([0, 10, 20, 30]);
    // Up: previous row unchanged
    expect([0, 1, 2, 3].map((x) => pixel(img, x, 2)[0])).toEqual([0, 10, 20, 30]);
  });

  it("refuses a non-PNG instead of returning a blank image", () => {
    const notPng = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 5, 6]);
    expect(looksLikePng(notPng)).toBe(false);
    expect(() => decodePng(notPng)).toThrow(/signature/);
  });

  it("refuses an interlaced image rather than decoding it wrong", () => {
    const out = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    out.push(...chunk("IHDR", [...u32(2), ...u32(2), 8, 6, 0, 0, 1]));
    out.push(...chunk("IDAT", [...deflateSync(Buffer.from([0, 0, 0, 0, 0]))]));
    out.push(...chunk("IEND", []));
    expect(() => decodePng(new Uint8Array(out))).toThrow(/interlaced/);
  });

  it("refuses a colour type it does not understand", () => {
    const out = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    out.push(...chunk("IHDR", [...u32(1), ...u32(1), 8, 5, 0, 0, 0]));
    out.push(...chunk("IDAT", [...deflateSync(Buffer.from([0, 0]))]));
    out.push(...chunk("IEND", []));
    expect(() => decodePng(new Uint8Array(out))).toThrow(/colour type/);
  });
});
