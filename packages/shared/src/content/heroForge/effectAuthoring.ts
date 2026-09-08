import type { AbilityDoc } from "../schema/ability";
import type { AbilityTemplateStack, TemplateDoc } from "../schema/template";
import { HERO_SLOTS, type HeroSlot } from "./constants";
import { compileGeneratedHeroDraft, generateHeroDraft, type HeroDraftGeneratorOptions } from "./generator";
import { type HeroPlan, type HeroTemplateProduct } from "./plan";
import { pinHeroPlanTemplates } from "./templateVersions";
export { pinHeroPlanTemplates } from "./templateVersions";

export interface HeroEffectAuthoringSlot {
  readonly slot: HeroSlot;
  readonly products: readonly HeroTemplateProduct[];
  readonly chain: AbilityTemplateStack;
  readonly compiled: AbilityDoc;
}

/** Products keep their authoring identities; Main's resolver owns all expansion. */
export function materializeHeroEffectAuthoring(
  input: HeroPlan,
  templates: readonly TemplateDoc[],
  options: HeroDraftGeneratorOptions,
): Readonly<Record<HeroSlot, HeroEffectAuthoringSlot>> {
  const plan = pinHeroPlanTemplates(input, templates);
  const generated = generateHeroDraft(plan, options);
  const result = compileGeneratedHeroDraft(generated, templates);
  if (!result.ok) throw new Error(result.failures.map((failure) => `${failure.slot}:${failure.message}`).join("; "));
  const authoring = {} as Record<HeroSlot, HeroEffectAuthoringSlot>;
  for (const slot of HERO_SLOTS) authoring[slot] = {
    slot, products: plan.slots[slot].products,
    chain: { cards: plan.slots[slot].products.map((product) => product.template), onConflict: plan.slots[slot].templateConflictPolicy },
    compiled: result.draft.abilityDrafts[slot],
  };
  return authoring;
}
