/**
 * Publish an Editor HeroProject batch through the real loopback Platform flow.
 *
 * This is deliberately opt-in and loopback-only. It saves each Editor draft,
 * asks the configured importer to build and inspect the complete ZIP, submits
 * the immutable archive, publishes it as an administrator, then proves one
 * hero can move to v2 and restore v1 without changing another hero.
 *
 * It does not claim visual or production acceptance. Run it against a fresh,
 * disposable Platform data directory so canonical hero ids remain meaningful.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import { isLoopbackHost } from "../../apps/content-api/src/guard";
import { readTargetProfileFacts } from "../../apps/editor/src/export-center/exportPolicy";
import { zHeroProject, type HeroProject } from "../../packages/shared/src/content/heroForge/schema";
import { HERO_SLOTS } from "../../packages/shared/src/content/heroForge/constants";
import { zHeroControl, zHeroInspection, zHeroReviewView, zHeroSnapshot, zHeroWork } from "../../packages/shared/src/content/communityHero";
import { buildHeroSourcePackage } from "../../packages/shared/src/content/import/heroSourcePackage";
import { buildRuntimePackageZip, packageZipInput, binarySha256 } from "../../packages/shared/src/content/import/packageZip";
import { readPackageZip } from "../../packages/shared/src/content/import/readPackageZip";
import { contentSha256 } from "../../packages/shared/src/content/import/jcs";

const { values } = parseArgs({ options: {
  "projects-dir": { type: "string" },
  "model-dir": { type: "string" },
  origin: { type: "string" },
  out: { type: "string" },
  authors: { type: "string" },
  reviewer: { type: "string" },
  ids: { type: "string" },
  "expect-count": { type: "string" },
  "rollback-id": { type: "string" },
  "canonical-takeover": { type: "boolean" },
  concurrency: { type: "string" },
  help: { type: "boolean" },
} });

if (values.help) {
  console.log("Usage: GGD_LOCAL_COMMUNITY_PROOF=disposable-local-only GGD_LOCAL_PROOF_PASSWORD=<private> node --import tsx tools/editor-acceptance/community-hero-release-check.mts --projects-dir <HeroProject directory> --origin http://127.0.0.1:<port> --out /private/tmp/<new-run> --authors hero-author[,model-author] --reviewer hero-reviewer [--canonical-takeover] [--concurrency 1|2] [--model-dir <sha256.glb directory>] [--ids id-a,id-b] [--expect-count N] [--rollback-id id-a]\nPublishes every selected project through draft -> complete ZIP -> inspection -> submission -> admin publication, then publishes a disposable v2 and restores v1 for one hero while checking another hero is unchanged. --canonical-takeover uses the reviewer-owned, admin-only same-ID migration path. Concurrency is capped at the importer's two isolated workers. Use only with a fresh isolated Platform data directory; no production or visual acceptance is claimed.");
  process.exit(0);
}

assert.equal(process.env.GGD_LOCAL_COMMUNITY_PROOF, "disposable-local-only", "Explicit disposable local opt-in is required.");
const password = process.env.GGD_LOCAL_PROOF_PASSWORD;
assert(password, "GGD_LOCAL_PROOF_PASSWORD is required and must stay outside reports and arguments.");
assert(values["projects-dir"] && values.origin && values.out && values.authors && values.reviewer, "--projects-dir, --origin, --out, --authors and --reviewer are required; use --help.");

function loopbackOrigin(raw: string): string {
  const url = new URL(raw);
  assert(["http:", "https:"].includes(url.protocol) && isLoopbackHost(url.hostname)
    && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash,
  "--origin must be a loopback HTTP(S) origin without credentials, path, query or fragment.");
  return `${url.origin}/api/v1`;
}

const origin = loopbackOrigin(values.origin);
const inputDirectory = await fs.realpath(path.resolve(values["projects-dir"]));
const modelDirectory = values["model-dir"] ? await fs.realpath(path.resolve(values["model-dir"])) : null;
const outputParent = await fs.realpath(path.dirname(path.resolve(values.out)));
const temporaryRoots = await Promise.all(["/tmp", tmpdir()].map((directory) => fs.realpath(directory)));
assert(temporaryRoots.some((root) => outputParent === root || outputParent.startsWith(root + path.sep)), "--out must be under a system temporary directory.");
const output = path.join(outputParent, path.basename(values.out));
await fs.mkdir(output); // Previous failures are evidence; never overwrite a run.

const canonicalTakeover = values["canonical-takeover"] === true;
const authorNames = canonicalTakeover ? [values.reviewer] : [...new Set(values.authors.split(",").map((value) => value.trim()).filter(Boolean))];
assert(authorNames.length > 0 && (canonicalTakeover || !authorNames.includes(values.reviewer)), "At least one author distinct from the reviewer is required outside canonical takeover mode.");
const requestedIds = values.ids?.split(",").map((value) => value.trim()).filter(Boolean);
const expectedCount = values["expect-count"] === undefined ? null : Number(values["expect-count"]);
assert(expectedCount === null || Number.isInteger(expectedCount) && expectedCount > 0, "--expect-count must be a positive integer.");
const concurrency = values.concurrency === undefined ? 1 : Number(values.concurrency);
assert(Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 2, "--concurrency must be 1 or 2.");

type ProjectInput = { file: string; project: HeroProject };
const projectFiles = (await fs.readdir(inputDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
  .map((entry) => entry.name)
  .sort();
const allProjects: ProjectInput[] = [];
for (const file of projectFiles) {
  try {
    allProjects.push({ file, project: zHeroProject.parse(JSON.parse(await fs.readFile(path.join(inputDirectory, file), "utf8"))) });
  } catch (error) {
    if (file.endsWith(".hero-project.json") || file.endsWith(".project.json")) throw error;
  }
}
const projects = requestedIds?.length
  ? allProjects.filter(({ project }) => requestedIds.includes(project.projectId))
  : allProjects;
if (requestedIds?.length) assert.equal(projects.length, new Set(requestedIds).size, "--ids contains an unknown or duplicate project id.");
if (expectedCount !== null) assert.equal(projects.length, expectedCount, "Selected project count does not match --expect-count.");
assert(projects.length >= 2, "At least two projects are required to prove cross-hero rollback isolation.");
assert.equal(new Set(projects.map(({ project }) => project.projectId)).size, projects.length, "Project ids must be unique.");
const rollbackId = values["rollback-id"] ?? projects[0]!.project.projectId;
assert(projects.some(({ project }) => project.projectId === rollbackId), "--rollback-id must identify a selected project.");

type Actor = { account: { id: string; username: string }; tokens: { accessToken: string } };
let importerRetries = 0;
async function request(route: string, token: string | null, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");
  const binary = options.body instanceof Uint8Array;
  const retryable = route.includes("hero-import") || route.includes("hero-submissions");
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(origin + route, {
      method,
      redirect: "error",
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(options.body === undefined ? {} : { "content-type": binary ? "application/zip" : "application/json" }),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : binary ? Uint8Array.from(options.body) : JSON.stringify(options.body),
      signal: AbortSignal.timeout(90_000),
    });
    if (response.ok) return response;
    const body = await response.text();
    if (response.status === 503 && retryable && /hero_(?:importer_failed|importer_unavailable|takeover_unavailable)/.test(body) && attempt < 7) {
      importerRetries += 1;
      await new Promise((resolve) => setTimeout(resolve, Math.min(500 * 2 ** attempt, 8_000)));
      continue;
    }
    throw new Error(`${route}: HTTP ${response.status} ${body}`);
  }
}
const json = async (route: string, token: string | null, options?: Parameters<typeof request>[2]): Promise<unknown> => (await request(route, token, options)).json();
const login = async (username: string): Promise<Actor> => await json("/auth/login", null, { body: { username, password } }) as Actor;
// A batch is bounded well inside the platform's 15-minute access-token TTL.
// Sharing one in-flight login per account avoids turning a successful fast
// importer into an authentication-rate-limit test. Server-side authorization
// still runs for every request and any expired token fails closed.
const actorLogins = new Map<string, Promise<Actor>>();
const actorFor = (username: string): Promise<Actor> => {
  const existing = actorLogins.get(username);
  if (existing) return existing;
  const pending = login(username);
  actorLogins.set(username, pending);
  return pending;
};
async function existingWork(workId: string, token: string): Promise<ReturnType<typeof zHeroWork.parse> | null> {
  const response = await fetch(`${origin}/hero-works/${encodeURIComponent(workId)}`, {
    redirect: "error",
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`/hero-works/${workId}: HTTP ${response.status} ${await response.text()}`);
  const body = await response.json() as { work?: unknown };
  return zHeroWork.parse(body.work);
}
async function buildCompleteArchive(sourceArchive: Uint8Array, token: string, projectId: string): Promise<Uint8Array> {
  return new Uint8Array(await (await request(canonicalTakeover ? "/admin/hero-import/build" : "/hero-import/build", token, { body: sourceArchive, ...(canonicalTakeover ? { headers: { "x-ggd-work-id": projectId } } : {}) })).arrayBuffer());
}
const safeStem = (value: string) => value.replace(/[^a-zA-Z0-9._-]+/g, "-");
const saveJson = (name: string, value: unknown) => fs.writeFile(path.join(output, name), JSON.stringify(value, null, 2) + "\n");

type ReleaseReceipt = {
  id: string;
  name: string;
  file: string;
  author: string;
  status: "not-run" | "running" | "published" | "failed";
  error?: string;
  projectDigest?: string;
  sourceArchiveSha256?: string;
  sourceArchiveBytes?: number;
  packageArchiveSha256?: string;
  packageArchiveBytes?: number;
  packageDigest?: string;
  snapshotDigest?: string;
  submissionId?: string;
  publishedVersion?: string;
  publicationRevision?: number;
  historyCount?: number;
  draftRevision?: number;
  slots?: number;
};
const receipts: ReleaseReceipt[] = projects.map(({ file, project }, index) => ({
  id: project.projectId,
  name: project.brief.name,
  file,
  author: authorNames[index % authorNames.length]!,
  status: "not-run",
}));
const report: Record<string, unknown> = {
  schema: "ggd-community-hero-release-check@1",
  startedAt: new Date().toISOString(),
  status: "running",
  scope: `Loopback Editor project draft, importer ZIP build/inspection, immutable submission, admin publication and single-hero restore isolation${canonicalTakeover ? "; server-authorized canonical takeover" : ""}. No production or visual acceptance.`,
  origin,
  inputDirectory,
  selectedIds: projects.map(({ project }) => project.projectId),
  rollbackId,
  canonicalTakeover,
  concurrency,
  receipts,
};
let saveChain = Promise.resolve();
const save = () => saveChain = saveChain.then(() => saveJson("report.json", report));

async function modelBytes(project: HeroProject): Promise<Uint8Array | undefined> {
  const uploaded = project.presentation.uploadedModel;
  if (!uploaded) return undefined;
  assert(modelDirectory, `${project.projectId} requires --model-dir for uploaded model ${uploaded.sha256}.`);
  const bytes = new Uint8Array(await fs.readFile(path.join(modelDirectory, `${uploaded.sha256}.glb`)));
  assert.equal((await binarySha256(bytes)).replace(/^sha256:/, ""), uploaded.sha256, `${project.projectId} uploaded model SHA-256 mismatch.`);
  assert.equal(bytes.length, uploaded.byteSize, `${project.projectId} uploaded model byte count mismatch.`);
  return bytes;
}

try {
  const reviewer = await actorFor(values.reviewer);
  const profile = await json("/hero-import/target-profile", reviewer.tokens.accessToken);
  const facts = readTargetProfileFacts(profile);
  assert(facts.gameRevision && facts.contentVersion && facts.migrationFingerprint && facts.authoringProcessorFingerprint, "Target profile is incomplete.");
  const target = { gameRevision: facts.gameRevision, contentVersion: facts.contentVersion, migrationFingerprint: facts.migrationFingerprint, processorFingerprint: facts.authoringProcessorFingerprint };
  report.target = target;
  await saveJson("target-profile.json", profile);
  await save();

  const processProject = async (index: number, input: ProjectInput) => {
    const receipt = receipts[index]!;
    receipt.status = "running";
    await save();
    try {
      const project = input.project;
      assert(project.acceptedPlan, `${project.projectId} has no accepted plan.`);
      for (const slot of HERO_SLOTS) assert(project.acceptedPlan.slots[slot], `${project.projectId} is missing ${slot}.`);
      // The platform access token is intentionally short-lived. A large batch
      // must prove the whole workflow without treating an expired test session
      // as a hero failure, so each independent work starts with a fresh login.
      const author = await actorFor(receipt.author);
      const bytes = await modelBytes(project);
      if (project.presentation.uploadedModel && bytes) {
        await request(`/hero-model-assets/${project.presentation.uploadedModel.sha256}`, author.tokens.accessToken, {
          method: "PUT", body: bytes, headers: { "content-type": "model/gltf-binary" },
        });
      }
      const payload = { project, rawInputs: {}, mode: "advanced", origin: project.acceptedPlan.origin };
      const priorWork = await existingWork(project.projectId, author.tokens.accessToken);
      const work = zHeroWork.parse(await json("/hero-works/draft", author.tokens.accessToken, {
        body: { workId: project.projectId, expectedRevision: priorWork?.draftRevision ?? 0, payload },
      }));
      const source = buildHeroSourcePackage(project, [], target, bytes);
      const sourceArchive = (await buildRuntimePackageZip(packageZipInput(source, project.projectId))).bytes;
      const builtArchive = await buildCompleteArchive(sourceArchive, author.tokens.accessToken, project.projectId);
      receipt.sourceArchiveSha256 = await binarySha256(sourceArchive);
      receipt.sourceArchiveBytes = sourceArchive.length;
      receipt.packageArchiveSha256 = await binarySha256(builtArchive);
      receipt.packageArchiveBytes = builtArchive.length;
      const inspection = zHeroInspection.parse(await json(canonicalTakeover ? "/admin/hero-import/inspect" : "/hero-import/inspect", author.tokens.accessToken, { body: builtArchive, ...(canonicalTakeover ? { headers: { "x-ggd-work-id": project.projectId } } : {}) }));
      assert.deepEqual(inspection.project, project, `${project.projectId} service inspection changed the Editor project.`);
      const restored = readPackageZip(builtArchive);
      assert.equal(restored.manifest.base.gameRevision, target.gameRevision);
      assert.equal(restored.manifest.base.contentVersion, target.contentVersion);
      assert(restored.compiled.some((entry) => entry.path === `compiled/champions/${project.projectId}.json`), `${project.projectId} ZIP has no compiled champion.`);
      for (const slot of HERO_SLOTS) assert(restored.compiled.some((entry) => entry.path === `compiled/abilities/${project.projectId}.${slot.toLowerCase()}.json`), `${project.projectId} ZIP has no compiled ${slot}.`);
      const operationId = `release-${Date.now().toString(36)}-${index.toString(36)}`;
      const snapshot = zHeroSnapshot.parse(await json(canonicalTakeover ? "/admin/hero-submissions/takeover" : "/hero-submissions", author.tokens.accessToken, {
        body: builtArchive,
        headers: { "x-ggd-work-id": project.projectId, "x-ggd-operation-id": operationId, "x-ggd-allow-attribution-remix": "true" },
      }));
      assert.equal(snapshot.canonicalTakeover, canonicalTakeover, `${project.projectId} submission lost its canonical takeover authority.`);
      const activeReviewer = receipt.author === values.reviewer ? author : await actorFor(values.reviewer);
      const review = zHeroReviewView.parse(await json(`/admin/hero-submissions/${snapshot.id}`, activeReviewer.tokens.accessToken));
      assert.equal(review.status, "pending");
      assert.deepEqual(review.snapshot.inspection.project, project);
      const control = zHeroControl.parse(await json(`/admin/hero-submissions/${snapshot.id}/publish`, activeReviewer.tokens.accessToken, {
        body: { operationId: `publish-${operationId}`, action: "publish", expectedRevision: review.publication.revision,
          reason: "集中隔離驗收：完整原文、六槽、模型與資源引用、服務重編譯及固定投稿版本均已通過；不宣稱正式站或額外視覺微調。" },
      }));
      assert.equal(control.published?.submissionId, snapshot.id);
      assert.equal(work.id, project.projectId);
      const stem = `${String(index + 1).padStart(3, "0")}-${safeStem(project.projectId)}`;
      await fs.writeFile(path.join(output, `${stem}.zip`), builtArchive);
      await saveJson(`${stem}.inspection.json`, inspection);
      Object.assign(receipt, {
        status: "published",
        projectDigest: contentSha256(project),
        packageDigest: snapshot.version.packageDigest,
        snapshotDigest: snapshot.version.snapshotDigest,
        submissionId: snapshot.id,
        publishedVersion: control.published?.version.versionId,
        publicationRevision: control.revision,
        historyCount: control.history.length,
        draftRevision: work.draftRevision,
        slots: HERO_SLOTS.length,
      });
      console.log(JSON.stringify({ id: receipt.id, status: receipt.status, submissionId: receipt.submissionId }));
    } catch (error) {
      receipt.status = "failed";
      receipt.error = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ id: receipt.id, status: receipt.status, error: receipt.error }));
    }
    await save();
  };
  await Promise.all(Array.from({ length: concurrency }, async (_, worker) => {
    for (let index = worker; index < projects.length; index += concurrency) await processProject(index, projects[index]!);
  }));

  const failed = receipts.filter((receipt) => receipt.status !== "published");
  const published = receipts.filter((receipt) => receipt.status === "published");
  assert(published.length >= 2, "At least two projects must publish to prove rollback isolation.");
  const requestedRollback = published.find((receipt) => receipt.id === rollbackId);
  const rollbackReceipt = requestedRollback ?? published[0]!;
  const effectiveRollbackId = rollbackReceipt.id;
  const rollbackInput = projects.find(({ project }) => project.projectId === effectiveRollbackId)!;
  const unaffectedReceipt = published.find((receipt) => receipt.id !== effectiveRollbackId)!;
  assert(Number.isInteger(rollbackReceipt.draftRevision), `${effectiveRollbackId} has no saved draft revision.`);
  const rollbackAuthor = await actorFor(rollbackReceipt.author);
  const rollbackReviewer = rollbackReceipt.author === values.reviewer ? rollbackAuthor : await actorFor(values.reviewer);
  const unaffectedBefore = zHeroReviewView.parse(await json(`/admin/hero-submissions/${unaffectedReceipt.submissionId}`, rollbackReviewer.tokens.accessToken));
  const v1 = zHeroReviewView.parse(await json(`/admin/hero-submissions/${rollbackReceipt.submissionId}`, rollbackReviewer.tokens.accessToken));
  assert.equal(v1.publication.published?.submissionId, rollbackReceipt.submissionId);

  const projectV2 = structuredClone(rollbackInput.project);
  projectV2.revision += 1;
  projectV2.brief.concept += "\n\n[隔離版本回復驗收：暫時版本 v2]";
  const bytesV2 = await modelBytes(projectV2);
  const payloadV2 = { project: projectV2, rawInputs: {}, mode: "advanced", origin: projectV2.acceptedPlan!.origin };
  const workV2 = zHeroWork.parse(await json("/hero-works/draft", rollbackAuthor.tokens.accessToken, {
    body: { workId: projectV2.projectId, expectedRevision: rollbackReceipt.draftRevision, payload: payloadV2 },
  }));
  const sourceV2 = buildHeroSourcePackage(projectV2, [], target, bytesV2);
  const sourceArchiveV2 = (await buildRuntimePackageZip(packageZipInput(sourceV2, projectV2.projectId))).bytes;
  const builtArchiveV2 = await buildCompleteArchive(sourceArchiveV2, rollbackAuthor.tokens.accessToken, projectV2.projectId);
  const inspectionV2 = zHeroInspection.parse(await json(canonicalTakeover ? "/admin/hero-import/inspect" : "/hero-import/inspect", rollbackAuthor.tokens.accessToken, { body: builtArchiveV2, ...(canonicalTakeover ? { headers: { "x-ggd-work-id": projectV2.projectId } } : {}) }));
  assert.deepEqual(inspectionV2.project, projectV2);
  const v2Operation = `release-v2-${Date.now().toString(36)}`;
  const snapshotV2 = zHeroSnapshot.parse(await json(canonicalTakeover ? "/admin/hero-submissions/takeover" : "/hero-submissions", rollbackAuthor.tokens.accessToken, {
    body: builtArchiveV2,
    headers: { "x-ggd-work-id": projectV2.projectId, "x-ggd-operation-id": v2Operation, "x-ggd-allow-attribution-remix": "true" },
  }));
  assert.equal(snapshotV2.canonicalTakeover, canonicalTakeover, `${projectV2.projectId} v2 submission lost its canonical takeover authority.`);
  const reviewV2 = zHeroReviewView.parse(await json(`/admin/hero-submissions/${snapshotV2.id}`, rollbackReviewer.tokens.accessToken));
  const publishedV2 = zHeroControl.parse(await json(`/admin/hero-submissions/${snapshotV2.id}/publish`, rollbackReviewer.tokens.accessToken, {
    body: { operationId: `publish-${v2Operation}`, action: "publish", expectedRevision: reviewV2.publication.revision, reason: "隔離版本回復驗收：先發布暫時 v2。" },
  }));
  assert.equal(publishedV2.published?.submissionId, snapshotV2.id);
  const restoredV1 = zHeroControl.parse(await json(`/admin/hero-submissions/${rollbackReceipt.submissionId}/publish`, rollbackReviewer.tokens.accessToken, {
    body: { operationId: `restore-v1-${Date.now().toString(36)}`, action: "restore", expectedRevision: publishedV2.revision, reason: "隔離版本回復驗收：恢復已成功發布的 v1。" },
  }));
  assert.equal(restoredV1.published?.submissionId, rollbackReceipt.submissionId);
  assert(restoredV1.history.some((entry) => entry.submissionId === snapshotV2.id));
  assert(restoredV1.history.filter((entry) => entry.submissionId === rollbackReceipt.submissionId).length >= 2);
  const unaffectedAfter = zHeroReviewView.parse(await json(`/admin/hero-submissions/${unaffectedReceipt.submissionId}`, rollbackReviewer.tokens.accessToken));
  assert.deepEqual(unaffectedAfter.publication.published, unaffectedBefore.publication.published, "Restoring one hero changed another hero's published pointer.");
  assert.equal(unaffectedAfter.publication.revision, unaffectedBefore.publication.revision, "Restoring one hero changed another hero's control revision.");

  const publishedList = await json("/hero-works/published", null) as { items?: unknown[] } | unknown[];
  const publishedItems = Array.isArray(publishedList) ? publishedList : publishedList.items ?? [];
  const publishedText = JSON.stringify(publishedItems);
  for (const receipt of published) assert(publishedText.includes(receipt.id), `${receipt.id} is absent from the public published list.`);
  report.rollback = {
    status: "passed",
    workId: effectiveRollbackId,
    ...(requestedRollback ? {} : { fallbackFrom: rollbackId }),
    v1SubmissionId: rollbackReceipt.submissionId,
    v2SubmissionId: snapshotV2.id,
    restoredSubmissionId: restoredV1.published?.submissionId,
    draftRevision: workV2.draftRevision,
    publicationRevision: restoredV1.revision,
    historyCount: restoredV1.history.length,
    unaffectedWorkId: unaffectedReceipt.id,
    unaffectedSubmissionId: unaffectedReceipt.submissionId,
  };
  report.publishedListCount = publishedItems.length;
  report.passed = published.length;
  report.failed = failed.length;
  if (failed.length === 0) {
    report.status = "passed";
  } else {
    report.status = "failed";
    report.error = `${failed.length} project(s) did not publish; rollback isolation still passed for ${effectiveRollbackId}.`;
    process.exitCode = 1;
  }
} catch (error) {
  report.status = "failed";
  report.error = error instanceof Error ? error.stack ?? error.message : String(error);
  report.passed = receipts.filter((receipt) => receipt.status === "published").length;
  report.failed = receipts.length - Number(report.passed);
  process.exitCode = 1;
} finally {
  report.importerRetries = importerRetries;
  report.finishedAt = new Date().toISOString();
  await save();
  console.log(JSON.stringify({ output, status: report.status, passed: report.passed, failed: report.failed, rollback: report.rollback }));
}
