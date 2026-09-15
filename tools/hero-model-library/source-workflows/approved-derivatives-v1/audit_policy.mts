import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const [repoArg, outputArg, maiCandidateArg] = process.argv.slice(2);
if (!repoArg || !outputArg) throw new Error("usage: audit_policy.mts <repo> <output-json> [mai-candidate.glb]");
const repo = resolve(repoArg);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));

const { inspectModelUpload } = await import(join(repo, "packages/shared/src/content/modelUpload/inspect.ts"));
const { heroModelBudgetIssues } = await import(join(repo, "packages/shared/src/content/modelUpload/heroModel.ts"));
const { HERO_MODEL_ADOPTION_POLICY, HERO_MODEL_BUDGET } = await import(join(repo, "packages/shared/src/content/modelUpload/budget.ts"));
const { zModelDoc } = await import(join(repo, "packages/shared/src/content/schema/model.ts"));
const validator = createRequire(join(repo, "packages/shared/package.json"))("gltf-validator");

const derivatives = read(join(repo, "materials/hero-model-library/derivatives.json")).entries;
assert.equal(derivatives.length, 11);
const rows = [];
for (const entry of derivatives) {
  const championPath = join(repo, "content/champions", `${entry.heroId}.json`);
  const champion = read(championPath);
  assert.equal(champion.id, entry.heroId);
  const options = champion.modelVersions.filter((option: any) => option.source?.reference === `derivative:${entry.id}`);
  assert.ok(options.length >= 1, `${entry.id}: no derivative option`);
  const latest = [...options].sort((a, b) => String(a.registeredAt).localeCompare(String(b.registeredAt))).at(-1)!;
  assert.equal(latest.source.selectionClass, "manual");
  const documentPath = join(repo, "content/models", `${latest.modelKey}.json`);
  const document = zModelDoc.parse(read(documentPath));
  assert.equal(document.id, latest.modelKey);
  const binaryPath = join(repo, "content", document.glbPath);
  const bytes = new Uint8Array(readFileSync(binaryPath));
  assert.equal(sha256(bytes), latest.binarySha256);
  const inspected = await inspectModelUpload(bytes);
  const budget = heroModelBudgetIssues(inspected);
  const clipNames = new Set(inspected.clips.map((clip: any) => clip.name));
  const stateEntries = Object.entries(document.clipMap);
  assert.equal(stateEntries.length, 6);
  for (const [state, name] of stateEntries) assert.ok(clipNames.has(name), `${entry.id}: ${state} references missing clip ${name}`);
  const metadata = inspected.json.extras?.ggdDerivative;
  assert.equal(metadata?.id, entry.id);
  assert.equal(metadata?.heroId, entry.heroId);
  assert.equal(metadata?.sourceId, entry.sourceId);
  assert.equal(metadata?.copyMode, "independent-embedded-copy");
  assert.equal(metadata?.changes, entry.changes);
  assert.ok((inspected.json.images ?? []).every((image: any) => image.uri === undefined));
  assert.ok((inspected.json.buffers ?? []).every((buffer: any) => buffer.uri === undefined));
  rows.push({
    id: entry.id,
    heroId: entry.heroId,
    name: entry.name,
    sourceId: entry.sourceId,
    changes: entry.changes,
    championPath: championPath.slice(repo.length + 1),
    currentModelKey: champion.modelKey,
    modelSelectionMode: champion.modelSelectionMode,
    derivativeOptionCount: options.length,
    latestDerivativeModelKey: latest.modelKey,
    latestDerivativeSourceModelKey: latest.sourceModelKey,
    latestDerivativeSelected: champion.modelKey === latest.modelKey,
    nonDefaultDerivativeOptionCount: options.filter((option: any) => option.modelKey !== champion.modelKey).length,
    sourceSelectionClass: latest.source.selectionClass,
    modelDocumentPath: documentPath.slice(repo.length + 1),
    modelDocumentSchema: document.schema,
    binaryPath: binaryPath.slice(repo.length + 1),
    binaryBytes: bytes.length,
    binarySha256: sha256(bytes),
    embedded: { buffers: inspected.json.buffers?.length ?? 0, images: inspected.json.images?.length ?? 0, externalUris: 0 },
    metrics: {
      triangles: inspected.triangles,
      drawPrimitives: inspected.meshes,
      skins: inspected.skins,
      skinnedPrimitives: inspected.skinnedPrimitives,
      maxTextureEdge: Math.max(0, ...inspected.textures.flatMap((texture: any) => [texture.width, texture.height])),
      sourceClipCount: inspected.clips.length,
      ggdStateBindings: stateEntries.length,
      distinctMappedClips: new Set(stateEntries.map(([, name]) => name)).size,
      maxChannelsPerClip: Math.max(0, ...inspected.clips.map((clip: any) => clip.channels)),
    },
    clipMap: document.clipMap,
    clips: inspected.clips,
    hardPolicy: { passed: budget.errors.length === 0, ...budget },
    metadata,
  });
}

let maiCandidate = null;
if (maiCandidateArg) {
  const candidatePath = resolve(maiCandidateArg);
  const bytes = new Uint8Array(readFileSync(candidatePath));
  const inspected = await inspectModelUpload(bytes);
  const budget = heroModelBudgetIssues(inspected);
  const optimizerSidecar = read(join(repo, "materials/hero-model-library/priority-evidence/approved-derivatives-v1/mai-optimizer-sidecar.json"));
  const sourcePath = join(repo, "content", optimizerSidecar.source);
  const sourceBytes = new Uint8Array(readFileSync(sourcePath));
  assert.equal(sha256(sourceBytes), optimizerSidecar.sourceSha256);
  const sourceInspected = await inspectModelUpload(sourceBytes);
  const khronos = await validator.validateBytes(bytes, {
    uri: "mai-decimated.glb", maxIssues: 0, writeTimestamp: false,
    externalResourceFunction: async () => { throw new Error("external resources prohibited"); },
  });
  assert.deepEqual(inspected.clips.map((clip: any) => clip.name), sourceInspected.clips.map((clip: any) => clip.name));
  assert.equal(inspected.skins, sourceInspected.skins);
  assert.ok(inspected.triangles <= HERO_MODEL_ADOPTION_POLICY.decimatedTargetTrianglesMax);
  assert.deepEqual(budget.errors, []);
  assert.equal(khronos.issues.numErrors, 0);
  assert.equal(khronos.issues.numWarnings, 0);
  assert.equal(inspected.json.extras?.ggdDerivative?.id, "mai");
  assert.ok((inspected.json.images ?? []).every((image: any) => image.uri === undefined));
  assert.ok((inspected.json.buffers ?? []).every((buffer: any) => buffer.uri === undefined));
  maiCandidate = {
    path: candidatePath,
    sha256: sha256(bytes),
    bytes: bytes.length,
    sourceSha256: optimizerSidecar.sourceSha256,
    metrics: { triangles: inspected.triangles, drawPrimitives: inspected.meshes, skins: inspected.skins, skinnedPrimitives: inspected.skinnedPrimitives, maxTextureEdge: Math.max(0, ...inspected.textures.flatMap((texture: any) => [texture.width, texture.height])), sourceClipCount: inspected.clips.length, maxChannelsPerClip: Math.max(0, ...inspected.clips.map((clip: any) => clip.channels)) },
    hardPolicy: { passed: true, ...budget },
    preservation: { sourcePath: optimizerSidecar.source, sourceTriangles: sourceInspected.triangles, jointCount: inspected.json.skins?.[0]?.joints.length ?? 0, skinCountUnchanged: true, namedClipsUnchanged: true, embeddedResources: true },
    khronos: { errors: khronos.issues.numErrors, warnings: khronos.issues.numWarnings, infos: khronos.issues.numInfos, hints: khronos.issues.numHints, truncated: khronos.issues.truncated },
  };
}

const output = {
  schema: "ggd.approved-derivatives-current-policy@1",
  policySource: "packages/shared/src/content/modelUpload/heroModel.ts",
  adoptionPolicy: HERO_MODEL_ADOPTION_POLICY,
  runtimeBudget: HERO_MODEL_BUDGET,
  count: rows.length,
  passed: rows.filter((row) => row.hardPolicy.passed).length,
  failed: rows.filter((row) => !row.hardPolicy.passed).length,
  rows,
  maiDecimatedCandidate: maiCandidate,
};
writeFileSync(resolve(outputArg), JSON.stringify(output, null, 2) + "\n");
console.log(JSON.stringify({ count: output.count, passed: output.passed, failed: output.failed }));
