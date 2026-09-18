import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { existsSync, linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

import { resizeImageWithFfmpeg } from "../../../../apps/content-api/src/resizeImage.node";
import { fileJson } from "../../../../packages/shared/src/content/node";
import { HERO_MODEL_ADOPTION_POLICY, HERO_MODEL_BUDGET } from "../../../../packages/shared/src/content/modelUpload/budget";
import { prepareUploadedHeroModel, verifyUploadedHeroModel } from "../../../../packages/shared/src/content/modelUpload/heroModel";
import { inspectModelUpload } from "../../../../packages/shared/src/content/modelUpload/inspect";

const STATES = ["idle", "run", "attack", "cast", "hurt", "death"] as const;

function parseArgs() {
  const args = process.argv.slice(2), values: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (!key?.startsWith("--") || !value) throw new Error("usage: prepare_runtime_candidate.mts --repo REPO --input MODEL.glb --selections FILE.json --metadata FILE.json --output DIR --mode plan|apply");
    values[key.slice(2)] = value;
  }
  for (const key of ["repo", "input", "selections", "metadata", "output", "mode"]) assert.ok(values[key], `missing --${key}`);
  assert.ok(["plan", "apply"].includes(values.mode!), "--mode must be plan or apply");
  return values as Record<"repo" | "input" | "selections" | "metadata" | "output" | "mode", string>;
}

function sha(path: string) {
  const bytes = readFileSync(path);
  return { absolutePath: resolve(path), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function publish(path: string, bytes: Uint8Array) {
  if (existsSync(path)) {
    assert.deepEqual(new Uint8Array(readFileSync(path)), bytes, `refusing to overwrite different artifact: ${path}`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, bytes, { flag: "wx" }); linkSync(temporary, path); }
  finally { rmSync(temporary, { force: true }); }
}

const args = parseArgs();
const repo = resolve(args.repo), input = resolve(args.input), output = resolve(args.output);
const metadata = JSON.parse(readFileSync(resolve(args.metadata), "utf8"));
assert.equal(metadata.schema, "ggd.jstars-runtime-candidate-metadata@1");
assert.equal(metadata.identityVerified, true, "native character identity is not verified");
assert.ok(metadata.nativeCharacterId && metadata.sourceId && metadata.heroId, "nativeCharacterId/sourceId/heroId are required");
const selections = JSON.parse(readFileSync(resolve(args.selections), "utf8"));
for (const state of STATES) assert.ok(Number.isInteger(selections[state]) && selections[state] >= 0, `missing non-negative ${state} animation index`);

const originalBytes = new Uint8Array(readFileSync(input));
const inspectedOriginal = await inspectModelUpload(originalBytes);
assert.ok(inspectedOriginal.clips.length > 0, "converted GLB has no native or authored animation clips");
for (const state of STATES) assert.ok(selections[state] < inspectedOriginal.clips.length, `${state} animation index is outside the converted GLB clip list`);
const needsDecimation = inspectedOriginal.triangles > HERO_MODEL_ADOPTION_POLICY.decimateWhenTrianglesAbove;
const optimizerOutput = join(output, "optimizer");
const optimizerCommand = [
  "node", "--import", "tsx", join(repo, "tools/model-budget/optimize.ts"), input,
  "--role", "champion", "--geometry", "--tex-edge", String(HERO_MODEL_BUDGET.texEdge.limit),
  "--out", optimizerOutput, "--apply", "--json",
];
const plan = {
  schema: "ggd.jstars-runtime-model-plan@1",
  source: metadata,
  input: sha(input),
  measured: {
    triangles: inspectedOriginal.triangles,
    drawPrimitives: inspectedOriginal.meshes,
    skins: inspectedOriginal.skins,
    skinnedPrimitives: inspectedOriginal.skinnedPrimitives,
    clips: inspectedOriginal.clips,
    textures: inspectedOriginal.textures,
  },
  policy: {
    decimateWhenTrianglesAbove: HERO_MODEL_ADOPTION_POLICY.decimateWhenTrianglesAbove,
    decimatedTargetTrianglesMax: HERO_MODEL_ADOPTION_POLICY.decimatedTargetTrianglesMax,
    textureEdgeMax: HERO_MODEL_BUDGET.texEdge.limit,
  },
  needsDecimation,
  optimizerCommand: needsDecimation ? optimizerCommand : null,
  officialPipeline: ["tools/model-budget/optimize.ts", "prepareUploadedHeroModel", "verifyUploadedHeroModel"],
  output,
  apply: args.mode === "apply",
};
if (args.mode === "plan") {
  process.stdout.write(JSON.stringify({ ...plan, status: needsDecimation ? "planned-official-decimation-before-preparation" : "planned-official-preparation" }, null, 2) + "\n");
  process.exit(0);
}

let preparedInput = input;
if (needsDecimation) {
  execFileSync(optimizerCommand[0]!, optimizerCommand.slice(1), { cwd: repo, stdio: ["ignore", "pipe", "pipe"] });
  const optimized = join(optimizerOutput, basename(input));
  assert.ok(existsSync(optimized), "official optimizer did not produce a candidate; geometry dependency or rig checks may have blocked it");
  const optimizedInspection = await inspectModelUpload(new Uint8Array(readFileSync(optimized)));
  assert.ok(optimizedInspection.triangles <= HERO_MODEL_ADOPTION_POLICY.decimatedTargetTrianglesMax,
    `decimated candidate has ${optimizedInspection.triangles} triangles; expected <= ${HERO_MODEL_ADOPTION_POLICY.decimatedTargetTrianglesMax}`);
  preparedInput = optimized;
}
const prepared = await prepareUploadedHeroModel(
  new Uint8Array(readFileSync(preparedInput)), selections, Number(metadata.yawOffsetDeg ?? 0), { resizeImage: resizeImageWithFfmpeg },
);
const verified = await verifyUploadedHeroModel(prepared.model, prepared.bytes);
assert.ok(Math.max(0, ...verified.inspected.textures.flatMap((row) => [row.width, row.height])) <= HERO_MODEL_BUDGET.texEdge.limit);
assert.ok(verified.inspected.skins > 0 && verified.inspected.skinnedPrimitives === verified.inspected.meshes);
assert.deepEqual(Object.keys(prepared.model.clipMap).sort(), [...STATES].sort());

const bodyPath = join(output, "body.glb"), descriptorPath = join(output, "uploaded-model.json"), documentPath = join(output, "model-document.json");
publish(bodyPath, prepared.bytes);
publish(descriptorPath, new TextEncoder().encode(fileJson(prepared.model)));
publish(documentPath, new TextEncoder().encode(fileJson(prepared.document)));
const receipt = {
  schema: "ggd.jstars-runtime-model-candidate@1",
  source: metadata,
  original: sha(input),
  optimizedInput: preparedInput === input ? null : sha(preparedInput),
  output: sha(bodyPath), descriptor: sha(descriptorPath), modelDocument: { ...sha(documentPath), id: prepared.document.id, glbPath: prepared.document.glbPath },
  selections, clipMap: prepared.model.clipMap, normalization: prepared.normalized, warnings: prepared.warnings,
  inspection: {
    triangles: verified.inspected.triangles, drawPrimitives: verified.inspected.meshes, skins: verified.inspected.skins,
    skinnedPrimitives: verified.inspected.skinnedPrimitives, clips: verified.inspected.clips, textures: verified.inspected.textures,
  },
  automaticEligible: false,
  productionDeploymentVerified: false,
};
const receiptPath = join(output, "candidate-receipt.json");
publish(receiptPath, new TextEncoder().encode(fileJson(receipt)));
process.stdout.write(JSON.stringify({ ...plan, status: "prepared-and-officially-verified", receipt: receiptPath, modelKey: prepared.document.id }, null, 2) + "\n");
