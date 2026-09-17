import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { ModelVersions } from "../../../../apps/content-api/src/modelVersions";
import { spliceMembers } from "../../../../packages/shared/src/content/editModel";
import { zModelVersionCommand } from "../../../../packages/shared/src/content/schema/championModelVersions";

const [repoArg, candidateArg, mode] = process.argv.slice(2);
if (!repoArg || !candidateArg || !["--plan", "--apply"].includes(mode ?? "")) {
  throw new Error("usage: pipeline_promote.mts REPO CANDIDATE_DIR --plan|--apply");
}

const repo = resolve(repoArg);
const content = join(repo, "content");
const candidate = resolve(candidateArg);
const receipt = JSON.parse(readFileSync(join(candidate, "candidate-receipt.json"), "utf8"));
assert.equal(receipt.schema, "ggd.jstars-runtime-model-candidate@1");
assert.equal(receipt.source.identityVerified, true);
const heroId = String(receipt.source.heroId);
const sourceModelKey = String(receipt.modelDocument.id);
const championPath = join(content, "champions", `${heroId}.json`);
assert.ok(existsSync(championPath), `hero definition does not exist: ${heroId}`);

const source = {
  kind: "exact" as const,
  character: String(receipt.source.character),
  work: String(receipt.source.work),
  library: String(receipt.source.sourceId),
  reference: String(receipt.source.reference),
  tier: "original" as const,
  selectionClass: "canonical-game" as const,
  sourceGame: "J-Stars Victory VS+",
  sourcePlatform: String(receipt.source.platform),
  sourceGameReleasedAt: "2015-06-26",
  sourceGameReleaseReference: "https://blog.playstation.com/archive/2015/06/26/anime-brawler-j-stars-victory-vs-hits-ps4-ps3-ps-vita-today",
};

const service = new ModelVersions(content);
const before = service.state(heroId);
const candidateOnly = before.versions.find((row) =>
  row.sourceModelKey === sourceModelKey
  && row.source.reference === source.reference
  && row.source.library === source.library
  && row.automaticEligible === false,
);
assert.ok(candidateOnly, "independent non-default J-Stars option must be registered before promotion");

const eligible = before.versions.find((row) =>
  row.sourceModelKey === sourceModelKey
  && row.source.reference === source.reference
  && row.source.library === source.library
  && row.automaticEligible === true,
);
const plan = {
  schema: "ggd.jstars-priority-six-default-plan@1",
  heroId,
  sourceModelKey,
  candidateOnlyModelKey: candidateOnly.modelKey,
  previousActiveModelKey: before.activeModelKey,
  previousSelectionMode: before.selectionMode,
  manualSelectionWillBePreserved: before.selectionMode === "manual",
  automaticEligible: true,
  apply: mode === "--apply",
  productionDeploymentVerified: false,
};
if (mode === "--plan") {
  process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
  process.exit(0);
}

let nextChampion;
let promotedModelKey: string;
if (eligible) {
  service.verify(eligible);
  promotedModelKey = eligible.modelKey;
  nextChampion = before.selectionMode === "automatic"
    ? (await service.prepare(heroId, zModelVersionCommand.parse({ action: "automatic", expectedHash: before.expectedHash }))).champion
    : service.champion(heroId);
} else {
  const next = await service.prepare(heroId, zModelVersionCommand.parse({
    action: "register",
    expectedHash: before.expectedHash,
    sourceModelKey,
    label: `${receipt.source.label}｜預設採用核准`,
    source,
    automaticEligible: true,
  }));
  service.writeArtifacts(next.artifacts);
  promotedModelKey = next.artifacts.at(-1)!.version.modelKey;
  nextChampion = next.champion;
}

if (before.selectionMode === "manual") {
  assert.equal(nextChampion.modelSelectionMode, "manual");
  assert.equal(nextChampion.modelKey, before.activeModelKey, "manual active selection must not change");
} else {
  assert.equal(nextChampion.modelSelectionMode, "automatic");
  assert.equal(nextChampion.modelKey, promotedModelKey, "eligible J-Stars candidate must become the automatic default");
}

const raw = readFileSync(championPath, "utf8");
const updated = spliceMembers(raw, {
  modelKey: nextChampion.modelKey,
  modelVersions: nextChampion.modelVersions,
  modelSelectionMode: nextChampion.modelSelectionMode,
});
if (updated !== raw) {
  const temporary = `${championPath}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, updated, { flag: "wx" });
    renameSync(temporary, championPath);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

const after = service.state(heroId);
for (const version of after.versions) service.verify(version);
assert.equal(after.selectionMode, before.selectionMode);
if (before.selectionMode === "manual") assert.equal(after.activeModelKey, before.activeModelKey);
else assert.equal(after.activeModelKey, promotedModelKey);

process.stdout.write(JSON.stringify({
  ...plan,
  status: eligible ? "already-promoted" : (before.selectionMode === "manual" ? "manual-selection-preserved" : "automatic-default-applied"),
  promotedModelKey,
  activeModelKey: after.activeModelKey,
  selectionMode: after.selectionMode,
  manualSelectionPreserved: before.selectionMode === "manual" ? after.activeModelKey === before.activeModelKey : null,
  automaticDefaultApplied: before.selectionMode === "automatic" && after.activeModelKey === promotedModelKey,
}, null, 2) + "\n");
