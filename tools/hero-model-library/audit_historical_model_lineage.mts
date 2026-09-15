/** Rebuild current evidence for four exact GLBs recovered from commit 7bc2fa3f8. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ACQUIRED_MODEL_OPTIONS } from "../../packages/shared/src/content/heroForge/communityAcquired";
import { HERO_MODEL_ADOPTION_POLICY, HERO_MODEL_BUDGET } from "../../packages/shared/src/content/modelUpload/budget";
import { heroModelBudgetIssues } from "../../packages/shared/src/content/modelUpload/heroModel";
import { inspectModelUpload } from "../../packages/shared/src/content/modelUpload/inspect";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUTPUT = join(ROOT, "materials/hero-model-library/priority-evidence/historical-model-recovery/current-lineage-audit.json");
const WRITE = process.argv.includes("--write");
const HISTORICAL_COMMIT = "7bc2fa3f8";
const DOWNLOADS = join(ROOT, "materials/hero-model-library/download-sources.json");
const REGISTRATION = join(ROOT, "materials/hero-model-library/priority-evidence/historical-model-recovery/model-option-registration.json");
const DECIMATION = join(ROOT, "materials/hero-model-library/priority-evidence/historical-model-recovery/historical-astralym-decimation-v1/validation.json");
const NORMALIZATION = join(ROOT, "materials/hero-model-library/priority-evidence/transparent-component-material-normalization-v1.json");

const targets = [
  {
    componentId: "historical-jetragon-7bc2fa3f8",
    heroId: "acquired-jetragon",
    nameZh: "空渦龍",
    historicalPath: "content/assets/models/community/0d9eed3ab4e8246e20a12e2f0ee03786931aeacfe4976e2c1a07c3bbf9106fa6.glb",
    historicalSha256: "0d9eed3ab4e8246e20a12e2f0ee03786931aeacfe4976e2c1a07c3bbf9106fa6",
    retainedPath: "content/assets/models/community/0d9eed3ab4e8246e20a12e2f0ee03786931aeacfe4976e2c1a07c3bbf9106fa6.glb",
    adoptedComponentId: "historical-jetragon-7bc2fa3f8",
    transformation: "exact-historical-source",
  },
  {
    componentId: "historical-astralym-7bc2fa3f8",
    heroId: "acquired-astralym",
    nameZh: "枯星龍",
    historicalPath: "content/assets/models/community/618a52817f4fe563ddf339563856180c3acb27106d5fdb839fb469c642495ea8.glb",
    historicalSha256: "618a52817f4fe563ddf339563856180c3acb27106d5fdb839fb469c642495ea8",
    retainedPath: "content/assets/models/community/618a52817f4fe563ddf339563856180c3acb27106d5fdb839fb469c642495ea8.glb",
    adoptedComponentId: "historical-astralym-decimated-c45f111d",
    transformation: "emissive-locked-decimation",
  },
  {
    componentId: "historical-kita-kita-7bc2fa3f8",
    heroId: "acquired-kita-kita",
    nameZh: "吉他吉他老伯",
    historicalPath: "content/assets/models/community/2bbff051c41157f9c9abdf9e9ca6c0b930e15687380f109eefdf208af5d4eb8c.glb",
    historicalSha256: "2bbff051c41157f9c9abdf9e9ca6c0b930e15687380f109eefdf208af5d4eb8c",
    retainedPath: "materials/hero-model-library/source-artifacts/historical-model-recovery-7bc2fa3f8/2bbff051c41157f9c9abdf9e9ca6c0b930e15687380f109eefdf208af5d4eb8c.glb",
    adoptedComponentId: "historical-kita-kita-7bc2fa3f8",
    transformation: "material-alpha-normalization",
  },
  {
    componentId: "historical-lord-nightmares-7bc2fa3f8",
    heroId: "acquired-lord-nightmares",
    nameZh: "金色魔王／惡夢之王",
    historicalPath: "content/assets/models/community/d5cf4ff0969a21787bfcdd1fabf787339e91c37e266231602004fc2edb5993c8.glb",
    historicalSha256: "d5cf4ff0969a21787bfcdd1fabf787339e91c37e266231602004fc2edb5993c8",
    retainedPath: "materials/hero-model-library/source-artifacts/historical-model-recovery-7bc2fa3f8/d5cf4ff0969a21787bfcdd1fabf787339e91c37e266231602004fc2edb5993c8.glb",
    adoptedComponentId: "historical-lord-nightmares-7bc2fa3f8",
    transformation: "material-alpha-normalization",
  },
] as const;

const sha = (bytes: Uint8Array | Buffer) => createHash("sha256").update(bytes).digest("hex");
const pin = (gitPath: string) => {
  const bytes = readFileSync(join(ROOT, gitPath));
  return { gitPath, bytes: bytes.length, sha256: sha(bytes) };
};
const codeInputs = [
  "packages/shared/src/content/modelUpload/adoptionPolicy.json",
  "packages/shared/src/content/modelUpload/budget.ts",
  "packages/shared/src/content/modelUpload/heroModel.ts",
  "packages/shared/src/content/modelUpload/inspect.ts",
  "packages/shared/src/content/modelUpload/glb.ts",
  "packages/shared/src/content/heroForge/communityAcquired.ts",
  "tools/hero-model-library/audit_historical_model_lineage.mts",
];

const downloads = JSON.parse(readFileSync(DOWNLOADS, "utf8"));
const source = [...downloads.publicSources, ...(downloads.paidSources ?? [])]
  .find((row: any) => row.id === "ggd-historical-model-recovery-7bc2fa3f8");
assert(source, "historical source registry missing");
const sourceById = new Map(source.componentCandidates.map((row: any) => [row.id, row]));
const registration = JSON.parse(readFileSync(REGISTRATION, "utf8"));
const registrationByHero = new Map(registration.registrations.map((row: any) => [row.heroId, row]));
const validator = createRequire(join(ROOT, "packages/shared/package.json"))("gltf-validator");

const records = [];
for (const target of targets) {
  const historyBytes = execFileSync("git", ["show", `${HISTORICAL_COMMIT}:${target.historicalPath}`], { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 });
  const retainedBytes = readFileSync(join(ROOT, target.retainedPath));
  assert.equal(sha(historyBytes), target.historicalSha256, `${target.componentId}: historical Git SHA changed`);
  assert.deepEqual(retainedBytes, historyBytes, `${target.componentId}: retained bytes differ from historical Git`);

  const sourceCandidate: any = sourceById.get(target.componentId);
  assert(sourceCandidate, `${target.componentId}: source candidate missing`);
  const sourceArtifact = sourceCandidate.sourceArtifact;
  const sourcePin = sourceArtifact ?? sourceCandidate;
  assert.equal(sourcePin.sha256, target.historicalSha256, `${target.componentId}: source lineage SHA mismatch`);
  assert.equal(sourcePin.bytes, retainedBytes.length, `${target.componentId}: source lineage size mismatch`);

  const exactInspection = await inspectModelUpload(retainedBytes);
  const exactBudget = heroModelBudgetIssues(exactInspection);
  const exactKhronos = await validator.validateBytes(new Uint8Array(retainedBytes), {
    uri: target.historicalPath,
    maxIssues: 0,
    writeTimestamp: false,
    externalResourceFunction: async () => { throw new Error("external resources prohibited"); },
  });
  assert.equal(exactKhronos.issues.numErrors, 0, `${target.componentId}: Khronos errors`);
  assert.equal(exactKhronos.issues.truncated, false, `${target.componentId}: truncated Khronos report`);

  const registered: any = registrationByHero.get(target.heroId);
  assert(registered, `${target.heroId}: lineage option registration missing`);
  assert.equal(registered.componentId, target.adoptedComponentId, `${target.heroId}: adopted lineage component changed`);
  const options = ACQUIRED_MODEL_OPTIONS[target.heroId] ?? [];
  assert(options.length > 1, `${target.heroId}: no retained non-default options`);
  assert.equal(options.includes(registered.modelKey), true, `${target.heroId}: registered lineage option absent`);
  assert.notEqual(options[0], registered.modelKey, `${target.heroId}: historical lineage option became default`);

  const modelDocPath = `content/models/${registered.modelKey}.json`;
  const modelDoc = JSON.parse(readFileSync(join(ROOT, modelDocPath), "utf8"));
  const adoptedPath = `content/${modelDoc.glbPath}`;
  const adoptedBytes = readFileSync(join(ROOT, adoptedPath));
  assert.equal(sha(adoptedBytes), registered.modelGlb.sha256, `${target.heroId}: adopted GLB SHA changed`);
  const adoptedInspection = await inspectModelUpload(adoptedBytes);
  const adoptedBudget = heroModelBudgetIssues(adoptedInspection);
  assert.deepEqual(adoptedBudget.errors, [], `${target.heroId}: adopted option violates current policy`);
  const adoptedKhronos = await validator.validateBytes(new Uint8Array(adoptedBytes), { uri: adoptedPath, maxIssues: 0, writeTimestamp: false });
  assert.equal(adoptedKhronos.issues.numErrors, 0, `${target.heroId}: adopted Khronos errors`);
  assert.equal(adoptedKhronos.issues.truncated, false, `${target.heroId}: adopted Khronos truncated`);
  assert.deepEqual(
    adoptedInspection.clips.map((clip) => clip.name),
    exactInspection.clips.map((clip) => clip.name),
    `${target.heroId}: adopted clip names differ from exact historical source`,
  );

  const exactDirectlySelectable = target.transformation === "exact-historical-source";
  const sourceReason = exactDirectlySelectable
    ? "exact historical bytes satisfy current adoption policy and are the registered lineage option"
    : target.transformation === "emissive-locked-decimation"
      ? "exact source is preserved but exceeds the current 10,000-triangle adoption trigger; the validated 7,996-triangle descendant is registered"
      : "exact source is preserved as a Git source artifact; the material-normalized descendant is registered because the source atlas alpha made the raw presentation unsuitable";
  records.push({
    id: target.componentId,
    heroId: target.heroId,
    nameZh: target.nameZh,
    recoveredFrom: {
      commit: HISTORICAL_COMMIT,
      gitObject: `${HISTORICAL_COMMIT}:${target.historicalPath}`,
      originalGitPath: target.historicalPath,
      retainedGitPath: target.retainedPath,
      bytes: retainedBytes.length,
      sha256: sha(retainedBytes),
      byteIdentical: true,
    },
    exactSourceValidation: {
      khronos: { errors: exactKhronos.issues.numErrors, warnings: exactKhronos.issues.numWarnings, truncated: exactKhronos.issues.truncated },
      metrics: {
        triangles: exactInspection.triangles,
        drawPrimitives: exactInspection.meshes,
        maxTextureEdge: Math.max(...exactInspection.textures.flatMap((texture) => [texture.width, texture.height])),
        clipCount: exactInspection.clips.length,
        maxAnimationChannels: Math.max(...exactInspection.clips.map((clip) => clip.channels)),
      },
      runtimeBudget: exactBudget,
      directlySelectable: exactDirectlySelectable,
      reason: sourceReason,
    },
    adoptedLineageOption: {
      transformation: target.transformation,
      componentId: registered.componentId,
      modelKey: registered.modelKey,
      modelDocument: pin(modelDocPath),
      modelGlb: pin(adoptedPath),
      byteIdenticalToExactSource: sha(adoptedBytes) === sha(retainedBytes),
      clipNamesPreserved: true,
      metrics: {
        triangles: adoptedInspection.triangles,
        drawPrimitives: adoptedInspection.meshes,
        maxTextureEdge: Math.max(...adoptedInspection.textures.flatMap((texture) => [texture.width, texture.height])),
        clipCount: adoptedInspection.clips.length,
        maxAnimationChannels: Math.max(...adoptedInspection.clips.map((clip) => clip.channels)),
      },
      runtimeBudget: adoptedBudget,
      khronos: { errors: adoptedKhronos.issues.numErrors, warnings: adoptedKhronos.issues.numWarnings, truncated: adoptedKhronos.issues.truncated },
      dropdown: {
        defaultModelKey: options[0],
        optionIndex: options.indexOf(registered.modelKey),
        isDefault: false,
        locallyRegistered: true,
        productionDeploymentVerified: false,
      },
    },
    backup: {
      s3Uri: sourceCandidate.s3Uri ?? sourceArtifact?.s3Uri ?? null,
      s3ArchiveMember: sourceCandidate.s3ArchiveMember ?? sourceArtifact?.s3ArchiveMember ?? null,
      readbackReceiptPath: sourceCandidate.backupReceiptPath ?? sourceArtifact?.backupReceiptPath ?? null,
      readbackReceiptSha256: sourceCandidate.backupReceiptSha256 ?? sourceArtifact?.backupReceiptSha256 ?? null,
    },
  });
}

const receipt = {
  schema: "ggd-historical-model-lineage-audit@1",
  scope: "Exact historical Git-byte retention, current GLB validation, standardized descendant relationship, local non-default dropdown registration and default preservation. Production deployment is not asserted.",
  historicalCommit: HISTORICAL_COMMIT,
  currentPolicy: { adoption: HERO_MODEL_ADOPTION_POLICY, runtimeBudget: HERO_MODEL_BUDGET },
  inputs: [pin(DOWNLOADS.replace(`${ROOT}/`, "")), pin(REGISTRATION.replace(`${ROOT}/`, "")), pin(DECIMATION.replace(`${ROOT}/`, "")), pin(NORMALIZATION.replace(`${ROOT}/`, "")), ...codeInputs.map(pin)],
  records,
  summary: {
    exactHistoricalGlbsRetained: records.length,
    exactHistoricalGlbsByteIdentical: records.filter((row) => row.recoveredFrom.byteIdentical).length,
    exactHistoricalGlbsKhronosPassed: records.filter((row) => row.exactSourceValidation.khronos.errors === 0 && !row.exactSourceValidation.khronos.truncated).length,
    exactHistoricalGlbsDirectlySelectable: records.filter((row) => row.exactSourceValidation.directlySelectable).length,
    standardizedLineageOptionsRegistered: records.filter((row) => row.adoptedLineageOption.dropdown.locallyRegistered).length,
    defaultsChanged: records.filter((row) => row.adoptedLineageOption.dropdown.isDefault).length,
    productionDeploymentVerified: false,
  },
};
const rendered = JSON.stringify(receipt, null, 2) + "\n";
if (WRITE) writeFileSync(OUTPUT, rendered);
else if (readFileSync(OUTPUT, "utf8") !== rendered) throw new Error(`stale ${relative(ROOT, OUTPUT)}; run with --write`);
console.log(JSON.stringify(receipt.summary));
