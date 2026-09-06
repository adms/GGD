import { contentSha256 } from "../import/jcs";
import type { AbilityDoc } from "../schema/ability";
import type { AbilityTemplateStack, TemplateDoc } from "../schema/template";
import { HERO_SLOTS, type HeroSlot } from "./constants";
import { compileGeneratedHeroDraft, generateHeroDraft, type HeroDraftGeneratorOptions } from "./generator";
import { zHeroPlan, type HeroPlan, type HeroTemplateProduct } from "./plan";

export interface HeroEffectAuthoringSlot {
  readonly slot: HeroSlot;
  readonly products: readonly HeroTemplateProduct[];
  readonly chain: AbilityTemplateStack;
  readonly compiled: AbilityDoc;
}

/** Bind products to the actual Main template bytes before review/export. */
export function pinHeroPlanTemplates(input: HeroPlan, templates: readonly TemplateDoc[]): HeroPlan {
  const plan = zHeroPlan.parse(input);
  const catalog = new Map(templates.map((template) => [template.id, template]));
  for (const slot of HERO_SLOTS) {
    for (const product of plan.slots[slot].products) {
      const template = catalog.get(product.template.ref);
      if (!template) throw new Error(`TEMPLATE_MISSING:${slot}:${product.instanceId}:${product.template.ref}`);
      const digest = contentSha256(template);
      if (product.template.contentSha256 && product.template.contentSha256 !== digest) {
        throw new Error(`TEMPLATE_PIN_MISMATCH:${slot}:${product.instanceId}`);
      }
      product.template.contentSha256 = digest;
    }
  }
  return plan;
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
