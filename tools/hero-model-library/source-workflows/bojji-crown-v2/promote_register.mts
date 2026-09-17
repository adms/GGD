/** Promote the head-material-split Bojji crown v2 as a manual-review candidate. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { existsSync, linkSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ModelVersions } from "../../../../apps/content-api/src/modelVersions";
import { spliceMembers } from "../../../../packages/shared/src/content/editModel";
import { fileJson } from "../../../../packages/shared/src/content/node";
import { zModelVersionCommand } from "../../../../packages/shared/src/content/schema/championModelVersions";
import { zChampionDoc } from "../../../../packages/shared/src/content/schema/champion";
import { uploadedHeroModelDoc, verifyUploadedHeroModel } from "../../../../packages/shared/src/content/modelUpload/heroModel";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const WORKSPACE = resolve(ROOT, "..");
const HERO_ID = "b2-bojji";
const BASE_VERSION_MODEL_KEY = "version.body.b73694be2665676dbdc4b6a6f44e374fce4cb0e08b74a673";
const SUPERSEDED_VERSION_MODEL_KEYS = [
  "version.body.e7ebe443cc4f7eaa8662702817d93a88cd33e6564575ea73",
  "version.body.6d14c4f923bb7f4327f74f842862b1fbc5295011dc5869e5",
];
const CANDIDATE_SHA256 = "bf74313802c832c3cdb78908484f8c8e5e76065607c27767110557304b80ed03";
const CANDIDATE_BYTES = 877112;
const SOURCE_REFERENCE = "derivative:bojji-crown-v2-head-material-split";

const [repoArg, candidateArg, mode] = process.argv.slice(2);
if (!repoArg || !["--plan", "--apply", "--check"].includes(mode ?? "")) {
  throw Error("usage: promote_register.mts REPO [CANDIDATE.glb] --plan|--apply|--check");
}
const repo = resolve(repoArg);
assert.equal(repo, ROOT, "this bounded workflow must run against its own repository root");
const candidate = resolve(candidateArg || join(WORKSPACE, "GGD-Asset-Library/conversions/bojji-crown-v2/candidate.glb"));
const validationPath = join(dirname(candidate), "validation.json");
const buildReceiptPath = join(dirname(candidate), "build-receipt.json");
const visualEvidencePath = join(dirname(candidate), "visual-evidence.json");
const inventoryDir = join(repo, "materials/hero-model-library/source-inventories/bojji-crown-v2");
const receiptPath = join(inventoryDir, "registration-receipt.json");
const content = join(repo, "content");
const championPath = join(content, "champions", `${HERO_ID}.json`);

const sha = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
const pin = (path: string) => {
  const bytes = readFileSync(path);
  return { path, bytes: bytes.length, sha256: sha(bytes) };
};
const gitPath = (path: string) => relative(repo, path).replaceAll("\\", "/");
function publish(path: string, data: Uint8Array) {
  if (existsSync(path)) {
    assert.deepEqual(new Uint8Array(readFileSync(path)), data, `refusing to overwrite different bytes: ${path}`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, data, { flag: "wx" }); linkSync(temporary, path); }
  finally { rmSync(temporary, { force: true }); }
}
function atomicWrite(path: string, data: string) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { writeFileSync(temporary, data, { flag: "wx" }); renameSync(temporary, path); }
  finally { if (existsSync(temporary)) unlinkSync(temporary); }
}

const candidateBytes = new Uint8Array(readFileSync(candidate));
assert.equal(candidateBytes.length, CANDIDATE_BYTES, "candidate byte length changed");
assert.equal(sha(candidateBytes), CANDIDATE_SHA256, "candidate hash changed");
const validation = JSON.parse(readFileSync(validationPath, "utf8"));
const buildReceipt = JSON.parse(readFileSync(buildReceiptPath, "utf8"));
const visualEvidence = JSON.parse(readFileSync(visualEvidencePath, "utf8"));
assert.equal(validation.schema, "ggd.bojji-crown-v2-validation@1");
assert.equal(validation.candidate.sha256, CANDIDATE_SHA256);
assert.equal(validation.metrics.triangles <= 8000, true);
assert.equal(validation.metrics.drawPrimitives <= 6, true);
assert.equal(validation.metrics.maxTextureEdge <= 256, true);
assert.equal(validation.metrics.maxChannelsPerClip <= 300, true);
assert.deepEqual(validation.ggdBudget.errors, []);
assert.equal(validation.khronos.errors, 0);
assert.equal(validation.khronos.warnings, 0);
assert.equal(validation.preservation.nodesSkinAnimationsAndCrownExact, true);
assert.equal(buildReceipt.output.sha256, CANDIDATE_SHA256);
assert.deepEqual(visualEvidence.summary, { views: 3, complete: 3, renderErrors: 0, ownerVisualReviewPending: true });

const championBefore = JSON.parse(readFileSync(championPath, "utf8"));
const baseVersion = championBefore.modelVersions.find((row: any) => row.modelKey === BASE_VERSION_MODEL_KEY);
assert.ok(baseVersion, "the previous approved Bojji derivative option must remain present");
assert.equal(baseVersion.source.reference, "derivative:bojji-crown-v1");
const baseDocument = JSON.parse(readFileSync(join(content, "models", `${BASE_VERSION_MODEL_KEY}.json`), "utf8"));
const descriptor = {
  schema: "ggd-uploaded-hero-model@1" as const,
  sha256: CANDIDATE_SHA256,
  byteSize: CANDIDATE_BYTES,
  clipMap: baseDocument.clipMap,
  yawOffsetDeg: baseDocument.yawOffsetDeg ?? 0,
};
await verifyUploadedHeroModel(descriptor, candidateBytes);
const sourceDocument = uploadedHeroModelDoc(descriptor);
const sourceAssetPath = join(content, sourceDocument.glbPath);
const sourceDocumentPath = join(content, "models", `${sourceDocument.id}.json`);
const sourceDocumentBytes = new TextEncoder().encode(fileJson(sourceDocument));
const source = {
  kind: "style-proxy" as const,
  character: "波吉（王冠繪本純色 v2 頭部材質分離版／獨立完整副本）",
  work: "國王排名；來源替身為 300英雄小桐人寵物",
  library: "300heroes",
  reference: SOURCE_REFERENCE,
  tier: "300heroes" as const,
  selectionClass: "manual" as const,
  sourceGame: "300英雄",
  sourcePlatform: "Windows",
};
const label = "波吉（王冠繪本純色 v2 頭部材質分離版／獨立完整副本）";

if (mode === "--plan") {
  process.stdout.write(JSON.stringify({
    schema: "ggd.bojji-crown-v2-promotion-plan@1", heroId: HERO_ID,
    candidate: pin(candidate), sourceModelKey: sourceDocument.id,
    gitGlbPath: gitPath(sourceAssetPath), modelDocumentPath: gitPath(sourceDocumentPath),
    previousDefaultModelKey: championBefore.modelKey, preservedVersionCount: championBefore.modelVersions.length,
    automaticEligible: false, selectAsCurrentAutomaticDefault: false,
    apply: false, productionDeploymentVerified: false,
  }, null, 2) + "\n");
  process.exit(0);
}

if (mode === "--apply") {
  const superseded = championBefore.modelVersions.filter((row: any) => SUPERSEDED_VERSION_MODEL_KEYS.includes(row.modelKey));
  assert.equal(superseded.length, SUPERSEDED_VERSION_MODEL_KEYS.length, "all superseded v2 options must remain present");
  const demotedChampion = zChampionDoc.parse({
    ...championBefore,
    modelKey: BASE_VERSION_MODEL_KEY,
    modelSelectionMode: "automatic",
    modelVersions: championBefore.modelVersions.map((row: any) => SUPERSEDED_VERSION_MODEL_KEYS.includes(row.modelKey)
      ? {...row, automaticEligible: false}
      : row),
  });
  const demotedRaw = spliceMembers(readFileSync(championPath, "utf8"), {
    modelKey: demotedChampion.modelKey,
    modelVersions: demotedChampion.modelVersions,
    modelSelectionMode: demotedChampion.modelSelectionMode,
  });
  atomicWrite(championPath, demotedRaw);
  publish(sourceAssetPath, candidateBytes);
  publish(sourceDocumentPath, sourceDocumentBytes);
  const service = new ModelVersions(content);
  const before = service.state(HERO_ID);
  const existing = before.versions.find(row => row.sourceModelKey === sourceDocument.id && row.source.reference === SOURCE_REFERENCE);
  if (!existing) {
    const next = await service.prepare(HERO_ID, zModelVersionCommand.parse({
      action: "register", expectedHash: before.expectedHash, sourceModelKey: sourceDocument.id,
      label, source, automaticEligible: false,
    }));
    service.writeArtifacts(next.artifacts);
    const raw = readFileSync(championPath, "utf8");
    atomicWrite(championPath, spliceMembers(raw, {
      modelKey: next.champion.modelKey,
      modelVersions: next.champion.modelVersions,
      modelSelectionMode: next.champion.modelSelectionMode,
    }));
  }
}

const service = new ModelVersions(content);
const after = service.state(HERO_ID);
const registered = after.versions.find(row => row.sourceModelKey === sourceDocument.id && row.source.reference === SOURCE_REFERENCE);
assert.ok(registered, "crown candidate was not registered");
service.verify(registered);
for (const version of after.versions) service.verify(version);
assert.equal(after.selectionMode, "automatic", "Bojji must remain in automatic mode");
assert.equal(registered.automaticEligible, false, "v2 appearance is pending owner review");
assert.equal(after.activeModelKey, BASE_VERSION_MODEL_KEY, "v1 must remain the current automatic selection");
const superseded = after.versions.filter(row => SUPERSEDED_VERSION_MODEL_KEYS.includes(row.modelKey));
assert.equal(superseded.length, SUPERSEDED_VERSION_MODEL_KEYS.length, "superseded v2 options were lost");
for (const version of superseded) assert.equal(version.automaticEligible, false, "superseded v2 must not be auto-selected");
assert.ok(after.versions.some(row => row.modelKey === BASE_VERSION_MODEL_KEY), "previous selected option was lost");
assert.equal(after.versions.filter(row => row.source.reference === SOURCE_REFERENCE).length, 1, "duplicate crown registration");
assert.deepEqual(new Uint8Array(readFileSync(sourceAssetPath)), candidateBytes, "Git GLB differs from validated candidate");
assert.deepEqual(new Uint8Array(readFileSync(sourceDocumentPath)), sourceDocumentBytes, "source model document differs");

const versionDocumentPath = join(content, "models", `${registered.modelKey}.json`);
const receipt = {
  schema: "ggd.bojji-crown-v2-registration-receipt@1",
  heroId: HERO_ID,
  ownerDecision: "retain the gold-crown v1 automatic default; register the head-material-split flat-colour v2 for manual review only and retain older v2 candidates as ineligible history",
  input: {
    candidate: pin(candidate), validation: pin(validationPath), buildReceipt: pin(buildReceiptPath), visualEvidence: pin(visualEvidencePath),
  },
  sourceModel: {
    modelKey: sourceDocument.id,
    modelDocument: { gitPath: gitPath(sourceDocumentPath), ...pin(sourceDocumentPath) },
    glb: { gitPath: gitPath(sourceAssetPath), ...pin(sourceAssetPath) },
  },
  registeredVersion: {
    modelKey: registered.modelKey,
    sourceModelKey: registered.sourceModelKey,
    label: registered.label,
    automaticEligible: registered.automaticEligible,
    registeredAt: registered.registeredAt,
    source: registered.source,
    modelDocument: { gitPath: gitPath(versionDocumentPath), ...pin(versionDocumentPath) },
  },
  supersededVersions: superseded.map(version => ({
    modelKey: version.modelKey,
    sourceModelKey: version.sourceModelKey,
    sourceReference: version.source.reference,
    automaticEligible: version.automaticEligible,
    supersededBy: registered.modelKey,
  })),
  preservation: {
    previousDefaultModelKey: BASE_VERSION_MODEL_KEY,
    previousDefaultRetained: true,
    allPriorVersionModelKeysRetained: championBefore.modelVersions
      .filter((row: any) => row.source?.reference !== SOURCE_REFERENCE)
      .every((row: any) => after.versions.some(current => current.modelKey === row.modelKey)),
    registeredReferenceCount: after.versions.filter(row => row.source.reference === SOURCE_REFERENCE).length,
    versionCountAfter: after.versions.length,
  },
  selection: {
    mode: after.selectionMode,
    activeModelKey: after.activeModelKey,
    v2CandidateSelected: after.activeModelKey === registered.modelKey,
    v1DefaultRetained: after.activeModelKey === BASE_VERSION_MODEL_KEY,
    runtimeSelectable: true,
  },
  validation: {
    triangles: validation.metrics.triangles,
    ownerMaximumTriangles: 8000,
    drawPrimitives: validation.metrics.drawPrimitives,
    maxTextureEdge: validation.metrics.maxTextureEdge,
    maxChannelsPerClip: validation.metrics.maxChannelsPerClip,
    khronosErrors: validation.khronos.errors,
    khronosWarnings: validation.khronos.warnings,
    ggdBudgetErrors: validation.ggdBudget.errors,
    nodesSkinAnimationsAndCrownExact: validation.preservation.nodesSkinAnimationsAndCrownExact,
  },
  status: {
    promotedToGit: true,
    registered: true,
    runtimeSelectable: true,
    automaticEligible: false,
    currentAutomaticSelected: false,
    ownerVisualReviewPending: true,
    supersededV2AutomaticEligible: false,
    productionDeployed: false,
  },
};
const rendered = JSON.stringify(receipt, null, 2) + "\n";
if (mode === "--check") {
  assert.ok(existsSync(receiptPath), "registration receipt missing");
  assert.equal(readFileSync(receiptPath, "utf8"), rendered, "registration receipt is stale");
} else {
  mkdirSync(inventoryDir, { recursive: true });
  atomicWrite(receiptPath, rendered);
}
process.stdout.write(JSON.stringify({
  status: mode === "--check" ? "registration-check-passed" : "registered-for-manual-review",
  sourceModelKey: sourceDocument.id,
  versionModelKey: registered.modelKey,
  activeModelKey: after.activeModelKey,
  versions: after.versions.length,
  receipt: gitPath(receiptPath),
}, null, 2) + "\n");
