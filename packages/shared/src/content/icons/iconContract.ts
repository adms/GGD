/**
 * Browser-safe icon contract shared by Editor validation and Main encoding.
 * This module must remain free of Node built-ins: it inspects only raw bytes.
 */

export const ICON_ENCODE = Object.freeze({
  edge: 128,
  quality: 90,
});

export const ICON_OUTPUT_DIR = "assets/icons";

export type IconFormat = "png" | "webp" | "jpeg";

export interface IconHeader {
  readonly format: IconFormat;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
}

const MIME_OF: Readonly<Record<IconFormat, string>> = Object.freeze({
  png: "image/png",
  webp: "image/webp",
  jpeg: "image/jpeg",
});

export const ICON_EXTENSIONS: Readonly<Record<string, IconFormat>> = Object.freeze({
  png: "png",
  webp: "webp",
  jpg: "jpeg",
  jpeg: "jpeg",
});

export const iconMimeOf = (format: IconFormat): string => MIME_OF[format];

const u32be = (b: Uint8Array, off: number): number =>
  ((b[off]! << 24) >>> 0) + (b[off + 1]! << 16) + (b[off + 2]! << 8) + b[off + 3]!;
const u16be = (b: Uint8Array, off: number): number => (b[off]! << 8) + b[off + 1]!;
const u16le = (b: Uint8Array, off: number): number => b[off]! + (b[off + 1]! << 8);
const u24le = (b: Uint8Array, off: number): number =>
  b[off]! + (b[off + 1]! << 8) + (b[off + 2]! << 16);
const ascii = (b: Uint8Array, from: number, to: number): string =>
  String.fromCharCode(...Array.from(b.subarray(from, to)));

function pngHeader(bytes: Uint8Array): IconHeader | null {
  if (bytes.length < 24) return null;
  if (u32be(bytes, 0) !== 0x89504e47 || u32be(bytes, 4) !== 0x0d0a1a0a) return null;
  if (ascii(bytes, 12, 16) !== "IHDR") return null;
  return { format: "png", mime: MIME_OF.png, width: u32be(bytes, 16), height: u32be(bytes, 20) };
}

function webpHeader(bytes: Uint8Array): IconHeader | null {
  if (bytes.length < 30) return null;
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 12) !== "WEBP") return null;
  const chunk = ascii(bytes, 12, 16);
  const result = (width: number, height: number): IconHeader => ({
    format: "webp",
    mime: MIME_OF.webp,
    width,
    height,
  });
  if (chunk === "VP8 ") {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    return result(u16le(bytes, 26) & 0x3fff, u16le(bytes, 28) & 0x3fff);
  }
  if (chunk === "VP8L") {
    if (bytes[20] !== 0x2f) return null;
    const bits = u16le(bytes, 21) + (bytes[23]! << 16) + (bytes[24]! << 24);
    return result((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
  }
  if (chunk === "VP8X") return result(u24le(bytes, 24) + 1, u24le(bytes, 27) + 1);
  return null;
}

function jpegHeader(bytes: Uint8Array): IconHeader | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let off = 2;
  while (off + 9 < bytes.length) {
    if (bytes[off] !== 0xff) return null;
    const marker = bytes[off + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      off += 2;
      continue;
    }
    const len = u16be(bytes, off + 2);
    if (len < 2) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return { format: "jpeg", mime: MIME_OF.jpeg, height: u16be(bytes, off + 5), width: u16be(bytes, off + 7) };
    }
    off += 2 + len;
  }
  return null;
}

/** Magic bytes plus dimensions, without decoding a pixel. */
export function sniffImageHeader(bytes: Uint8Array): IconHeader | null {
  return pngHeader(bytes) ?? webpHeader(bytes) ?? jpegHeader(bytes);
}

export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const header = pngHeader(bytes);
  return header ? { width: header.width, height: header.height } : null;
}
