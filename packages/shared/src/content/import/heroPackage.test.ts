import { describe, expect, it } from "vitest";
import { heroPackageProject, shippedHeroCatalog } from "../../../testkit/heroPackageFixture";
import { buildHeroImportPackage, compileHeroPackageProject, validateHeroImportPackage } from "./heroPackage";
import { validatePackage } from "./validatePackage";
import { packageDigest } from "./digest";
import { contentSha256, jcsByteLength } from "./jcs";
import { importHeroHandoff } from "../heroForge/handoff";
import { HERO_SLOTS } from "../heroForge/constants";
import { buildRuntimePackageZip, packageZipInput } from "./packageZip";
import { readPackageZip } from "./readPackageZip";

const catalog = shippedHeroCatalog();
const target = { gameRevision: "fixture-revision", contentVersion: "fixture-content", migrationFingerprint: "fixture-migration", processorFingerprint: "fixture-processor" };
const project = heroPackageProject(catalog);

describe("complete hero through Main's package representation", () => {
  it("allows only the exact server-authorized canonical takeover identity", () => {
    const occupied = new Map(catalog.documents);
    occupied.set(`champions/${project.projectId}`, { id: project.projectId, schema: "champion@1" });
    expect(() => compileHeroPackageProject(project, { ...catalog, documents: occupied }, false)).toThrow("不能佔用既有官方英雄");
    expect(compileHeroPackageProject(project, { ...catalog, documents: occupied, canonicalTakeoverId: project.projectId }, false).project.projectId).toBe(project.projectId);
    expect(() => compileHeroPackageProject(project, { ...catalog, documents: occupied, canonicalTakeoverId: "another-hero" }, false)).toThrow("授權的接管身分");
    expect(() => compileHeroPackageProject(project, { ...catalog, canonicalTakeoverId: project.projectId }, false)).toThrow("只能用於既有正式英雄");
  });

  it("round trips a generated counterpart as owned content and rejects an existing identity collision", async () => {
    const authored = structuredClone(project);
    authored.acceptedPlan!.slots.Q.products = [{ instanceId: "form", template: { ref: "tpl-transform", inheritDefaults: true, params: {} } }];
    const pkg = buildHeroImportPackage(authored, catalog, target);
    const wire = readPackageZip((await buildRuntimePackageZip(packageZipInput(pkg, "form-proof"))).bytes);
    const validated = validateHeroImportPackage(wire, catalog);
    expect(validated.diagnostics).toEqual([]);
    const alternate = validated.result!.compiled.relatedChampions[0]!;
    expect(wire.compiled).toContainEqual(expect.objectContaining({ path: `compiled/champions/${alternate.id}.json` }));
    expect(wire.manifest.requires.some((entry) => entry.kind === "champions" && entry.id === alternate.id)).toBe(false);
    expect(validated.result!.compiled.champion.transform?.counterpartId).toBe(alternate.id);
    const occupied = new Map(catalog.documents); occupied.set(`champions/${alternate.id}`, { ...alternate });
    expect(() => compileHeroPackageProject(authored, { ...catalog, documents: occupied }, false)).toThrow("身分衝突");
    occupied.set(`champions/${authored.projectId}`, { id: authored.projectId, schema: "champion@1" });
    expect(compileHeroPackageProject(authored, { ...catalog, documents: occupied, canonicalTakeoverId: authored.projectId }, false).compiled.relatedChampions[0]?.id).toBe(alternate.id);
    occupied.set(`champions/${alternate.id}`, { ...alternate, transform: { role: "alternate", counterpartId: "some-other-hero" } });
    expect(() => compileHeroPackageProject(authored, { ...catalog, documents: occupied, canonicalTakeoverId: authored.projectId }, false)).toThrow("身分衝突");
  });
  const buildSources = { generatorVersion: `sha256:${"a".repeat(64)}`, processorVersion: `sha256:${"b".repeat(64)}`, processorFingerprint: "123456abcdef" };
  const versionedCatalog = { ...catalog, buildSources };
  const versionedTarget = { ...target, processorFingerprint: buildSources.processorFingerprint };

  it("round trips the exact generator and processor identities alongside the full editable hero", async () => {
    const authored = structuredClone(project);
    authored.acceptedPlan!.generatorVersion = buildSources.generatorVersion;
    const pkg = buildHeroImportPackage(authored, versionedCatalog, versionedTarget);
    const wire = readPackageZip((await buildRuntimePackageZip(packageZipInput(pkg, "build-source-proof"))).bytes);
    const validated = validateHeroImportPackage(wire, versionedCatalog);
    expect(validated.diagnostics).toEqual([]);
    expect(validated.result?.project).toEqual(authored);
    expect(validated.result?.buildProvenance).toEqual({ schema: "ggd-hero-build-provenance@1", ...buildSources, planGeneratorVersion: buildSources.generatorVersion });
    expect(wire.validation.find((entry) => entry.path === "validation/hero-build-provenance.json")?.document).toEqual(validated.result?.buildProvenance);
    expect(validated.result?.runtime).toEqual(compileHeroPackageProject(project, catalog, false).runtime);
    expect(pkg.manifest.packageDigest).toBe(buildHeroImportPackage(authored, versionedCatalog, versionedTarget).manifest.packageDigest);
  });

  it("leaves a legacy plan's unknown generator explicit while identifying its current compiler", () => {
    const result = compileHeroPackageProject(project, versionedCatalog, false);
    expect(result.buildProvenance).toMatchObject({ ...buildSources, planGeneratorVersion: null });
    expect(result.project).toEqual(project);
    const stale = structuredClone(project);
    stale.acceptedPlan!.generatorVersion = `sha256:${"c".repeat(64)}`;
    expect(() => compileHeroPackageProject(stale, versionedCatalog, false)).toThrow("明確採用目前生成器");
    expect(() => buildHeroImportPackage(project, versionedCatalog, target)).toThrow("建包處理器來源與目標版本不同");
  });

  it.each(["changed", "missing"])("rejects %s build provenance even with newly signed manifest hashes", (kind) => {
    const pkg = buildHeroImportPackage(project, versionedCatalog, versionedTarget);
    const path = "validation/hero-build-provenance.json";
    if (kind === "missing") {
      pkg.validation = pkg.validation.filter((entry) => entry.path !== path);
      pkg.manifest.entries = pkg.manifest.entries.filter((entry) => entry.path !== path);
    } else {
      const document = pkg.validation.find((entry) => entry.path === path)!.document as Record<string, unknown>;
      document.generatorVersion = `sha256:${"d".repeat(64)}`;
      Object.assign(pkg.manifest.entries.find((entry) => entry.path === path)!, { contentSha256: contentSha256(document), contentSize: jcsByteLength(document) });
    }
    pkg.manifest.packageDigest = packageDigest(pkg.manifest);
    const validated = validateHeroImportPackage(pkg, versionedCatalog);
    expect(validated.result).toBeNull();
    expect(validated.diagnostics.some((diagnostic) => diagnostic.severity === "error")).toBe(true);
  });

  it("keeps the self-clone sentinel local to its caster", () => {
    const authored = structuredClone(project);
    authored.acceptedPlan!.slots.W.products = [{ instanceId: "clone-proof", template: {
      ref: "tpl-summon-agent", inheritDefaults: true, params: { body: "self", count: 1, durationSec: 6 },
    } }];
    const result = compileHeroPackageProject(authored, catalog, false);
    expect(result.compiled.abilityDrafts.W.effects).toContainEqual(expect.objectContaining({ kind: "summon", championId: "self" }));
    expect(result.dependencies.some((doc) => doc.collection === "champions" && doc.id === "self")).toBe(false);
  });

  it("pins a summoned champion and its appearance instead of relying on the server-only baseline", async () => {
    const authored = structuredClone(project);
    authored.acceptedPlan!.slots.W.products = [{ instanceId: "summon-proof", template: {
      ref: "tpl-summon-agent", inheritDefaults: true,
      params: { body: "champion", championId: "thorne", count: 1, durationSec: 6 },
    } }];
    const pkg = buildHeroImportPackage(authored, catalog, target);
    const wire = readPackageZip((await buildRuntimePackageZip(packageZipInput(pkg, "summon-proof"))).bytes);
    expect(wire.documents).toContainEqual(expect.objectContaining({ path: "authoring/champions/thorne.json" }));
    expect(wire.compiled).toContainEqual(expect.objectContaining({ path: "compiled/champions/thorne.json" }));
    const modelKey = catalog.documents.get("champions/thorne")!.modelKey;
    expect(wire.compiled).toContainEqual(expect.objectContaining({ path: `compiled/models/${modelKey}.json` }));
    expect(validateHeroImportPackage(wire, catalog).diagnostics).toEqual([]);
    const missing = new Map(catalog.documents); missing.delete("champions/thorne");
    expect(() => compileHeroPackageProject(authored, { ...catalog, documents: missing }, false)).toThrow(/champions\/thorne/);
  });

  it("carries original slot requirements and author notes through ZIP without turning them into verdicts", async () => {
    const source = { schema: "ggd-workflow-upload-sidecar@1", projectId: project.projectId, displayName: project.brief.name,
      identity: "素材角色與遊戲角色分開保存", sourceOwnerText: "\n逐字保留原稿\n「重複詛咒反而增益敵人。」\n", reviewText: "逐槽驗收，不能用代理素材完成原設計。",
      slots: HERO_SLOTS.map((slot) => ({ slot, name: project.acceptedPlan!.slots[slot].name, ownerDescription: `${slot} 原始技能\n含換行。`, currentBehavior: "基礎模板", requiredRefinement: "原設計待補", refinementContracts: ["M10"] })),
    };
    const authored = importHeroHandoff(project, JSON.stringify(source));
    authored.refinementNotes = { EX: "已保存來源，機制尚待驗收。" };
    const pkg = buildHeroImportPackage(authored, catalog, target);
    const zip = await buildRuntimePackageZip(packageZipInput(pkg, "source-preserved"));
    const wire = readPackageZip(zip.bytes);
    const validated = validateHeroImportPackage(wire, catalog);
    expect(validated.diagnostics).toEqual([]);
    expect(validated.result?.project).toEqual(authored);
    expect(wire.manifest.fidelityDecisions).toEqual(pkg.manifest.fidelityDecisions);
    expect(validated.result?.runtime).toEqual(compileHeroPackageProject(project, catalog).runtime);
  });
  it("pins authored subtype calls, compiles them once and rejects missing or changed dependencies", () => {
    const authored = structuredClone(project);
    const id = `${authored.projectId}.q`;
    authored.presentation.slots.Q.script = { schema: "vfx-script@1", id, abilityId: id, yields: ["caster.castFx"], segments: [
      { call: { subtype: "sub.forward-twin-blast", params: { burstLifeSec: 0.8 } } },
      { call: { subtype: "sub.forward-twin-blast", params: { burstLifeSec: 2.4 } } },
    ] };
    const result = compileHeroPackageProject(authored, catalog, false);
    expect(result.project).toEqual(authored);
    expect(result.dependencies).toContainEqual(expect.objectContaining({ collection: "vfx-subtypes", id: "sub.forward-twin-blast" }));
    expect(result.compiled.vfxScripts[0]!.segments).toHaveLength(4);
    expect(result.compiled.vfxScripts[0]!.segments[1]).toMatchObject({ lifeSec: 0.8 });
    expect(result.compiled.vfxScripts[0]!.segments[3]).toMatchObject({ lifeSec: 2.4 });
    const missing = new Map(catalog.documents); missing.delete("vfx-subtypes/sub.forward-twin-blast");
    expect(() => compileHeroPackageProject(authored, { ...catalog, documents: missing }, false)).toThrow(/固定依賴/);
    const pkg = buildHeroImportPackage(authored, catalog, target);
    const changed = new Map(catalog.documents);
    const subtype = structuredClone(changed.get("vfx-subtypes/sub.forward-twin-blast")!);
    subtype.label = "新版本"; changed.set("vfx-subtypes/sub.forward-twin-blast", subtype);
    expect(validateHeroImportPackage(pkg, { ...catalog, documents: changed }).result).toBeNull();
  });
  it("round trips source text, repeated products, locks and six compiled slots through the existing validator", () => {
    const pkg = buildHeroImportPackage(project, catalog, target);
    const wire = JSON.parse(JSON.stringify(pkg));
    wire.assets = pkg.assets;
    const validated = validatePackage({ raw: wire, base: { gameRevision: target.gameRevision, contentVersion: target.contentVersion, activationDigest: null, authoringDigest: null, present: new Map() }, capabilities: new Set(pkg.manifest.requiredCapabilities), processorFingerprint: target.processorFingerprint, heroCatalog: catalog, heroTarget: target });
    expect(validated.diagnostics).toEqual([]);
    expect(validated.ok).toBe(true);
    expect(validated.hero?.project).toEqual(project);
    expect(validated.hero?.runtime.filter((doc) => doc.collection === "abilities")).toHaveLength(6);
    expect(pkg.manifest.packageDigest).toBe(buildHeroImportPackage(project, catalog, target).manifest.packageDigest);
  });

  it.each(["runtime", "dependency", "root", "simulation", "missing", "scope", "manifest"])("rejects %s drift even after an attacker recomputes the outer digest", (kind) => {
    const pkg = buildHeroImportPackage(project, catalog, target);
    if (kind === "runtime") (pkg.compiled[1]!.document as Record<string, unknown>).name = "forged";
    if (kind === "dependency") (pkg.documents[1]!.document as Record<string, unknown>).name = "forged";
    if (kind === "root") pkg.manifest.selectionRoots[0]!.id = "another-work";
    if (kind === "simulation") pkg.validation[0]!.document = { schema: "ggd-hero-simulation@1", status: "pass" };
    if (kind === "missing") pkg.documents.pop();
    if (kind === "scope") pkg.manifest.scope = "official";
    if (kind === "manifest") pkg.manifest.entries[0]!.contentSize += 1;
    pkg.manifest.packageDigest = packageDigest(pkg.manifest);
    const result = validateHeroImportPackage(pkg, catalog);
    expect(result.result).toBeNull();
    expect(result.diagnostics.some((diagnostic) => diagnostic.severity === "error")).toBe(true);
  });

  it("rejects changed server defaults instead of silently recompiling the approved version", () => {
    const pkg = buildHeroImportPackage(project, catalog, target);
    const documents = new Map(catalog.documents);
    const key = "config/damage-tiers";
    const original = documents.get(key)!;
    documents.set(key, { ...original, notes: "a new server revision" });
    expect(contentSha256(documents.get(key))).not.toBe(contentSha256(original));
    expect(validateHeroImportPackage(pkg, { ...catalog, documents }).result).toBeNull();
  });
});
