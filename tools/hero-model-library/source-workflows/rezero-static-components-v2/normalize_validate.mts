/** Normalize and validate one mixed-skin static Re:Zero Unity component. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [repoArgument, sourceArgument, outputArgument, candidateId] = process.argv.slice(2);
if (!candidateId) {
  throw new Error(
    "Usage: normalize_validate.mts <GGD repo> <Unity conversion directory> <output directory> <candidate id>",
  );
}

const repo = resolve(repoArgument);
const source = resolve(sourceArgument);
const output = resolve(outputArgument);
const inputPath = join(source, "body.glb");
const conversionPath = join(source, "conversion.json");
const input = new Uint8Array(readFileSync(inputPath));
const conversion = JSON.parse(readFileSync(conversionPath, "utf8"));
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const importRepo = (path: string) => import(pathToFileURL(join(repo, path)).href);

assert.equal(sha256(input), conversion.output.sha256, "Unity GLB differs from conversion receipt");
assert.equal(input.byteLength, conversion.output.bytes, "Unity GLB size differs from conversion receipt");
assert.equal(conversion.output.animations, 0, "Static Unity component unexpectedly contains animations");
assert.equal(conversion.sourceAnimationClips, 0, "Source Unity bundle unexpectedly contains AnimationClip objects");
assert.equal(conversion.sourceUpAxis, "y", "Subaru must use the visually verified Y-up source orientation");
assert.equal(conversion.rootName, "subaruPrefab", "Mixed renderer policy is pinned to Subaru's prefab");
const rigidAttachments = conversion.meshes.filter(
  (mesh: { skinOrigin?: string }) => mesh.skinOrigin === "synthesized-rigid-hierarchy-attachment",
);
assert.equal(rigidAttachments.length, 1, "Expected exactly one hierarchy-rigid face renderer");
assert.equal(rigidAttachments[0]!.name, "face", "Unexpected hierarchy-rigid renderer");
assert.equal(rigidAttachments[0]!.sourceBoneCount, 0, "Rigid attachment source unexpectedly had bones");
assert.equal(rigidAttachments[0]!.implicitSingleBoneWeight, true, "Rigid attachment did not get one exact joint");

const [
  { normalizeUploadedModel },
  { inspectModelUpload },
  { resizeImageWithFfmpeg },
  { heroModelBudgetIssues },
  { HERO_MODEL_BUDGET },
  { MODEL_UPLOAD_LIMITS, readFloatAccessor },
] = await Promise.all([
  importRepo("packages/shared/src/content/modelUpload/normalize.ts"),
  importRepo("packages/shared/src/content/modelUpload/inspect.ts"),
  importRepo("apps/content-api/src/resizeImage.node.ts"),
  importRepo("packages/shared/src/content/modelUpload/heroModel.ts"),
  importRepo("packages/shared/src/content/modelUpload/budget.ts"),
  importRepo("packages/shared/src/content/modelUpload/glb.ts"),
]);

const before = await inspectModelUpload(input);
assert.equal(before.meshes, 3, "Expected body plus two face draw primitives");
assert.equal(before.skins, 2, "Expected native body skin plus one hierarchy-rigid face skin");
assert.equal(before.skinnedPrimitives, before.meshes, "Every source primitive must be skinned");
assert.equal(before.clips.length, 0, "Source GLB unexpectedly contains clips");
assert.equal(before.textures.length, 1, "Expected one source base-color texture");
assert.equal(before.textures[0]!.width, 2048, "Unexpected source texture width");
assert.equal(before.textures[0]!.height, 1024, "Unexpected source texture height");

const normalized = await normalizeUploadedModel(input, {
  maxTextureEdge: HERO_MODEL_BUDGET.texEdge.limit,
  resizeImage: resizeImageWithFfmpeg,
});
const after = await inspectModelUpload(normalized.bytes);
const budget = heroModelBudgetIssues(after);

assert.equal(normalized.report.changed, true, "Oversized source texture was not normalized");
assert.deepEqual(normalized.report.drawCalls, { before: 3, after: 3 });
assert.deepEqual(normalized.report.droppedZeroClips, []);
assert.deepEqual(normalized.report.clipIndexMap, []);
assert.deepEqual(normalized.report.texturesOverCap, []);
assert.deepEqual(normalized.report.resizedTextures, [[2048, 256]]);
assert.equal(after.triangles, before.triangles, "Texture normalization changed triangles");
assert.equal(after.meshes, before.meshes, "Texture normalization changed primitives");
assert.equal(after.skins, before.skins, "Texture normalization changed skins");
assert.equal(after.skinnedPrimitives, before.skinnedPrimitives, "Texture normalization changed skin coverage");
assert.equal(after.clips.length, 0, "Texture normalization added clips");
assert.equal(after.textures.length, 1, "Texture normalization changed texture count");
assert.equal(after.textures[0]!.width, 256, "Normalized texture width differs");
assert.equal(after.textures[0]!.height, 128, "Normalized texture height differs");
assert.deepEqual(budget.errors, [], "Normalized component violates current GGD budget");

for (const field of [
  "nodes", "skins", "scenes", "scene", "animations", "meshes", "accessors",
  "materials", "textures", "samplers", "extensionsUsed", "extensionsRequired",
]) {
  // Re-encoding JSON canonicalizes IEEE -0 to JSON 0. They have identical
  // transform meaning, so compare the serialized document rather than
  // Object.is-style numeric identity.
  assert.equal(
    JSON.stringify(after.json[field]),
    JSON.stringify(before.json[field]),
    `${field} changed during texture-only normalization`,
  );
}

const dimensions: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const sizes: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
function logicalAccessorBytes(model: any, index: number) {
  const accessor = model.json.accessors[index];
  assert.ok(!accessor.sparse, `Accessor ${index} is sparse`);
  const view = model.json.bufferViews[accessor.bufferView];
  const width = dimensions[accessor.type]! * sizes[accessor.componentType]!;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? width;
  const bytes = Buffer.alloc(accessor.count * width);
  for (let row = 0; row < accessor.count; row++) {
    bytes.set(model.bin.subarray(base + row * stride, base + row * stride + width), row * width);
  }
  return bytes;
}

const accessorPreservation = [];
for (let index = 0; index < before.json.accessors.length; index++) {
  const a = logicalAccessorBytes(before, index);
  const b = logicalAccessorBytes(after, index);
  assert.deepEqual(b, a, `Accessor ${index} bytes changed`);
  accessorPreservation.push({
    index,
    componentType: after.json.accessors[index]!.componentType,
    type: after.json.accessors[index]!.type,
    count: after.json.accessors[index]!.count,
    bytes: b.byteLength,
    sha256: sha256(b),
    unchanged: true,
  });
}

let floatAccessorCount = 0;
let finiteFloatValueCount = 0;
for (let index = 0; index < after.json.accessors.length; index++) {
  if (after.json.accessors[index]!.componentType !== 5126) continue;
  const values = readFloatAccessor(after.json, after.bin, index);
  for (const value of values) assert(Number.isFinite(value), `Accessor ${index} contains a non-finite float`);
  floatAccessorCount++;
  finiteFloatValueCount += values.length;
}

const toolPaths = [
  "tools/hero-model-library/convert_unity_prefab_mixed.py",
  "packages/shared/src/content/modelUpload/normalize.ts",
  "packages/shared/src/content/modelUpload/inspect.ts",
  "packages/shared/src/content/modelUpload/glb.ts",
  "packages/shared/src/content/modelUpload/heroModel.ts",
  "packages/shared/src/content/modelUpload/budget.ts",
  "apps/content-api/src/resizeImage.node.ts",
];
const toolPins = toolPaths.map((path) => ({ path, sha256: sha256(readFileSync(join(repo, path))) }));

mkdirSync(output, { recursive: false });
mkdirSync(join(output, "validation"), { recursive: false });
mkdirSync(join(output, "textures"), { recursive: false });
writeFileSync(join(output, "body.glb"), normalized.bytes, { flag: "wx" });

const image = after.json.images![0]!;
assert.notEqual(image.bufferView, undefined);
const imageView = after.json.bufferViews[image.bufferView!]!;
const imageBytes = after.bin.subarray(
  imageView.byteOffset ?? 0,
  (imageView.byteOffset ?? 0) + imageView.byteLength,
);
writeFileSync(join(output, "textures", "base-color-256.png"), imageBytes, { flag: "wx" });

const receipt = {
  schema: "ggd.rezero-static-component-normalization@1",
  candidateId,
  sourceId: "thunderstore-rezero",
  sourceVersion: "0.1.1",
  sourceRootName: conversion.rootName,
  input: {
    path: inputPath,
    bytes: input.byteLength,
    sha256: sha256(input),
    conversionReceipt: conversionPath,
    sourceBundle: conversion.source,
  },
  output: {
    path: join(output, "body.glb"),
    bytes: normalized.bytes.byteLength,
    sha256: sha256(normalized.bytes),
    triangles: after.triangles,
    drawPrimitives: after.meshes,
    skins: after.skins,
    skinnedPrimitives: after.skinnedPrimitives,
    joints: after.json.skins?.map((skin: { joints: number[] }) => skin.joints.length) ?? [],
    textures: after.textures,
    clips: after.clips,
  },
  officialNormalization: normalized.report,
  accessorPreservation,
  allAccessorBytesPreserved: true,
  jsonComparison: "JSON serialization equality; source negative zero may canonicalize to zero",
  finiteFloatAccessors: {
    passed: true,
    accessorCount: floatAccessorCount,
    valueCount: finiteFloatValueCount,
  },
  khronosIssues: after.report.issues,
  budget,
  limits: { upload: MODEL_UPLOAD_LIMITS, hero: HERO_MODEL_BUDGET },
  toolPins,
  ffmpegVersion: execFileSync("ffmpeg", ["-version"], { encoding: "utf8" }).split("\n")[0],
  contractCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(),
  status: {
    converted: true,
    structuralValidationPassed: true,
    visualValidationPassed: false,
    completeHero: false,
    heroBound: false,
    runtimeSelectable: false,
    deployed: false,
  },
  limitations: [
    "The 2048px source texture is retained separately; the GGD candidate uses a 256px Lanczos PNG.",
    "The source bundle contains no AnimationClip objects and the candidate has no clips.",
    "Subaru's source face renderer stores no bones, bind poses, joint indices or weights; it is preserved as a one-joint rigid skin attached to its own face transform below the native head hierarchy.",
    "Unity custom shader behavior is represented only by portable base-color PBR material data.",
    "Hero binding, backend dropdown registration, runtime switching and deployment were not performed.",
  ],
};
writeFileSync(join(output, "normalization.json"), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
writeFileSync(join(output, "validation", "structural.json"), JSON.stringify({
  schema: "ggd.rezero-static-component-validation@1",
  candidateId,
  sourceId: "thunderstore-rezero",
  glb: receipt.output,
  conversionReceipt: { path: conversionPath, sha256: sha256(readFileSync(conversionPath)) },
  khronosIssues: receipt.khronosIssues,
  ggdInspection: {
    triangles: after.triangles,
    drawPrimitives: after.meshes,
    skinnedPrimitives: after.skinnedPrimitives,
    skinCount: after.skins,
    joints: receipt.output.joints,
    textureCount: after.textures.length,
    textures: after.textures,
    clipCount: after.clips.length,
    clips: after.clips,
    budget,
  },
  finiteFloatAccessors: receipt.finiteFloatAccessors,
  allAccessorBytesPreserved: true,
  structuralValidationPassed: true,
  visualValidationPassed: false,
  runtimeReady: false,
  runtimeSelectable: false,
  defaultEligible: false,
  limitations: receipt.limitations,
}, null, 2) + "\n", { flag: "wx" });

console.log(JSON.stringify({
  candidateId,
  output: receipt.output,
  khronosErrors: receipt.khronosIssues.numErrors,
  khronosWarnings: receipt.khronosIssues.numWarnings,
  finiteFloatValueCount,
  budget,
}));
