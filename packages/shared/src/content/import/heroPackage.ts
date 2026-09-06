import { isCollectionName, type CollectionName, type TemplateDoc } from "../schema";
import { validateDoc } from "../loader";
import { extractRefs } from "../refs";
import { zHeroProject, type HeroProject } from "../heroForge/schema";
import { HERO_SLOTS } from "../heroForge/constants";
import { compileGeneratedHeroDraft, generateHeroDraft, type GeneratedHeroDraft, type CompiledHeroDraft } from "../heroForge/generator";
import { zVfxSubtypeDoc } from "../schema/vfxSubtype";
import { heroScenarioProjection, heroKitScenarioProjection, runHeroAbilityScenario, runHeroKitScenario } from "../heroForge/scenario";
import { normalizeTemplateBinding } from "../templates/expand";
import { contentSha256, jcsByteLength } from "./jcs";
import { packageDigest } from "./digest";
import { zEditorImportPackage, type EditorImportPackage } from "./packageSchema";
import type { ImportDiagnostic } from "./diagnostics";
import type { AbilityDef, ChampionDef, ProjectileDef } from "../../sim";
import { resolveTemplateExpansion } from "../templates/resolve";
import { createRuntimeResolver } from "../runtimeResolver";
import { resolveChampionRuntimeStats } from "../championRuntimeResolver";
import { zAbilityDoc } from "../schema/ability";
import { assetMediaType, referencedAssetPaths } from "../assetReferences";
import { sha256Bytes } from "../sha256";
import { zHeroAssetPath } from "../heroForge/presentation";
import { ZIP_LIMITS } from "./zipSafety";
import { assertContainedModelAsset } from "./modelAssetSafety";
import type { HeroAbilityScenarioResult, HeroKitScenarioResult } from "../heroForge/scenario";
import { BUILTIN_VFX_TEXTURES } from "../builtinVfxTextures";
import { createHeroSimulationBaseline } from "../heroForge/simulationBaseline";

export const HERO_PACKAGE_COLLECTION = "hero-projects";
export const HERO_RESOLVER_CONFIG_IDS = [
  "aoe-tiers", "range-tiers", "cooldown-tiers", "damage-tiers", "mana-tiers", "cast-time-tiers",
  "move-speed-tiers", "displacement-tiers", "combo-strikes", "rank-growth", "ap-coefficient",
  "arena-rules", "stat-normalization", "speed-growth-tiers",
] as const;
export const HERO_RENDER_CONFIG_IDS = ["camera", "vfx-budget", "vfx-cleanup", "model-lod", "weather", "feel-fx", "ui-cues", "screen-fx", "vfx-scripts"] as const;

export interface HeroPackageReplay {
  revision: number;
  errors: string[];
  generated: GeneratedHeroDraft;
  compiled: CompiledHeroDraft;
  scenarios: HeroAbilityScenarioResult[];
  kit: HeroKitScenarioResult;
}

export interface HeroPackageDocument { collection: CollectionName; id: string; document: Record<string, unknown> }
export interface HeroPackageCatalog {
  /** Exact server-owned dependency documents, keyed by collection/id. */
  documents: ReadonlyMap<string, Record<string, unknown>>;
  /** Only server-approved shipping bytes or previously normalized icon bytes. */
  readAsset: (path: string) => Uint8Array | undefined;
}
export interface HeroPackageTarget {
  gameRevision: string;
  contentVersion: string;
  migrationFingerprint: string;
  processorFingerprint: string;
}
export interface CompiledHeroPackage {
  project: HeroProject;
  generated: GeneratedHeroDraft;
  compiled: CompiledHeroDraft;
  dependencies: HeroPackageDocument[];
  runtime: HeroPackageDocument[];
  scenarios: unknown;
  assets: { path: string; bytes: Uint8Array; contentSha256: string; mediaType: string }[];
}

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const keyOf = (document: Pick<HeroPackageDocument, "collection" | "id">) => `${document.collection}/${document.id}`;

/** A representation adapter inside the existing package importer, without a store. */
export function compileHeroPackageProject(raw: unknown, catalog: HeroPackageCatalog, simulate = true): CompiledHeroPackage {
  const project = zHeroProject.parse(raw);
  if (!project.acceptedPlan) throw new Error("英雄尚未接受完整六槽方案。");
  if (catalog.documents.has(`champions/${project.projectId}`)) throw new Error("社群作品不能佔用既有官方英雄的身分，請建立改作草稿。");
  if (![...catalog.documents].some(([key, document]) => key.startsWith("champions/") && document.modelKey === project.presentation.modelKey)) throw new Error("英雄本體必須使用目前目錄中已核准的英雄模型，不能以特效或場景模型替代。");
  const dependencies = new Map<string, HeroPackageDocument>();
  const include = (collection: CollectionName, id: string): Record<string, unknown> => {
    const key = `${collection}/${id}`;
    const existing = dependencies.get(key);
    if (existing) return existing.document;
    const source = catalog.documents.get(key);
    const document = source && json(source);
    if (!document || document.id !== id) throw new Error(`缺少固定依賴：${key}`);
    const parsed = validateDoc(collection, document);
    if (!parsed.ok) throw new Error(`${key} 不符合目前內容契約：${parsed.issues.map((issue) => issue.path + ": " + issue.message).join("；")}`);
    dependencies.set(key, { collection, id, document });
    return document;
  };
  for (const id of HERO_RESOLVER_CONFIG_IDS) include("config", id);
  for (const id of HERO_RENDER_CONFIG_IDS) if (catalog.documents.has(`config/${id}`)) include("config", id);
  HERO_SLOTS.forEach((slot) => project.acceptedPlan!.slots[slot].products.forEach((product) => include("ability-templates", product.template.ref)));
  // Presets may use a template outside the selected cards; the walk below pins it.
  const templates = [...catalog.documents.entries()].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);
  const generated = generateHeroDraft(project.acceptedPlan, { heroId: project.projectId, heroName: project.brief.name, presentation: project.presentation });
  // Retain call dependencies before compiling them into inline runtime segments.
  // Authoring remains unchanged, and the package pins each exact subtype.
  const vfxSubtypes = new Map<string, ReturnType<typeof zVfxSubtypeDoc.parse>>();
  for (const script of generated.vfxScripts) for (const edge of extractRefs("vfx-scripts", json(script) as unknown as Record<string, unknown>)) {
    if (edge.targetCollection === "vfx-subtypes") vfxSubtypes.set(edge.targetId, zVfxSubtypeDoc.parse(include("vfx-subtypes", edge.targetId)));
  }
  const result = compileGeneratedHeroDraft(generated, templates, HERO_RESOLVER_CONFIG_IDS.map((id) => include("config", id)), [...vfxSubtypes.values()]);
  if (!result.ok) throw new Error(result.failures.map((failure) => `${failure.slot}: ${failure.message}`).join("；"));
  const compiled = result.draft;
  const runtime: HeroPackageDocument[] = [
    { collection: "champions", id: compiled.champion.id, document: json(compiled.champion) },
    ...HERO_SLOTS.map((slot) => ({ collection: "abilities" as const, id: compiled.abilityDrafts[slot].id, document: json(compiled.abilityDrafts[slot]) })),
    ...compiled.vfxScripts.map((script) => ({ collection: "vfx-scripts" as const, id: script.id, document: json(script) })),
  ];
  const own = new Set(runtime.map(keyOf));
  const visited = new Set<string>();
  const templateMap = new Map(templates.map((template) => [template.id, template]));
  const configs = HERO_RESOLVER_CONFIG_IDS.map((id) => include("config", id));
  const resolver = createRuntimeResolver(templateMap, configs);
  const resolveAbility = (raw: Record<string, unknown>): Record<string, unknown> => {
    let document = raw;
    if (raw.template) {
      for (const card of normalizeTemplateBinding(raw.template).cards) include("ability-templates", card.ref);
      const expanded = resolveTemplateExpansion(raw, templateMap);
      if (!expanded.ok) throw new Error(expanded.failure.message);
      document = expanded.merged;
    }
    return json(resolver.resolve(zAbilityDoc.parse({ ...document, schema: "ability@1" })));
  };
  const resolveDependency = (doc: HeroPackageDocument): HeroPackageDocument => {
    if (doc.collection === "abilities") return { ...doc, document: resolveAbility(doc.document) };
    if (doc.collection === "items" || doc.collection === "augments") return { ...doc, document: json(resolver.resolve(doc.document)) };
    if (doc.collection === "champions") {
      const abilities = Object.fromEntries(Object.entries(doc.document.abilities as Record<string, Record<string, unknown>>).map(([slot, ability]) => {
        const standalone = catalog.documents.get(`abilities/${ability.id}`);
        if (standalone) include("abilities", String(ability.id));
        const { schema: _schema, ...resolved } = resolveAbility({ ...ability, ...standalone });
        return [slot, resolved];
      }));
      return { ...doc, document: json(resolveChampionRuntimeStats({ ...doc.document, abilities } as unknown as Parameters<typeof resolveChampionRuntimeStats>[0], configs)) as unknown as Record<string, unknown> };
    }
    return doc;
  };
  const visitPresets = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(visitPresets);
    else if (value && typeof value === "object") {
      const node = value as Record<string, unknown>;
      if (node.kind === "spawnModelFx" && typeof node.preset === "string") include("ability-templates", node.preset);
      Object.values(node).forEach(visitPresets);
    }
  };
  const visit = (doc: HeroPackageDocument) => {
    const key = keyOf(doc); if (visited.has(key)) return; visited.add(key);
    if (visited.size > 1000) throw new Error("完整英雄依賴超過 1000 份，請縮小作品引用範圍。");
    visitPresets(doc.document);
    if (!own.has(key) && doc.collection !== "ability-templates") {
      doc = resolveDependency(doc);
      runtime.push(json(doc));
      visitPresets(doc.document);
    }
    // Soft visual references are required in a published complete hero.
    for (const edge of extractRefs(doc.collection, doc.document)) {
      const targetKey = `${edge.targetCollection}/${edge.targetId}`;
      if (own.has(targetKey)) continue;
      visit({ collection: edge.targetCollection, id: edge.targetId, document: include(edge.targetCollection, edge.targetId) });
    }
    if (doc.collection === "abilities" && doc.document.template) {
      for (const card of normalizeTemplateBinding(doc.document.template).cards) include("ability-templates", card.ref);
    }
  };
  [...runtime].forEach(visit);
  // Template/config docs can themselves introduce document dependencies.
  for (const dependency of dependencies.values()) visit(dependency);
  const paths = new Set<string>(Object.values(BUILTIN_VFX_TEXTURES));
  const audioKeys = new Set<string>();
  const inspectAudio = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(inspectAudio);
    else if (value && typeof value === "object") for (const [field, child] of Object.entries(value)) {
      if ((field === "sfxKey" || field === "soundKey" || field === "arriveSoundKey") && typeof child === "string") audioKeys.add(child);
      inspectAudio(child);
    }
  };
  for (const doc of [...runtime, ...dependencies.values()]) {
    if (doc.collection !== "config" || doc.id !== "audio-map") referencedAssetPaths(doc.document, paths);
    inspectAudio(doc.document);
  }
  if (audioKeys.size) {
    const audioMap = include("config", "audio-map").sfx as Record<string, unknown>;
    visit({ collection: "config", id: "audio-map", document: include("config", "audio-map") });
    for (const key of audioKeys) {
      if (!audioMap?.[key]) throw new Error(`缺少聲音來源：${key}`);
      referencedAssetPaths(audioMap[key], paths);
    }
  }
  let assetBytes = 0;
  const assets = [...paths].sort().map((path) => {
    zHeroAssetPath.parse(path);
    if (path.includes("..") || path.startsWith("assets/blizzard-local/")) throw new Error(`資產不可分發：${path}`);
    const bytes = catalog.readAsset(path);
    if (!bytes) throw new Error(`缺少可分發資產位元組：${path}`);
    if (/\.gl(?:b|tf)$/.test(path)) assertContainedModelAsset(path, bytes);
    assetBytes += bytes.length;
    if (bytes.length > ZIP_LIMITS.maxEntryUncompressedBytes || assetBytes > ZIP_LIMITS.maxTotalUncompressedBytes) throw new Error("完整英雄資產超過目前目標的 ZIP 限制。");
    return { path, bytes: new Uint8Array(bytes), contentSha256: `sha256:${sha256Bytes(bytes)}`, mediaType: assetMediaType(path)! };
  });
  for (const lock of project.presentation.assetLocks) {
    const asset = assets.find((entry) => entry.path === lock.path);
    if (!asset || asset.contentSha256 !== `sha256:${lock.sha256}` || asset.bytes.length !== lock.byteSize || asset.mediaType !== lock.mediaType) throw new Error(`素材鎖已過期：${lock.path}`);
  }
  const relatedAbilities = runtime.filter((doc) => doc.collection === "abilities").map((doc) => doc.document) as unknown as AbilityDef[];
  const relatedProjectiles = runtime.filter((doc) => doc.collection === "projectiles").map((doc) => doc.document) as unknown as ProjectileDef[];
  const relatedChampions = runtime.filter((doc) => doc.collection === "champions").map((doc) => doc.document) as unknown as ChampionDef[];
  let scenarios: unknown = null;
  if (simulate) {
    const baseline = createHeroSimulationBaseline(catalog.documents);
    const slots = HERO_SLOTS.map((slot) => runHeroAbilityScenario(compiled.champion, compiled.abilityDrafts[slot], { baseline, ticks: 180, relatedAbilities, relatedProjectiles, relatedChampions }));
    const kit = runHeroKitScenario(compiled.champion, compiled.abilityDrafts, { baseline, ticksPerStep: 180, relatedAbilities, relatedProjectiles, relatedChampions });
    const failures = slots.flatMap((scenario) => scenario.assertions.filter((assertion) => assertion.status === "fail").map((assertion) => `${scenario.slot}: ${assertion.summaryZh}`));
    if (kit.status === "rejected") failures.push(`整套技能未完成：${kit.rejectedSlots.join("、")}`);
    if (failures.length) throw new Error(failures.join("；"));
    const replay: HeroPackageReplay = { revision: project.revision, errors: [], generated, compiled, scenarios: slots, kit };
    scenarios = json({ schema: "ggd-hero-simulation@1", baseline: { digest: baseline.digest, arenaId: baseline.arena.id, counts: baseline.counts }, slots: slots.map(heroScenarioProjection), kit: heroKitScenarioProjection(kit), replay });
  }
  return { project, generated, compiled, dependencies: [...dependencies.values()].sort((a, b) => keyOf(a).localeCompare(keyOf(b), "en")), runtime, scenarios, assets };
}

/** Produce Main's existing JSON/ZIP envelope with one editable hero as authority. */
export function buildHeroImportPackage(project: unknown, catalog: HeroPackageCatalog, target: HeroPackageTarget): EditorImportPackage {
  const result = compileHeroPackageProject(project, catalog);
  const rootPath = `authoring/${HERO_PACKAGE_COLLECTION}/${result.project.projectId}.json`;
  const documents = [{ path: rootPath, document: json(result.project) }, ...result.dependencies.map((dependency) => ({ path: `authoring/${keyOf(dependency)}.json`, document: dependency.document }))];
  const compiled = result.runtime.map((document) => ({ path: `compiled/${keyOf(document)}.json`, document: document.document }));
  const validation = [{ path: "validation/hero-simulation.json", document: result.scenarios }];
  const entries = [...documents.map((doc) => ({ ...doc, role: "authoring" as const })), ...compiled.map((doc) => ({ ...doc, role: "compiled" as const })), ...validation.map((doc) => ({ ...doc, role: "validation" as const }))]
    .map(({ path, role, document }) => ({ path, role, contentSha256: contentSha256(document), contentSize: jcsByteLength(document) }));
  const manifest = {
    schema: "ggd-editor-package@1", gameId: "ggd", mode: "bootstrap", scope: "community-work",
    packageDigest: "sha256:" + "0".repeat(64), migrationFingerprint: target.migrationFingerprint,
    base: { gameRevision: target.gameRevision, contentVersion: target.contentVersion, activationDigest: null, authoringDigest: null },
    authoringProcessor: { kind: "runtime-direct", contractVersion: "runtime-direct@1", fingerprint: target.processorFingerprint },
    selectionRoots: [{ kind: "hero", id: result.project.projectId, contentSha256: contentSha256(json(result.project)) }],
    changes: documents.map((doc) => ({ kind: doc.path === rootPath ? "hero" : "runtime-dependency", id: doc.path.split("/").at(-1)!.slice(0, -5), path: doc.path, op: "upsert", before: null, after: { contentSha256: contentSha256(doc.document) }, reason: doc.path === rootPath ? "selected" : "required-dependency" })),
    entries: [...entries, ...result.assets.map((asset) => ({ path: asset.path, role: "asset", contentSha256: asset.contentSha256, contentSize: asset.bytes.length, mime: asset.mediaType }))],
    requires: result.dependencies.map((dependency) => ({ kind: dependency.collection, id: dependency.id, contentSha256: contentSha256(dependency.document) })),
    requiredCapabilities: [...new Set(result.dependencies.filter((doc) => doc.collection === "ability-templates").flatMap((doc) => (doc.document as TemplateDoc).requires))].sort(),
    expectedCompiled: result.runtime.map((document) => ({ path: `compiled/${keyOf(document)}.json`, collection: document.collection, id: document.id, contentSha256: contentSha256(document.document) })),
    expectedDerived: [], validationPolicy: { representation: "ggd-hero-project@2", references: "exact", activation: "work-scoped" },
    requiredScenarios: [{ id: "hero-simulation", schema: "ggd-hero-simulation@1", contentSha256: contentSha256(result.scenarios) }],
    fidelityDecisions: [], acceptedWarnings: [],
  };
  manifest.packageDigest = packageDigest(manifest);
  return zEditorImportPackage.parse({ schema: "ggd-editor-import@1", manifest, documents, compiled, validation, reports: {}, assets: result.assets.map(({ path, bytes }) => ({ path, bytes })) });
}

export function validateHeroImportPackage(pkg: EditorImportPackage, catalog: HeroPackageCatalog): { diagnostics: ImportDiagnostic[]; result: CompiledHeroPackage | null } {
  const diagnostics: ImportDiagnostic[] = [];
  const fail = (message: string, path?: string) => diagnostics.push({ code: "HERO_PACKAGE_INVALID", severity: "error", message, ...(path ? { path } : {}) });
  try {
    const roots = pkg.documents.filter((entry) => entry.path.startsWith(`authoring/${HERO_PACKAGE_COLLECTION}/`));
    if (pkg.manifest.scope !== "community-work" || pkg.manifest.mode !== "bootstrap" || roots.length !== 1 || pkg.manifest.selectionRoots.length !== 1 || pkg.manifest.selectionRoots[0]!.kind !== "hero") throw new Error("完整英雄必須以單一作品提交，不能切換官方 ACTIVE 或只提交部分技能。");
    const root = roots[0]!;
    if (Object.keys(pkg.reports).length || pkg.manifest.expectedDerived.length || pkg.manifest.fidelityDecisions.length || pkg.manifest.acceptedWarnings.length) throw new Error("完整英雄快照不接受未經驗證的報告、降級決定或警告豁免。");
    if (contentSha256(pkg.manifest.validationPolicy) !== contentSha256({ representation: "ggd-hero-project@2", references: "exact", activation: "work-scoped" })) throw new Error("完整英雄驗證政策不一致。");
    const result = compileHeroPackageProject(root.document, catalog);
    if (root.path !== `authoring/${HERO_PACKAGE_COLLECTION}/${result.project.projectId}.json` || pkg.manifest.selectionRoots[0]!.id !== result.project.projectId || pkg.manifest.selectionRoots[0]!.contentSha256 !== contentSha256(root.document)) throw new Error("英雄來源、路徑與 selection root 身分不一致。");
    const expectedDocuments = new Map(result.dependencies.map((dependency) => [`authoring/${keyOf(dependency)}.json`, dependency.document]));
    expectedDocuments.set(root.path, root.document as Record<string, unknown>);
    const expectedRuntime = new Map(result.runtime.map((document) => [`compiled/${keyOf(document)}.json`, document.document]));
    const checkSet = (actual: readonly { path: string; document?: unknown }[], expected: ReadonlyMap<string, unknown>, label: string) => {
      if (actual.length !== expected.size || new Set(actual.map((entry) => entry.path)).size !== actual.length) throw new Error(`${label} 文件集合不完整或重複。`);
      for (const entry of actual) {
        const expectedDoc = expected.get(entry.path);
        if (!expectedDoc || contentSha256(entry.document) !== contentSha256(expectedDoc)) fail(`${label} 與伺服器重算的固定依賴／結果不同。`, entry.path);
      }
    };
    checkSet(pkg.documents, expectedDocuments, "Authoring");
    checkSet(pkg.compiled, expectedRuntime, "Runtime");
    checkSet(pkg.validation, new Map([["validation/hero-simulation.json", result.scenarios]]), "SimWorld");
    const all = new Map([...expectedDocuments, ...expectedRuntime, ["validation/hero-simulation.json", result.scenarios]]);
    if (pkg.assets.length !== result.assets.length || new Set(pkg.assets.map((asset) => asset.path)).size !== result.assets.length) throw new Error("資產快照集合不完整或重複。");
    const expectedAssets = new Map(result.assets.map((asset) => [asset.path, asset]));
    for (const asset of pkg.assets) {
      const expected = expectedAssets.get(asset.path);
      if (!expected || !(asset.bytes instanceof Uint8Array) || `sha256:${sha256Bytes(asset.bytes)}` !== expected.contentSha256) fail("資產位元組與伺服器固定來源不同。", asset.path);
    }
    const entryCount = all.size + expectedAssets.size;
    if (pkg.manifest.entries.length !== entryCount || new Set(pkg.manifest.entries.map((entry) => entry.path)).size !== entryCount) throw new Error("Manifest 文件集合不完整或重複。");
    for (const entry of pkg.manifest.entries) {
      const asset = expectedAssets.get(entry.path);
      if (asset) {
        if (entry.role !== "asset" || entry.contentSha256 !== asset.contentSha256 || entry.contentSize !== asset.bytes.length || entry.mime !== asset.mediaType) fail("Manifest 與固定資產不同。", entry.path);
        continue;
      }
      const document = all.get(entry.path);
      if (!document || entry.contentSha256 !== contentSha256(document) || entry.contentSize !== jcsByteLength(document)) fail("Manifest 與完整快照位元組不一致。", entry.path);
      const role = entry.path.startsWith("compiled/") ? "compiled" : entry.path.startsWith("validation/") ? "validation" : "authoring";
      if (entry.role !== role) fail("文件角色與完整快照不一致。", entry.path);
    }
    if (pkg.manifest.expectedCompiled.length !== expectedRuntime.size || new Set(pkg.manifest.expectedCompiled.map((entry) => entry.path)).size !== expectedRuntime.size) throw new Error("預期 runtime 清單不完整或重複。");
    for (const entry of pkg.manifest.expectedCompiled) {
      const document = expectedRuntime.get(entry.path);
      if (!document || entry.contentSha256 !== contentSha256(document) || entry.path !== `compiled/${entry.collection}/${entry.id}.json`) fail("預期 runtime 與伺服器編譯結果不同。", entry.path);
    }
    if (pkg.manifest.requiredScenarios.length !== 1 || pkg.manifest.requiredScenarios[0]!.id !== "hero-simulation" || pkg.manifest.requiredScenarios[0]!.schema !== "ggd-hero-simulation@1" || pkg.manifest.requiredScenarios[0]!.contentSha256 !== contentSha256(result.scenarios)) throw new Error("六槽與整套 SimWorld 證據不一致。");
    const exact = new Map(result.dependencies.map((dependency) => [keyOf(dependency), contentSha256(dependency.document)]));
    if (pkg.manifest.requires.length !== exact.size || new Set(pkg.manifest.requires.map((ref) => `${ref.kind}/${ref.id}`)).size !== exact.size) throw new Error("固定依賴清單不完整或重複。");
    for (const ref of pkg.manifest.requires) if (!isCollectionName(ref.kind) || exact.get(`${ref.kind}/${ref.id}`) !== ref.contentSha256) fail(`固定依賴已變更或不受支援：${ref.kind}/${ref.id}`);
    const capabilities = [...new Set(result.dependencies.filter((doc) => doc.collection === "ability-templates").flatMap((doc) => (doc.document as TemplateDoc).requires))].sort();
    if (contentSha256(pkg.manifest.requiredCapabilities) !== contentSha256(capabilities)) throw new Error("能力清單與實際使用的模板不一致。");
    const changes = pkg.manifest.changes;
    if (changes.length !== expectedDocuments.size || new Set(changes.map((entry) => entry.path)).size !== expectedDocuments.size) throw new Error("變更清單不完整或重複。");
    for (const change of changes) if (!expectedDocuments.has(change.path) || change.op !== "upsert" || change.before !== null || change.after?.contentSha256 !== contentSha256(expectedDocuments.get(change.path)) || change.kind !== (change.path === root.path ? "hero" : "runtime-dependency") || change.id !== change.path.split("/").at(-1)!.slice(0, -5)) throw new Error("完整英雄不能刪除文件或宣告未包含的變更。");
    return { diagnostics, result: diagnostics.length ? null : result };
  } catch (error) { fail(error instanceof Error ? error.message : String(error)); return { diagnostics, result: null }; }
}
