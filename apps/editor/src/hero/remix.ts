import { HERO_SECTION_IDS, HERO_SLOTS } from "@ggd/shared/content/heroForge/constants";
import { zHeroProject, type HeroProject } from "@ggd/shared/content/heroForge/schema";
import type { HeroSnapshot } from "@ggd/shared/content/communityHero";
import type { HeroDraftPayload } from "./store";

/** Copy authoring verbatim; only identity and validation receipts become new. */
export function copyHeroProjectDraft(source: HeroProject, projectId: string): HeroProject {
  if (projectId === source.projectId) throw new Error("改作必須建立新的作品身分。");
  const project = structuredClone(source);
  project.projectId = projectId; project.revision = 0; project.receipts = [];
  const ownAbilities = new Map(HERO_SLOTS.map((slot) => [`${source.projectId}.${slot.toLowerCase()}`, `${projectId}.${slot.toLowerCase()}`]));
  // Main's cross-skill bindings use abilityId; text values never participate.
  const rebind = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(rebind); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) {
      if (key === "abilityId" && typeof entry === "string" && ownAbilities.has(entry)) (value as Record<string, unknown>)[key] = ownAbilities.get(entry);
      else rebind(entry);
    }
  };
  for (const slot of HERO_SLOTS) {
    if (project.acceptedPlan) {
      rebind(project.acceptedPlan.slots[slot].abilityOverrides);
      rebind(project.acceptedPlan.slots[slot].products);
    }
    const script = project.presentation.slots[slot].script;
    if (script) { script.id = `${projectId}.${slot.toLowerCase()}`; script.abilityId = script.id; rebind(script); }
  }
  for (const section of HERO_SECTION_IDS) {
    project.sections[section] = { ...project.sections[section], revision: 0, state: "draft" };
    project.validationState[section] = { revision: 0, status: "idle", diagnosticCodes: [] };
  }
  return project;
}

export function remixHeroProject(source: HeroProject, projectId: string): HeroProject {
  return zHeroProject.parse(copyHeroProjectDraft(source, projectId));
}

export function remixHeroDraft(snapshot: HeroSnapshot, projectId: string): HeroDraftPayload {
  if (!snapshot.allowAttributionRemix) throw new Error("原作者未授權署名改作。");
  return { project: remixHeroProject(snapshot.inspection.project, projectId), rawInputs: {}, mode: "quick", origin: snapshot.inspection.project.acceptedPlan?.origin ?? "鬥士", source: { workId: snapshot.workId, submissionId: snapshot.id, packageDigest: snapshot.version.packageDigest, authorId: snapshot.accountId } };
}
