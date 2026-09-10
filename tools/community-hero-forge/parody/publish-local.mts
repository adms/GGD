/** Public author/reviewer workflow for already verified ZIPs, loopback only.
 * Requires Owner-authorized disposable test accounts. Never grants privileges,
 * enables site flags, writes content/, or treats local publication as deployment.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { readPackageZip } from "../../../packages/shared/src/content/import/readPackageZip.js";
import { readTargetProfileFacts } from "../../../apps/editor/src/export-center/exportPolicy.js";
import { contentSha256 } from "../../../packages/shared/src/content/import/jcs.js";
import { zHeroProject } from "../../../packages/shared/src/content/heroForge/schema.js";
import { uploadedHeroModelPath } from "../../../packages/shared/src/content/modelUpload/heroModelSchema.js";
const { values: v } = parseArgs({ options: {
  "service-proof": { type: "string" }, output: { type: "string" },
  "platform-port": { type: "string" }, author: { type: "string" }, reviewer: { type: "string" },
  "publish-passing-only": { type: "boolean", default: false },
  "resume-identical-drafts": { type: "boolean", default: false },
} });
assert.equal(process.env.GGD_LOCAL_COMMUNITY_PROOF, "disposable-local-only");
const password = process.env.GGD_LOCAL_PROOF_PASSWORD;
assert(v["service-proof"] && v.output && v.author && v.reviewer && password);
assert.notEqual(v.author, v.reviewer);
const port = Number(v["platform-port"]);
assert(Number.isInteger(port) && port > 0 && port < 65536);
const origin = `http://127.0.0.1:${port}/api/v1`;
const input = await fs.realpath(v["service-proof"]), output = path.resolve(v.output);
assert(output !== input && !output.startsWith(input + path.sep));
const proofBytes = await fs.readFile(path.join(input, "report.json"));
const source = JSON.parse(proofBytes.toString());
assert.equal(source.schema, "ggd-handoff-service-proof@1");
assert(v["publish-passing-only"] ? ["passed", "failed"].includes(source.status) : source.status === "passed");
assert.equal(source.origin, origin);
const selected = source.results.filter((item: any) => item.status === "passed");
const blocked = source.results.filter((item: any) => item.status !== "passed");
assert.equal(source.failed, blocked.length);
assert.equal(source.passed, selected.length);
if (!v["publish-passing-only"]) assert.equal(blocked.length, 0);
assert(source.results.length > 0);
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const run = "review-" + sha(proofBytes).slice(0, 16);
await fs.mkdir(output); // Never overwrite prior evidence.
const results: any[] = [];
const report: any = { schema: "ggd-handoff-publication-proof@1", origin, startedAt: new Date().toISOString(),
  serviceProofSha256: sha(proofBytes), target: source.target, status: "running", results, blocked,
  scope: "Disposable local author draft, submission, authenticated admin publication and attributed source download. Not formal deployment, visual or original-design approval." };
const save = () => fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
async function request(route: string, token = "", body?: unknown, extra: Record<string, string> = {}, method = "POST") {
  const binary = body instanceof Uint8Array;
  const response = await fetch(origin + route, { method: body === undefined ? "GET" : method, redirect: "error",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "content-type": binary ? "application/zip" : "application/json" }), ...extra },
    body: body === undefined ? undefined : binary ? Uint8Array.from(body) : JSON.stringify(body), signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`${route}: HTTP ${response.status} ${await response.text()}`);
  return response;
}
const json = async (route: string, token = "", body?: unknown, extra?: Record<string, string>) => (await request(route, token, body, extra)).json();
try {
  const a = await json("/auth/login", "", { username: v.author, password });
  const r = await json("/auth/login", "", { username: v.reviewer, password });
  assert(r.account.roles.includes("admin"));
  const at = a.tokens.accessToken, rt = r.tokens.accessToken;
  const facts = readTargetProfileFacts(await json("/hero-import/target-profile", at));
  assert.deepEqual({ gameRevision: facts.gameRevision, contentVersion: facts.contentVersion, migrationFingerprint: facts.migrationFingerprint, processorFingerprint: facts.authoringProcessorFingerprint }, source.target);
  // Existing drafts may only be reused explicitly and byte-for-byte. This tool
  // never overwrites a work or guesses its next draft revision.
  const mine = await json("/hero-works/mine", at);
  assert(Array.isArray(mine));
  for (const item of selected) {
    const existing = mine.find((work: any) => work.id === item.projectId);
    if (existing) {
      assert(v["resume-identical-drafts"], `Existing work: ${item.projectId}`);
      assert.equal(contentSha256(existing.draft?.project), item.sourceDigest, `Existing draft differs: ${item.projectId}`);
    }
  }
  for (const item of selected) {
    const result: any = { name: item.name, workId: item.projectId, status: "running" }; results.push(result);
    assert.equal(item.status, "passed");
    assert.equal(path.basename(item.archive), item.archive);
    const archive = new Uint8Array(await fs.readFile(path.join(input, item.archive)));
    assert.equal(`sha256:${sha(archive)}`, item.archiveSha256);
    const pkg = readPackageZip(archive);
    assert.equal(pkg.manifest.packageDigest, item.packageDigest);
    const project = zHeroProject.parse(pkg.documents.find(d => d.path === `authoring/hero-projects/${item.projectId}.json`)?.document);
    assert.equal(contentSha256(project), item.sourceDigest);
    assert.equal(project.brief.name, item.name);
    const model = project.presentation.uploadedModel;
    assert(model);
    const modelBytes = pkg.assets.find(asset => asset.path === uploadedHeroModelPath(model))?.bytes;
    assert(modelBytes && sha(modelBytes) === model.sha256);
    await request(`/hero-model-assets/${model.sha256}`, at, modelBytes, { "content-type": "model/gltf-binary" }, "PUT");
    if (!mine.some((work: any) => work.id === project.projectId)) await json("/hero-works/draft", at, { workId: project.projectId, expectedRevision: 0,
      payload: { project, rawInputs: {}, mode: "visual", origin: project.acceptedPlan!.origin } });
    result.draftSaved = true; await save();
    const submission = await json("/hero-submissions", at, archive, {
      "x-ggd-work-id": project.projectId, "x-ggd-operation-id": `${run}-submit-${project.projectId}`,
      "x-ggd-allow-attribution-remix": "true" });
    result.submissionId = submission.id; await save();
    assert.equal(submission.version.packageDigest, pkg.manifest.packageDigest);
    const review = await json(`/admin/hero-submissions/${submission.id}`, rt);
    await json(`/admin/hero-submissions/${submission.id}/publish`, rt, { operationId: `${run}-publish-${project.projectId}`,
      action: "publish", expectedRevision: review.publication.revision,
      reason: "Owner-authorized isolated 37-hero adaptation workflow acceptance. Behavior and ZIP proofs recorded; no production or visual approval claimed." });
    const published = await json(`/admin/hero-submissions/${submission.id}`, rt);
    assert.equal(published.status, "published");
    assert.equal(published.publication.published.submissionId, submission.id);
    // A distinct account downloads through the public attributed-remix path.
    const restored = new Uint8Array(await (await request(`/hero-works/${project.projectId}/source/package`, rt)).arrayBuffer());
    assert.deepEqual(restored, archive);
    Object.assign(result, { status: "passed", packageDigest: pkg.manifest.packageDigest,
      versionId: published.publication.published.version.versionId,
      publicationRevision: published.publication.revision,
      archiveSha256: sha(restored), sourceDigest: item.sourceDigest,
      modelSha256: item.modelSha256, attributedSourceRestored: true });
    await save(); console.log(JSON.stringify({ name: result.name, status: result.status }));
  }
  const listed = await json("/hero-works/published");
  for (const result of results) assert(listed.some((row: any) => row.workId === result.workId && row.status === "published" && row.name === result.name && row.packageDigest === result.packageDigest));
  report.passed = results.length; report.status = blocked.length ? "partial" : "passed";
} catch (error) {
  report.status = "failed"; report.error = error instanceof Error ? error.message : String(error); process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString(); await save();
  console.log(JSON.stringify({ output, status: report.status, passed: report.passed, error: report.error }));
}
