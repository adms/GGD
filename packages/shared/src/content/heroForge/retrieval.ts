import type { RuntimeCapabilityManifest } from "../editorCapabilities";
import type { TemplateDoc } from "../schema/template";
import { HERO_PROPOSAL_REQUEST_SCHEMA, HERO_PROPOSAL_SCHEMA, HERO_SLOTS, type HeroSectionId, type HeroSlot } from "./constants";
import type { HeroProject } from "./schema";
import { zProposalRequest, type ProposalRequest } from "./proposal";
import { sanitizedPlanFromProject, sanitizedSummaryFromProject } from "./validation";

type ProposalTask = ProposalRequest["task"];

export interface ProposalRequestInput {
  readonly task: ProposalTask;
  readonly sectionId: HeroSectionId;
  readonly targetSlot?: HeroSlot | null;
  readonly project: HeroProject;
  readonly templates: readonly TemplateDoc[];
  readonly capabilityManifest: RuntimeCapabilityManifest;
  readonly diagnosticCodes?: readonly string[];
}

function capabilityAvailable(id: string, manifest: RuntimeCapabilityManifest): boolean {
  if (manifest.unsupported.includes(id) || manifest.knownBroken.some((entry) => entry.token === id)) return false;
  const planned = manifest.planned.find((entry) => entry.key === id);
  if (planned) return planned.state !== "unsupported";
  if (manifest.simCapabilities[id]) return manifest.simCapabilities[id]!.available;
  if (id.startsWith("effect:")) return manifest.effectKinds.includes(id.slice("effect:".length).replace(/@1$/, ""));
  if (id.startsWith("hook:")) return manifest.hookEvents.includes(id.slice("hook:".length).replace(/@1$/, ""));
  return false;
}

function patchPaths(sectionId: HeroSectionId, task: ProposalTask, targetSlot: HeroSlot | null, project: HeroProject): string[][] {
  let candidates: string[][] = sectionId === "identity"
    ? [["brief", "concept"]]
    : sectionId === "attributes"
      ? [
          ["acceptedPlan", "origin"], ["acceptedPlan", "archetype"], ["acceptedPlan", "attackType"],
          ["acceptedPlan", "budget", "power"], ["acceptedPlan", "budget", "complexity"],
        ]
      : sectionId === "skills"
        ? HERO_SLOTS.flatMap((slot) => ["name", "purpose", "products"].map((leaf) => ["acceptedPlan", "slots", slot, leaf]))
        : sectionId === "mechanics"
          ? HERO_SLOTS.flatMap((slot) => ["capabilityIds", "directionOptionIds", "fallbackOptionIds"].map((leaf) => ["acceptedPlan", "slots", slot, leaf]))
          : sectionId === "presentation"
            ? HERO_SLOTS.flatMap((slot) => ["name", "purpose"].map((leaf) => ["acceptedPlan", "slots", slot, leaf]))
            : [];
  if (task === "simplify-complexity") candidates = [["acceptedPlan", "budget", "complexity"]];
  if (task === "fill-slot" && targetSlot) candidates = candidates.filter((path) => path[2] === targetSlot);
  return candidates.filter((path) => project.sections[sectionId].fieldOwnership[path.join(".")] !== "locked");
}

/**
 * Deterministic retrieval is the authority over the candidate set. AI sees at
 * most eight enabled, currently supported templates and cannot name a ninth.
 */
export function buildProposalRequest(input: ProposalRequestInput): ProposalRequest {
  const selected = new Set(HERO_SLOTS.flatMap((slot) => input.project.acceptedPlan?.slots[slot].products.map((product) => product.template.ref) ?? []));
  const eligible = input.templates
    .filter((template) => template.status === "enabled" && template.requires.every((id) => capabilityAvailable(id, input.capabilityManifest)))
    .sort((a, b) => {
      const selectedDelta = Number(selected.has(b.id)) - Number(selected.has(a.id));
      return selectedDelta || b.gapScore - a.gapScore || a.id.localeCompare(b.id);
    })
    .slice(0, 8);
  if (eligible.length < 3) throw new Error("目前 target 找不到至少 3 個可驗證模板，AI 候選已安全關閉。");
  const legalCapabilityIds = [...new Set([
    ...eligible.flatMap((template) => template.requires),
    ...HERO_SLOTS.flatMap((slot) => input.project.acceptedPlan?.slots[slot].capabilityIds ?? []),
  ])].filter((id) => capabilityAvailable(id, input.capabilityManifest)).sort();

  return zProposalRequest.parse({
    schema: HERO_PROPOSAL_REQUEST_SCHEMA,
    task: input.task,
    projectRevision: input.project.revision,
    sectionId: input.sectionId,
    targetSlot: input.targetSlot ?? null,
    sanitizedHeroSummary: sanitizedSummaryFromProject(input.project),
    currentPlan: sanitizedPlanFromProject(input.project),
    diagnosticCodes: [...new Set(input.diagnosticCodes ?? [])].sort().slice(0, 64),
    legalTemplateIds: eligible.map((template) => template.id),
    templateOptions: eligible.map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      requires: template.requires,
    })),
    legalPatchPaths: patchPaths(input.sectionId, input.task, input.targetSlot ?? null, input.project),
    legalCapabilityIds,
    // Direction and fallback IDs remain empty until E6 binds each option to a
    // concrete generator path. A raw capability name is not proof of direction.
    legalDirectionOptions: [],
    legalFallbackOptions: [],
    outputSchema: HERO_PROPOSAL_SCHEMA,
  });
}
