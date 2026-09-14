/** Validate an unbound MBA six-state candidate without registering a hero. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const [glbArgument, clipsArgument, outputArgument] = process.argv.slice(2);
if (!glbArgument || !clipsArgument || !outputArgument) throw new Error("Usage: validate.mts <body.glb> <six-state-clips.json> <validation.json>");
const repo = resolve(".");
const glbPath = resolve(glbArgument);
const bytes = readFileSync(glbPath);
const expected = JSON.parse(readFileSync(resolve(clipsArgument), "utf8")) as Record<string, string>;
assert.deepEqual(Object.keys(expected).sort(), ["attack", "cast", "death", "hurt", "idle", "run"]);
const digest = createHash("sha256").update(bytes).digest("hex");
const require = createRequire(join(repo, "packages/shared/package.json"));
const validator = require("gltf-validator");
const { inspectModelUpload } = await import(join(repo, "packages/shared/src/content/modelUpload/inspect.ts"));
const { heroModelBudgetIssues } = await import(join(repo, "packages/shared/src/content/modelUpload/heroModel.ts"));
const { readFloatAccessor } = await import(join(repo, "packages/shared/src/content/modelUpload/glb.ts"));
const khronos = await validator.validateBytes(new Uint8Array(bytes), { uri: glbPath, maxIssues: 0, writeTimestamp: false, externalResourceFunction: async () => { throw new Error("External resources prohibited"); } });
assert.equal(khronos.issues.numErrors, 0, "Khronos validation errors");
assert.equal(khronos.issues.truncated, false, "Khronos validation report truncated");
const inspection = await inspectModelUpload(new Uint8Array(bytes));
const budget = heroModelBudgetIssues(inspection);
assert.deepEqual(budget.errors, [], "GGD model hard-budget errors");
assert.equal(inspection.skins, 1, "Expected exactly one native skin");
assert.equal(inspection.skinnedPrimitives, inspection.meshes, "Every rendered primitive must be skinned");
assert.deepEqual(inspection.clips.map((clip: { name: string }) => clip.name).sort(), Object.values(expected).sort(), "Selected native clips changed");
let accessorCount = 0, valueCount = 0;
for (let index = 0; index < inspection.json.accessors.length; index++) {
  if (inspection.json.accessors[index]!.componentType !== 5126) continue;
  for (const value of readFloatAccessor(inspection.json, inspection.bin, index)) assert(Number.isFinite(value), `Non-finite float accessor ${index}`);
  accessorCount++; valueCount += inspection.json.accessors[index]!.count;
}
const result = {
  schema: "ggd.mba-unused-native-six-state-validation@1", glb: { path: glbPath, bytes: bytes.length, sha256: digest },
  selectedNativeClips: expected, validator: "gltf-validator@2.0.0-dev.3.10", khronosIssues: khronos.issues,
  ggdInspection: { triangles: inspection.triangles, drawPrimitives: inspection.meshes, skinnedPrimitives: inspection.skinnedPrimitives, skinCount: inspection.skins, jointCount: inspection.json.skins?.[0]?.joints.length ?? 0, textureCount: inspection.textures.length, textures: inspection.textures, clips: inspection.clips, budget },
  finiteFloatAccessors: { passed: true, accessorCount, valueCount }, structuralValidationPassed: true,
  visualAcceptance: "pending-owner-review", runtimeRegistrationPerformed: false, runtimeSelectable: false, productionDeploymentVerified: false,
};
mkdirSync(dirname(resolve(outputArgument)), { recursive: true });
writeFileSync(resolve(outputArgument), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output: resolve(outputArgument), sha256: digest, triangles: inspection.triangles, draws: inspection.meshes, clips: inspection.clips.length, khronosErrors: khronos.issues.numErrors, khronosWarnings: khronos.issues.numWarnings, budgetErrors: budget.errors.length, budgetWarnings: budget.warnings.length }));
