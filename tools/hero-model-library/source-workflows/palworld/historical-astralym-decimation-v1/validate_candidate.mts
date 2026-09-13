import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { inspectModelUpload } from "../../../../../packages/shared/src/content/modelUpload/inspect";
import { heroModelBudgetIssues } from "../../../../../packages/shared/src/content/modelUpload/heroModel";
import adoptionPolicy from "../../../../../packages/shared/src/content/modelUpload/adoptionPolicy.json" with { type: "json" };
import { checkRig } from "../../../../model-budget/rig";
import { imageBytes, readGlb, readImages } from "../../../../model-budget/glb";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../../..");
const CHECK = process.argv.includes("--check");
const SOURCE = path.join(ROOT, "content/assets/models/community/618a52817f4fe563ddf339563856180c3acb27106d5fdb839fb469c642495ea8.glb");
const CANDIDATE = path.join(ROOT, "content/assets/models/community/c45f111dfef172872db990ee8c40161bfba4a9e38f36a95951273ba0ebd0b71f.glb");
const VISUAL = path.join(ROOT, "materials/hero-model-library/priority-evidence/historical-model-recovery/historical-astralym-decimation-v1/visual-comparison.json");
const OUTPUT = path.join(ROOT, "materials/hero-model-library/priority-evidence/historical-model-recovery/historical-astralym-decimation-v1/validation.json");
const LOCAL_SOURCE = "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/conversions/historical-model-recovery-7bc2fa3f8/restored/618a52817f4fe563ddf339563856180c3acb27106d5fdb839fb469c642495ea8.glb";
const LOCAL_CANDIDATE = "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/conversions/historical-astralym-decimation-v1/final/c45f111dfef172872db990ee8c40161bfba4a9e38f36a95951273ba0ebd0b71f.glb";
const EXPECTED_SOURCE = "618a52817f4fe563ddf339563856180c3acb27106d5fdb839fb469c642495ea8";
const EXPECTED_CANDIDATE = "c45f111dfef172872db990ee8c40161bfba4a9e38f36a95951273ba0ebd0b71f";
const CLIPS = ["Idle", "Walk", "FarSkill_Action", "HaloBeam_Loop", "Damage"];

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const pin = (file: string) => ({ path: path.relative(ROOT, file).split(path.sep).join("/"), bytes: fs.statSync(file).size, sha256: digest(fs.readFileSync(file)) });
const localPin = (file: string) => ({ path: file, bytes: fs.statSync(file).size, sha256: digest(fs.readFileSync(file)) });
const encoded = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

const COMPONENT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
function accessorDigest(glb: ReturnType<typeof readGlb>, index: number): string {
  const accessor = glb.json.accessors[index];
  assert(accessor && accessor.bufferView !== undefined && !accessor.sparse, `unsupported accessor ${index}`);
  const view = glb.json.bufferViews[accessor.bufferView];
  const elementBytes = COMPONENT_BYTES[accessor.componentType] * COMPONENTS[accessor.type];
  const stride = view.byteStride ?? elementBytes;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const logical = Buffer.alloc(accessor.count * elementBytes);
  for (let row = 0; row < accessor.count; row++) {
    glb.bin!.copy(logical, row * elementBytes, start + row * stride, start + row * stride + elementBytes);
  }
  return digest(logical);
}

function structuralPreservation(sourceFile: string, candidateFile: string) {
  const before = readGlb(sourceFile), after = readGlb(candidateFile);
  assert.deepEqual(after.json.nodes, before.json.nodes, "node hierarchy/transforms changed");
  assert.deepEqual(after.json.scenes, before.json.scenes, "scene changed");
  assert.deepEqual(after.json.scene, before.json.scene, "default scene changed");
  assert.deepEqual(after.json.materials, before.json.materials, "materials changed");
  assert.deepEqual(after.json.textures, before.json.textures, "texture bindings changed");
  assert.deepEqual(after.json.samplers, before.json.samplers, "samplers changed");
  assert.deepEqual(after.json.skins, before.json.skins, "skin/joint references changed");
  assert.deepEqual(after.json.animations, before.json.animations, "animation channels/samplers changed");
  const images = (glb: typeof before) => readImages(glb).map((image) => ({
    index: image.index, width: image.w, height: image.h, format: image.format,
    bytes: image.diskBytes, sha256: digest(imageBytes(glb, image)),
  }));
  const beforeImages = readImages(before), afterImages = readImages(after);
  assert.equal(afterImages.length, beforeImages.length, "embedded image count changed");
  const imageSanitization = [];
  for (let index = 0; index < beforeImages.length; index++) {
    const a = beforeImages[index], b = afterImages[index];
    assert.equal(b.w, a.w, `image ${index}: width changed`);
    assert.equal(b.h, a.h, `image ${index}: height changed`);
    const sourceBytes = imageBytes(before, a), candidateBytes = imageBytes(after, b);
    if (digest(sourceBytes) === digest(candidateBytes)) continue;
    const decode = (bytes: Uint8Array) => execFileSync(
      "ffmpeg", ["-loglevel", "error", "-i", "pipe:0", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"],
      { input: bytes, maxBuffer: a.w * a.h * 4 + 1024 },
    );
    const sourcePixels = decode(sourceBytes), candidatePixels = decode(candidateBytes);
    assert.equal(candidatePixels.length, sourcePixels.length, `image ${index}: decoded length changed`);
    let clearedPixels = 0;
    for (let offset = 0; offset < sourcePixels.length; offset += 4) {
      assert.equal(candidatePixels[offset + 3], sourcePixels[offset + 3], `image ${index}: alpha changed`);
      if (sourcePixels[offset + 3] > 5) {
        for (let channel = 0; channel < 3; channel++) assert.equal(candidatePixels[offset + channel], sourcePixels[offset + channel], `image ${index}: visible RGB changed`);
      } else if (Math.max(sourcePixels[offset], sourcePixels[offset + 1], sourcePixels[offset + 2]) > 8) {
        assert.deepEqual([...candidatePixels.subarray(offset, offset + 3)], [0, 0, 0], `image ${index}: hidden bright RGB not cleared`);
        clearedPixels++;
      } else {
        for (let channel = 0; channel < 3; channel++) assert.equal(candidatePixels[offset + channel], sourcePixels[offset + channel], `image ${index}: unrelated hidden RGB changed`);
      }
    }
    imageSanitization.push({ imageIndex: index, width: a.w, height: a.h, clearedPixels, alphaValuesChanged: 0, visiblePixelsChanged: 0 });
  }
  assert.deepEqual(imageSanitization.map((row) => row.clearedPixels).sort((a, b) => a - b), [927, 927, 1428, 1428]);
  const primitiveRecords = [];
  for (let meshIndex = 0; meshIndex < before.json.meshes.length; meshIndex++) {
    const a = before.json.meshes[meshIndex].primitives, b = after.json.meshes[meshIndex].primitives;
    assert.equal(b.length, a.length, `mesh ${meshIndex}: primitive count changed`);
    for (let primitiveIndex = 0; primitiveIndex < a.length; primitiveIndex++) {
      assert.equal(b[primitiveIndex].material, a[primitiveIndex].material, "primitive material changed");
      assert.equal(b[primitiveIndex].mode ?? 4, a[primitiveIndex].mode ?? 4, "primitive mode changed");
      assert.deepEqual(Object.keys(b[primitiveIndex].attributes).sort(), Object.keys(a[primitiveIndex].attributes).sort(), "primitive attributes changed");
      for (const semantic of Object.keys(a[primitiveIndex].attributes)) {
        assert.equal(accessorDigest(after, b[primitiveIndex].attributes[semantic]), accessorDigest(before, a[primitiveIndex].attributes[semantic]), `${semantic} values changed`);
      }
      primitiveRecords.push({ meshIndex, primitiveIndex, material: a[primitiveIndex].material,
        trianglesBefore: before.json.accessors[a[primitiveIndex].indices].count / 3,
        trianglesAfter: after.json.accessors[b[primitiveIndex].indices].count / 3,
        preservedAttributeSemantics: Object.keys(a[primitiveIndex].attributes).sort() });
    }
  }
  for (let skinIndex = 0; skinIndex < before.json.skins.length; skinIndex++) {
    assert.equal(accessorDigest(after, after.json.skins[skinIndex].inverseBindMatrices), accessorDigest(before, before.json.skins[skinIndex].inverseBindMatrices), "inverse bind matrices changed");
  }
  for (let animationIndex = 0; animationIndex < before.json.animations.length; animationIndex++) {
    for (let samplerIndex = 0; samplerIndex < before.json.animations[animationIndex].samplers.length; samplerIndex++) {
      const a = before.json.animations[animationIndex].samplers[samplerIndex], b = after.json.animations[animationIndex].samplers[samplerIndex];
      assert.equal(accessorDigest(after, b.input), accessorDigest(before, a.input), "animation input keys changed");
      assert.equal(accessorDigest(after, b.output), accessorDigest(before, a.output), "animation output keys changed");
    }
  }
  return { nodeHierarchyAndTransformsExact: true, materialDefinitionsExact: true, embeddedImagesExactExceptTransparentEmissiveRgbSanitization: true,
    skinJointsAndInverseBindMatricesExact: true, allNonIndexVertexAttributesExact: true,
    animationChannelsAndKeyValuesExact: true, primitiveRecords, images: images(after), imageSanitization };
}

async function build() {
  assert.equal(digest(fs.readFileSync(SOURCE)), EXPECTED_SOURCE);
  assert.equal(digest(fs.readFileSync(CANDIDATE)), EXPECTED_CANDIDATE);
  assert.equal(digest(fs.readFileSync(LOCAL_SOURCE)), EXPECTED_SOURCE);
  assert.equal(digest(fs.readFileSync(LOCAL_CANDIDATE)), EXPECTED_CANDIDATE);
  const [source, candidate] = await Promise.all([inspectModelUpload(fs.readFileSync(SOURCE)), inspectModelUpload(fs.readFileSync(CANDIDATE))]);
  const budget = heroModelBudgetIssues(candidate);
  const rig = checkRig(SOURCE, CANDIDATE, "fewer");
  const visual = JSON.parse(fs.readFileSync(VISUAL, "utf8"));
  assert.equal(candidate.report.issues.numErrors, 0, "Khronos errors");
  assert.equal(candidate.report.issues.truncated, false, "Khronos result truncated");
  assert.deepEqual(budget.errors, [], "GGD runtime budget errors");
  assert(candidate.triangles <= adoptionPolicy.hero.decimatedTargetTrianglesMax, "formal adoption triangle target missed");
  assert.equal(rig.ok, true, rig.reasons.join("; "));
  assert.deepEqual(candidate.clips.map((clip) => clip.name), CLIPS, "native clips changed");
  assert.deepEqual(candidate.clips, source.clips, "native clip duration/channel metadata changed");
  assert.equal(visual.candidate.sha256, EXPECTED_CANDIDATE);
  assert.equal(visual.allChangedPixelPctAtChannelDeltaGt10Under5, true);
  assert.equal(visual.allLitClassificationXorPctAtLuma128Under5, true);
  assert.equal(visual.humanReview.result, "accepted");
  const preservation = structuralPreservation(SOURCE, CANDIDATE);
  return {
    schema: "ggd-historical-astralym-decimation-validation@1",
    candidateId: "historical-astralym-decimated-c45f111d",
    heroId: "acquired-astralym",
    originalRetained: { git: pin(SOURCE), local: localPin(LOCAL_SOURCE) },
    candidate: { git: pin(CANDIDATE), local: localPin(LOCAL_CANDIDATE) },
    parameters: { tool: "tools/model-budget/optimize/decimate-emissive-lock.mjs", target: 7900, actualTriangles: candidate.triangles, emissiveThreshold: 192, errorBound: 0.02, lockBorder: true, transparentEmissiveMatteSanitization: { alphaMax: 5, hiddenRgbFloorExclusive: 8 } },
    metrics: { triangles: candidate.triangles, drawPrimitives: candidate.meshes, textures: candidate.textures, skins: candidate.skins, joints: candidate.joints, clips: candidate.clips },
    preservation,
    khronos: candidate.report,
    ggdModelBudget: budget,
    rig,
    directionEvidence: "Default scene, full node hierarchy and every node transform are byte-value identical; five-clip front/back/isometric Babylon samples preserve facing.",
    animationProvenance: { kind: "native-source-clips-preserved", nativeClipCount: 5, nativeClips: CLIPS, generatedClips: 0, retargetedClips: 0 },
    selectedClips: { idle: "Idle", run: "Walk", attack: "FarSkill_Action", cast: "HaloBeam_Loop", hurt: "Damage", death: "Damage" },
    deathPresentation: "Native Damage clip plus authorized runtime ascend/fade fallback; no native Death clip claimed.",
    visualEvidence: pin(VISUAL),
    visualAcceptance: { changedPixelPctMax: visual.maxChangedPixelPctAtChannelDeltaGt10, litClassificationXorPctMax: visual.maxLitClassificationXorPctAtLuma128, contractMaxPct: adoptionPolicy.hero.visualLitPixelDeltaPctMax, humanReview: visual.humanReview },
    formalHeroAdoptionEligible: true,
    runtimeDropdownScope: "non-default-option-only",
    productionDeploymentVerified: false,
  };
}

const result = await build();
const value = encoded(result);
if (CHECK) {
  if (!fs.existsSync(OUTPUT) || fs.readFileSync(OUTPUT, "utf8") !== value) throw new Error(`stale validation: ${path.relative(ROOT, OUTPUT)}`);
  console.log(`historical Astralym decimation validation current (${result.metrics.triangles} triangles)`);
} else {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, value);
  console.log(`wrote ${path.relative(ROOT, OUTPUT)}`);
}
