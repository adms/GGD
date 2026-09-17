#!/usr/bin/env node
/**
 * Reduce a textured skinned GLB while locking vertices that sample bright
 * emissive texels.  The regular decimator remains the default general tool;
 * this worker exists for thin emissive characters where position-only
 * simplification met the triangle target but visibly tore the lit markings.
 *
 * Dependencies are the same isolated packages as decimate.mjs. Bootstrap with:
 *   bash tools/model-budget/optimize/bootstrap-geometry.sh
 *
 * Usage:
 *   node decimate-emissive-lock.mjs input.glb output.glb \
 *     --target 7900 --emissive-threshold 192 --error 0.02
 */
import { execFileSync } from "node:child_process";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptSimplifier } from "meshoptimizer";

const [, , input, output, ...argv] = process.argv;
const option = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
};
if (!input || !output) {
  console.error("usage: node decimate-emissive-lock.mjs input.glb output.glb --target N [--emissive-threshold N] [--error N]");
  process.exit(2);
}
const target = Number(option("--target", "7900"));
const emissiveThreshold = Number(option("--emissive-threshold", "192"));
const errorBound = Number(option("--error", "0.02"));
const sanitizeEmissiveMattes = argv.includes("--sanitize-transparent-emissive-mattes");
if (!Number.isFinite(target) || target < 4) throw new Error("--target must be >= 4");
if (!Number.isFinite(emissiveThreshold) || emissiveThreshold < 0 || emissiveThreshold > 255) throw new Error("--emissive-threshold must be 0..255");
if (!Number.isFinite(errorBound) || errorBound < 0) throw new Error("--error must be >= 0");

function decodeRgba(texture) {
  const [width, height] = texture.getSize();
  const pixels = execFileSync(
    "ffmpeg",
    ["-loglevel", "error", "-i", "pipe:0", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"],
    { input: Buffer.from(texture.getImage()), maxBuffer: width * height * 4 + 1024 },
  );
  if (pixels.length !== width * height * 4) throw new Error(`decoded image length ${pixels.length} != ${width}x${height}x4`);
  return { width, height, pixels };
}

function encodeRgbaPng({ width, height, pixels }) {
  return execFileSync(
    "ffmpeg",
    [
      "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba",
      "-video_size", `${width}x${height}`, "-i", "pipe:0",
      "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1",
    ],
    { input: pixels, maxBuffer: width * height * 8 + 1024 * 1024 },
  );
}

/**
 * Emissive materials can expose RGB stored underneath transparent texels in
 * Babylon even when the base-colour alpha test rejects those texels.  Clearing
 * only that hidden RGB preserves every visible pixel and alpha value while
 * preventing a bright rectangular matte.  Source images remain untouched; the
 * operation applies only to the separately generated candidate.
 */
function sanitizeTransparentEmissiveMattes(document) {
  const touched = new Set();
  const records = [];
  for (const material of document.getRoot().listMaterials()) {
    if (Math.max(...material.getEmissiveFactor()) <= 0) continue;
    for (const texture of [material.getBaseColorTexture(), material.getEmissiveTexture()]) {
      if (!texture || touched.has(texture)) continue;
      touched.add(texture);
      const image = decodeRgba(texture);
      let clearedPixels = 0;
      for (let offset = 0; offset < image.pixels.length; offset += 4) {
        if (image.pixels[offset + 3] > 5) continue;
        if (Math.max(image.pixels[offset], image.pixels[offset + 1], image.pixels[offset + 2]) <= 8) continue;
        image.pixels[offset] = 0;
        image.pixels[offset + 1] = 0;
        image.pixels[offset + 2] = 0;
        clearedPixels += 1;
      }
      if (!clearedPixels) continue;
      texture.setImage(encodeRgbaPng(image));
      texture.setMimeType("image/png");
      records.push({
        texture: texture.getName() || null,
        width: image.width,
        height: image.height,
        clearedPixels,
        visiblePixelsChanged: 0,
        alphaValuesChanged: 0,
      });
    }
  }
  return records;
}

function repeat(value) {
  return value - Math.floor(value);
}

function lockFromEmissive(primitive) {
  const positions = primitive.getAttribute("POSITION");
  const uv = primitive.getAttribute("TEXCOORD_0")?.getArray();
  const emissive = primitive.getMaterial()?.getEmissiveTexture();
  const locks = new Uint8Array(positions.getCount());
  if (!uv || !emissive) return locks;
  const image = decodeRgba(emissive);
  for (let vertex = 0; vertex < positions.getCount(); vertex++) {
    const x = Math.max(0, Math.min(image.width - 1, Math.floor(repeat(uv[vertex * 2]) * image.width)));
    const vf = repeat(uv[vertex * 2 + 1]);
    // glTF UV and decoder row origins differ across loaders. Lock either
    // orientation so the preservation rule is conservative and portable.
    const rows = [Math.floor(vf * image.height), Math.floor((1 - vf) * image.height)];
    for (const rawY of rows) {
      const y = Math.max(0, Math.min(image.height - 1, rawY));
      const offset = (y * image.width + x) * 4;
      if (Math.max(image.pixels[offset], image.pixels[offset + 1], image.pixels[offset + 2]) >= emissiveThreshold) {
        locks[vertex] = 1;
        break;
      }
    }
  }
  return locks;
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(input);
await MeshoptSimplifier.ready;
const primitives = document.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives());
const beforeIndices = primitives.reduce((sum, primitive) => sum + primitive.getIndices().getCount(), 0);
const ratio = (target * 3) / beforeIndices;
const records = [];

for (const [primitiveIndex, primitive] of primitives.entries()) {
  if (primitive.getMode() !== 4) throw new Error(`primitive ${primitiveIndex}: only TRIANGLES mode is supported`);
  const positions = primitive.getAttribute("POSITION").getArray();
  if (!(positions instanceof Float32Array)) throw new Error(`primitive ${primitiveIndex}: POSITION must be Float32Array`);
  const indicesAccessor = primitive.getIndices();
  const indices = indicesAccessor.getArray();
  const desired = Math.floor((indices.length * ratio) / 3) * 3;
  const locks = lockFromEmissive(primitive);
  const [reduced, measuredError] = MeshoptSimplifier.simplifyWithAttributes(
    indices,
    positions,
    3,
    new Float32Array(),
    0,
    [],
    locks,
    desired,
    errorBound,
    ["LockBorder"],
  );
  indicesAccessor.setArray(reduced);
  records.push({
    primitiveIndex,
    material: primitive.getMaterial()?.getName() ?? null,
    trianglesBefore: indices.length / 3,
    trianglesAfter: reduced.length / 3,
    vertices: primitive.getAttribute("POSITION").getCount(),
    emissiveLockedVertices: locks.reduce((sum, value) => sum + value, 0),
    measuredError,
  });
}

const emissiveMatteSanitization = sanitizeEmissiveMattes ? sanitizeTransparentEmissiveMattes(document) : [];
await io.write(output, document);
const trianglesAfter = records.reduce((sum, record) => sum + record.trianglesAfter, 0);
console.log(JSON.stringify({
  tool: "model-budget/decimate-emissive-lock@1",
  input,
  output,
  parameters: { target, emissiveThreshold, errorBound, lockBorder: true, sanitizeTransparentEmissiveMattes: sanitizeEmissiveMattes },
  trianglesBefore: beforeIndices / 3,
  trianglesAfter,
  emissiveMatteSanitization,
  records,
}));
if (trianglesAfter > 7999) process.exit(1);
