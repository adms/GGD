import { expect, it } from "vitest";
import { heroPackageProject, shippedHeroCatalog } from "../../../testkit/heroPackageFixture";
import { generateHeroDraft, compileGeneratedHeroDraft } from "./generator";
import { pinHeroPlanTemplates } from "./templateVersions";
import { zHeroPlan } from "./plan";
import { contentSha256 } from "../import/jcs";
import type { TemplateDoc } from "../schema/template";
import { compileHeroPackageProject, buildHeroImportPackage, validateHeroImportPackage } from "../import/heroPackage";
import { buildRuntimePackageZip, packageZipInput } from "../import/packageZip";
import { readPackageZip } from "../import/readPackageZip";

const catalog = shippedHeroCatalog();
const templates = [...catalog.documents].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);
const target = { gameRevision: "template-version-test", contentVersion: "cv_test", migrationFingerprint: "migration-test", processorFingerprint: "processor-test" };

it("keeps two heroes and per-instance overrides stable after a template default changes", () => {
  const a = heroPackageProject(catalog, "pinned-a"), b = heroPackageProject(catalog, "pinned-b");
  const before = JSON.stringify(b);
  const plan = a.acceptedPlan!, card = plan.slots.Q.products[0]!.template;
  const old = plan.templateVersions![card.contentSha256!]!;
  const newer = structuredClone(old);
  newer.params.damage!.default = { perRank: [333], ratios: [] };
  card.params.damage = { perRank: [111], ratios: [] };
  const changed = templates.map((template) => template.id === old.id ? newer : template);
  const compile = (input: typeof plan, sources: TemplateDoc[]) => {
    const result = compileGeneratedHeroDraft(generateHeroDraft(input, { heroId: "pinned-a", heroName: "甲" }), sources);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(JSON.stringify(result.failures));
    return result.draft.abilityDrafts.Q;
  };
  expect(compile(plan, changed)).toEqual(compile(plan, templates));
  const upgrade = structuredClone(plan);
  const nextDigest = contentSha256(newer);
  upgrade.templateVersions![nextDigest] = newer;
  upgrade.slots.Q.products[1]!.template.contentSha256 = nextDigest;
  const result = compile(upgrade, changed);
  expect(JSON.stringify(result.effects)).toContain("111");
  expect(JSON.stringify(result.effects)).toContain("333");
  expect(compile(plan, changed)).not.toEqual(result);
  expect(JSON.stringify(b)).toBe(before);
  expect(pinHeroPlanTemplates(plan, changed)).toEqual(plan);
});

it("rejects corrupted definitions and does not upgrade an unresolved legacy pin", () => {
  const plan = heroPackageProject(catalog).acceptedPlan!;
  const card = plan.slots.Q.products[0]!.template;
  plan.templateVersions![card.contentSha256!]!.name += " altered";
  expect(zHeroPlan.safeParse(plan).success).toBe(false);
  delete plan.templateVersions;
  card.contentSha256 = "sha256:" + "0".repeat(64);
  expect(() => pinHeroPlanTemplates(plan, templates)).toThrow(/TEMPLATE_PIN_MISMATCH/);
});

it("round trips historical templates and rejects self-approved source snapshots", async () => {
  const project = heroPackageProject(catalog, "historical-zip");
  const card = project.acceptedPlan!.slots.Q.products[0]!.template;
  const saved = project.acceptedPlan!.templateVersions![card.contentSha256!]!;
  const documents = new Map(catalog.documents);
  const newer = structuredClone(saved); newer.params.damage!.default = { perRank: [333], ratios: [] };
  documents.set(`ability-templates/${saved.id}`, newer);
  const changed = { ...catalog, documents };
  expect(() => compileHeroPackageProject(project, changed, false)).toThrow(/伺服器來源確認/);
  const trusted = { ...changed, resolveTemplateVersion: (id: string, digest: string) => id === saved.id && digest === contentSha256(saved) ? saved : undefined };
  const original = compileHeroPackageProject(project, catalog, false);
  expect(compileHeroPackageProject(project, trusted, false).runtime).toEqual(original.runtime);
  const pkg = buildHeroImportPackage(project, trusted, target);
  const zip = await buildRuntimePackageZip(packageZipInput(pkg, project.projectId));
  const restored = validateHeroImportPackage(readPackageZip(zip.bytes), trusted);
  expect(restored.diagnostics).toEqual([]);
  expect(restored.result?.project).toEqual(project);
  expect(restored.result?.runtime).toEqual(original.runtime);
});
