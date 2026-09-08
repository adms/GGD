import { describe, expect, it } from "vitest";
import { heroPackageProject, shippedHeroCatalog } from "../../../testkit/heroPackageFixture";
import { compileGeneratedHeroDraft, generateHeroDraft } from "./generator";
import { heroCounterpartId } from "./forms";
import { runHeroAbilityScenario } from "./scenario";
import type { TemplateDoc } from "../schema/template";
import { zChampionDoc } from "../schema/champion";

const catalog = shippedHeroCatalog();
const templates = [...catalog.documents.values()].filter((doc) => doc.schema === "template@1") as TemplateDoc[];
const configs = [...catalog.documents.values()].filter((doc) => String(doc.schema).startsWith("config."));

function formProject() {
  const project = heroPackageProject(catalog, "generated-form-proof");
  project.acceptedPlan!.slots.Q.products = [{ instanceId: "form", template: { ref: "tpl-transform", inheritDefaults: true, params: {} } }];
  project.acceptedPlan!.slots.Q.capabilityIds = ["championForm"];
  return project;
}

describe("generated hero counterparts", () => {
  it("creates a distinct authored pair without fabricating imported rawcodes", () => {
    const project = formProject();
    const draft = generateHeroDraft(project.acceptedPlan!, { heroId: project.projectId, heroName: project.brief.name });
    const alternate = draft.relatedChampions[0]!;
    expect(draft.relatedChampions).toHaveLength(1);
    expect(zChampionDoc.safeParse(draft.champion).success).toBe(true);
    expect(zChampionDoc.safeParse(alternate).success).toBe(true);
    expect(draft.champion.transform).toEqual({ role: "base", counterpartId: alternate.id });
    expect(alternate.transform).toEqual({ role: "alternate", counterpartId: draft.champion.id });
    expect(draft.champion.name).toBe(project.brief.name);
    expect(alternate.description).toBe(draft.champion.description);
    alternate.abilities.Q.name = "只改變身態副本";
    expect(draft.champion.abilities.Q.name).not.toBe(alternate.abilities.Q.name);
    const longId = "a".repeat(64);
    expect(heroCounterpartId(longId).length).toBeLessThanOrEqual(64);
    expect(heroCounterpartId(longId)).not.toBe(heroCounterpartId(`${longId.slice(0, -1)}b`));
  });

  it.each([1, 4])("executes rank %i using the generated body and refuses a missing body", (rank) => {
    const project = formProject();
    const result = compileGeneratedHeroDraft(generateHeroDraft(project.acceptedPlan!, { heroId: project.projectId, heroName: project.brief.name }), templates, configs);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { champion, relatedChampions, abilityDrafts } = result.draft;
    expect(relatedChampions[0]!.origin).toBe(champion.origin);
    expect(relatedChampions[0]!.baseStats).toEqual(champion.baseStats);
    const opts = { rank, ticks: 180, relatedAbilities: Object.values(abilityDrafts), relatedChampions };
    const scenario = runHeroAbilityScenario(champion, abilityDrafts.Q, opts);
    expect(scenario.status).toBe("accepted");
    expect(scenario.eventCounts.championForm).toBeGreaterThan(0);
    const missing = runHeroAbilityScenario(champion, abilityDrafts.Q, { ...opts, relatedChampions: [] });
    expect(missing.rejectionReason).toBe("no-form");
    expect(missing.eventCounts.championForm ?? 0).toBe(0);
  });

  it("uses compiled effects when template IDs and capability hints change", () => {
    const project = formProject();
    const custom = structuredClone(templates.find((doc) => doc.id === "tpl-transform")!);
    custom.id = "author-custom-body-switch";
    project.acceptedPlan!.slots.Q.products[0]!.template.ref = custom.id;
    project.acceptedPlan!.slots.Q.capabilityIds = [];
    const generated = generateHeroDraft(project.acceptedPlan!, { heroId: project.projectId, heroName: project.brief.name });
    expect(generated.relatedChampions).toEqual([]);
    const result = compileGeneratedHeroDraft(generated, [...templates, custom], configs);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.relatedChampions).toHaveLength(1);
    const ordinary = heroPackageProject(catalog);
    ordinary.acceptedPlan!.slots.Q.capabilityIds = ["championForm"];
    const noForm = compileGeneratedHeroDraft(generateHeroDraft(ordinary.acceptedPlan!, { heroId: ordinary.projectId, heroName: ordinary.brief.name }), templates, configs);
    expect(noForm.ok).toBe(true);
    if (noForm.ok) {
      expect(noForm.draft.relatedChampions).toEqual([]);
      expect(noForm.draft.champion.transform).toBeUndefined();
    }
  });
});
