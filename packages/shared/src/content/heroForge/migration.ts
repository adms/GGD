import { z } from "zod";
import { HERO_PLAN_SCHEMA, HERO_PROJECT_SCHEMA, HERO_SLOTS } from "./constants";
import { zHeroPlan, type HeroPlan } from "./plan";
import { zAiMode, zHeroProject, type HeroProject } from "./schema";

const zPrivateReceipt = z.object({
  projectRevision: z.number().int().nonnegative(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  providerKind: z.enum(["local", "byok"]).optional(),
  modelId: z.string().min(1).max(256).optional(),
  providerOrigin: z.string().url().max(2048).optional(),
  protocol: z.enum(["responses", "chat-completions"]).optional(),
  requestId: z.string().min(1).max(256).optional(),
}).strict();

/** Local sidecar only. Never include this in an exported project or submission. */
export const zHeroPrivateData = z.object({
  providerPreference: zAiMode.default("off"),
  receipts: z.array(zPrivateReceipt).max(512).default([]),
}).strict();
export type HeroPrivateData = z.infer<typeof zHeroPrivateData>;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("HERO_MIGRATION_EXPECTED_OBJECT");
  return value as Record<string, unknown>;
}

export function migrateHeroPlan(input: unknown): HeroPlan {
  const plan = structuredClone(record(input));
  if (plan.schema === HERO_PLAN_SCHEMA) return zHeroPlan.parse(plan);
  if (plan.schema !== "ggd-hero-plan@1") throw new Error("HERO_PLAN_VERSION_UNSUPPORTED");
  const slots = record(plan.slots);
  for (const slot of HERO_SLOTS) {
    const previous = record(slots[slot]);
    const ids = z.array(z.string()).min(1).max(8).parse(previous.templateIds);
    const params = record(previous.templateParamsById ?? {});
    if (new Set(ids).size !== ids.length || Object.keys(params).some((id) => !ids.includes(id))) {
      throw new Error(`HERO_LEGACY_TEMPLATE_AMBIGUOUS:${slot}`);
    }
    const { templateIds: _ids, templateParamsById: _params, ...rest } = previous;
    slots[slot] = { ...rest, products: ids.map((ref, index) => ({
      instanceId: `${slot.toLowerCase()}-${index + 1}`, template: { ref, params: params[ref] ?? {} },
    })) };
  }
  return zHeroPlan.parse({ ...plan, schema: HERO_PLAN_SCHEMA, slots });
}

/** Read-only migration: the caller keeps the original bytes until durable save succeeds. */
export function migrateHeroProject(input: unknown): { project: HeroProject; privateData: HeroPrivateData; migrated: boolean } {
  const previous = structuredClone(record(input));
  if (previous.schema === HERO_PROJECT_SCHEMA) {
    return { project: zHeroProject.parse(previous), privateData: zHeroPrivateData.parse({}), migrated: false };
  }
  if (previous.schema !== "ggd-hero-project@1") throw new Error("HERO_PROJECT_VERSION_UNSUPPORTED");
  const { providerPreference, ...portable } = previous;
  const privateReceipts: z.infer<typeof zPrivateReceipt>[] = [];
  const receipts = z.array(z.unknown()).max(512).parse(portable.receipts).map((value) => {
    const receipt = record(value);
    const { providerKind, modelId, providerOrigin, protocol, requestId, ...accepted } = receipt;
    if ([providerKind, modelId, providerOrigin, protocol, requestId].some((entry) => entry !== undefined)) {
      privateReceipts.push(zPrivateReceipt.parse({
        projectRevision: receipt.projectRevision, digest: receipt.digest,
        providerKind, modelId, providerOrigin, protocol, requestId,
      }));
    }
    return accepted;
  });
  const sections = record(portable.sections);
  for (const section of Object.values(sections)) {
    const owners = record(record(section).fieldOwnership);
    const migrated: Record<string, unknown> = {};
    for (const [path, owner] of Object.entries(owners)) {
      // A legacy lock on the template list or its ID-keyed params protects the
      // complete product chain; migration must never weaken an accepted lock.
      const nextPath = path.replace(/^(acceptedPlan\.slots\.[A-Z]+)\.(templateIds|templateParamsById)(\..*)?$/, "$1.products");
      if (migrated[nextPath] !== "locked" && (owner === "locked" || migrated[nextPath] !== "manual")) migrated[nextPath] = owner;
    }
    record(section).fieldOwnership = migrated;
  }
  return {
    project: zHeroProject.parse({ ...portable, schema: HERO_PROJECT_SCHEMA, sections,
      acceptedPlan: portable.acceptedPlan === null ? null : migrateHeroPlan(portable.acceptedPlan), receipts }),
    privateData: zHeroPrivateData.parse({ providerPreference, receipts: privateReceipts }),
    migrated: true,
  };
}

/** A strict allowlist at every portable boundary; unknown metadata is rejected. */
export function serializeHeroProject(project: HeroProject): string {
  return JSON.stringify(zHeroProject.parse(project));
}
