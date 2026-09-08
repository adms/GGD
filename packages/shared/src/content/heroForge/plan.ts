import { z } from "zod";
import { ARCHETYPES, ORIGINS } from "../statNormalization";
import { zId } from "../schema/common";
import { zChampionStatOverrides } from "../schema/championStats";
import { defaultAbilityMaxRank } from "../schema/ability";
import { DEFAULT_TEMPLATE_CONFLICT, TEMPLATE_STACK_MAX_CARDS, zAbilityTemplateCard, zTemplateConflictPolicy, zTemplateDoc } from "../schema/template";
import { contentSha256 } from "../import/jcs";
import { zHeroBuildSourceVersion } from "../import/heroBuildProvenance";
import { HERO_PLAN_SCHEMA, HERO_SLOTS } from "./constants";

export { ARCHETYPES, ARCHETYPE_LABEL_ZH, ORIGINS } from "../statNormalization";
export type { Archetype, Origin } from "../statNormalization";

/** Capability ids contain version separators (`@1`), unlike content ids. */
export const CONTRACT_ID_RE = /^[a-z0-9][a-z0-9._:@/-]*$/i;
export const zContractId = z.string().min(1).max(128).regex(CONTRACT_ID_RE);

export const zHeroSourceLock = z
  .object({
    canonicalId: zId.nullable(),
    versionId: zId.nullable(),
  })
  .strict();
export type HeroSourceLock = z.infer<typeof zHeroSourceLock>;

export const zHeroBudget = z
  .object({
    power: z.number().int().min(0).max(100),
    complexity: z.number().int().min(0).max(100),
  })
  .strict();
export type HeroBudget = z.infer<typeof zHeroBudget>;

/** A product is an instance of Main's existing template card, not a second graph. */
export const zHeroTemplateProduct = z.object({
  instanceId: zId,
  template: zAbilityTemplateCard,
}).strict();
export type HeroTemplateProduct = z.infer<typeof zHeroTemplateProduct>;
export const zHeroTemplateProducts = z.array(zHeroTemplateProduct).min(1).max(TEMPLATE_STACK_MAX_CARDS)
  .superRefine((products, context) => {
    const seen = new Set<string>();
    products.forEach((product, index) => {
      if (seen.has(product.instanceId)) context.addIssue({ code: z.ZodIssueCode.custom, path: [index, "instanceId"], message: "product instance ids must be unique" });
      seen.add(product.instanceId);
    });
  });

export const zHeroStatOverrides = zChampionStatOverrides
  .default({});
export type HeroStatOverrides = z.infer<typeof zHeroStatOverrides>;

const slotSchema = (slot: (typeof HERO_SLOTS)[number]) =>
  z
    .object({
      slot: z.literal(slot),
      name: z.string().min(1).max(80),
      purpose: z.string().min(1).max(4000),
      maxRank: z.number().int().min(1).max(6).refine((rank) => slot === "PASSIVE" || slot === "EX" || rank === defaultAbilityMaxRank(slot), "新技能 Q／W／E 為四級，R 為三級").optional(),
      abilityOverrides: z.record(z.unknown()).default({}).refine((value) =>
        !["id", "schema", "slot", "template", "name", "description", "castType", "targetsEnemies", "innateKind", "passive", "marks", "radius"].some((key) => key in value),
      "技能身分與名稱請在各自欄位編輯；施放方式、被動、標記和固定半徑由產品參數決定"),
      products: zHeroTemplateProducts,
      templateConflictPolicy: zTemplateConflictPolicy.default(DEFAULT_TEMPLATE_CONFLICT),
      tuning: z
        .object({
          cooldownSec: z.number().finite().min(0).max(600).describe("冷卻秒數"),
          manaCost: z.number().finite().min(0).max(10_000).describe("魔力消耗"),
          range: z.number().finite().min(0).max(100).describe("施放距離"),
        })
        .strict()
        .default({
          cooldownSec: slot === "PASSIVE" ? 0 : slot === "EX" ? 60 : 10,
          manaCost: slot === "PASSIVE" ? 0 : slot === "EX" ? 100 : 40,
          range: slot === "PASSIVE" ? 0 : 6,
        }),
      capabilityIds: z.array(zContractId).max(32),
      directionOptionIds: z.array(zContractId).max(8),
      fallbackOptionIds: z.array(zContractId).max(8),
    })
    .strict();

export const zHeroSlotPlans = z
  .object({
    PASSIVE: slotSchema("PASSIVE"),
    Q: slotSchema("Q"),
    W: slotSchema("W"),
    E: slotSchema("E"),
    R: slotSchema("R"),
    EX: slotSchema("EX"),
  })
  .strict();
export type HeroSlotPlans = z.infer<typeof zHeroSlotPlans>;

export const zHeroPlan = z
  .object({
    schema: z.literal(HERO_PLAN_SCHEMA),
    planId: zId,
    title: z.string().min(1).max(80),
    summary: z.string().min(1).max(4000),
    sourceLock: zHeroSourceLock,
    origin: z.enum(ORIGINS),
    archetype: z.enum(ARCHETYPES),
    attackType: z.enum(["melee", "ranged"]),
    budget: zHeroBudget,
    statOverrides: zHeroStatOverrides,
    generatorVersion: zHeroBuildSourceVersion.optional(),
    /** Exact source definitions, deduplicated by digest; params remain on each instance. */
    templateVersions: z.record(z.string().regex(/^sha256:[0-9a-f]{64}$/), zTemplateDoc)
      .superRefine((versions, context) => {
        if (Object.keys(versions).length > 192) context.addIssue({ code: z.ZodIssueCode.custom, message: "模板版本超過 192 份" });
        for (const [digest, template] of Object.entries(versions)) if (contentSha256(template) !== digest) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: [digest], message: "模板版本內容與雜湊不一致" });
        }
      }).optional(),
    slots: zHeroSlotPlans,
  })
  .strict();
export type HeroPlan = z.infer<typeof zHeroPlan>;
