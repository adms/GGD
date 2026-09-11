/** Loopback Editor build/inspect round trip for the acquired-model hero batch.
 * This produces local evidence only; it never submits, stores or publishes a work.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import { isLoopbackHost } from "../../apps/content-api/src/guard";
import { readTargetProfileFacts } from "../../apps/editor/src/export-center/exportPolicy";
import { shippedHeroCatalog } from "../../packages/shared/testkit/heroPackageFixture";
import { COMMUNITY_ACQUIRED_HEROES, createAcquiredHeroProject } from "../../packages/shared/src/content/heroForge/communityAcquired";
import { HERO_SLOTS } from "../../packages/shared/src/content/heroForge/constants";
import { heroBodyModelIds } from "../../packages/shared/src/content/heroForge/bodyModels";
import { zHeroInspection } from "../../packages/shared/src/content/communityHero";
import { buildHeroSourcePackage } from "../../packages/shared/src/content/import/heroSourcePackage";
import { buildRuntimePackageZip, packageZipInput, binarySha256 } from "../../packages/shared/src/content/import/packageZip";
import { readPackageZip } from "../../packages/shared/src/content/import/readPackageZip";
import { contentSha256 } from "../../packages/shared/src/content/import/jcs";
import { referencedAssetPaths } from "../../packages/shared/src/content/assetReferences";
import { BUILTIN_VFX_TEXTURES } from "../../packages/shared/src/content/builtinVfxTextures";
import { extractRefs } from "../../packages/shared/src/content/refs";
import { isCollectionName, type TemplateDoc } from "../../packages/shared/src/content/schema";

const { values } = parseArgs({ options: {
  origin: { type: "string" }, out: { type: "string" },
  "editor-origin": { type: "string", default: "http://127.0.0.1:5214" }, help: { type: "boolean" },
  ids: { type: "string" },
} });
if (values.help) {
  console.log("Usage: node --import tsx tools/editor-acceptance/acquired-heroes-service-check.mts --origin http://127.0.0.1:8834 --out /private/tmp/acquired-heroes-service-<new-run> [--editor-origin http://127.0.0.1:5214] [--ids acquired-astralym,acquired-jetragon]\nBoth origins must be loopback. Output must be a new directory beneath an existing system temporary directory. No login, submission or publication.");
  process.exit(0);
}
assert(values.origin && values.out, "--origin and --out are required; use --help.");
function localOrigin(raw: string): string {
  const url = new URL(raw);
  assert(["http:", "https:"].includes(url.protocol) && isLoopbackHost(url.hostname)
    && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash,
  "Only a loopback HTTP(S) origin without credentials, path, query or fragment is accepted.");
  return url.origin;
}
const origin = localOrigin(values.origin), editorOrigin = localOrigin(values["editor-origin"]!);
const parent = await fs.realpath(path.dirname(path.resolve(values.out)));
const temporaryRoots = await Promise.all(["/tmp", tmpdir()].map((directory) => fs.realpath(directory)));
assert(temporaryRoots.some((root) => parent === root || parent.startsWith(root + path.sep)), "--out must be under a system temporary directory.");
const output = path.join(parent, path.basename(values.out));
await fs.mkdir(output); // A failed previous run is evidence too; never overwrite it.

type Route = "/active/target-profile" | "/hero-package" | "/inspect-hero-package";
async function request(route: Route, body?: Uint8Array) {
  const response = await fetch(`${origin}/content-api/content-import${route}`, {
    method: body ? "POST" : "GET", redirect: "error", credentials: "omit",
    headers: { origin: editorOrigin, ...(body ? { "content-type": "application/zip" } : {}) },
    body: body ? Uint8Array.from(body) : undefined, signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`${route}: HTTP ${response.status} ${await response.text()}`);
  return response;
}
function targetOf(profile: unknown) {
  const facts = readTargetProfileFacts(profile);
  assert(facts.gameRevision && facts.contentVersion && facts.migrationFingerprint && facts.authoringProcessorFingerprint, "Service target profile is incomplete.");
  return { gameRevision: facts.gameRevision, contentVersion: facts.contentVersion, migrationFingerprint: facts.migrationFingerprint, processorFingerprint: facts.authoringProcessorFingerprint };
}
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
const write = (name: string, value: unknown) => fs.writeFile(path.join(output, name), JSON.stringify(value, null, 2) + "\n");
const requestedIds = values.ids?.split(",").map((value) => value.trim()).filter(Boolean);
const selectedRecipes = requestedIds?.length
  ? COMMUNITY_ACQUIRED_HEROES.filter((recipe) => requestedIds.includes(recipe.id))
  : COMMUNITY_ACQUIRED_HEROES;
if (requestedIds?.length) {
  assert.equal(selectedRecipes.length, new Set(requestedIds).size, "--ids contains an unknown or duplicate acquired hero id.");
}
const results = selectedRecipes.map((recipe) => ({ id: recipe.id, name: recipe.name, status: "not-run", errors: [] as { phase: string; message: string }[], facts: {} as Record<string, unknown> }));
const report = { schema: "ggd-acquired-heroes-service-check@1", startedAt: new Date().toISOString(), finishedAt: "", status: "running", origin, editorOrigin,
  scope: "Loopback source factory, service build, exact ZIP source/dependencies and service inspection. No publication, visual or design-fidelity acceptance.",
  recipeSha256: contentSha256(selectedRecipes), selectedIds: selectedRecipes.map(({ id }) => id), target: null as ReturnType<typeof targetOf> | null,
  results, passed: 0, failed: 0, blocked: 0, notRun: results.length, error: "" };
try {
  assert(results.length > 0 && results.length <= COMMUNITY_ACQUIRED_HEROES.length);
  const catalog = shippedHeroCatalog();
  const templates = [...catalog.documents].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);
  const models = new Set(heroBodyModelIds(catalog.documents));
  const profile = await (await request("/active/target-profile")).json();
  const target = targetOf(profile); report.target = target;
  await write("target-profile.json", profile); await write("report.json", report);
  for (const [index, recipe] of selectedRecipes.entries()) {
    const item = results[index]!;
    if (!recipe.modelKey) {
      item.status = "blocked";
      item.errors.push({ phase: "model", message: "No verified body/actions assigned; package build and inspection were not attempted." });
      await write("report.json", report); console.log(JSON.stringify(item)); continue;
    }
    item.status = "running";
    let phase = "source";
    const check = (label: string, action: () => void) => {
      try { action(); } catch (error) { item.errors.push({ phase: label, message: error instanceof Error ? error.message : String(error) }); }
    };
    try {
      const project = createAcquiredHeroProject(recipe.id, item.id, templates);
      assert(models.has(project.presentation.modelKey), `Model is not approved in the checked-out catalog: ${project.presentation.modelKey}`);
      const source = buildHeroSourcePackage(project, [], target);
      const sourceZip = (await buildRuntimePackageZip(packageZipInput(source, project.projectId))).bytes;
      await write(`${item.id}.project.json`, project);
      await fs.writeFile(path.join(output, `${item.id}.source.zip`), sourceZip);
      item.facts.sourceSha256 = contentSha256(project);
      phase = "service-build";
      const archive = new Uint8Array(await (await request("/hero-package", sourceZip)).arrayBuffer());
      await fs.writeFile(path.join(output, `${item.id}.zip`), archive);
      item.facts.archiveSha256 = await binarySha256(archive); item.facts.archiveBytes = archive.length;
      phase = "zip-integrity";
      const pkg = readPackageZip(archive);
      const authored = new Map(pkg.documents.map((entry) => [entry.path, entry.document]));
      const runtime = new Map(pkg.compiled.map((entry) => [entry.path, entry.document as Record<string, unknown>]));
      const assets = new Map(pkg.assets.map((entry) => [entry.path, entry.bytes]));
      check("source-exact", () => assert.deepEqual(authored.get(`authoring/hero-projects/${item.id}.json`), json(project)));
      check("target", () => {
        assert.equal(pkg.manifest.scope, "community-work");
        assert.deepEqual(pkg.manifest.selectionRoots.map(({ kind, id }) => ({ kind, id })), [{ kind: "hero", id: item.id }]);
        assert.deepEqual(pkg.manifest.base, { gameRevision: target.gameRevision, contentVersion: target.contentVersion, activationDigest: null, authoringDigest: null });
        assert.equal(pkg.manifest.migrationFingerprint, target.migrationFingerprint);
        assert.equal(pkg.manifest.authoringProcessor.fingerprint, target.processorFingerprint);
        assert(pkg.validation.length > 0, "Missing service validation records.");
      });
      for (const slot of HERO_SLOTS) check(`slot:${slot}`, () => {
        const ability = runtime.get(`compiled/abilities/${item.id}.${slot.toLowerCase()}.json`);
        assert(ability, `Missing compiled ${slot}`); assert.equal(ability.slot, slot);
        assert.equal(ability.name, project.acceptedPlan!.slots[slot].name);
        const script = project.presentation.slots[slot].script;
        if (script) assert.deepEqual(runtime.get(`compiled/vfx-scripts/${script.id}.json`), json(script), "VFX authoring calls must remain exact.");
      });
      check("body-model", () => {
        assert.equal(runtime.get(`compiled/champions/${item.id}.json`)?.modelKey, project.presentation.modelKey);
        const key = `models/${project.presentation.modelKey}`;
        assert.deepEqual(authored.get(`authoring/${key}.json`), json(catalog.documents.get(key)), "Service and checked-out model metadata differ.");
        const model = runtime.get(`compiled/${key}.json`); assert(model && typeof model.glbPath === "string");
        const expected = catalog.readAsset(model.glbPath); assert(expected, `Missing checked-out model bytes: ${model.glbPath}`);
        assert.deepEqual(assets.get(model.glbPath), expected, "Model GLB bytes changed in the service round trip.");
        item.facts.modelKey = project.presentation.modelKey; item.facts.modelPath = model.glbPath;
        item.facts.modelDocumentSha256 = contentSha256(model);
        item.facts.modelBytesSha256 = pkg.manifest.entries.find((entry) => entry.path === model.glbPath)?.contentSha256;
      });
      for (const dependency of pkg.manifest.requires) check(`dependency:${dependency.kind}/${dependency.id}`, () => {
        const document = authored.get(`authoring/${dependency.kind}/${dependency.id}.json`);
        assert(document, "Missing pinned dependency"); assert.equal(contentSha256(document), dependency.contentSha256);
      });
      const paths = new Set<string>(Object.values(BUILTIN_VFX_TEXTURES));
      for (const [documentPath, document] of runtime) {
        const collection = documentPath.split("/")[1]!;
        if (!["models", "vfx", "vfx-scripts", "vfx-subtypes"].includes(collection)) continue;
        referencedAssetPaths(document, paths);
        if (isCollectionName(collection)) for (const edge of extractRefs(collection, document)) check(`vfx-reference:${documentPath}:${edge.field}`, () => {
          assert(runtime.has(`compiled/${edge.targetCollection}/${edge.targetId}.json`) || authored.has(`authoring/${edge.targetCollection}/${edge.targetId}.json`), `Missing ${edge.targetCollection}/${edge.targetId}`);
        });
      }
      for (const assetPath of paths) check(`asset:${assetPath}`, () => assert(assets.get(assetPath) instanceof Uint8Array, "Missing packaged visual/model asset bytes."));
      item.facts.packageDigest = pkg.manifest.packageDigest;
      item.facts.slots = HERO_SLOTS.length; item.facts.runtimeDocuments = pkg.compiled.length;
      item.facts.validationDocuments = pkg.validation.length; item.facts.assets = pkg.assets.length;
      phase = "service-inspection";
      const rawInspection = await (await request("/inspect-hero-package", archive)).json();
      await write(`${item.id}.inspection.json`, rawInspection);
      const inspection = zHeroInspection.parse(rawInspection);
      check("inspection-source-exact", () => assert.deepEqual(json(inspection.project), json(project)));
      check("inspection-digest", () => assert.equal(inspection.packageDigest, pkg.manifest.packageDigest));
      check("inspection-errors", () => assert.deepEqual(inspection.diagnostics.filter((entry) => entry.severity === "error"), []));
    } catch (error) { item.errors.push({ phase, message: error instanceof Error ? error.message : String(error) }); }
    item.status = item.errors.length ? "failed" : "passed";
    await write("report.json", report); console.log(JSON.stringify(item));
  }
  const after = await (await request("/active/target-profile")).json();
  await write("target-profile-after.json", after);
  assert.deepEqual(targetOf(after), target, "Service target changed during this batch.");
} catch (error) { report.error = error instanceof Error ? error.message : String(error); }
finally {
  report.passed = results.filter((item) => item.status === "passed").length;
  report.failed = results.filter((item) => item.status === "failed").length;
  report.blocked = results.filter((item) => item.status === "blocked").length;
  report.notRun = results.filter((item) => item.status === "not-run").length;
  report.status = report.error || report.failed || report.notRun ? "failed" : report.blocked ? "blocked" : "passed";
  report.finishedAt = new Date().toISOString(); await write("report.json", report);
  if (report.status !== "passed") process.exitCode = 1;
  console.log(JSON.stringify({ output, status: report.status, passed: report.passed, failed: report.failed, blocked: report.blocked, notRun: report.notRun, error: report.error }));
}
