/** Register the validated Azazel wing source model as a retained selectable version. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ModelVersions } from "../../../../apps/content-api/src/modelVersions.ts";
import { contentSha256 } from "../../../../packages/shared/src/content/import/jcs.ts";
import { spliceMembers } from "../../../../packages/shared/src/content/editModel.ts";
import { preferredModelVersion, zModelVersionCommand } from "../../../../packages/shared/src/content/schema/championModelVersions.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const HERO_ID = "community-review-32-20260907";
const SOURCE_MODEL_KEY = "community.body.ba1abbbdb25444e61533ab7354ebd85125ffa860763b86ee";
const CANDIDATE_SHA256 = "acbc5a0cd8880ef835cfc0bb59011f59fbca3c053f7e0902c5d7df5cae5e166a";
const STAGE = resolve(ROOT, "../GGD-Asset-Library/conversions/approved-derivative-azazel-wings-v1");
const RECEIPT = join(STAGE, "azazel-wings-v1.registration.json");
const source = {
  kind: "style-proxy" as const,
  character: "阿薩謝爾（獨立副本／喜羊羊，小型蝙蝠翼）",
  work: "喜羊羊與灰太狼",
  library: "300heroes",
  reference: "derivative:azazel",
  tier: "300heroes" as const,
  selectionClass: "manual" as const,
  sourceGame: "300英雄",
  sourcePlatform: "Windows",
};
const label = "阿薩謝爾（獨立副本／喜羊羊，小型蝙蝠翼）";

const service = new ModelVersions(resolve(ROOT, "content"));
const before = service.state(HERO_ID);
for (const version of before.versions) service.verify(version);
const oldVersionHashes = before.versions.map((version) => contentSha256(version));
let changed = false;
let added = before.versions.find((version) => version.sourceModelKey === SOURCE_MODEL_KEY && version.binarySha256 === CANDIDATE_SHA256);

if (!added) {
  const prepared = await service.prepare(HERO_ID, zModelVersionCommand.parse({
    action: "register", expectedHash: before.expectedHash,
    sourceModelKey: SOURCE_MODEL_KEY, label, source, automaticEligible: true,
  }));
  assert.equal(prepared.artifacts.length, 1);
  added = prepared.artifacts[0]!.version;
  assert.equal(added.sourceModelKey, SOURCE_MODEL_KEY);
  assert.equal(added.binarySha256, CANDIDATE_SHA256);
  assert.equal(added.automaticEligible, true);
  assert.equal(prepared.champion.modelSelectionMode, "automatic");
  assert.equal(prepared.champion.modelKey, added.modelKey);
  assert.equal(prepared.champion.modelVersions?.length, before.versions.length + 1);
  for (const hash of oldVersionHashes) assert.ok(prepared.champion.modelVersions!.some((version) => contentSha256(version) === hash));

  service.assertCurrent(HERO_ID, before.expectedHash);
  service.writeArtifacts(prepared.artifacts);
  for (const artifact of prepared.artifacts) service.verify(artifact.version);
  const championPath = resolve(ROOT, "content/champions", `${HERO_ID}.json`);
  const raw = readFileSync(championPath, "utf8");
  const temporary = `${championPath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, spliceMembers(raw, {
      modelKey: prepared.champion.modelKey,
      modelVersions: prepared.champion.modelVersions,
      modelSelectionMode: prepared.champion.modelSelectionMode,
    }), { flag: "wx" });
    service.assertCurrent(HERO_ID, before.expectedHash);
    renameSync(temporary, championPath);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  changed = true;
}

const after = service.state(HERO_ID);
for (const version of after.versions) service.verify(version);
added = after.versions.find((version) => version.sourceModelKey === SOURCE_MODEL_KEY && version.binarySha256 === CANDIDATE_SHA256);
assert.ok(added);
assert.equal(added.automaticEligible, true);
assert.equal(added.source.selectionClass, "manual");
assert.equal(after.selectionMode, "automatic");
assert.equal(after.preferredModelKey, added.modelKey);
assert.equal(after.activeModelKey, added.modelKey);
for (const hash of oldVersionHashes) assert.ok(after.versions.some((version) => contentSha256(version) === hash), `lost old version ${hash}`);
assert.equal(after.versions.length, before.versions.length + (changed ? 1 : 0));

const versionDocumentPath = resolve(ROOT, "content/models", `${added.modelKey}.json`);
const versionDocument = JSON.parse(readFileSync(versionDocumentPath, "utf8"));
const versionGlbPath = resolve(ROOT, "content", versionDocument.glbPath);
assert.equal(versionDocument.bodyVersion.sourceModelKey, SOURCE_MODEL_KEY);
assert.equal(createHash("sha256").update(readFileSync(versionGlbPath)).digest("hex"), CANDIDATE_SHA256);
const baselineVersions = after.versions.filter((version) => version.modelKey !== added.modelKey);
const baselineSelected = preferredModelVersion(baselineVersions);
assert.ok(baselineSelected);
const baselineChampion = { ...service.champion(HERO_ID), modelKey: baselineSelected.modelKey, modelVersions: baselineVersions, modelSelectionMode: "automatic" as const };
const baselineVersionHashes = baselineVersions.map((version) => contentSha256(version));
const receipt = {
  schema: "ggd.approved-azazel-wings-registration@1",
  workflowId: "approved-derivative-azazel-wings-v1",
  heroId: HERO_ID,
  mutationPerformedThisRun: changed,
  before: { expectedHash: contentSha256(baselineChampion), activeModelKey: baselineSelected.modelKey, selectionMode: "automatic", versionCount: baselineVersions.length, versionHashes: baselineVersionHashes, basis: "current champion with only this workflow version removed" },
  addedVersion: added,
  after: {
    expectedHash: after.expectedHash, activeModelKey: after.activeModelKey,
    preferredModelKey: after.preferredModelKey, selectionMode: after.selectionMode,
    versionCount: after.versions.length,
    allPreviousVersionsRetained: baselineVersionHashes.every((hash) => after.versions.some((version) => contentSha256(version) === hash)),
  },
  artifacts: {
    sourceModelKey: SOURCE_MODEL_KEY,
    versionModelKey: added.modelKey,
    versionDocumentPath,
    versionDocumentSha256: createHash("sha256").update(readFileSync(versionDocumentPath)).digest("hex"),
    versionGlbPath,
    versionGlbSha256: CANDIDATE_SHA256,
  },
  status: { registered: true, selectable: true, automaticEligible: true, automaticSelected: true, productionDeployed: false },
};
writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify({ changed, versionModelKey: added.modelKey, beforeVersions: before.versions.length, afterVersions: after.versions.length, activeModelKey: after.activeModelKey }));
