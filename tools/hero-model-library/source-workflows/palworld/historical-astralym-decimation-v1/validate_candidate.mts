import assert from "node:assert/strict";
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
// ⭐ PR #1152 合併準備（2026-09-14）：減面產物之後又做過貼圖背板修補（出貨版本 7d8264d1…）。
//   這支驗的是**減面**這一步 ⇒ 讀逐位元組封存的減面產物；修補只動貼圖位元組，由
//   tools/model-fix/record_backdrop_repairs.py 的證明與 historical_components.py 守著。
const CANDIDATE = path.join(ROOT, "materials/hero-model-library/source-artifacts/historical-model-recovery-7bc2fa3f8/f77cf1ee8dd52cd14e75356f424034f2f8e866d3adafc70642a9f4efed36c2a7.glb");
const VISUAL = path.join(ROOT, "materials/hero-model-library/priority-evidence/historical-model-recovery/historical-astralym-decimation-v1/visual-comparison.json");
const OUTPUT = path.join(ROOT, "materials/hero-model-library/priority-evidence/historical-model-recovery/historical-astralym-decimation-v1/validation.json");
const LOCAL_SOURCE = "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/conversions/historical-model-recovery-7bc2fa3f8/restored/618a52817f4fe563ddf339563856180c3acb27106d5fdb839fb469c642495ea8.glb";
const LOCAL_CANDIDATE = "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/conversions/historical-astralym-decimation-v1/final/f77cf1ee8dd52cd14e75356f424034f2f8e866d3adafc70642a9f4efed36c2a7.glb";
const EXPECTED_SOURCE = "618a52817f4fe563ddf339563856180c3acb27106d5fdb839fb469c642495ea8";
const EXPECTED_CANDIDATE = "f77cf1ee8dd52cd14e75356f424034f2f8e866d3adafc70642a9f4efed36c2a7";
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
  assert.deepEqual(images(after), images(before), "embedded images changed");
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
  return { nodeHierarchyAndTransformsExact: true, materialDefinitionsExact: true, embeddedImagesExact: true,
    skinJointsAndInverseBindMatricesExact: true, allNonIndexVertexAttributesExact: true,
    animationChannelsAndKeyValuesExact: true, primitiveRecords, images: images(after) };
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
    candidateId: "historical-astralym-decimated-f77cf1ee",
    heroId: "acquired-astralym",
    originalRetained: { git: pin(SOURCE), local: localPin(LOCAL_SOURCE) },
    candidate: { git: pin(CANDIDATE), local: localPin(LOCAL_CANDIDATE) },
    parameters: { tool: "tools/model-budget/optimize/decimate-emissive-lock.mjs", target: 7900, actualTriangles: candidate.triangles, emissiveThreshold: 192, errorBound: 0.02, lockBorder: true },
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
