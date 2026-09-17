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
const SOURCE_MODEL_KEY = "community.body.c1b48643fe5058e2ad3a42e37569400176d0daa3bf6e274f";
const CANDIDATE_SHA256 = "8c1e23a6873d2a9dba21f60000a157c2cb30c5160e22b98621bc7e6ed86a2672";
const SUPERSEDED_VERSION_KEY = "version.body.effe98edd329922f74c1ed84541cdc743b08fcc0090555e8";
const STAGE = resolve(ROOT, "../GGD-Asset-Library/conversions/approved-derivative-azazel-wings-v2");
const RECEIPT = join(STAGE, "azazel-wings-v2.registration.json");
const source = {
  kind: "style-proxy" as const,
  character: "阿薩謝爾（獨立副本／喜羊羊，參考圖閉眼橘髮與蝙蝠翼 v2）",
  work: "喜羊羊與灰太狼",
  library: "300heroes",
  reference: "derivative:azazel",
  tier: "300heroes" as const,
  selectionClass: "manual" as const,
  sourceGame: "300英雄",
  sourcePlatform: "Windows",
};
const label = "阿薩謝爾（獨立副本／參考圖閉眼一致橘髮與蝙蝠翼 v2.1／待外觀核准）";

const service = new ModelVersions(resolve(ROOT, "content"));
const before = service.state(HERO_ID);
for (const version of before.versions) service.verify(version);
const oldVersionHashes = before.versions.map((version) => contentSha256(version));
const oldVersionKeys = before.versions.map((version) => version.modelKey);
let changed = false;
let added = before.versions.find((version) => version.sourceModelKey === SOURCE_MODEL_KEY && version.binarySha256 === CANDIDATE_SHA256);

if (!added) {
  const prepared = await service.prepare(HERO_ID, zModelVersionCommand.parse({
    action: "register", expectedHash: before.expectedHash,
    sourceModelKey: SOURCE_MODEL_KEY, label, source, automaticEligible: false,
  }));
  assert.equal(prepared.artifacts.length, 1);
  added = prepared.artifacts[0]!.version;
  assert.equal(added.sourceModelKey, SOURCE_MODEL_KEY);
  assert.equal(added.binarySha256, CANDIDATE_SHA256);
  assert.equal(added.automaticEligible, false);
  assert.equal(prepared.champion.modelSelectionMode, "automatic");
  assert.equal(prepared.champion.modelKey, before.activeModelKey);
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

let supersededMarked = false;
const interim = service.state(HERO_ID);
const supersededLabel = "阿薩謝爾（獨立副本／參考圖閉眼橘髮與蝙蝠翼 v2／已由 v2.1 取代／非自動）";
const superseded = interim.versions.find((version) => version.modelKey === SUPERSEDED_VERSION_KEY);
assert.ok(superseded);
assert.equal(superseded.automaticEligible, false);
if (superseded.label !== supersededLabel) {
  const championPath = resolve(ROOT, "content/champions", `${HERO_ID}.json`);
  const raw = readFileSync(championPath, "utf8");
  const temporary = `${championPath}.${randomUUID()}.tmp`;
  const versions = interim.versions.map((version) =>
    version.modelKey === SUPERSEDED_VERSION_KEY ? { ...version, label: supersededLabel, automaticEligible: false } : version,
  );
  try {
    writeFileSync(temporary, spliceMembers(raw, { modelVersions: versions }), { flag: "wx" });
    service.assertCurrent(HERO_ID, interim.expectedHash);
    renameSync(temporary, championPath);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  supersededMarked = true;
}

const after = service.state(HERO_ID);
for (const version of after.versions) service.verify(version);
added = after.versions.find((version) => version.sourceModelKey === SOURCE_MODEL_KEY && version.binarySha256 === CANDIDATE_SHA256);
assert.ok(added);
assert.equal(added.automaticEligible, false);
assert.equal(added.source.selectionClass, "manual");
assert.equal(after.selectionMode, "automatic");
assert.equal(after.preferredModelKey, before.preferredModelKey);
assert.equal(after.activeModelKey, before.activeModelKey);
for (const modelKey of oldVersionKeys) assert.ok(after.versions.some((version) => version.modelKey === modelKey), `lost old version ${modelKey}`);
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
  schema: "ggd.approved-azazel-wings-registration@2",
  workflowId: "approved-derivative-azazel-wings-v2",
  heroId: HERO_ID,
  mutationPerformedThisRun: changed || supersededMarked,
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
  status: { registered: true, selectable: true, automaticEligible: false, automaticSelected: false, priorV2SupersededAndNonAutomatic: true, ownerAppearanceAcceptance: "pending", productionDeployed: false },
};
writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify({ changed, supersededMarked, versionModelKey: added.modelKey, beforeVersions: before.versions.length, afterVersions: after.versions.length, activeModelKey: after.activeModelKey }));
