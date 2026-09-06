import {
  HERO_PROJECT_SCHEMA, HERO_SECTION_IDS, defaultHeroPresentation, staleSectionsFrom,
  ORIGIN_ATTACK_TYPE, archetypeForOrigin, sha256Hex, stableStringify,
  type FieldOwner, type HeroPlan, type HeroProject, type HeroSectionId,
} from "@ggd/shared/content";
import { getIn, setIn } from "../store";
import { hasLegacyStatOverrides } from "@ggd/shared/content/schema/championStats";

/** Draft construction deliberately permits incomplete text; publishing validates. */
export function createHeroProject(projectId: string): HeroProject {
  return {
    schema: HERO_PROJECT_SCHEMA, projectId, revision: 0,
    sourceLock: { canonicalId: null, versionId: null },
    brief: { name: "", concept: "", moveNames: {} }, acceptedPlan: null,
    presentation: defaultHeroPresentation(), receipts: [],
    sections: Object.fromEntries(HERO_SECTION_IDS.map((id) => [id, { revision: 0, state: "empty", fieldOwnership: {} }])) as HeroProject["sections"],
    validationState: Object.fromEntries(HERO_SECTION_IDS.map((id) => [id, { revision: 0, status: "idle", diagnosticCodes: [] as string[] }])) as HeroProject["validationState"],
  };
}

export function fieldOwner(project: HeroProject, section: HeroSectionId, path: string): FieldOwner {
  const owners = project.sections[section].fieldOwnership;
  const ancestors = Object.entries(owners).filter(([key]) => path === key || path.startsWith(`${key}.`));
  if (ancestors.some(([, owner]) => owner === "locked")) return "locked";
  return ancestors.sort(([a], [b]) => b.length - a.length)[0]?.[1] ?? "auto";
}

function revise(project: HeroProject, section: HeroSectionId): HeroProject {
  const revision = project.revision + 1;
  const sections = structuredClone(project.sections);
  const validationState = structuredClone(project.validationState);
  sections[section] = { ...sections[section], revision, state: "draft" };
  validationState[section] = { revision, status: "idle", diagnosticCodes: [] };
  for (const dependent of staleSectionsFrom(section)) {
    sections[dependent].state = "stale";
    validationState[dependent].status = "stale";
  }
  return { ...project, revision, sections, validationState };
}

export function editHeroProject(project: HeroProject, section: HeroSectionId, path: string, value: unknown, actor: "manual" | "auto" = "manual"): HeroProject {
  if (path === "sourceLock" || path.startsWith("sourceLock.") || path === "sourceDesign" || path.startsWith("sourceDesign.")) return project;
  const owner = fieldOwner(project, section, path);
  if (owner === "locked" || (actor === "auto" && owner !== "auto")) return project;
  let next = setIn(project, path, value) as HeroProject;
  // Parent replacement must preserve protected descendants, including unset
  // values. Numeric paths retain arrays through the shared immutable setter.
  for (const [child, childOwner] of Object.values(project.sections).flatMap((entry) => Object.entries(entry.fieldOwnership))) {
    if (!child.startsWith(`${path}.`) || (childOwner !== "locked" && !(actor === "auto" && childOwner === "manual"))) continue;
    next = setIn(next, child, getIn(project, child)) as HeroProject;
  }
  if (actor === "manual") next = setIn(next, `sections.${section}.fieldOwnership`, { ...next.sections[section].fieldOwnership, [path]: "manual" }) as HeroProject;
  const provenance = next.presentation.modelProvenance;
  if (provenance && (next.presentation.modelKey !== project.presentation.modelKey || next.presentation.uploadedModel?.sha256 !== provenance.modelSha256)) {
    next = { ...next, presentation: { ...next.presentation } };
    delete next.presentation.modelProvenance;
  }
  return revise(next, section);
}

export function setHeroFieldOwner(project: HeroProject, section: HeroSectionId, path: string, owner: FieldOwner): HeroProject {
  const next = structuredClone(project);
  next.sections[section].fieldOwnership[path] = owner;
  return revise(next, section);
}

export function acceptHeroPlan(project: HeroProject, candidate: HeroPlan): HeroProject {
  if (stableStringify(candidate.sourceLock) !== stableStringify(project.sourceLock)) throw new Error("方案身分與專案鎖定不一致。");
  let plan = structuredClone(candidate);
  // A protected parameter belongs to its existing instance and template. A
  // different candidate must not transplant that value onto a different kind.
  if (project.acceptedPlan) for (const slot of Object.keys(plan.slots) as Array<keyof HeroPlan["slots"]>) {
    const prefix = `acceptedPlan.slots.${slot}.products`;
    if (Object.values(project.sections).some((section) => Object.entries(section.fieldOwnership).some(([path, owner]) => owner !== "auto" && (path === prefix || path.startsWith(`${prefix}.`))))) {
      plan.slots[slot].products = structuredClone(project.acceptedPlan.slots[slot].products);
    }
  }
  for (const section of Object.values(project.sections)) for (const [path, owner] of Object.entries(section.fieldOwnership)) {
    if (owner === "auto" || !path.startsWith("acceptedPlan.") || !project.acceptedPlan) continue;
    plan = setIn(plan, path.slice("acceptedPlan.".length), getIn(project, path)) as HeroPlan;
  }
  return revise({ ...project, acceptedPlan: plan, receipts: [...project.receipts, {
    kind: "plan-generated", projectRevision: project.revision + 1, digest: sha256Hex(stableStringify(plan)),
  }] }, "skills");
}

export function changeHeroOrigin(project: HeroProject, origin: HeroPlan["origin"]): HeroProject {
  if (!project.acceptedPlan) return project;
  let next = editHeroProject(project, "attributes", "acceptedPlan.origin", origin);
  if (next === project) return project;
  next = editHeroProject(next, "attributes", "acceptedPlan.archetype", archetypeForOrigin(origin), "auto");
  const attackType = ORIGIN_ATTACK_TYPE[origin];
  if (attackType) next = editHeroProject(next, "attributes", "acceptedPlan.attackType", attackType, "auto");
  return next;
}

/** Only called after saving a separate copy containing every old value/lock. */
export function replaceLegacyStatOverrides(project: HeroProject): HeroProject {
  if (!project.acceptedPlan || !hasLegacyStatOverrides(project.acceptedPlan.statOverrides)) return project;
  const next = structuredClone(project);
  next.acceptedPlan!.statOverrides = {};
  const prefix = "acceptedPlan.statOverrides";
  for (const section of Object.values(next.sections)) section.fieldOwnership = Object.fromEntries(
    Object.entries(section.fieldOwnership).filter(([path]) => path !== prefix && !path.startsWith(prefix + ".")),
  );
  next.sections.attributes.fieldOwnership[prefix] = "manual";
  return revise(next, "attributes");
}

/** Move by instance identity and remap ownership, so locks follow their product. */
export function moveHeroProduct(project: HeroProject, slot: keyof HeroPlan["slots"], from: number, to: number): HeroProject {
  if (!project.acceptedPlan) return project;
  const path = `acceptedPlan.slots.${slot}.products`;
  if (fieldOwner(project, "skills", path) === "locked") return project;
  const previous = project.acceptedPlan.slots[slot].products;
  if (!previous[from] || to < 0 || to >= previous.length) return project;
  const products = [...previous]; products.splice(to, 0, products.splice(from, 1)[0]!);
  return replaceHeroProducts(project, slot, products);
}

/** Every structural edit remaps ownership using stable product identities. */
export function replaceHeroProducts(project: HeroProject, slot: keyof HeroPlan["slots"], products: HeroPlan["slots"]["Q"]["products"]): HeroProject {
  if (!project.acceptedPlan || products.length < 1) return project;
  const path = `acceptedPlan.slots.${slot}.products`;
  if (fieldOwner(project, "skills", path) === "locked") return project;
  const previous = project.acceptedPlan.slots[slot].products;
  for (const [index, product] of previous.entries()) {
    const prefix = `${path}.${index}`;
    if (!products.some((entry) => entry.instanceId === product.instanceId) && Object.entries(project.sections.skills.fieldOwnership).some(([key, owner]) => owner === "locked" && (key === prefix || key.startsWith(`${prefix}.`)))) return project;
  }
  const next = setIn(project, path, products) as HeroProject;
  const fieldOwnership: Record<string, FieldOwner> = {};
  for (const [key, owner] of Object.entries(project.sections.skills.fieldOwnership)) {
    const suffix = key.startsWith(`${path}.`) ? key.slice(path.length + 1) : "";
    const [index, ...tail] = suffix.split(".");
    const product = index && /^\d+$/.test(index) ? previous[Number(index)] : undefined;
    const nextIndex = product ? products.findIndex((entry) => entry.instanceId === product.instanceId) : -1;
    if (product && nextIndex < 0) continue;
    const remapped = product ? `${path}.${nextIndex}${tail.length ? `.${tail.join(".")}` : ""}` : key;
    fieldOwnership[remapped] = owner;
  }
  fieldOwnership[path] = "manual";
  next.sections = { ...next.sections, skills: { ...next.sections.skills, fieldOwnership } };
  return revise(next, "skills");
}
