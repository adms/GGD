import assert from "node:assert/strict";
import { existsSync, linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { prepareUploadedHeroModel, verifyUploadedHeroModel } from "../../../../packages/shared/src/content/modelUpload/heroModel";
import { inspectModelUpload } from "../../../../packages/shared/src/content/modelUpload/inspect";
import { resizeImageWithFfmpeg } from "../../../../apps/content-api/src/resizeImage.node";
import { fileJson } from "../../../../packages/shared/src/content/node";

type SourceOption = {
  id: string;
  label: string;
  sourceGame: string;
  sourcePlatform: string;
  nativeCharacterId: string | null;
  identityState: string;
  identityVerified: boolean;
  reference: string;
  selectionClass: "canonical-game";
  tier: "original";
};

function usage(): never {
  throw new Error("usage: prepare_model_candidate.mts REPO INPUT.glb SOURCE_OPTIONS.json SOURCE_ID SELECTIONS.json|auto OUTPUT_DIR --plan|--apply");
}

function shaPin(path: string) {
  const bytes = readFileSync(path);
  return { absolutePath: resolve(path), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function inferSelections(clips: ReadonlyArray<{ name: string }>): Record<string, number> {
  assert.ok(clips.length, "input GLB has no animation clips");
  const find = (pattern: RegExp): number => clips.findIndex((clip) => pattern.test(clip.name));
  const pick = (pattern: RegExp, fallback: number): number => {
    const matched = find(pattern);
    return matched >= 0 ? matched : fallback;
  };
  const idle = pick(/idle|stand|wait/i, 0);
  const run = pick(/run|walk|dash|move/i, idle);
  const attack = pick(/attack|atk|punch|kick|combo|normal/i, idle);
  const cast = pick(/cast|skill|special|power|charge|jajanken/i, attack);
  const hurt = pick(/hurt|damage|hit|stun|impact/i, idle);
  // Owner policy permits hurt + runtime fade when no native death exists.  The
  // model version therefore maps death to hurt, while the receipt keeps the
  // fallback explicit for later review.
  const death = pick(/death|die|dead|ko|down/i, hurt);
  return { idle, run, attack, cast, hurt, death };
}

function publish(path: string, bytes: Uint8Array): void {
  if (existsSync(path)) {
    assert.deepEqual(new Uint8Array(readFileSync(path)), bytes, `refusing to overwrite different candidate artifact: ${path}`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, bytes, { flag: "wx" });
    linkSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

const [repoArg, inputArg, optionsArg, sourceId, selectionsArg, outputArg, mode] = process.argv.slice(2);
if (!repoArg || !inputArg || !optionsArg || !sourceId || !selectionsArg || !outputArg || !["--plan", "--apply"].includes(mode)) usage();
const repo = resolve(repoArg);
const input = resolve(inputArg);
const output = resolve(outputArg);
const options = JSON.parse(readFileSync(resolve(optionsArg), "utf8"));
assert.equal(options.schema, "ggd.gon-original-game-source-options@1");
const source = options.sources.find((row: SourceOption) => row.id === sourceId) as SourceOption | undefined;
assert.ok(source, `unknown source option: ${sourceId}`);
assert.equal(source.selectionClass, "canonical-game");
assert.equal(source.tier, "original");
assert.equal(source.identityVerified, true, `${source.id} identity is not verified; candidate preparation is blocked`);
assert.ok(source.nativeCharacterId, `${source.id} native character ID is missing`);
const inspectedInput = await inspectModelUpload(new Uint8Array(readFileSync(input)));
const selectionMode = selectionsArg === "auto" ? "auto-name-heuristic" : "explicit-index-file";
const selections = selectionsArg === "auto"
  ? inferSelections(inspectedInput.clips)
  : JSON.parse(readFileSync(resolve(selectionsArg), "utf8"));
for (const key of ["idle", "run", "attack", "cast", "hurt", "death"]) {
  assert.ok(Number.isInteger(selections[key]) && selections[key] >= 0, `missing non-negative animation index: ${key}`);
}
const raw = new Uint8Array(readFileSync(input));
const plan = {
  schema: "ggd.gon-original-game-model-candidate-plan@1",
  heroId: options.heroId,
  source,
  input: { absolutePath: input, bytes: raw.length, sha256: inspectedInput.sha256 },
  selections,
  selectionMode,
  deathUsesHurtFallback: selections.death === selections.hurt && !/death|die|dead|ko|down/i.test(inspectedInput.clips[selections.death]?.name ?? ""),
  output,
  officialPipeline: ["prepareUploadedHeroModel", "verifyUploadedHeroModel", "ModelVersions.prepare"],
  apply: mode === "--apply",
};
if (mode === "--plan") {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

const prepared = await prepareUploadedHeroModel(raw, selections, 0, { resizeImage: resizeImageWithFfmpeg });
const verified = await verifyUploadedHeroModel(prepared.model, prepared.bytes);
assert.deepEqual(verified.model, prepared.model);
const bodyPath = join(output, "body.glb");
const descriptorPath = join(output, "uploaded-model.json");
const modelDocPath = join(output, "model-document.json");
publish(bodyPath, prepared.bytes);
publish(descriptorPath, new TextEncoder().encode(fileJson(prepared.model)));
publish(modelDocPath, new TextEncoder().encode(fileJson(prepared.document)));
const receipt = {
  schema: "ggd.gon-original-game-model-candidate@1",
  heroId: options.heroId,
  source,
  input: plan.input,
  output: shaPin(bodyPath),
  descriptor: shaPin(descriptorPath),
  modelDocument: { absolutePath: modelDocPath, id: prepared.document.id, glbPath: prepared.document.glbPath },
  clipMap: prepared.model.clipMap,
  selections,
  selectionMode,
  deathUsesHurtFallback: plan.deathUsesHurtFallback,
  inspection: {
    triangles: verified.inspected.triangles,
    drawPrimitives: verified.inspected.meshes,
    skins: verified.inspected.skins,
    skinnedPrimitives: verified.inspected.skinnedPrimitives,
    clips: verified.inspected.clips.map((clip) => ({ name: clip.name, duration: clip.duration, channels: clip.channels })),
    textures: verified.inspected.textures.map((texture) => ({ width: texture.width, height: texture.height })),
  },
  normalization: prepared.normalized,
  warnings: prepared.warnings,
  stages: {
    convertedToGgdCandidate: true,
    officialVerificationPassed: true,
    registered: false,
    runtimeSelectable: false,
    productionDeployed: false,
  },
};
const receiptPath = join(output, "candidate-receipt.json");
publish(receiptPath, new TextEncoder().encode(fileJson(receipt)));
console.log(JSON.stringify({ ...plan, status: "candidate-prepared-and-verified", receipt: receiptPath, modelKey: prepared.document.id }, null, 2));
