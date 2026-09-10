/** Local authoring/package evidence. This command never submits or publishes. */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { readHeroPackageCatalog } from "../../apps/content-api/src/heroPackageIO";
import type { CommunityHeroExample } from "../../packages/shared/src/content/heroForge/communityExamples";
import type { HeroProject } from "../../packages/shared/src/content/heroForge/schema";
import { createLocalDraft } from "../../apps/editor/src/drafts/repository";
import { HERO_SLOTS } from "../../packages/shared/src/content/heroForge/constants";
import { compileGeneratedHeroDraft, generateHeroDraft, type CompiledHeroDraft, type GeneratedHeroDraft } from "../../packages/shared/src/content/heroForge/generator";
import { heroBodyModelIds } from "../../packages/shared/src/content/heroForge/bodyModels";
import { buildHeroImportPackage, validateHeroImportPackage, HERO_RENDER_CONFIG_IDS, HERO_RESOLVER_CONFIG_IDS, type HeroPackageCatalog, type HeroPackageTarget } from "../../packages/shared/src/content/import/heroPackage";
import { buildRuntimePackageZip, packageZipInput, binarySha256 } from "../../packages/shared/src/content/import/packageZip";
import { readPackageZip } from "../../packages/shared/src/content/import/readPackageZip";
import { contentSha256 } from "../../packages/shared/src/content/import/jcs";
import { snapshotHeroGenerator, snapshotHeroProcessor } from "../../packages/shared/src/content/import/heroBuildSources";
import { assertContainedModelAsset } from "../../packages/shared/src/content/import/modelAssetSafety";
import { referencedAssetPaths, assetMediaType } from "../../packages/shared/src/content/assetReferences";
import { BUILTIN_VFX_TEXTURES } from "../../packages/shared/src/content/builtinVfxTextures";
import { extractRefs } from "../../packages/shared/src/content/refs";
import { normalizeTemplateBinding } from "../../packages/shared/src/content/templates/expand";
import { resolveTemplateExpansion } from "../../packages/shared/src/content/templates/resolve";
import { validateDoc } from "../../packages/shared/src/content/loader";
import { isCollectionName, type TemplateDoc } from "../../packages/shared/src/content/schema";
import type { VfxSubtypeDoc } from "../../packages/shared/src/content/schema/vfxSubtype";

type Issue = { phase: string; code: string; message: string; path?: string };
type AssetFact = { path: string; mediaType: string | null; status: "present" | "blocked"; bytes?: number; sha256?: string };
type ArtifactFact = { path: string; bytes: number; sha256: string; contentSha256: string };
type CheckOptions = { createProject: (id: string, projectId: string, templates: readonly TemplateDoc[]) => HeroProject; outputDirectory?: string };
export type HeroCheckRow = {
  index: number; id: string; name: string; projectId: string; status: "passed" | "blocked" | "failed";
  modelKey: string | null; sourceSha256: string; compiled: boolean; slots: string[];
  errors: Issue[]; warnings: Issue[]; dependencies: string[]; assets: AssetFact[];
  package: { status: "not-run" | "passed" | "failed"; reason?: string; digest?: string; zipSha256?: string; zipBytes?: number; exactSource?: boolean; inspection?: string };
  mechanicsSha256?: string;
  authoring?: { revision: number; generatorVersion: string | null; templateVersions: string[]; project: ArtifactFact; draft: ArtifactFact };
};
export type AcquiredCheckReport = {
  schema: "ggd-acquired-heroes-check@1"; scope: string; startedAt: string; finishedAt: string;
  status: "passed" | "blocked" | "failed"; sourceSha256: string; catalogSha256: string;
  target: HeroPackageTarget; counts: { heroes: number; compiled: number; slots: number; packages: number; passed: number; blocked: number; failed: number; warnings: number };
  heroes: HeroCheckRow[];
};
const json = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const scope = "Local factory/schema compilation, source dependency and manifest-verified asset checks, existing package SimWorld/ZIP/inspection. No service, production, model appearance, design-fidelity or publication acceptance.";

/** A comparison warning, not a claim that two differently tuned kits play alike. */
export function mechanicsFingerprint(draft: CompiledHeroDraft, projectId: string): string {
  const aliases = new Map<string, string>();
  const visual = new Set(["vfxKey", "sfxKey", "soundKey", "arriveSoundKey", "castVfxKey", "hitVfxKey", "icon", "name", "description", "provenance", "schema", "id"]);
  const walk = (value: unknown, key = ""): unknown => {
    if (typeof value === "number") return "<number>";
    if (typeof value === "string") {
      if (["statusId", "markId", "stackKey"].includes(key) && value.startsWith(projectId)) {
        if (!aliases.has(value)) aliases.set(value, `<local-${aliases.size}>`);
        return aliases.get(value);
      }
      return value.replaceAll(projectId, "$hero");
    }
    if (Array.isArray(value)) return value.map((entry) => walk(entry));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([field]) => !visual.has(field)).map(([field, entry]) => [field, walk(entry, field)]));
    return value;
  };
  return contentSha256(HERO_SLOTS.map((slot) => {
    const ability = draft.abilityDrafts[slot];
    return walk({ slot, castType: ability.castType, effects: ability.effects, passive: ability.passive ?? null, marks: ability.marks ?? null });
  }));
}

function rootsOf(generated: GeneratedHeroDraft, compiled: CompiledHeroDraft) {
  return [
    { collection: "champions" as const, document: json(compiled.champion) },
    ...compiled.relatedChampions.map((document) => ({ collection: "champions" as const, document: json(document) })),
    ...Object.values(compiled.abilityDrafts).map((document) => ({ collection: "abilities" as const, document: json(document) })),
    ...generated.vfxScripts.map((document) => ({ collection: "vfx-scripts" as const, document: json(document) })),
    ...(generated.templateInstances ?? []).map((document) => ({ collection: "ability-templates" as const, document: json(document) })),
  ];
}

/** Collect all missing references/files in this hero before the package builder's fail-fast boundary. */
async function inspectDependencies(row: HeroCheckRow, generated: GeneratedHeroDraft, compiled: CompiledHeroDraft, catalog: HeroPackageCatalog, modelAssigned: boolean) {
  const roots = rootsOf(generated, compiled);
  const local = new Map(roots.map(({ collection, document }) => [`${collection}/${document.id}`, document as Record<string, unknown>]));
  const localStatuses = new Set<string>();
  const visitValues = (value: unknown, callback: (value: Record<string, unknown>) => void): void => {
    if (Array.isArray(value)) value.forEach((entry) => visitValues(entry, callback));
    else if (value && typeof value === "object") { callback(value as Record<string, unknown>); Object.values(value).forEach((entry) => visitValues(entry, callback)); }
  };
  // Same inline declaration boundary as compileHeroPackageProject: compiled mechanics only.
  for (const ability of Object.values(compiled.abilityDrafts)) {
    const collect = (node: Record<string, unknown>) => { if (["applyBuff", "applyStatus"].includes(String(node.kind)) && typeof node.statusId === "string") localStatuses.add(node.statusId); };
    visitValues(ability.effects, collect); visitValues(ability.passive, collect);
    for (const mark of ability.marks ?? []) { localStatuses.add(mark.markId); visitValues(mark, collect); }
  }
  const pending = [...local.keys(), ...HERO_RESOLVER_CONFIG_IDS.map((id) => `config/${id}`),
    ...HERO_RENDER_CONFIG_IDS.filter((id) => catalog.documents.has(`config/${id}`)).map((id) => `config/${id}`)];
  const visited = new Set<string>(), paths = new Set<string>(Object.values(BUILTIN_VFX_TEXTURES)), audioKeys = new Set<string>();
  const add = (code: string, message: string, path?: string) => row.errors.push({ phase: "dependencies", code, message, ...(path ? { path } : {}) });
  const templates = new Map([...catalog.documents, ...local].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => [String(doc.id), doc as TemplateDoc]));
  const expandAbility = (raw: Record<string, unknown>, path: string): Record<string, unknown> => {
    if (!raw.template) return raw;
    try {
      for (const card of normalizeTemplateBinding(raw.template).cards) pending.push(`ability-templates/${card.ref}`);
      const expanded = resolveTemplateExpansion(raw, templates);
      if (expanded.ok) return expanded.merged;
      add("DEPENDENCY_TEMPLATE_FAILED", expanded.failure.message, path);
    } catch (error) { add("DEPENDENCY_TEMPLATE_FAILED", message(error), path); }
    return raw;
  };
  while (pending.length) {
    const key = pending.shift()!;
    if (visited.has(key)) continue;
    visited.add(key);
    if (visited.size > 1000) { add("DEPENDENCY_LIMIT", "Hero dependency closure exceeds the existing 1000-document package limit."); break; }
    const slash = key.indexOf("/"), collection = key.slice(0, slash), id = key.slice(slash + 1);
    if (!modelAssigned && key === "models/unassigned.model") continue;
    let document = local.get(key) ?? catalog.documents.get(key);
    if (!document) { add("MISSING_DOCUMENT", `Missing catalog document: ${key}`, key); continue; }
    if (!isCollectionName(collection)) { add("UNKNOWN_COLLECTION", key, key); continue; }
    if (!local.has(key)) {
      row.dependencies.push(key);
      const valid = validateDoc(collection, document);
      if (!valid.ok) add("INVALID_DEPENDENCY", valid.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "), key);
    }
    // Follow the package builder's external-ability expansion too: template
    // defaults can introduce references absent from the raw dependency JSON.
    // Local roots are already compiled. Re-expanding their template would feed
    // resolved runtime values (such as msBonusTier + value) into authoring schema.
    if (!local.has(key) && collection === "abilities") document = expandAbility(document, key);
    if (!local.has(key) && collection === "champions" && document.abilities && typeof document.abilities === "object") {
      document = { ...document, abilities: Object.fromEntries(Object.entries(document.abilities).map(([slot, raw]) => {
        const embedded = raw as Record<string, unknown>, standalone = catalog.documents.get(`abilities/${embedded.id}`);
        if (standalone) pending.push(`abilities/${embedded.id}`);
        return [slot, expandAbility({ ...embedded, ...standalone }, `${key}#${slot}`)];
      })) };
    }
    if (key !== "config/audio-map") referencedAssetPaths(document, paths);
    visitValues(document, (node) => {
      for (const field of ["sfxKey", "soundKey", "arriveSoundKey"]) if (typeof node[field] === "string") audioKeys.add(node[field] as string);
      if (node.kind === "spawnModelFx" && typeof node.preset === "string") pending.push(`ability-templates/${node.preset}`);
    });
    for (const ref of extractRefs(collection, document)) {
      const target = `${ref.targetCollection}/${ref.targetId}`;
      if (ref.soft && ref.targetCollection === "status-effects" && localStatuses.has(ref.targetId) && !catalog.documents.has(target)) continue;
      pending.push(target);
    }
    // Preset-only model templates also have dependencies, so the queue stays open.
    if (audioKeys.size && !visited.has("config/audio-map")) pending.push("config/audio-map");
  }
  const audio = catalog.documents.get("config/audio-map")?.sfx as Record<string, unknown> | undefined;
  for (const key of [...audioKeys].sort()) {
    if (!audio?.[key]) add("MISSING_AUDIO_KEY", `Missing audio-map entry: ${key}`, `config/audio-map#sfx.${key}`);
    else referencedAssetPaths(audio[key], paths);
  }
  row.dependencies.sort();
  for (const path of [...paths].sort()) {
    const fact: AssetFact = { path, mediaType: assetMediaType(path) ?? null, status: "blocked" };
    row.assets.push(fact);
    try {
      const bytes = catalog.readAsset(path);
      if (!bytes || bytes.length === 0) throw new Error(`Asset is missing, empty, unlisted or unavailable to the package catalog: ${path}`);
      if (/\.gl(?:b|tf)$/.test(path)) assertContainedModelAsset(path, bytes);
      Object.assign(fact, { status: "present", bytes: bytes.length, sha256: await binarySha256(bytes) });
    } catch (error) { row.errors.push({ phase: "assets", code: "ASSET_UNAVAILABLE", message: message(error), path }); }
  }
}

export async function checkAcquiredHeroes(recipes: readonly CommunityHeroExample[], catalog: HeroPackageCatalog, target: HeroPackageTarget, options: CheckOptions): Promise<AcquiredCheckReport> {
  const report: AcquiredCheckReport = { schema: "ggd-acquired-heroes-check@1", scope, startedAt: new Date().toISOString(), finishedAt: "", status: "passed",
    sourceSha256: contentSha256(recipes), catalogSha256: contentSha256([...catalog.documents].sort(([a], [b]) => a.localeCompare(b))), target,
    counts: { heroes: recipes.length, compiled: 0, slots: 0, packages: 0, passed: 0, blocked: 0, failed: 0, warnings: 0 }, heroes: [] };
  const templates = [...catalog.documents].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);
  const configs = [...catalog.documents].filter(([key]) => key.startsWith("config/")).map(([, doc]) => doc);
  const subtypes = [...catalog.documents].filter(([key]) => key.startsWith("vfx-subtypes/")).map(([, doc]) => doc as VfxSubtypeDoc);
  const models = new Set(heroBodyModelIds(catalog.documents)), seen = new Map<string, HeroCheckRow[]>(), identities = new Map<string, HeroCheckRow[]>();
  for (const [index, recipe] of recipes.entries()) {
    const projectId = recipe.id;
    const row: HeroCheckRow = { index, id: recipe.id, name: recipe.name, projectId, status: "passed", modelKey: recipe.modelKey || null, sourceSha256: contentSha256(recipe), compiled: false, slots: [], errors: [], warnings: [], dependencies: [], assets: [], package: { status: "not-run" } };
    report.heroes.push(row);
    seen.set(recipe.id, [...(seen.get(recipe.id) ?? []), row]);
    const add = (phase: string, code: string, message: string) => row.errors.push({ phase, code, message });
    if (!row.modelKey) add("model", "MODEL_NOT_ASSIGNED", "No model selected. Diagnostic-only unassigned.model is used for schema compilation; no fallback model or package is accepted.");
    else if (!models.has(row.modelKey)) add("model", "MODEL_NOT_APPROVED", `Model is not an approved hero body in this catalog: ${row.modelKey}`);
    if (catalog.documents.has(`champions/${projectId}`)) add("identity", "EXISTING_HERO_ID", `The existing community package gate forbids replacing catalog hero ${projectId}; this authoring snapshot is not a publishable new work.`);
    try {
      assert(/^[a-z0-9][a-z0-9._-]*$/.test(recipe.id), "Invalid recipe ID.");
      assert.deepEqual(Object.keys(recipe.moves).sort(), [...HERO_SLOTS].sort(), "Recipe must contain exactly six official slots.");
      for (const slot of HERO_SLOTS) {
        const template = catalog.documents.get(`ability-templates/${recipe.moves[slot].ref}`);
        if (!template || template.status !== "enabled") add("templates", "TEMPLATE_NOT_ENABLED", `${slot}: ${recipe.moves[slot].ref}`);
      }
      if (row.errors.some((issue) => issue.phase === "templates")) { row.status = "failed"; continue; }
      const project = options.createProject(recipe.id, projectId, templates);
      assert.equal(project.projectId, projectId, "Acquired factory changed the requested project identity.");
      assert.equal(project.presentation.modelKey, row.modelKey ?? "unassigned.model", "Acquired factory silently substituted the selected body.");
      const draft = createLocalDraft(`hero/${projectId}`, "hero", project.revision, { project, rawInputs: {}, mode: "visual", origin: project.acceptedPlan!.origin });
      draft.updatedAt = 0;
      const artifact = async (path: string, value: unknown): Promise<ArtifactFact> => {
        const bytes = Buffer.from(JSON.stringify(value, null, 2) + "\n");
        if (options.outputDirectory && seen.get(recipe.id)!.length === 1) {
          const full = resolve(options.outputDirectory, path); mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, bytes);
        }
        return { path, bytes: bytes.length, sha256: await binarySha256(bytes), contentSha256: contentSha256(value) };
      };
      row.authoring = { revision: project.revision, generatorVersion: project.acceptedPlan!.generatorVersion ?? null, templateVersions: Object.keys(project.acceptedPlan!.templateVersions ?? {}).sort(),
        project: await artifact(`projects/${projectId}.json`, project), draft: await artifact(`drafts/${projectId}.json`, draft) };
      const generated = generateHeroDraft(project.acceptedPlan!, { heroId: projectId, heroName: project.brief.name, presentation: project.presentation });
      const result = compileGeneratedHeroDraft(generated, templates, configs, subtypes);
      if (!result.ok) {
        for (const failure of result.failures) add("compile", "COMPILE_FAILED", `${failure.slot}: ${failure.message}`);
        row.status = "failed"; continue;
      }
      row.compiled = true;
      assert.deepEqual(Object.keys(result.draft.abilityDrafts).sort(), [...HERO_SLOTS].sort());
      for (const slot of HERO_SLOTS) {
        const id: string = result.draft.abilityDrafts[slot].id;
        assert.equal(id, `${projectId}.${slot.toLowerCase()}`, `${slot}: generated identity drift`);
        row.slots.push(id); identities.set(id, [...(identities.get(id) ?? []), row]);
      }
      row.mechanicsSha256 = mechanicsFingerprint(result.draft, projectId);
      await inspectDependencies(row, generated, result.draft, catalog, !!row.modelKey);
      if (row.errors.length) { row.package.reason = "Model/dependency/asset blockers must be resolved before package build."; continue; }
      try {
        const pkg = buildHeroImportPackage(project, catalog, target);
        const archive = await buildRuntimePackageZip(packageZipInput(pkg, projectId));
        const restored = readPackageZip(archive.bytes);
        const authored = restored.documents.find((entry) => entry.path === `authoring/hero-projects/${projectId}.json`);
        assert.deepEqual(authored?.document, json(project), "ZIP did not preserve the exact editable source.");
        const inspected = validateHeroImportPackage(restored, catalog);
        if (inspected.diagnostics.some((issue) => issue.severity === "error") || !inspected.result) throw new Error(inspected.diagnostics.map((issue) => issue.message).join("; ") || "Existing package inspection returned no hero.");
        assert.deepEqual(inspected.result.project, project, "Inspection changed editable source.");
        row.package = { status: "passed", digest: pkg.manifest.packageDigest, zipSha256: await binarySha256(archive.bytes), zipBytes: archive.bytes.length, exactSource: true, inspection: "validateHeroImportPackage: passed; no service request" };
      } catch (error) { row.package = { status: "failed" }; add("package", "PACKAGE_FAILED", message(error)); }
    } catch (error) { add("compile", "AUTHORING_FAILED", message(error)); row.status = "failed"; }
  }
  for (const [id, rows] of seen) if (rows.length > 1) for (const row of rows) row.errors.push({ phase: "identity", code: "DUPLICATE_RECIPE_ID", message: `${id}: rows ${rows.map((entry) => entry.index).join(", ")}` });
  for (const [id, rows] of identities) if (rows.length > 1) for (const row of rows) row.errors.push({ phase: "identity", code: "DUPLICATE_ABILITY_ID", message: id });
  const mechanics = new Map<string, HeroCheckRow[]>();
  for (const row of report.heroes) if (row.mechanicsSha256) mechanics.set(row.mechanicsSha256, [...(mechanics.get(row.mechanicsSha256) ?? []), row]);
  for (const rows of mechanics.values()) if (rows.length > 1) for (const row of rows) row.warnings.push({ phase: "mechanics", code: "SIMILAR_SIX_SLOT_STRUCTURE", message: `Same six-slot effect/hook structure after ignoring names, local mark names, visuals and numeric tuning: ${rows.map((entry) => entry.id).join(", ")}. Review warning, not proof of identical gameplay.` });
  for (const row of report.heroes) {
    row.status = row.errors.some((issue) => ["compile", "templates", "identity", "package"].includes(issue.phase)) ? "failed" : row.errors.length ? "blocked" : "passed";
    report.counts[row.status]++; report.counts.compiled += Number(row.compiled); report.counts.slots += row.slots.length; report.counts.packages += Number(row.package.status === "passed"); report.counts.warnings += row.warnings.length;
  }
  report.status = report.counts.failed ? "failed" : report.counts.blocked ? "blocked" : "passed";
  if (recipes.length === 0) report.status = "failed";
  report.finishedAt = new Date().toISOString();
  return report;
}

export const reportExitCode = (report: Pick<AcquiredCheckReport, "status">, mode: "report" | "strict") => mode === "strict" && report.status !== "passed" ? 1 : 0;

async function main() {
  const { values } = parseArgs({ options: { out: { type: "string" }, mode: { type: "string", default: "report" }, help: { type: "boolean" } } });
  if (values.help) { console.log("Usage: node --import tsx tools/editor-acceptance/acquired-heroes-check.ts [--mode report|strict] [--out /private/tmp/acquired-heroes-run]\nRuns every COMMUNITY_ACQUIRED_HEROES recipe, writes report.json, authoring-manifest.json, projects/*.json and Editor drafts/*.json with updatedAt=0. Report mode preserves every blocker and exits 0; strict writes the same complete report then exits 1 unless all pass. No fallback bodies, service calls, submission, publication or ZIP files are written."); return; }
  assert(values.mode === "report" || values.mode === "strict", "--mode must be report or strict");
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../.."), content = resolve(root, "content");
  const out = resolve(values.out ?? `/private/tmp/ggd-acquired-heroes-${Date.now()}-${process.pid}`);
  assert(!existsSync(out) || readdirSync(out).length === 0, "--out must be new or empty, so stale drafts cannot masquerade as this run's output.");
  const write = (name: string, value: unknown) => { mkdirSync(out, { recursive: true }); writeFileSync(resolve(out, name), JSON.stringify(value, null, 2) + "\n"); };
  let report: AcquiredCheckReport | undefined;
  try {
    const { COMMUNITY_ACQUIRED_HEROES, ACQUIRED_MODEL_OPTIONS, createAcquiredHeroProject } = await import("../../packages/shared/src/content/heroForge/communityAcquired");
    const generator = snapshotHeroGenerator(root), processor = snapshotHeroProcessor(root);
    const sourceFiles = ["tools/editor-acceptance/acquired-heroes-check.ts", "packages/shared/src/content/heroForge/communityAcquired.ts", "packages/shared/src/content/heroForge/communityAcquiredFirst.ts", "packages/shared/src/content/heroForge/communityAcquiredSecond.ts", "packages/shared/src/content/heroForge/communityAcquiredLegacy.ts", "packages/shared/src/content/heroForge/communityAcquiredPresentation.ts"];
    const sources = await Promise.all(sourceFiles.map(async (path) => { const bytes = readFileSync(resolve(root, path)); return { path, sha256: await binarySha256(bytes), bytes: bytes.length }; }));
    const catalog = readHeroPackageCatalog(content);
    catalog.buildSources = { generatorVersion: generator.versionId, processorVersion: processor.versionId, processorFingerprint: processor.processorFingerprint };
    const fingerprint = contentSha256([...catalog.documents].sort(([a], [b]) => a.localeCompare(b)));
    // Local pins are explicit and never presented as a fetched service target profile.
    const target: HeroPackageTarget = { gameRevision: "local-authoring-check", contentVersion: fingerprint, migrationFingerprint: "local-authoring-check", processorFingerprint: processor.processorFingerprint };
    report = await checkAcquiredHeroes(COMMUNITY_ACQUIRED_HEROES, catalog, target, { outputDirectory: out,
      createProject: (id, projectId, templates) => createAcquiredHeroProject(id, projectId, templates, generator.versionId) });
    // A concurrent recipe/presentation edit must not receive a misleading version receipt.
    for (const source of sources) if (await binarySha256(readFileSync(resolve(root, source.path))) !== source.sha256) throw new Error(`Source changed during this run; rebuild required: ${source.path}`);
    write("report.json", report);
    write("authoring-manifest.json", { schema: "ggd-acquired-heroes-authoring@1", generator: "tools/editor-acceptance/acquired-heroes-check.ts",
      rebuild: "node --import tsx tools/editor-acceptance/acquired-heroes-check.ts --mode strict --out <new-output-directory>",
      recipeSha256: report.sourceSha256, catalogSha256: report.catalogSha256, buildSources: catalog.buildSources, sources,
      serviceImported: false, published: false, status: report.status, modelOptions: ACQUIRED_MODEL_OPTIONS,
      rows: report.heroes.map((row) => ({ id: row.id, name: row.name, status: row.status, modelKey: row.modelKey, sourceSha256: row.sourceSha256, authoring: row.authoring ?? null })) });
    console.log(JSON.stringify({ output: out, status: report.status, ...report.counts }));
    process.exitCode = reportExitCode(report, values.mode);
  } catch (error) {
    write("report.json", { schema: "ggd-acquired-heroes-check@1", scope, heroes: [], ...report, status: "failed", fatal: message(error) });
    console.error(message(error)); process.exitCode = 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
