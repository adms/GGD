import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

import { HERO_MODEL_ADOPTION_POLICY, HERO_MODEL_BUDGET } from "../../../../packages/shared/src/content/modelUpload/budget";
import { heroModelBudgetIssues } from "../../../../packages/shared/src/content/modelUpload/heroModel";
import { inspectModelUpload } from "../../../../packages/shared/src/content/modelUpload/inspect";
import { readFloatAccessor } from "../../../../packages/shared/src/content/modelUpload/glb";
import { measureGlb, readGlb } from "../../../model-budget/glb";
import { checkRig } from "../../../model-budget/rig";

const [sourceArg, candidateArg, rebuildArg, conversionArg, drawAuditArg, outputArg] = process.argv.slice(2);
if (!outputArg) throw new Error("usage: validate_candidate.mts <source> <candidate> <rebuild> <conversion> <draw-audit> <output>");
const source = resolve(sourceArg!), candidate = resolve(candidateArg!), rebuild = resolve(rebuildArg!);
const conversionPath = resolve(conversionArg!), drawAuditPath = resolve(drawAuditArg!), output = resolve(outputArg);
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const sourceBytes = readFileSync(source), candidateBytes = readFileSync(candidate), rebuildBytes = readFileSync(rebuild);
const conversion = JSON.parse(readFileSync(conversionPath, "utf8"));
const drawAudit = JSON.parse(readFileSync(drawAuditPath, "utf8"));
assert.equal(sha(sourceBytes), conversion.input.sha256);
assert.equal(sha(candidateBytes), conversion.output.sha256);
assert.equal(sha(rebuildBytes), conversion.rebuild.sha256);
assert.deepEqual(candidateBytes, rebuildBytes, "independent rebuild differs");

const require = createRequire(join(resolve("."), "packages/shared/package.json"));
const validator = require("gltf-validator");
const khronos = await validator.validateBytes(new Uint8Array(candidateBytes), {
  uri: candidate, maxIssues: 0, writeTimestamp: false,
  externalResourceFunction: async () => { throw new Error("external resources prohibited"); },
});
assert.equal(khronos.issues.numErrors, 0);
assert.equal(khronos.issues.truncated, false);
const khronosCodes = Object.fromEntries(
  [...new Set(khronos.issues.messages.map((issue: {code: string}) => issue.code))]
    .sort()
    .map((code) => [code, khronos.issues.messages.filter((issue: {code: string}) => issue.code === code).length]),
);

// The preserved extraction is intentionally larger than the 32 MiB upload
// ceiling.  Read it with the offline analyser; only the reduced candidate is
// expected to pass the actual upload parser.
const beforeGlb = readGlb(source);
assert(beforeGlb.bin, "source GLB has no BIN chunk");
const beforeMetrics = measureGlb(source);
const after = await inspectModelUpload(new Uint8Array(candidateBytes));
const rig = checkRig(source, candidate, "fewer");
assert.equal(rig.ok, true, rig.reasons.join("; "));
assert.equal(after.triangles <= HERO_MODEL_ADOPTION_POLICY.decimatedTargetTrianglesMax, true);
assert.equal(Math.max(...after.textures.flatMap((row) => [row.width, row.height])) <= HERO_MODEL_BUDGET.texEdge.limit, true);
assert.equal(after.meshes, 20);
assert.equal(after.skins, 1);
assert.equal(after.skinnedPrimitives, after.meshes);
assert.equal(after.clips.length, 0);
assert.equal(drawAudit.decision.safeCurrentAutomationCanReachSix, false);

const jsonShape = (model: {json: any}) => ({
  scenes: model.json.scenes,
  nodes: (model.json.nodes ?? []).map((node: any) => ({
    name: node.name ?? null, children: node.children ?? [], mesh: node.mesh ?? null, skin: node.skin ?? null,
    translation: node.translation ?? [0, 0, 0], rotation: node.rotation ?? [0, 0, 0, 1], scale: node.scale ?? [1, 1, 1], matrix: node.matrix ?? null,
  })),
  meshPrimitives: (model.json.meshes ?? []).map((mesh: any) => mesh.primitives.map((primitive: any) => ({
    material: primitive.material ?? null, mode: primitive.mode ?? 4, attributes: Object.keys(primitive.attributes).sort(),
  }))),
  skins: (model.json.skins ?? []).map((skin: any) => ({joints: skin.joints, skeleton: skin.skeleton ?? null})),
  materials: (model.json.materials ?? []).map((m: any) => ({
    name: m.name ?? null, alphaMode: m.alphaMode ?? "OPAQUE", alphaCutoff: m.alphaCutoff ?? 0.5,
    doubleSided: m.doubleSided ?? false, emissiveFactor: m.emissiveFactor ?? [0, 0, 0],
    normalTexture: m.normalTexture ?? null, occlusionTexture: m.occlusionTexture ?? null, emissiveTexture: m.emissiveTexture ?? null,
    pbrMetallicRoughness: {
      baseColorFactor: m.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1],
      baseColorTexture: m.pbrMetallicRoughness?.baseColorTexture ?? null,
      metallicFactor: m.pbrMetallicRoughness?.metallicFactor ?? 1,
      roughnessFactor: m.pbrMetallicRoughness?.roughnessFactor ?? 1,
      metallicRoughnessTexture: m.pbrMetallicRoughness?.metallicRoughnessTexture ?? null,
    },
  })),
  textures: model.json.textures,
  samplers: model.json.samplers,
});
assert.deepEqual(jsonShape(beforeGlb), jsonShape(after), "node/material/primitive semantics changed");

const ibm = (model: {json: any; bin: Uint8Array | Buffer}) => (model.json.skins ?? []).map((skin: any) =>
  Array.from(readFloatAccessor(model.json, model.bin, skin.inverseBindMatrices)));
assert.deepEqual(ibm({json: beforeGlb.json, bin: beforeGlb.bin}), ibm(after), "inverse bind matrices changed");
let floatAccessors = 0, floatValues = 0;
for (let index = 0; index < after.json.accessors.length; index++) {
  if (after.json.accessors[index]!.componentType !== 5126) continue;
  const values = readFloatAccessor(after.json, after.bin, index);
  for (const value of values) assert(Number.isFinite(value), `accessor ${index} contains non-finite value`);
  floatAccessors++; floatValues += values.length;
}
const budget = heroModelBudgetIssues(after);
assert.deepEqual(budget.errors, [`繪製網格 20 超過英雄模型上限 ${HERO_MODEL_BUDGET.meshes.limit}。`]);
const result = {
  schema: "ggd.jump-force-dai-decimation-validation@1",
  candidateId: conversion.candidateId,
  source: {absolutePath: source, bytes: sourceBytes.length, sha256: sha(sourceBytes)},
  candidate: {absolutePath: candidate, bytes: candidateBytes.length, sha256: sha(candidateBytes)},
  deterministicRebuild: {absolutePath: rebuild, byteIdentical: true, sha256: sha(rebuildBytes)},
  metrics: {
    before: {triangles: beforeMetrics.triangles, drawPrimitives: beforeMetrics.meshes, maxTextureEdge: beforeMetrics.maxTextureEdge, skins: beforeMetrics.skins, joints: rig.before.joints, textures: beforeMetrics.images.length, clips: beforeMetrics.clips},
    after: {triangles: after.triangles, drawPrimitives: after.meshes, maxTextureEdge: Math.max(...after.textures.flatMap((x) => [x.width, x.height])), skins: after.skins, joints: rig.after.joints, textures: after.textures.length, clips: after.clips.length},
  },
  preservation: {
    rig, nodeHierarchyAndTransformsEquivalent: true, skinJointsAndInverseBindMatricesExact: true,
    materialTextureSlotAndPrimitiveAssignmentsEquivalent: true, allRenderedPrimitivesRemainSkinned: true,
    sourceAndCandidateAnimationCount: 0,
  },
  finiteFloatAccessors: {passed: true, accessorCount: floatAccessors, valueCount: floatValues},
  khronos: {validator: "gltf-validator@2.0.0-dev.3.10", errors: 0, warnings: khronos.issues.numWarnings, infos: khronos.issues.numInfos, truncated: false, issueCodeCounts: khronosCodes},
  currentPolicy: {
    geometryAdoptionPassed: true, textureEdgePassed: true, drawCallPassed: false,
    errors: budget.errors, warnings: budget.warnings,
  },
  readiness: "geometry-and-texture-validated; draw-call-hard-blocked; no-six-state-motion",
  componentAcceptedForGitRuntime: false,
  backendRegistered: false, runtimeSelectable: false, productionDeployed: false,
  evidence: {
    conversion: {gitOrLocalPath: conversionPath, bytes: readFileSync(conversionPath).length, sha256: sha(readFileSync(conversionPath))},
    drawCallAudit: {gitOrLocalPath: drawAuditPath, bytes: readFileSync(drawAuditPath).length, sha256: sha(readFileSync(drawAuditPath))},
  },
};
mkdirSync(dirname(output), {recursive: true});
writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({triangles: after.triangles, drawPrimitives: after.meshes, textureEdge: result.metrics.after.maxTextureEdge, khronosErrors: 0, blockingErrors: budget.errors}));
