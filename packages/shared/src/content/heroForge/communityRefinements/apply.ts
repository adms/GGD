import { z } from "zod";
import { HERO_SLOTS } from "../constants";
import { zHeroTemplateProducts } from "../plan";
import { zHeroProject, type HeroProject } from "../schema";
import { pinHeroPlanTemplates } from "../templateVersions";
import type { TemplateDoc } from "../../schema/template";

const zSlotRefinement = z.object({
  products: zHeroTemplateProducts,
  purpose: z.string().min(1).max(4000),
  note: z.string().min(1).max(8000),
  removeOverrides: z.array(z.string()).default([]),
  abilityOverrides: z.record(z.unknown()).default({}),
  visualTargets: z.object({ castEffect: z.enum(["target", "self"]) }).optional(),
}).strict();

export const zCommunityDesignRefinement = z.object({
  schema: z.literal("ggd-community-design-refinement@1"),
  version: z.number().int().positive(),
  projectId: z.string(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  slots: z.object(Object.fromEntries(HERO_SLOTS.map(slot => [slot, zSlotRefinement.optional()])) as
    Record<typeof HERO_SLOTS[number], z.ZodOptional<typeof zSlotRefinement>>).strict(),
}).strict();

/** Apply reviewed authoring data to a new project revision, never to a shared template. */
export function applyCommunityDesignRefinement(input: HeroProject, raw: unknown, templates: readonly TemplateDoc[]): HeroProject {
  const patch = zCommunityDesignRefinement.parse(raw);
  const project = zHeroProject.parse(input);
  if (!project.acceptedPlan || project.projectId !== patch.projectId || project.sourceDesign?.sourceSha256 !== patch.sourceSha256) {
    throw new Error("REFINEMENT_SOURCE_MISMATCH: 微調必須對應同一英雄與完整原稿版本");
  }
  if (!Object.values(patch.slots).some(Boolean)) throw new Error("EMPTY_REFINEMENT");
  for (const slot of HERO_SLOTS) {
    const change = patch.slots[slot];
    if (!change) continue;
    const authored = project.acceptedPlan.slots[slot];
    authored.products = structuredClone(change.products);
    authored.templateConflictPolicy = "reject";
    for (const field of change.removeOverrides) delete authored.abilityOverrides[field];
    Object.assign(authored.abilityOverrides, structuredClone(change.abilityOverrides));
    authored.purpose = change.purpose;
    project.refinementNotes = { ...project.refinementNotes, [slot]: change.note };
    if (change.visualTargets) {
      const script = project.presentation.slots[slot].script;
      if (!script) throw new Error(`REFINEMENT_SCRIPT_MISSING:${slot}`);
      for (const segment of script.segments) {
        if (segment.kind === "vfx" && segment.on === "castEffect") segment.at = change.visualTargets.castEffect;
      }
    }
  }
  project.acceptedPlan = pinHeroPlanTemplates(project.acceptedPlan, templates);
  project.revision++;
  project.receipts = [];
  for (const section of ["skills", "mechanics", "presentation", "validation", "package"] as const) {
    project.sections[section] = { ...project.sections[section], revision: project.revision, state: "stale" };
    project.validationState[section] = { revision: project.revision, status: "stale", diagnosticCodes: [] };
  }
  return zHeroProject.parse(project);
}
