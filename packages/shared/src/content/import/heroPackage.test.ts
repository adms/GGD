import { describe, expect, it } from "vitest";
import { heroPackageProject, shippedHeroCatalog } from "../../../testkit/heroPackageFixture";
import { buildHeroImportPackage, validateHeroImportPackage } from "./heroPackage";
import { validatePackage } from "./validatePackage";
import { packageDigest } from "./digest";
import { contentSha256 } from "./jcs";

const catalog = shippedHeroCatalog();
const target = { gameRevision: "fixture-revision", contentVersion: "fixture-content", migrationFingerprint: "fixture-migration", processorFingerprint: "fixture-processor" };
const project = heroPackageProject(catalog);

describe("complete hero through Main's package representation", () => {
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
