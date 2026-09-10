/** Rebuild a complete handoff with the running, authenticated local importer.
 * Preserves every source project and model; compilation is not design approval.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { zHeroProject } from "../../packages/shared/src/content/heroForge/schema.js";
import { importHeroHandoffBatch } from "../../packages/shared/src/content/heroForge/handoff.js";
import { HERO_SLOTS } from "../../packages/shared/src/content/heroForge/constants.js";
import { buildHeroSourcePackage } from "../../packages/shared/src/content/import/heroSourcePackage.js";
import { buildRuntimePackageZip, packageZipInput, binarySha256 } from "../../packages/shared/src/content/import/packageZip.js";
import { readPackageZip } from "../../packages/shared/src/content/import/readPackageZip.js";
import { contentSha256 } from "../../packages/shared/src/content/import/jcs.js";
import { uploadedHeroModelPath } from "../../packages/shared/src/content/modelUpload/heroModelSchema.js";
import { readTargetProfileFacts } from "../../apps/editor/src/export-center/exportPolicy.js";

const { values } = parseArgs({ options: {
  handoff: { type: "string" }, out: { type: "string" },
  "projects-dir": { type: "string" }, "model-dir": { type: "string" },
  "platform-port": { type: "string" }, username: { type: "string" },
} });
assert.equal(process.env.GGD_LOCAL_COMMUNITY_PROOF, "disposable-local-only", "Explicit local acceptance opt-in is required.");
assert(Boolean(values.handoff) !== Boolean(values["projects-dir"]), "Select one handoff or directory of immutable .project.json sources.");
assert(values.out && values.username && process.env.GGD_LOCAL_PROOF_PASSWORD);
const port = Number(values["platform-port"]);
assert(Number.isInteger(port) && port > 0 && port < 65536);
const origin = `http://127.0.0.1:${port}/api/v1`;
const input = path.resolve(values.handoff ?? values["projects-dir"]!), output = path.resolve(values.out);
assert(output !== input && !output.startsWith(input + path.sep), "Evidence must use a new directory outside the input handoff.");
const safe = (relative: string) => {
  assert(!path.isAbsolute(relative) && !relative.includes("\\") && relative.split("/").every(part => part && part !== "." && part !== ".."));
  return path.join(input, relative);
};
let rows: { name: string; project: string; projectText: string }[];
if (values.handoff) {
  const index = JSON.parse(await fs.readFile(path.join(input, "index.json"), "utf8"));
  assert.equal(index.heroCount, 37); assert.equal(index.slotCount, 222); assert.equal(index.heroes.length, 37);
  const entries = await Promise.all(index.heroes.map(async (row: { name: string; project: string; recipe: string }) => ({
    ...row, projectText: await fs.readFile(safe(row.project), "utf8"), recipeText: await fs.readFile(safe(row.recipe), "utf8"),
  })));
  importHeroHandoffBatch(JSON.stringify(index), new Map(entries.flatMap(row => [[row.project, row.projectText], [row.recipe, row.recipeText]] as [string, string][])));
  rows = entries;
} else {
  rows = await Promise.all((await fs.readdir(input)).filter(name => name.endsWith(".project.json")).sort().map(async project => {
    const projectText = await fs.readFile(safe(project), "utf8");
    const raw = JSON.parse(projectText), parsed = zHeroProject.parse(raw);
    assert.deepEqual(parsed, raw, "Adoption must not silently add, strip or rewrite source fields.");
    return { name: parsed.brief.name, project, projectText };
  }));
  assert.equal(rows.length, 37);
  assert.equal(new Set(rows.map(row => JSON.parse(row.projectText).projectId)).size, rows.length);
}
await fs.mkdir(output); // Refuse to replace any previous run, including failures.
let token = "";
async function request(route: string, body?: unknown) {
  const binary = body instanceof Uint8Array;
  const response = await fetch(origin + route, {
    method: body === undefined ? "GET" : "POST", redirect: "error",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "content-type": binary ? "application/zip" : "application/json" }) },
    body: body === undefined ? undefined : binary ? Uint8Array.from(body) : JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error(`${route}: HTTP ${response.status} ${await response.text()}`);
  return response;
}
const results: Record<string, unknown>[] = [];
const report: Record<string, unknown> = {
  schema: "ggd-handoff-service-proof@1", startedAt: new Date().toISOString(), status: "running", origin,
  scope: "Current-service build, ZIP source/model integrity and server inspection. No publication, visual or original-design acceptance.",
  input, results,
};
const save = () => fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
try {
  const login = await (await request("/auth/login", { username: values.username, password: process.env.GGD_LOCAL_PROOF_PASSWORD })).json();
  token = login.tokens.accessToken;
  const profile = await (await request("/hero-import/target-profile")).json();
  const facts = readTargetProfileFacts(profile);
  assert(facts.gameRevision && facts.contentVersion && facts.migrationFingerprint && facts.authoringProcessorFingerprint);
  const target = { gameRevision: facts.gameRevision, contentVersion: facts.contentVersion, migrationFingerprint: facts.migrationFingerprint, processorFingerprint: facts.authoringProcessorFingerprint };
  report.target = target;
  await fs.writeFile(path.join(output, "target-profile.json"), JSON.stringify(profile, null, 2) + "\n");
  await save();
  for (const row of rows) {
    const item: Record<string, unknown> = { name: row.name, project: row.project, status: "running" };
    results.push(item);
    try {
      const project = zHeroProject.parse(JSON.parse(row.projectText));
      assert.equal(project.brief.name, row.name);
      assert(project.acceptedPlan);
      for (const slot of HERO_SLOTS) assert(project.acceptedPlan.slots[slot]);
      const model = project.presentation.uploadedModel;
      const bytes = model ? new Uint8Array(await fs.readFile(path.join(values["model-dir"] ?? path.join(input, "models"), model.sha256 + ".glb"))) : undefined;
      const source = buildHeroSourcePackage(project, [], target, bytes);
      const sourceZip = (await buildRuntimePackageZip(packageZipInput(source, project.projectId))).bytes;
      const archive = new Uint8Array(await (await request("/hero-import/build", sourceZip)).arrayBuffer());
      const pkg = readPackageZip(archive);
      const restored = pkg.documents.find(entry => entry.path === `authoring/hero-projects/${project.projectId}.json`)?.document;
      assert.deepEqual(restored, project, "Service ZIP must preserve the full source, names and requiredRefinement.");
      assert(pkg.compiled.length && pkg.validation.length, "A source-only archive is not a compiled hero.");
      assert.equal(pkg.manifest.base.gameRevision, target.gameRevision);
      assert.equal(pkg.manifest.base.contentVersion, target.contentVersion);
      assert.equal(pkg.manifest.migrationFingerprint, target.migrationFingerprint);
      assert.equal(pkg.manifest.authoringProcessor.fingerprint, target.processorFingerprint);
      if (model) {
        const restoredModel = pkg.assets.find(asset => asset.path === uploadedHeroModelPath(model));
        assert.deepEqual(restoredModel?.bytes, bytes, "Runtime model bytes must survive the service round trip.");
      }
      const inspection = await (await request("/hero-import/inspect", archive)).json();
      const stem = path.basename(row.project).replace(/\.(?:hero-)?project\.json$/, "");
      await fs.writeFile(path.join(output, stem + ".zip"), archive);
      await fs.writeFile(path.join(output, stem + ".inspection.json"), JSON.stringify(inspection, null, 2) + "\n");
      Object.assign(item, { status: "passed", projectId: project.projectId, sourceDigest: contentSha256(project),
        sourceFileSha256: await binarySha256(new TextEncoder().encode(row.projectText)),
        ...(project.sourceDesign ? { sourceDesignDigest: contentSha256(project.sourceDesign) } : {}),
        modelKey: project.presentation.modelKey, modelSha256: model?.sha256 ?? null,
        packageDigest: pkg.manifest.packageDigest, archiveSha256: await binarySha256(archive), archiveBytes: archive.length,
        runtimeDocuments: pkg.compiled.length, validationDocuments: pkg.validation.length, assets: pkg.assets.length,
        archive: stem + ".zip", inspection: stem + ".inspection.json", slots: HERO_SLOTS.length,
      });
    } catch (error) {
      Object.assign(item, { status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
    await save();
    console.log(JSON.stringify(item));
  }
  const after = readTargetProfileFacts(await (await request("/hero-import/target-profile")).json());
  assert.deepEqual({ gameRevision: after.gameRevision, contentVersion: after.contentVersion, migrationFingerprint: after.migrationFingerprint, processorFingerprint: after.authoringProcessorFingerprint }, target, "Target changed during this batch.");
  report.passed = results.filter(item => item.status === "passed").length;
  report.failed = results.length - Number(report.passed);
  report.status = report.failed === 0 ? "passed" : "failed";
  if (report.failed !== 0) process.exitCode = 1;
} catch (error) {
  report.status = "failed";
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await save();
  console.log(JSON.stringify({ output, status: report.status, passed: report.passed, failed: report.failed, error: report.error }));
}
