import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import { inflateRawSync } from "node:zlib";
import { importHeroHandoffBatch } from "../../packages/shared/src/content/heroForge/handoff.js";
import { generateHeroDraft, compileGeneratedHeroDraft } from "../../packages/shared/src/content/heroForge/generator.js";
import { shippedHeroCatalog } from "../../packages/shared/testkit/heroPackageFixture.js";
import type { TemplateDoc } from "../../packages/shared/src/content/schema/template.js";
import { sha256Bytes } from "../../packages/shared/src/content/sha256.js";
import { readPackageZip } from "../../packages/shared/src/content/import/readPackageZip.js";
import { uploadedHeroModelPath } from "../../packages/shared/src/content/modelUpload/heroModelSchema.js";
import { runHeroAbilityScenario, runHeroKitScenario } from "../../packages/shared/src/content/heroForge/scenario.js";
import { createHeroSimulationBaseline } from "../../packages/shared/src/content/heroForge/simulationBaseline.js";
import { contentSha256 } from "../../packages/shared/src/content/import/jcs.js";
import { zHeroProject } from "../../packages/shared/src/content/heroForge/schema.js";

// Offline by default. Restore the existing S3 release archive with restore.py
// first; this tool never reads credentials, uploads assets, or changes a service.
const { values } = parseArgs({ options: { "batch-dir": { type: "string" }, "release-root": { type: "string" }, output: { type: "string" }, "scenario-report": { type: "string" } } });
if (values.output && !values["release-root"]) throw new Error("--output requires --release-root <restored release-13956d93b payload>");
const repo = path.resolve(import.meta.dirname, "../..");
const material = path.resolve(values["batch-dir"] ?? path.join(repo, "materials/community-hero-forge"));
function member(name: string): string {
  assert(name && !name.includes("\\") && !path.posix.isAbsolute(name) &&
    !name.split("/").includes("..") && path.posix.normalize(name) === name, `Unsafe path: ${name}`);
  return name;
}
const manifest = JSON.parse(await fs.readFile(path.join(material, "handoff-manifest.json"), "utf8"));
assert.equal(manifest.schema, "ggd-shared-authoring-handoff@1");
for (const row of manifest.refinements) {
  const bytes = new Uint8Array(await fs.readFile(path.join(material, member(row.path))));
  assert.equal(sha256Bytes(bytes), row.sha256, `Refinement changed; rebuild shared projects: ${row.path}`);
}
const files = new Map<string, Uint8Array>();
for (const row of manifest.files) {
  assert(!files.has(member(row.path)), `Duplicate file: ${row.path}`);
  const bytes = new Uint8Array(await fs.readFile(path.join(material, row.path)));
  assert.equal(bytes.length, row.bytes, row.path);
  assert.equal(sha256Bytes(bytes), row.sha256, row.path);
  files.set(row.path, bytes);
}
const decoder = new TextDecoder();
const sourceIndex = JSON.parse(decoder.decode(files.get("index.json")));
const projects = importHeroHandoffBatch(decoder.decode(files.get("index.json")),
  new Map([...files].map(([name, bytes]) => [name, decoder.decode(bytes)])));
assert.equal(projects.length, manifest.heroCount);
assert.equal(projects.length * 6, manifest.slotCount);
const catalog = shippedHeroCatalog();
const templates = [...catalog.documents.values()].filter(d => d.schema === "template@1") as TemplateDoc[];
const configs = [...catalog.documents.values()].filter(d => String(d.schema).startsWith("config."));
const compilationFailures: string[] = [];
const scenarioResults: Array<Record<string, unknown>> = [];
const baseline = values["scenario-report"] ? createHeroSimulationBaseline(catalog.documents) : undefined;
for (const project of projects) {
  try {
  const compiled = compileGeneratedHeroDraft(generateHeroDraft(project.acceptedPlan!, {
    heroId: project.projectId, heroName: project.brief.name, modelKey: project.presentation.modelKey, presentation: project.presentation,
  }), templates, configs);
  assert(compiled.ok, `${project.projectId}: ${compiled.ok ? "" : JSON.stringify(compiled.failures)}`);
  assert.equal(Object.keys(compiled.draft.abilityDrafts).length, 6);
  if (baseline) {
    const sourceEntry = sourceIndex.heroes.find((entry: { projectId: string }) => entry.projectId === project.projectId);
    const sourceProject = zHeroProject.parse(JSON.parse(decoder.decode(files.get(sourceEntry.project))));
    assert.deepEqual(sourceProject.acceptedPlan, project.acceptedPlan);
    assert.deepEqual(sourceProject.presentation, project.presentation);
    const relatedAbilities = Object.values(compiled.draft.abilityDrafts);
    const options = { baseline, relatedAbilities, relatedChampions: compiled.draft.relatedChampions };
    const slots = relatedAbilities.map(ability => runHeroAbilityScenario(compiled.draft.champion, ability, { ...options, ticks: 180 }));
    const kit = runHeroKitScenario(compiled.draft.champion, compiled.draft.abilityDrafts, { ...options, ticksPerStep: 180 });
    const failures = slots.flatMap(row => row.assertions.filter(a => a.status === "fail").map(a => `${row.slot}: ${a.summaryZh}`));
    if (kit.status === "rejected") failures.push(`整套技能未完成：${kit.rejectedSlots.join("、")}`);
    scenarioResults.push({ projectId: project.projectId, name: project.brief.name, sourceDigest: contentSha256(sourceProject), importedDraftDigest: contentSha256(project), status: failures.length ? "failed" : "passed", failures,
      slots: slots.map(row => ({ slot: row.slot, status: row.status, rejectionReason: row.rejectionReason })),
      kit: { status: kit.status, rejectedSlots: kit.rejectedSlots, rejectionReasonsBySlot: kit.rejectionReasonsBySlot } });
  }
  } catch (error) { compilationFailures.push(`${project.projectId}: ${String(error)}`); }
}
assert.equal(compilationFailures.length, 0, compilationFailures.join("\n"));
if (values["scenario-report"]) {
  const failed = scenarioResults.filter(row => row.status === "failed");
  await fs.writeFile(path.resolve(values["scenario-report"]), JSON.stringify({ schema: "ggd-handoff-admission-scenarios@1",
    scope: "Offline default six-slot and fixed-order admission scenarios; no asset, service, visual or publication proof.",
    baselineDigest: baseline!.digest, passed: scenarioResults.length - failed.length, failed: failed.length, results: scenarioResults }, null, 2) + "\n", { flag: "wx" });
  assert.equal(failed.length, 0, failed.map(row => `${row.name}: ${(row.failures as string[]).join("；")}`).join("\n"));
}
const assets = new Map<string, Uint8Array>();
if (values["release-root"]) {
  const release = path.resolve(values["release-root"]);
  assert.equal(manifest.modelSources.length, projects.length);
  for (const project of projects) {
    const rows = manifest.modelSources.filter((r: { projectId: string }) => r.projectId === project.projectId);
    assert.equal(rows.length, 1);
    const row = rows[0], model = project.presentation.uploadedModel;
    assert(model && model.sha256 === row.sha256 && model.byteSize === row.bytes);
    const zip = new Uint8Array(await fs.readFile(path.join(release, member(row.zipMember))));
    assert.equal(sha256Bytes(zip), row.archiveSha256, row.zipMember);
    const pkg = readPackageZip(zip, { inflate: (bytes, maxBytes) => inflateRawSync(bytes, { maxOutputLength: maxBytes }) });
    const bytes = pkg.assets.find(a => a.path === uploadedHeroModelPath(model))?.bytes;
    assert(bytes && bytes.length === model.byteSize && sha256Bytes(bytes) === model.sha256, project.projectId);
    assets.set(`models/${model.sha256}.glb`, bytes);
  }
}
if (values.output) {
  const output = path.resolve(values.output);
  await fs.mkdir(output); // Fail rather than replace another handoff or worktree.
  for (const [name, bytes] of [...files, ...assets]) {
    const target = path.join(output, member(name));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes, { flag: "wx" });
  }
}
console.log(JSON.stringify({ heroes: projects.length, slots: projects.length * 6,
  compilation: "passed", boundModelsVerified: values["release-root"] ? projects.length : 0,
  distinctModelFiles: assets.size, output: values.output ?? null,
  originalDesignAcceptance: "incomplete", visualAcceptance: "unverified", formalPublication: false }));
