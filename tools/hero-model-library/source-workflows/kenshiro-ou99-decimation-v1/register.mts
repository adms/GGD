import assert from "node:assert/strict";
import { existsSync, linkSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { ModelVersions } from "../../../../apps/content-api/src/modelVersions";
import { spliceMembers } from "../../../../packages/shared/src/content/editModel";
import { zModelVersionCommand } from "../../../../packages/shared/src/content/schema/championModelVersions";
import { fileJson } from "../../../../packages/shared/src/content/node";

const [repoArg, mode] = process.argv.slice(2);
if (!repoArg || !["--plan", "--apply"].includes(mode)) throw new Error("usage: register.mts REPO --plan|--apply");
const repo = resolve(repoArg);
const content = join(repo, "content");
const heroId = "godie-umal";
const sourceModelKey = "ou99.464696-standard-v1";
const championPath = join(content, "champions", `${heroId}.json`);
const sourceDocPath = join(content, "models", `${sourceModelKey}.json`);
const sourceDoc = JSON.parse(readFileSync(sourceDocPath, "utf8"));
const sourceAsset = join(content, sourceDoc.glbPath);
const source = {
  kind: "exact" as const,
  character: "拳四郎",
  work: "北斗神拳",
  library: "ou99 偶久網",
  reference: "https://www.ou99.com/thread-464696-1-1.html",
  tier: "w3x" as const,
  selectionClass: "community-mod" as const,
  sourceGame: "Warcraft III community model",
  sourcePlatform: "Windows",
};
const service = new ModelVersions(content);
const before = service.state(heroId);
const existing = before.versions.find((row) => row.sourceModelKey === sourceModelKey && row.source.reference === source.reference);
if (existing) {
  service.verify(existing);
  assert.notEqual(before.activeModelKey, existing.modelKey, "Kenshiro candidate must remain non-default");
  console.log(JSON.stringify({ status: "already-registered", modelKey: existing.modelKey, activeModelKey: before.activeModelKey }));
  process.exit(0);
}
const plan = { heroId, sourceModelKey, sourceAsset: sourceDoc.glbPath, previousActiveModelKey: before.activeModelKey, source, automaticEligible: false };
if (mode === "--plan") {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}
assert.ok(existsSync(sourceAsset));
const current = service.state(heroId);
const next = await service.prepare(heroId, zModelVersionCommand.parse({
  action: "register",
  expectedHash: current.expectedHash,
  sourceModelKey,
  label: "ou99 拳四郎（本尊／62 段原生動作／減面版）",
  source,
  automaticEligible: false,
}));
service.writeArtifacts(next.artifacts);
const registered = next.artifacts.at(-1)?.version;
assert.ok(registered);
assert.notEqual(next.champion.modelKey, registered.modelKey, "Registration unexpectedly changed the default model");
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
assert.notEqual(after.activeModelKey, registered.modelKey);
const retainedDefault = after.versions.find((row) => row.modelKey === after.activeModelKey);
assert.equal(retainedDefault?.source.kind, "previous");
console.log(JSON.stringify({ ...plan, status: "registered-non-default", candidateModelKey: registered.modelKey, activeModelKey: after.activeModelKey, versionCount: after.versions.length }, null, 2));
