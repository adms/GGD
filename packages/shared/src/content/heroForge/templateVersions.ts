import { contentSha256 } from "../import/jcs";
import { zTemplateDoc, type TemplateDoc, type AbilityTemplateCard } from "../schema/template";
import { HERO_SLOTS } from "./constants";
import { zHeroPlan, type HeroPlan, type HeroTemplateProduct } from "./plan";

/** Read the pinned definition without consulting a mutable current template. */
export function heroProductTemplate(plan: HeroPlan, product: HeroTemplateProduct, templates: readonly TemplateDoc[]): TemplateDoc | undefined {
  const digest = product.template.contentSha256;
  const saved = digest ? plan.templateVersions?.[digest] : undefined;
  const template = saved ?? templates.find((entry) => entry.id === product.template.ref);
  if (!template || template.id !== product.template.ref || (digest && contentSha256(template) !== digest)) return undefined;
  return template;
}

/** Existing pins are preserved. Legacy references establish a baseline now. */
export function pinHeroPlanTemplates(input: HeroPlan, templates: readonly TemplateDoc[]): HeroPlan {
  const plan = zHeroPlan.parse(input);
  const versions: Record<string, TemplateDoc> = {};
  for (const slot of HERO_SLOTS) for (const product of plan.slots[slot].products) {
    const template = heroProductTemplate(plan, product, templates);
    if (!template) throw new Error(`TEMPLATE_PIN_MISMATCH_OR_MISSING:${slot}:${product.instanceId}:${product.template.ref}`);
    const digest = contentSha256(template);
    product.template.contentSha256 = digest;
    versions[digest] = structuredClone(template);
  }
  plan.templateVersions = versions;
  return plan;
}

/** Runtime dependencies get immutable identities, allowing two versions of a
 * template in one chain or room without overwriting the shared source id. */
export function heroTemplateInstance(digest: string, source: TemplateDoc): TemplateDoc {
  if (contentSha256(source) !== digest) throw new Error("模板版本內容與雜湊不一致");
  return zTemplateDoc.parse({ ...structuredClone(source), id: `hero-template.${digest.slice(7, 55)}` });
}

export function heroTemplateInstances(plan: HeroPlan): TemplateDoc[] {
  const used = new Map<string, TemplateDoc>();
  for (const slot of HERO_SLOTS) for (const product of plan.slots[slot].products) {
    const digest = product.template.contentSha256;
    if (!digest || !plan.templateVersions?.[digest]) continue;
    const source = plan.templateVersions[digest]!;
    if (source.id !== product.template.ref) throw new Error("模板版本與產品來源不一致");
    used.set(digest, heroTemplateInstance(digest, source));
  }
  return [...used.values()].sort((a, b) => a.id.localeCompare(b.id, "en"));
}

export function heroTemplateInstanceCard(plan: HeroPlan, card: AbilityTemplateCard): AbilityTemplateCard {
  const source = card.contentSha256 ? plan.templateVersions?.[card.contentSha256] : undefined;
  if (!source) return structuredClone(card);
  if (source.id !== card.ref) throw new Error("模板版本與產品來源不一致");
  const instance = heroTemplateInstance(card.contentSha256!, source);
  return { ...structuredClone(card), ref: instance.id, contentSha256: contentSha256(instance) };
}
