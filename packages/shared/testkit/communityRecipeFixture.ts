import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDeterministicHeroPlans } from "../src/content/heroForge/planner";
import { HERO_PROJECT_SCHEMA, HERO_SECTION_IDS, HERO_SLOTS } from "../src/content/heroForge/constants";
import { zHeroProject } from "../src/content/heroForge/schema";
import { importHeroHandoff } from "../src/content/heroForge/handoff";
import { defaultHeroPresentation } from "../src/content/heroForge/presentation";
import { shippedHeroCatalog } from "./heroPackageFixture";

/** Rebuild the actual committed six-slot authoring recipe, not its compiled preview. */
export function communityRecipeFixture(number: string) {
  const root = resolve(import.meta.dirname, "../../..");
  const text = readFileSync(resolve(root, `materials/community-hero-forge/recipes/${number}.upload-recipe.json`), "utf8");
  const recipe = JSON.parse(text);
  const brief = { name: recipe.displayName, concept: recipe.identity, moveNames: Object.fromEntries(recipe.slots.map((s: { slot: string; name: string }) => [s.slot, s.name])) };
  const sourceLock = { canonicalId: null, versionId: null };
  const catalog = shippedHeroCatalog();
  const plan = createDeterministicHeroPlans({ projectId: recipe.projectId, brief, origin: recipe.origin, sourceLock,
    availableTemplateIds: [...catalog.documents.keys()].filter(key => key.startsWith("ability-templates/")).map(key => key.split("/")[1]!),
  })[0]!;
  plan.attackType = recipe.attackType; plan.archetype = recipe.archetype; plan.statOverrides = recipe.statOverrides;
  const presentation = defaultHeroPresentation();
  for (const slot of HERO_SLOTS) {
    const source = recipe.slots.find((s: { slot: string }) => s.slot === slot);
    Object.assign(plan.slots[slot], { name: source.name, purpose: source.currentBehavior, maxRank: source.maxRank,
      products: [{ instanceId: `${slot.toLowerCase()}-original`, template: source.template }], abilityOverrides: source.abilityOverrides });
    presentation.slots[slot].script = source.vfx.script;
  }
  const project = zHeroProject.parse({ schema: HERO_PROJECT_SCHEMA, projectId: recipe.projectId, revision: 0, brief, sourceLock,
    acceptedPlan: plan, presentation, receipts: [],
    sections: Object.fromEntries(HERO_SECTION_IDS.map(id => [id, { revision: 0, state: "draft", fieldOwnership: {} }])),
    validationState: Object.fromEntries(HERO_SECTION_IDS.map(id => [id, { revision: 0, status: "idle", diagnosticCodes: [] }])),
  });
  const refinement = JSON.parse(readFileSync(resolve(root, `materials/community-hero-forge/refinements/${number}.json`), "utf8"));
  return { project: importHeroHandoff(project, text), refinement, catalog };
}
