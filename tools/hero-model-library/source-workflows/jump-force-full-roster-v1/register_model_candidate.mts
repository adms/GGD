import assert from "node:assert/strict";
import { existsSync, linkSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { ModelVersions } from "../../../../apps/content-api/src/modelVersions";
import { spliceMembers } from "../../../../packages/shared/src/content/editModel";
import { zModelVersionCommand } from "../../../../packages/shared/src/content/schema/championModelVersions";
import { uploadedHeroModelDoc, verifyUploadedHeroModel } from "../../../../packages/shared/src/content/modelUpload/heroModel";
import { fileJson } from "../../../../packages/shared/src/content/node";

function publish(path: string, bytes: Uint8Array): void {
  if (existsSync(path)) {
    assert.deepEqual(new Uint8Array(readFileSync(path)), bytes, `refusing to overwrite different registered artifact: ${path}`);
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

const [repoArg, candidateArg, mode] = process.argv.slice(2);
if (!repoArg || !candidateArg || !["--plan", "--apply"].includes(mode)) {
  throw new Error("usage: register_model_candidate.mts REPO CANDIDATE_DIR --plan|--apply");
}
const repo = resolve(repoArg);
const content = join(repo, "content");
const candidate = resolve(candidateArg);
const receipt = JSON.parse(readFileSync(join(candidate, "candidate-receipt.json"), "utf8"));
assert.equal(receipt.schema, "ggd.gon-original-game-model-candidate@1");
assert.equal(receipt.source.identityVerified, true);
assert.ok(receipt.source.nativeCharacterId);
const descriptor = JSON.parse(readFileSync(join(candidate, "uploaded-model.json"), "utf8"));
const bytes = new Uint8Array(readFileSync(join(candidate, "body.glb")));
await verifyUploadedHeroModel(descriptor, bytes);
const sourceDoc = uploadedHeroModelDoc(descriptor);
assert.equal(sourceDoc.id, receipt.modelDocument.id);
const sourceAsset = join(content, sourceDoc.glbPath);
const sourceDocPath = join(content, "models", `${sourceDoc.id}.json`);
const heroId = receipt.heroId;
const source = {
  kind: "exact" as const,
  character: "傑・富力士",
  work: "HUNTER×HUNTER",
  library: receipt.source.id,
  reference: receipt.source.reference,
  tier: "original" as const,
  selectionClass: "canonical-game" as const,
  sourceGame: receipt.source.sourceGame,
  sourcePlatform: receipt.source.sourcePlatform,
};
const service = new ModelVersions(content);
const before = service.state(heroId);
const existing = before.versions.find((row) => row.sourceModelKey === sourceDoc.id && row.source.reference === source.reference && row.source.library === source.library);
if (existing) {
  service.verify(existing);
  console.log(JSON.stringify({ status: "already-registered", sourceId: receipt.source.id, modelKey: existing.modelKey, activeModelKey: before.activeModelKey }, null, 2));
  process.exit(0);
}
const plan = {
  schema: "ggd.gon-original-game-model-registration-plan@1",
  heroId,
  sourceId: receipt.source.id,
  nativeCharacterId: receipt.source.nativeCharacterId,
  sourceModelKey: sourceDoc.id,
  sourceAsset: sourceDoc.glbPath,
  previousActiveModelKey: before.activeModelKey,
  previousSelectionMode: before.selectionMode,
  label: receipt.source.label,
  source,
  automaticEligible: false,
  apply: mode === "--apply",
  productionDeploymentVerified: false,
};
if (mode === "--plan") {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

publish(sourceAsset, bytes);
publish(sourceDocPath, new TextEncoder().encode(fileJson(sourceDoc)));
const current = service.state(heroId);
const next = await service.prepare(heroId, zModelVersionCommand.parse({
  action: "register",
  expectedHash: current.expectedHash,
  sourceModelKey: sourceDoc.id,
  label: receipt.source.label,
  source,
  automaticEligible: false,
}));
service.writeArtifacts(next.artifacts);
const registered = next.artifacts.at(-1)?.version;
assert.ok(registered);
assert.notEqual(next.champion.modelKey, registered.modelKey, "new original-game candidate must remain non-default until runtime review");
const championPath = join(content, "champions", `${heroId}.json`);
const raw = readFileSync(championPath, "utf8");
const updated = spliceMembers(raw, {
  modelKey: next.champion.modelKey,
  modelVersions: next.champion.modelVersions,
  modelSelectionMode: next.champion.modelSelectionMode,
});
const temporary = `${championPath}.${randomUUID()}.tmp`;
try {
  writeFileSync(temporary, updated, { flag: "wx" });
  renameSync(temporary, championPath);
} finally {
  if (existsSync(temporary)) unlinkSync(temporary);
}
const after = service.state(heroId);
for (const version of after.versions) service.verify(version);
const retained = after.versions.filter((row) => row.source.reference === source.reference && row.source.library === source.library);
assert.equal(retained.length, 1);
assert.equal(retained[0]?.automaticEligible, false);
console.log(JSON.stringify({ ...plan, status: "registered-non-default-independent-option", candidateModelKey: registered.modelKey, activeModelKey: after.activeModelKey, versionCount: after.versions.length }, null, 2));
