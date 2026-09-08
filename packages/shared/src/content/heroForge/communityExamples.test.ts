import { describe, expect, it } from "vitest";
import { shippedHeroCatalog } from "../../../testkit/heroPackageFixture";
import type { TemplateDoc } from "../schema/template";
import { buildHeroImportPackage, compileHeroPackageProject, validateHeroImportPackage } from "../import/heroPackage";
import { COMMUNITY_HERO_EXAMPLES, createCommunityHeroExample } from "./communityExamples";
import { HERO_SLOTS } from "./constants";
import { zHeroProject } from "./schema";
import { compileGeneratedHeroDraft, generateHeroDraft } from "./generator";
import { runHeroAbilityScenario } from "./scenario";
import { createHeroSimulationBaseline } from "./simulationBaseline";
import { DEFAULT_HERO_SCENARIO_SETUP } from "./scenarioSetup";

const catalog = shippedHeroCatalog();
const templates = [...catalog.documents.entries()].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);
const target = { gameRevision: "concept-proof", contentVersion: "concept-proof", migrationFingerprint: "concept-proof", processorFingerprint: "concept-proof" };
const baseline = createHeroSimulationBaseline(catalog.documents);

describe("seven adapted community heroes", () => {
  it.each(COMMUNITY_HERO_EXAMPLES)("$inspiration survives all six slots, package simulation and immutable import", (example) => {
    const project = createCommunityHeroExample(example.id, `concept-proof-${example.id}`, templates);
    const frozenText = JSON.stringify(project);
    const materialized = compileHeroPackageProject(project, catalog, true);
    expect(Object.keys(materialized.compiled.abilityDrafts)).toEqual([...HERO_SLOTS]);
    expect(materialized.compiled.champion.origin).toBe(example.origin);
    for (const slot of HERO_SLOTS) {
      const ability = materialized.compiled.abilityDrafts[slot];
      expect(ability.description).toBe(example.moves[slot].purpose);
      expect(ability.maxRank).toBe(slot === "R" ? 3 : slot === "PASSIVE" || slot === "EX" ? 1 : 4);
      expect(Number.isFinite(ability.range)).toBe(true);
      expect(ability.range).toBeLessThanOrEqual(12);
      if (slot !== "PASSIVE") expect(ability.effects.length).toBeGreaterThan(0);
    }
    const pkg = buildHeroImportPackage(project, catalog, target);
    const result = validateHeroImportPackage(pkg, catalog);
    expect(result.diagnostics).toEqual([]);
    expect(result.result?.project).toEqual(project);
    expect(JSON.stringify(project)).toBe(frozenText);
    expect(zHeroProject.parse(JSON.parse(frozenText))).toEqual(project);
    expect(pkg.manifest.scope).toBe("community-work");
  }, 120_000);

  it("creates separate identities without mutating the recipe or another author's edits", () => {
    const first = createCommunityHeroExample("karthus", "author-one", templates);
    const second = createCommunityHeroExample("karthus", "author-two", templates);
    first.acceptedPlan!.slots.Q.name = "我的暮點\n「鐘聲不等於傷害」";
    expect(second.acceptedPlan!.slots.Q.name).toBe("暮點");
    expect(first.acceptedPlan!.slots.PASSIVE.products[0]!.template.params.markId).toBe("author-one.last-song");
    expect(second.acceptedPlan!.slots.PASSIVE.products[0]!.template.params.markId).toBe("author-two.last-song");
    expect(first.sourceLock).toEqual({ canonicalId: null, versionId: null });
  });

  it.each([
    ["warwick", "Q", "heal"], ["warwick", "E", "statusApplied"],
    ["karthus", "E", "damage"], ["lux", "Q", "statusApplied"], ["lux", "W", "shieldGained"],
    ["yasuo", "E", "displace"], ["yasuo", "W", "shieldGained"],
    ["missfortune", "Q", "damage"], ["missfortune", "R", "damage"],
    ["leesin", "R", "displace"], ["leesin", "EX", "leapStart"],
    ["xerath", "E", "statusApplied"], ["xerath", "R", "damage"],
  ] as const)("%s %s produces its intended %s event with a target inside the effect area", (id, slot, event) => {
    const project = createCommunityHeroExample(id, `mechanic-${id}`, templates);
    const { compiled } = compileHeroPackageProject(project, catalog, false);
    const setup = structuredClone(DEFAULT_HERO_SCENARIO_SETUP);
    setup.caster.x = 0; setup.target.x = 1; setup.target.hp = 100;
    const result = runHeroAbilityScenario(compiled.champion, compiled.abilityDrafts[slot], { baseline, setup, ticks: 180, relatedAbilities: Object.values(compiled.abilityDrafts) });
    expect(result.status).toBe("accepted");
    expect(result.eventCounts[event] ?? 0).toBeGreaterThan(0);
    if (slot === "R" && id === "leesin") expect(result.after.targetPos).not.toEqual(result.before.targetPos);
  });

  it.each(["warwick", "yasuo"])("%s's three-hit combo also lands the finisher through the normal approach path", (id) => {
    const project = createCommunityHeroExample(id, `finisher-${id}`, templates);
    const { compiled } = compileHeroPackageProject(project, catalog, false);
    const result = runHeroAbilityScenario(compiled.champion, compiled.abilityDrafts.R, { baseline, ticks: 180, relatedAbilities: Object.values(compiled.abilityDrafts) });
    expect(result.status).toBe("accepted");
    expect(result.eventCounts.damage).toBeGreaterThanOrEqual(4);
  });

  it.each(["duplicate", "passive"])("rejects silently discarded %s author effects", (kind) => {
    const project = createCommunityHeroExample("lux", `shadow-${kind}`, templates);
    const slot = kind === "passive" ? "PASSIVE" : "Q";
    project.acceptedPlan!.slots[slot].abilityOverrides.effects = [{ kind: "damage", damageType: "magic", amount: { flat: 10 } }];
    const result = compileGeneratedHeroDraft(generateHeroDraft(project.acceptedPlan!, { heroId: project.projectId, heroName: project.brief.name }), templates);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failures).toContainEqual(expect.objectContaining({ slot, message: expect.stringContaining("abilityOverrides.effects.0") }));
  });
});
