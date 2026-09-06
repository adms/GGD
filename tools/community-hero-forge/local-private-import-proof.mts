/** Full Main work-import round trip against the isolated production container. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { heroPackageProject, shippedHeroCatalog } from "../../packages/shared/testkit/heroPackageFixture";
import { HERO_IMPORT_PREFIX, heroImportHeaders } from "../../packages/shared/src/content/node/heroImportAuth";
import { readTargetProfileFacts } from "../../apps/editor/src/export-center/exportPolicy";
import { buildHeroSourcePackage } from "../../packages/shared/src/content/import/heroSourcePackage";
import { buildRuntimePackageZip, packageZipInput } from "../../packages/shared/src/content/import/packageZip";
import { readPackageZip } from "../../packages/shared/src/content/import/readPackageZip";

if (process.env.GGD_LOCAL_COMMUNITY_PROOF !== "disposable-local-only" || !process.env.GGD_LOCAL_PROOF_IMPORT_SECRET) throw new Error("Explicit local proof opt-in and disposable import secret are required.");
const secret = process.env.GGD_LOCAL_PROOF_IMPORT_SECRET;
const runId = `private-import-proof-${Date.now()}`;
const output = process.env.GGD_LOCAL_PROOF_REPORT ?? "/private/tmp/ggd-community-private-import-proof.json";
const proof: Record<string, any> = { schema: "ggd-community-private-import-proof@1", runId, status: "running", startedAt: new Date().toISOString(), limits: "Loopback Docker Main importer with HMAC. Not browser, platform review or production deployment evidence." };
async function request(path: string, body?: Uint8Array, identity?: Record<string, string>) {
  const method = body ? "POST" : "GET", target = HERO_IMPORT_PREFIX + path;
  const response = await fetch("http://127.0.0.1:8795" + target, { method, headers: { ...heroImportHeaders(secret, method, target, body, identity), ...(body ? { "content-type": "application/zip" } : {}) }, body: body ? Buffer.from(body) : undefined, signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response;
}
try {
  const facts = readTargetProfileFacts(await (await request("/active/target-profile")).json());
  assert(facts.gameRevision && facts.contentVersion && facts.migrationFingerprint && facts.authoringProcessorFingerprint);
  const target = { gameRevision: facts.gameRevision, contentVersion: facts.contentVersion, migrationFingerprint: facts.migrationFingerprint, processorFingerprint: facts.authoringProcessorFingerprint };
  proof.target = target;
  const project = heroPackageProject(shippedHeroCatalog(), runId);
  const source = buildHeroSourcePackage(project, [], target);
  const sourceZip = (await buildRuntimePackageZip(packageZipInput(source, project.projectId))).bytes;
  const built = new Uint8Array(await (await request("/hero-package", sourceZip)).arrayBuffer());
  const inspection = await (await request("/inspect-hero-package", built)).json() as any;
  assert.equal(inspection.project.brief.concept, project.brief.concept);
  const identity = { "x-ggd-work-id": project.projectId, "x-ggd-operation-id": runId };
  const prepared = await (await request("/prepare-work", built, identity)).json() as any;
  assert.equal(prepared.status, "stored");
  const retried = await (await request("/prepare-work", built, identity)).json() as any;
  assert.deepEqual(retried.version, prepared.version);
  const path = `/work-versions/${project.projectId}/${encodeURIComponent(prepared.version.versionId)}`;
  const detail = await (await request(path)).json() as any;
  const downloaded = new Uint8Array(await (await request(path + "/package")).arrayBuffer());
  const imported = readPackageZip(downloaded);
  assert.equal(imported.manifest.packageDigest, inspection.packageDigest);
  assert.equal(detail.version.snapshotDigest, prepared.version.snapshotDigest);
  assert.deepEqual(detail.project, project);
  proof.version = prepared.version; proof.archiveBytes = { built: built.length, downloaded: downloaded.length };
  proof.idempotentRetry = true; proof.editableSourceUnchanged = true;
  proof.status = "passed"; proof.finishedAt = new Date().toISOString();
  console.log(`Private Main stored ${project.projectId}: ${inspection.packageDigest}`);
} catch (error) { proof.status = "failed"; proof.error = error instanceof Error ? error.stack : String(error); process.exitCode = 1; console.error(proof.error); }
finally { writeFileSync(output, JSON.stringify(proof, null, 2) + "\n"); console.log(`Evidence: ${output}`); }
