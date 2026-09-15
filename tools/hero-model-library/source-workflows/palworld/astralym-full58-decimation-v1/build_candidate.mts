import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resizeImageWithFfmpeg } from "../../../../../apps/content-api/src/resizeImage.node";
import { inspectModelUpload } from "../../../../../packages/shared/src/content/modelUpload/inspect";
import { normalizeUploadedModel } from "../../../../../packages/shared/src/content/modelUpload/normalize";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../../..");
const WORKSPACE = path.dirname(ROOT);
const SOURCE = path.join(WORKSPACE, "GGD-Asset-Library/conversions/palworld-astralym-materials-20260911/astralym-material-bound.glb");
const EXPECTED_SOURCE_SHA256 = "5178b51b17783acaab5542b5cb50483b3f85110dc915803a5fd0682afba6baaf";
const outputIndex = process.argv.indexOf("--out");
if (outputIndex < 0 || !process.argv[outputIndex + 1]) {
  throw new Error("usage: build_candidate.mts --out /absolute/astralym-full58-256-decimated.glb");
}
const output = path.resolve(process.argv[outputIndex + 1]);
const sha256 = (bytes: Uint8Array | Buffer) => createHash("sha256").update(bytes).digest("hex");
type Json = Record<string, any>;
function parseRawGlb(bytes: Uint8Array): { json: Json; bin: Uint8Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x46546c67, "not a GLB");
  assert.equal(view.getUint32(4, true), 2, "not GLB 2.0");
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).trim());
  const binAt = 20 + jsonLength;
  assert.equal(view.getUint32(binAt + 4, true), 0x004e4942, "missing BIN chunk");
  const binLength = view.getUint32(binAt, true);
  return { json, bin: bytes.subarray(binAt + 8, binAt + 8 + binLength) };
}

function rawClipMetadata(bytes: Uint8Array) {
  const { json, bin } = parseRawGlb(bytes);
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  return (json.animations ?? []).map((clip: Json) => {
    let duration = 0;
    for (const sampler of clip.samplers ?? []) {
      const accessor = json.accessors[sampler.input];
      if (typeof accessor.max?.[0] === "number") { duration = Math.max(duration, accessor.max[0]); continue; }
      assert.equal(accessor.componentType, 5126, "animation input must use float32");
      assert.equal(accessor.type, "SCALAR", "animation input must be scalar");
      const bufferView = json.bufferViews[accessor.bufferView];
      const stride = bufferView.byteStride ?? 4;
      const offset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + (accessor.count - 1) * stride;
      duration = Math.max(duration, view.getFloat32(offset, true));
    }
    return { name: clip.name, duration, channels: clip.channels.length };
  });
}

function makeUploadCompatible(bytes: Uint8Array) {
  const { json, bin } = parseRawGlb(bytes);
  const parts: Uint8Array[] = [bin];
  let offset = bin.length;
  const pad = () => {
    const count = (4 - offset % 4) % 4;
    if (count) { parts.push(new Uint8Array(count)); offset += count; }
  };
  const converted = new Set<number>();
  for (const mesh of json.meshes ?? []) for (const primitive of mesh.primitives ?? []) {
    const accessorId = primitive.attributes?.NORMAL;
    if (!Number.isInteger(accessorId) || converted.has(accessorId)) continue;
    const accessor = json.accessors[accessorId];
    if (accessor.componentType !== 5122 || accessor.normalized !== true || accessor.type !== "VEC3") continue;
    const sourceView = json.bufferViews[accessor.bufferView];
    const sourceOffset = (sourceView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const stride = sourceView.byteStride ?? 6;
    const floats = new Float32Array(accessor.count * 3);
    const source = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
    for (let row = 0; row < accessor.count; row++) for (let column = 0; column < 3; column++) {
      floats[row * 3 + column] = Math.max(-1, source.getInt16(sourceOffset + row * stride + column * 2, true) / 32767);
    }
    pad();
    const payload = new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength);
    const viewId = json.bufferViews.length;
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: payload.length, target: 34962 });
    parts.push(payload); offset += payload.length;
    json.accessors[accessorId] = { bufferView: viewId, componentType: 5126, count: accessor.count, type: "VEC3" };
    converted.add(accessorId);
  }
  for (const animation of json.animations ?? []) for (const sampler of animation.samplers ?? []) {
    if (sampler.interpolation === "LINEAR") delete sampler.interpolation;
  }
  for (const key of ["extensionsUsed", "extensionsRequired"]) {
    if (!Array.isArray(json[key])) continue;
    json[key] = json[key].filter((name: string) => name !== "KHR_mesh_quantization");
    if (json[key].length === 0) delete json[key];
  }
  pad();
  const merged = new Uint8Array(offset);
  let at = 0;
  for (const part of parts) { merged.set(part, at); at += part.length; }
  json.buffers = [{ byteLength: merged.length }];
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadding = (4 - jsonBytes.length % 4) % 4;
  if (jsonPadding) {
    const padded = new Uint8Array(jsonBytes.length + jsonPadding); padded.set(jsonBytes); padded.fill(0x20, jsonBytes.length); jsonBytes = padded;
  }
  const total = 12 + 8 + jsonBytes.length + 8 + merged.length;
  const output = new Uint8Array(total); const header = new DataView(output.buffer);
  header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, total, true);
  header.setUint32(12, jsonBytes.length, true); header.setUint32(16, 0x4e4f534a, true); output.set(jsonBytes, 20);
  const binAt = 20 + jsonBytes.length; header.setUint32(binAt, merged.length, true); header.setUint32(binAt + 4, 0x004e4942, true); output.set(merged, binAt + 8);
  return { bytes: output, convertedNormalAccessors: converted.size, omittedDefaultLinearSamplers: true, jsonBytes: jsonBytes.length };
}
const sourceBytes = new Uint8Array(fs.readFileSync(SOURCE));
assert.equal(sha256(sourceBytes), EXPECTED_SOURCE_SHA256, "Astralym full-motion source changed");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ggd-astralym-full58-"));
const decimated = path.join(tempRoot, "astralym-full58-decimated-native.glb");
const worker = path.join(ROOT, "tools/model-budget/optimize/decimate-emissive-lock.mjs");
const rawResult = execFileSync(process.execPath, [
  worker, SOURCE, decimated,
  "--target", "7900", "--emissive-threshold", "192", "--error", "0.02",
  "--sanitize-transparent-emissive-mattes",
], { encoding: "utf8" });
const decimation = JSON.parse(rawResult);
const decimatedBytes = new Uint8Array(fs.readFileSync(decimated));
const compatible = makeUploadCompatible(decimatedBytes);
const normalized = await normalizeUploadedModel(compatible.bytes, { resizeImage: resizeImageWithFfmpeg });
const sourceClips = rawClipMetadata(sourceBytes);
const candidateInspection = await inspectModelUpload(normalized.bytes);
assert.equal(sourceClips.length, 58, "source no longer has 58 clips");
assert.deepEqual(
  candidateInspection.clips.map(({ name, duration, channels }) => ({ name, duration, channels })),
  sourceClips,
  "native clip names, durations or channel counts changed",
);
assert.equal(candidateInspection.triangles, decimation.trianglesAfter, "inspection triangle count differs from decimator");
assert.equal(candidateInspection.triangles <= 8000, true, "candidate exceeds formal decimated target");
assert.equal(candidateInspection.meshes, 3, "draw primitive count changed");
assert.equal(candidateInspection.skins, 1, "skin count changed");
assert.equal(candidateInspection.skinnedPrimitives, candidateInspection.meshes, "not every primitive remains skinned");
assert.equal(Math.max(...candidateInspection.textures.flatMap((texture) => [texture.width, texture.height])), 256, "texture cap missed");
assert.equal(normalized.report.droppedZeroClips.length, 0, "normalizer removed a source clip");
assert.equal(normalized.report.texturesOverCap.length, 0, "normalizer left an oversized texture");

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, normalized.bytes);
const receipt = {
  schema: "ggd-palworld-astralym-full58-build@1",
  source: { path: SOURCE, bytes: sourceBytes.length, sha256: EXPECTED_SOURCE_SHA256 },
  output: { path: output, bytes: normalized.bytes.length, sha256: sha256(normalized.bytes) },
  stages: {
    decimation: {
      tool: path.relative(ROOT, worker),
      parameters: decimation.parameters,
      trianglesBefore: decimation.trianglesBefore,
      trianglesAfter: decimation.trianglesAfter,
      primitiveRecords: decimation.records,
      transparentEmissiveMatteSanitization: decimation.emissiveMatteSanitization,
    },
    normalization: normalized.report,
    uploadCompatibility: {
      convertedNormalAccessors: compatible.convertedNormalAccessors,
      omittedDefaultLinearSamplers: compatible.omittedDefaultLinearSamplers,
      jsonBytes: compatible.jsonBytes,
    },
  },
  preservationAssertions: {
    nativeClipCount: candidateInspection.clips.length,
    nativeClipMetadataExact: true,
    generatedClips: 0,
    retargetedClips: 0,
    skinnedPrimitives: candidateInspection.skinnedPrimitives,
    skinCount: candidateInspection.skins,
    jointCounts: candidateInspection.json.skins?.map((skin) => skin.joints.length) ?? [],
  },
  measured: {
    triangles: candidateInspection.triangles,
    drawPrimitives: candidateInspection.meshes,
    textureCount: candidateInspection.textures.length,
    maxTextureEdge: Math.max(...candidateInspection.textures.flatMap((texture) => [texture.width, texture.height])),
    clipCount: candidateInspection.clips.length,
    maxClipChannels: Math.max(...candidateInspection.clips.map((clip) => clip.channels)),
  },
  dependencies: {
    node: process.version,
    gltfTransformCore: "4.4.1",
    gltfTransformFunctions: "4.4.1",
    meshoptimizer: "1.2.0",
    ffmpeg: "required by resizeImageWithFfmpeg",
  },
};
fs.writeFileSync(`${output}.generation.json`, JSON.stringify(receipt, null, 2) + "\n");
fs.rmSync(tempRoot, { recursive: true, force: true });
console.log(JSON.stringify(receipt));
