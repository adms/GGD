import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const sourcePath = join(ROOT, "content/assets/models/community/7727100cdc5fa23b58e173d2cdbd7ca9a08f7c6034e6fc31060e91463603a9a2.glb");
const candidatePath = resolve(process.argv[2] ?? join(ROOT, "../GGD-Asset-Library/conversions/approved-derivative-azazel-wings-v1/azazel-wings-v1.glb"));
const outputPath = resolve(process.argv[3] ?? candidatePath.replace(/\.glb$/, ".validation.json"));
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const source = new Uint8Array(readFileSync(sourcePath));
const candidate = new Uint8Array(readFileSync(candidatePath));
assert.equal(sha256(source), "7727100cdc5fa23b58e173d2cdbd7ca9a08f7c6034e6fc31060e91463603a9a2");

const { inspectModelUpload } = await import(join(ROOT, "packages/shared/src/content/modelUpload/inspect.ts"));
const { heroModelBudgetIssues } = await import(join(ROOT, "packages/shared/src/content/modelUpload/heroModel.ts"));
const { HERO_MODEL_ADOPTION_POLICY, HERO_MODEL_BUDGET } = await import(join(ROOT, "packages/shared/src/content/modelUpload/budget.ts"));
const validator = createRequire(join(ROOT, "packages/shared/package.json"))("gltf-validator");
const before = await inspectModelUpload(source);
const after = await inspectModelUpload(candidate);
const budget = heroModelBudgetIssues(after);
const khronos = await validator.validateBytes(candidate, {
  uri: "azazel-wings-v1.glb", maxIssues: 0, writeTimestamp: false,
  externalResourceFunction: async () => { throw new Error("external resources prohibited"); },
});

assert.deepEqual(budget.errors, []);
// Owner's latest explicit acceptance is <= 8,000 triangles.
assert.ok(after.triangles <= 8_000);
assert.ok(after.meshes <= HERO_MODEL_BUDGET.meshes.limit);
assert.ok(Math.max(...after.textures.flatMap((x: any) => [x.width, x.height])) <= HERO_MODEL_BUDGET.texEdge.limit);
assert.ok(Math.max(...after.clips.map((x: any) => x.channels)) <= HERO_MODEL_BUDGET.channels.limit);
assert.equal(after.skins, before.skins);
assert.equal(after.meshes, before.meshes + 1);
assert.equal(after.skinnedPrimitives, after.meshes);
assert.deepEqual(after.clips, before.clips);
assert.deepEqual(after.json.animations, before.json.animations);
assert.deepEqual(after.json.skins, before.json.skins);
assert.deepEqual(after.json.nodes, before.json.nodes);
assert.deepEqual(after.json.meshes[0].primitives[0], before.json.meshes[0].primitives[0]);
assert.equal(after.json.meshes[0].primitives.length, 2);
assert.equal(after.json.extras?.ggdDerivative?.id, "azazel");
assert.equal(after.json.extras?.ggdAppearanceRevision?.attachmentJoint, "Bip01 Spine1");
assert.equal(after.json.meshes[0].primitives[1].extras?.binding, "100%-rigid-to-Bip01-Spine1");
assert.ok((after.json.images ?? []).every((x: any) => x.uri === undefined));
assert.ok((after.json.buffers ?? []).every((x: any) => x.uri === undefined));
assert.equal(khronos.issues.numErrors, 0);
assert.equal(khronos.issues.numWarnings, 0);
assert.equal(khronos.issues.truncated, false);

const result = {
  schema: "ggd.approved-azazel-wings-validation@1",
  source: { path: sourcePath, sha256: sha256(source), bytes: source.length },
  candidate: { path: candidatePath, sha256: sha256(candidate), bytes: candidate.length },
  metrics: {
    triangles: after.triangles, drawPrimitives: after.meshes, skinnedPrimitives: after.skinnedPrimitives,
    skins: after.skins, joints: after.json.skins?.[0]?.joints.length ?? 0,
    textures: after.textures, maxTextureEdge: Math.max(...after.textures.flatMap((x: any) => [x.width, x.height])),
    clips: after.clips, maxChannelsPerClip: Math.max(...after.clips.map((x: any) => x.channels)),
  },
  policy: { ownerAcceptedTriangleMaximum: 8_000, repositoryAdoptionPolicy: HERO_MODEL_ADOPTION_POLICY, budget: HERO_MODEL_BUDGET, result: budget },
  khronos: { errors: khronos.issues.numErrors, warnings: khronos.issues.numWarnings, infos: khronos.issues.numInfos, hints: khronos.issues.numHints, truncated: khronos.issues.truncated },
  preservation: {
    bodyPrimitiveJsonUnchanged: true, skinJsonUnchanged: true, nodeJsonUnchanged: true,
    animationJsonUnchanged: true, sourceClipInventoryUnchanged: true,
    independentEmbeddedCopy: true, sourceCandidateRetained: true,
  },
  attachment: { primitive: 1, jointName: "Bip01 Spine1", binding: "100%-rigid-to-chest/back-joint", targetCharacterNativeMotion: false },
  status: { converted: true, policyValidated: true, khronosValidated: true, visualReviewed: false, registered: false, selectable: false, deployed: false },
};
writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ triangles: after.triangles, drawPrimitives: after.meshes, maxTextureEdge: result.metrics.maxTextureEdge, maxChannelsPerClip: result.metrics.maxChannelsPerClip, khronos: result.khronos }));
