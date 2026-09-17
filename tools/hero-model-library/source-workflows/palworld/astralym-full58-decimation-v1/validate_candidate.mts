import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HERO_MODEL_ADOPTION_POLICY, HERO_MODEL_BUDGET } from "../../../../../packages/shared/src/content/modelUpload/budget";
import { MODEL_UPLOAD_LIMITS } from "../../../../../packages/shared/src/content/modelUpload/glb";
import { heroModelBudgetIssues } from "../../../../../packages/shared/src/content/modelUpload/heroModel";
import { inspectModelUpload } from "../../../../../packages/shared/src/content/modelUpload/inspect";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../../..");
const WORKSPACE = path.dirname(ROOT);
const SOURCE = path.join(WORKSPACE, "GGD-Asset-Library/conversions/palworld-astralym-materials-20260911/astralym-material-bound.glb");
const CANDIDATE = path.join(WORKSPACE, "GGD-Asset-Library/conversions/palworld-astralym-full58-decimation-v1/final/astralym-full58-256-decimated.glb");
const EXPECTED_SOURCE = "5178b51b17783acaab5542b5cb50483b3f85110dc915803a5fd0682afba6baaf";
const EXPECTED_CANDIDATE = "d45146e882628fe8bbf635727ad272ff8f82238cf36b4d5f481dbbf0d9b45874";
const VISUAL = path.join(ROOT, "materials/hero-model-library/priority-evidence/palworld-astralym-full58-decimation-v1/visual-comparison.json");
const OUTPUT = path.join(ROOT, "materials/hero-model-library/priority-evidence/palworld-astralym-full58-decimation-v1/validation.json");
const CHECK = process.argv.includes("--check");
const sha256 = (bytes: Uint8Array | Buffer) => createHash("sha256").update(bytes).digest("hex");
type Json = Record<string, any>;

function parse(bytes: Uint8Array): { json: Json; bin: Uint8Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x46546c67); assert.equal(view.getUint32(4, true), 2);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).trim());
  const binAt = 20 + jsonLength; assert.equal(view.getUint32(binAt + 4, true), 0x004e4942);
  return { json, bin: bytes.subarray(binAt + 8, binAt + 8 + view.getUint32(binAt, true)) };
}

const COMPONENT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
function accessorBytes(glb: { json: Json; bin: Uint8Array }, index: number): Uint8Array {
  const accessor = glb.json.accessors[index];
  assert(accessor && accessor.bufferView !== undefined && !accessor.sparse, `unsupported accessor ${index}`);
  const bufferView = glb.json.bufferViews[accessor.bufferView];
  const elementBytes = COMPONENT_BYTES[accessor.componentType] * COMPONENTS[accessor.type];
  const stride = bufferView.byteStride ?? elementBytes;
  const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const output = new Uint8Array(accessor.count * elementBytes);
  for (let row = 0; row < accessor.count; row++) {
    output.set(glb.bin.subarray(start + row * stride, start + row * stride + elementBytes), row * elementBytes);
  }
  return output;
}

function animationProof(source: ReturnType<typeof parse>, candidate: ReturnType<typeof parse>) {
  const before = source.json.animations ?? [], after = candidate.json.animations ?? [];
  assert.equal(before.length, 58); assert.equal(after.length, 58);
  const rows = [];
  for (let index = 0; index < before.length; index++) {
    const a = before[index], b = after[index];
    assert.equal(b.name, a.name); assert.equal(b.channels.length, a.channels.length); assert.equal(b.samplers.length, a.samplers.length);
    for (let channel = 0; channel < a.channels.length; channel++) {
      assert.deepEqual(b.channels[channel].target, a.channels[channel].target, `${a.name} channel target changed`);
      assert.equal(b.channels[channel].sampler, a.channels[channel].sampler, `${a.name} sampler reference changed`);
    }
    for (let sampler = 0; sampler < a.samplers.length; sampler++) {
      const x = a.samplers[sampler], y = b.samplers[sampler];
      assert.equal(y.interpolation ?? "LINEAR", x.interpolation ?? "LINEAR", `${a.name} interpolation changed`);
      assert.equal(sha256(accessorBytes(candidate, y.input)), sha256(accessorBytes(source, x.input)), `${a.name} input samples changed`);
      assert.equal(sha256(accessorBytes(candidate, y.output)), sha256(accessorBytes(source, x.output)), `${a.name} output samples changed`);
    }
    rows.push({ name: a.name, channels: a.channels.length, samplerCount: a.samplers.length, inputAndOutputAccessorSamplesExact: true });
  }
  return rows;
}

const sourceBytes = new Uint8Array(fs.readFileSync(SOURCE));
const candidateBytes = new Uint8Array(fs.readFileSync(CANDIDATE));
assert.equal(sha256(sourceBytes), EXPECTED_SOURCE); assert.equal(sha256(candidateBytes), EXPECTED_CANDIDATE);
const source = parse(sourceBytes), candidate = parse(candidateBytes);
assert.deepEqual(candidate.json.nodes, source.json.nodes, "node hierarchy or transforms changed");
assert.deepEqual(candidate.json.scenes, source.json.scenes, "scenes changed");
assert.equal(candidate.json.scene, source.json.scene, "default scene changed");
assert.deepEqual(candidate.json.skins, source.json.skins, "skin joint structure changed");
assert.deepEqual(
  candidate.json.materials.map((material: Json) => ({ name: material.name, extras: material.extras })),
  source.json.materials.map((material: Json) => ({ name: material.name, extras: material.extras })),
  "material names or OP.GG provenance bindings changed",
);
for (let skin = 0; skin < source.json.skins.length; skin++) {
  assert.equal(
    sha256(accessorBytes(candidate, candidate.json.skins[skin].inverseBindMatrices)),
    sha256(accessorBytes(source, source.json.skins[skin].inverseBindMatrices)),
    "inverse bind matrices changed",
  );
}
const animations = animationProof(source, candidate);
const inspection = await inspectModelUpload(candidateBytes);
const budget = heroModelBudgetIssues(inspection);
assert.deepEqual(budget.errors, [], "GGD budget failed");
assert.equal(inspection.triangles, 7896); assert.equal(inspection.meshes, 3);
assert.equal(inspection.skins, 1); assert.equal(inspection.skinnedPrimitives, 3);
assert.equal(inspection.clips.length, 58); assert.equal(Math.max(...inspection.clips.map((clip) => clip.channels)), 435);
assert.equal(Math.max(...inspection.textures.flatMap((texture) => [texture.width, texture.height])), 256);
assert.equal(inspection.triangles <= HERO_MODEL_ADOPTION_POLICY.decimatedTargetTrianglesMax, true);
const validator = createRequire(path.join(ROOT, "packages/shared/package.json"))("gltf-validator");
const khronos = await validator.validateBytes(candidateBytes, { uri: path.basename(CANDIDATE), maxIssues: 0, writeTimestamp: false });
assert.equal(khronos.issues.numErrors, 0, "Khronos errors"); assert.equal(khronos.issues.truncated, false, "Khronos output truncated");
const visual = JSON.parse(fs.readFileSync(VISUAL, "utf8"));
assert.equal(visual.source.sha256, EXPECTED_SOURCE); assert.equal(visual.candidate.sha256, EXPECTED_CANDIDATE);
assert.equal(visual.allChangedPixelPctAtChannelDeltaGt10Under5, true); assert.equal(visual.allLitClassificationXorPctAtLuma128Under5, true);
assert.equal(visual.humanReview.result, "accepted");

const result = {
  schema: "ggd-palworld-astralym-full58-validation@1",
  source: { path: SOURCE, bytes: sourceBytes.length, sha256: EXPECTED_SOURCE },
  candidate: { path: CANDIDATE, bytes: candidateBytes.length, sha256: EXPECTED_CANDIDATE },
  currentLimits: { upload: MODEL_UPLOAD_LIMITS, hero: HERO_MODEL_BUDGET, adoption: HERO_MODEL_ADOPTION_POLICY },
  measured: {
    triangles: inspection.triangles, drawPrimitives: inspection.meshes, textures: inspection.textures,
    skins: inspection.skins, skinnedPrimitives: inspection.skinnedPrimitives,
    jointCounts: inspection.json.skins?.map((skin) => skin.joints.length) ?? [],
    clips: inspection.clips, maxClipChannels: 435,
  },
  preservation: {
    nodeHierarchyTransformsAndScenesExact: true,
    skinJointsAndInverseBindMatricesExact: true,
    materialNamesAndOpggProvenanceBindingsExact: true,
    materialJsonCanonicalizedByPinnedGltfTransform: true,
    renderingSemanticsAcceptedByRepresentativeAB: true,
    nativeAnimationCount: animations.length,
    nativeAnimationAccessorSamplesExact: true,
    generatedAnimations: 0,
    retargetedAnimations: 0,
    animations,
  },
  khronos: { errors: khronos.issues.numErrors, warnings: khronos.issues.numWarnings, infos: khronos.issues.numInfos, hints: khronos.issues.numHints, truncated: khronos.issues.truncated },
  budget,
  visual: { path: path.relative(ROOT, VISUAL), sha256: sha256(fs.readFileSync(VISUAL)), maxChangedPixelPct: visual.maxChangedPixelPctAtChannelDeltaGt10, maxLitXorPct: visual.maxLitClassificationXorPctAtLuma128, humanReview: visual.humanReview },
  readiness: "validated-independent-full-motion-component-pending-registration",
  semanticUse: {
    existingReviewedClipMap: { idle: "Idle", run: "Walk", attack: "FarSkill_Action", cast: "HaloBeam_Loop", hurt: "Damage", death: "Damage" },
    deathFallback: "No native Death clip. Damage plus the owner-authorized ascend/fade presentation remains a declared fallback.",
  },
  productionDeploymentVerified: false,
};
const encoded = JSON.stringify(result, null, 2) + "\n";
if (CHECK) {
  assert.equal(fs.readFileSync(OUTPUT, "utf8"), encoded, "stale validation receipt");
  console.log("Astralym full58 validation current");
} else {
  fs.writeFileSync(OUTPUT, encoded);
  console.log(JSON.stringify({ candidate: result.candidate, khronos: result.khronos, budget: result.budget, visual: result.visual }));
}
