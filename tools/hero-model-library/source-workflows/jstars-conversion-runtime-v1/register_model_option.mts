import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { existsSync, linkSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";

import { ModelVersions } from "../../../../apps/content-api/src/modelVersions";
import { spliceMembers } from "../../../../packages/shared/src/content/editModel";
import { fileJson } from "../../../../packages/shared/src/content/node";
import { zModelVersionCommand } from "../../../../packages/shared/src/content/schema/championModelVersions";
import { uploadedHeroModelDoc, verifyUploadedHeroModel } from "../../../../packages/shared/src/content/modelUpload/heroModel";

function publish(path: string, bytes: Uint8Array) {
  if (existsSync(path)) {
    assert.deepEqual(new Uint8Array(readFileSync(path)), bytes, `refusing to overwrite different registered artifact: ${path}`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, bytes, { flag: "wx" }); linkSync(temporary, path); }
  finally { rmSync(temporary, { force: true }); }
}

const [repoArg, candidateArg, mode] = process.argv.slice(2);
if (!repoArg || !candidateArg || !["--plan", "--apply"].includes(mode ?? "")) {
  throw new Error("usage: register_model_option.mts REPO CANDIDATE_DIR --plan|--apply");
}
const repo = resolve(repoArg), content = join(repo, "content"), candidate = resolve(candidateArg);
const receipt = JSON.parse(readFileSync(join(candidate, "candidate-receipt.json"), "utf8"));
assert.equal(receipt.schema, "ggd.jstars-runtime-model-candidate@1");
assert.equal(receipt.source.identityVerified, true);
assert.equal(receipt.automaticEligible, false);
const heroId = String(receipt.source.heroId), championPath = join(content, "champions", `${heroId}.json`);
assert.ok(existsSync(championPath), `hero definition does not exist: ${heroId}`);
const descriptor = JSON.parse(readFileSync(join(candidate, "uploaded-model.json"), "utf8"));
const bytes = new Uint8Array(readFileSync(join(candidate, "body.glb")));
await verifyUploadedHeroModel(descriptor, bytes);
const sourceDoc = uploadedHeroModelDoc(descriptor);
assert.equal(sourceDoc.id, receipt.modelDocument.id);
const source = {
  kind: "exact" as const,
  character: receipt.source.character,
  work: receipt.source.work,
  library: receipt.source.sourceId,
  reference: receipt.source.reference,
  tier: "original" as const,
  selectionClass: "canonical-game" as const,
  sourceGame: "J-Stars Victory VS+",
  sourcePlatform: receipt.source.platform,
};
const service = new ModelVersions(content), before = service.state(heroId);
const existing = before.versions.find((row) => row.sourceModelKey === sourceDoc.id && row.source.reference === source.reference && row.source.library === source.library);
if (existing) {
  service.verify(existing);
  process.stdout.write(JSON.stringify({ status: "already-registered", heroId, modelKey: existing.modelKey, activeModelKey: before.activeModelKey }, null, 2) + "\n");
  process.exit(0);
}
const plan = {
  schema: "ggd.jstars-model-registration-plan@1", heroId, sourceModelKey: sourceDoc.id,
  sourceAsset: sourceDoc.glbPath, label: receipt.source.label, source, automaticEligible: false,
  previousActiveModelKey: before.activeModelKey, previousSelectionMode: before.selectionMode,
  apply: mode === "--apply", productionDeploymentVerified: false,
};
if (mode === "--plan") {
  process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
  process.exit(0);
}
publish(join(content, sourceDoc.glbPath), bytes);
publish(join(content, "models", `${sourceDoc.id}.json`), new TextEncoder().encode(fileJson(sourceDoc)));
const current = service.state(heroId);
const next = await service.prepare(heroId, zModelVersionCommand.parse({
  action: "register", expectedHash: current.expectedHash, sourceModelKey: sourceDoc.id,
  label: receipt.source.label, source, automaticEligible: false,
}));
service.writeArtifacts(next.artifacts);
const registered = next.artifacts.at(-1)?.version;
assert.ok(registered);
assert.notEqual(next.champion.modelKey, registered.modelKey, "J-Stars candidate must remain non-default before explicit selection");
const raw = readFileSync(championPath, "utf8");
const updated = spliceMembers(raw, { modelKey: next.champion.modelKey, modelVersions: next.champion.modelVersions, modelSelectionMode: next.champion.modelSelectionMode });
const temporary = `${championPath}.${randomUUID()}.tmp`;
try { writeFileSync(temporary, updated, { flag: "wx" }); renameSync(temporary, championPath); }
finally { if (existsSync(temporary)) unlinkSync(temporary); }
const after = service.state(heroId);
for (const version of after.versions) service.verify(version);
assert.equal(after.versions.filter((row) => row.source.reference === source.reference && row.source.library === source.library).length, 1);
process.stdout.write(JSON.stringify({ ...plan, status: "registered-non-default-independent-option", candidateModelKey: registered.modelKey, activeModelKey: after.activeModelKey, versionCount: after.versions.length }, null, 2) + "\n");
