import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { modelUploadFixture } from "@ggd/shared/content/modelUpload/fixtures";
import { encodeUploadGlb } from "@ggd/shared/content/modelUpload/glb";
import { inspectModelUpload } from "@ggd/shared/content/modelUpload/inspect";
import { resizeImageWithFfmpeg } from "./resizeImage.node";

const colors = [[220, 32, 48], [16, 192, 64], [48, 80, 224], [208, 176, 32]];
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function chunk(type: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}

/** Authored RGB quadrants, no pHYs or color-profile metadata, like the Kaiji source PNGs. */
function authoredPng(width: number, height: number) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const pixels = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const color = colors[(y >= height / 2 ? 2 : 0) + (x >= width / 2 ? 1 : 0)]!;
    pixels.set(color, y * (1 + width * 3) + 1 + x * 3);
  }
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}

function pngChunks(bytes: Uint8Array) {
  const png = Buffer.from(bytes), chunks = new Map<string, Buffer>();
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    chunks.set(png.toString("ascii", at + 4, at + 8), png.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  return chunks;
}

describe("real ffmpeg texture resizing", () => {
  it.each([[512, 512, 256, 256], [512, 256, 256, 128]])(
    "keeps square pixels and image proportions for %ix%i -> %ix%i",
    async (width, height, outWidth, outHeight) => {
      const source = authoredPng(width, height), original = Buffer.from(source), sourceSha = sha256(source);
      expect(pngChunks(source).has("pHYs")).toBe(false);
      const resized = await resizeImageWithFfmpeg(source, 256);
      expect(resized, "real ffmpeg must successfully resize the authored PNG").not.toBeNull();
      const chunks = pngChunks(resized!), header = chunks.get("IHDR")!;
      expect([header.readUInt32BE(0), header.readUInt32BE(4)]).toEqual([outWidth, outHeight]);
      // The old filter emitted pHYs=(0,1,unit=0), which Khronos rejects as non-square pixels.
      const physical = chunks.get("pHYs");
      if (physical) {
        expect(physical.readUInt32BE(0), "PNG pixels must have positive aspect ratio").toBeGreaterThan(0);
        expect(physical.readUInt32BE(0)).toBe(physical.readUInt32BE(4));
      }
      const rgb = execFileSync("ffmpeg", ["-v", "error", "-i", "pipe:0", "-frames:v", "1",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { input: resized!, maxBuffer: 1024 * 1024 });
      expect(rgb.length).toBe(outWidth * outHeight * 3);
      for (let quadrant = 0; quadrant < 4; quadrant++) {
        const x = (quadrant % 2 ? 3 : 1) * outWidth / 4;
        const y = (quadrant >= 2 ? 3 : 1) * outHeight / 4;
        const at = (y * outWidth + x) * 3;
        expect([...rgb.subarray(at, at + 3)]).toEqual(colors[quadrant]);
      }
      const fixture = modelUploadFixture();
      fixture.json.images = [{ bufferView: fixture.json.bufferViews.length, mimeType: "image/png" }];
      fixture.json.bufferViews.push({ buffer: 0, byteOffset: fixture.bin.length, byteLength: resized!.length });
      const bin = new Uint8Array(fixture.bin.length + resized!.length);
      bin.set(fixture.bin); bin.set(resized!, fixture.bin.length);
      const inspected = await inspectModelUpload(encodeUploadGlb(fixture.json, bin));
      expect(inspected.report.issues.numWarnings).toBe(0);
      expect(inspected.textures[0]).toMatchObject({ width: outWidth, height: outHeight });
      expect(source).toEqual(original);
      expect(sha256(source)).toBe(sourceSha);
    },
  );
});
