import type { RuntimeCapabilityManifest } from "../editorCapabilities";
import { stableStringify } from "../hash";
import { sha256Hex } from "../sha256";
import { ARCHETYPES, ORIGINS } from "../statNormalization";
import { HERO_SLOT_SET, zHeroProposal, zProposalRequest, type HeroProposal, type ProposalRequest } from "./proposal";
import type { HeroProject } from "./schema";
import { zHeroTemplateProducts } from "./plan";

export type ProposalDiagnosticCode =
  | "invalid-request-schema"
  | "invalid-proposal-json"
  | "invalid-proposal-schema"
  | "request-digest-mismatch"
  | "section-mismatch"
  | "patch-outside-section"
  | "invalid-patch-value"
  | "template-not-allowlisted"
  | "capability-not-allowlisted"
  | "capability-unknown"
  | "capability-unsupported"
  | "direction-not-allowlisted"
  | "fallback-not-allowlisted"
  | "owner-immutable"
  | "proposal-outcome-mismatch"
  | "base-revision-mismatch";

export interface ProposalDiagnostic {
  code: ProposalDiagnosticCode;
  message: string;
  path?: readonly string[];
}

export type ProposalValidationResult =
  | { ok: true; request: ProposalRequest; proposal: HeroProposal }
  | { ok: false; diagnostics: readonly ProposalDiagnostic[] };

type CapabilityManifest = Pick<
  RuntimeCapabilityManifest,
  "effectKinds" | "hookEvents" | "simCapabilities" | "planned" | "unsupported" | "knownBroken"
>;

export interface ProposalValidationInput {
  request: unknown;
  proposal: unknown;
  currentRevision: number;
  capabilityManifest: CapabilityManifest;
  immutableOwnerPaths?: readonly (readonly string[])[];
}

export function proposalRequestDigest(request: ProposalRequest): string {
  return sha256Hex(stableStringify(request));
}

/** Remove Owner dialogue before a summary crosses either AI provider boundary. */
export function excludeOwnerQuotes(text: string): string {
  let output = "";
  const closers: string[] = [];
  for (const character of text) {
    if (character === "「" || character === "『") {
      if (closers.length === 0) output += "〔Owner 引用已排除〕";
      closers.push(character === "「" ? "」" : "』");
    } else if (closers.length > 0) {
      if (character === closers.at(-1)) closers.pop();
    } else {
      output += character;
    }
  }
  return output;
}

export function sanitizedSummaryFromProject(project: Pick<HeroProject, "brief" | "sourceLock">) {
  return {
    name: excludeOwnerQuotes(project.brief.name),
    concept: excludeOwnerQuotes(project.brief.concept),
    moveNames: Object.fromEntries(
      Object.entries(project.brief.moveNames).map(([slot, name]) => [slot, excludeOwnerQuotes(name)]),
    ),
    sourceLock: project.sourceLock,
  };
}

export function sanitizedPlanFromProject(project: Pick<HeroProject, "acceptedPlan">) {
  if (!project.acceptedPlan) return null;
  const plan = structuredClone(project.acceptedPlan);
  plan.title = excludeOwnerQuotes(plan.title);
  plan.summary = excludeOwnerQuotes(plan.summary);
  for (const slot of Object.values(plan.slots)) {
    slot.name = excludeOwnerQuotes(slot.name);
    slot.purpose = excludeOwnerQuotes(slot.purpose);
  }
  return plan;
}

function isPathPrefix(prefix: readonly string[], path: readonly string[]): boolean {
  return prefix.length <= path.length && prefix.every((segment, index) => segment === path[index]);
}

function slotPath(path: readonly string[], leaf: string): boolean {
  return path.length === 4 && path[0] === "acceptedPlan" && path[1] === "slots" && HERO_SLOT_SET.has(path[2]!) && path[3] === leaf;
}

function pathAllowed(section: ProposalRequest["sectionId"], path: readonly string[]): boolean {
  const key = path.join(".");
  if (section === "identity") return key === "brief.concept";
  if (section === "attributes") {
    return [
      "acceptedPlan.origin",
      "acceptedPlan.archetype",
      "acceptedPlan.attackType",
      "acceptedPlan.budget.power",
      "acceptedPlan.budget.complexity",
    ].includes(key);
  }
  if (section === "skills") return slotPath(path, "name") || slotPath(path, "purpose") || slotPath(path, "products");
  if (section === "mechanics") {
    return slotPath(path, "capabilityIds") || slotPath(path, "directionOptionIds") || slotPath(path, "fallbackOptionIds");
  }
  if (section === "presentation") return slotPath(path, "name") || slotPath(path, "purpose");
  return false;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function valueAllowed(path: readonly string[], value: unknown): boolean {
  const key = path.join(".");
  if (key === "brief.concept") return typeof value === "string" && value.length >= 1 && value.length <= 4000;
  if (key === "acceptedPlan.origin") return (ORIGINS as readonly unknown[]).includes(value);
  if (key === "acceptedPlan.archetype") return (ARCHETYPES as readonly unknown[]).includes(value);
  if (key === "acceptedPlan.attackType") return value === "melee" || value === "ranged";
  if (key.startsWith("acceptedPlan.budget.")) return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 100;
  if (slotPath(path, "name")) return typeof value === "string" && value.length >= 1 && value.length <= 80;
  if (slotPath(path, "purpose")) return typeof value === "string" && value.length >= 1 && value.length <= 4000;
  if (slotPath(path, "products")) return zHeroTemplateProducts.safeParse(value).success;
  return ["capabilityIds", "directionOptionIds", "fallbackOptionIds"].some((leaf) => slotPath(path, leaf)) && stringArray(value);
}

function capabilityState(id: string, manifest: CapabilityManifest): "supported" | "unsupported" | "unknown" {
  const planned = manifest.planned.find((entry) => entry.key === id);
  if (planned) return planned.state === "unsupported" ? "unsupported" : "supported";
  if (manifest.unsupported.includes(id)) return "unsupported";
  const sim = manifest.simCapabilities[id];
  if (sim) return sim.available ? "supported" : "unsupported";
  const effect = /^effect[.:]([^@]+)(?:@1)?$/.exec(id)?.[1];
  if (effect && manifest.effectKinds.includes(effect)) return "supported";
  const hook = /^hook[.:]([^@]+)(?:@1)?$/.exec(id)?.[1];
  if (hook && manifest.hookEvents.includes(hook)) return "supported";
  if (manifest.knownBroken.some((entry) => entry.token === id)) return "unsupported";
  return "unknown";
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

export function validateHeroProposal(input: ProposalValidationInput): ProposalValidationResult {
  const requestResult = zProposalRequest.safeParse(input.request);
  if (!requestResult.success) {
    return { ok: false, diagnostics: [{ code: "invalid-request-schema", message: requestResult.error.message }] };
  }
  const proposalResult = zHeroProposal.safeParse(input.proposal);
  if (!proposalResult.success) {
    return { ok: false, diagnostics: [{ code: "invalid-proposal-schema", message: proposalResult.error.message }] };
  }
  const request = requestResult.data;
  const proposal = proposalResult.data;
  const diagnostics: ProposalDiagnostic[] = [];

  if (proposal.requestDigest !== proposalRequestDigest(request)) diagnostics.push({ code: "request-digest-mismatch", message: "Proposal does not belong to this request." });
  if (proposal.sectionId !== request.sectionId) diagnostics.push({ code: "section-mismatch", message: "Proposal targets a different section." });
  const expectsPatches = proposal.outcome === "proposed" || proposal.outcome === "degraded";
  if ((expectsPatches && proposal.patches.length === 0) || (!expectsPatches && proposal.patches.length > 0)) {
    diagnostics.push({ code: "proposal-outcome-mismatch", message: "Proposal outcome and patch count disagree." });
  }

  const patchTemplates: string[] = [];
  const patchCapabilities: string[] = [];
  const patchDirections: string[] = [];
  const patchFallbacks: string[] = [];
  for (const patch of proposal.patches) {
    if (!pathAllowed(request.sectionId, patch.path) || !request.legalPatchPaths.some((path) => path.join(".") === patch.path.join("."))) diagnostics.push({ code: "patch-outside-section", message: "Patch path is not writable by this request.", path: patch.path });
    if (!valueAllowed(patch.path, patch.value)) diagnostics.push({ code: "invalid-patch-value", message: "Patch value does not match its field contract.", path: patch.path });
    if (slotPath(patch.path, "products")) {
      const products = zHeroTemplateProducts.safeParse(patch.value);
      if (products.success) patchTemplates.push(...products.data.map((product) => product.template.ref));
    }
    if (!stringArray(patch.value)) continue;
    if (slotPath(patch.path, "capabilityIds")) patchCapabilities.push(...patch.value);
    if (slotPath(patch.path, "directionOptionIds")) patchDirections.push(...patch.value);
    if (slotPath(patch.path, "fallbackOptionIds")) patchFallbacks.push(...patch.value);
  }

  const templateIds = unique([...proposal.referencedTemplateIds, ...patchTemplates]);
  const capabilityIds = unique([...proposal.referencedCapabilityIds, ...patchCapabilities]);
  const directionIds = unique([...proposal.selectedDirectionOptionIds, ...patchDirections]);
  const fallbackIds = unique([...proposal.selectedFallbackOptionIds, ...patchFallbacks]);
  for (const id of templateIds) if (!request.legalTemplateIds.includes(id)) diagnostics.push({ code: "template-not-allowlisted", message: `Template is not allowlisted: ${id}` });
  for (const id of capabilityIds) {
    if (!request.legalCapabilityIds.includes(id)) diagnostics.push({ code: "capability-not-allowlisted", message: `Capability is not allowlisted: ${id}` });
    const state = capabilityState(id, input.capabilityManifest);
    if (state === "unknown") diagnostics.push({ code: "capability-unknown", message: `Capability is unknown to the live target: ${id}` });
    if (state === "unsupported") diagnostics.push({ code: "capability-unsupported", message: `Capability is unavailable on the live target: ${id}` });
  }
  for (const id of directionIds) if (!request.legalDirectionOptions.some((option) => option.id === id)) diagnostics.push({ code: "direction-not-allowlisted", message: `Direction is not allowlisted: ${id}` });
  for (const id of fallbackIds) if (!request.legalFallbackOptions.some((option) => option.id === id)) diagnostics.push({ code: "fallback-not-allowlisted", message: `Fallback is not allowlisted: ${id}` });

  for (const patch of proposal.patches) {
    if ((input.immutableOwnerPaths ?? []).some((path) => isPathPrefix(path, patch.path) || isPathPrefix(patch.path, path))) {
      diagnostics.push({ code: "owner-immutable", message: "Patch would change protected Owner text.", path: patch.path });
    }
  }
  if (proposal.baseRevision !== request.projectRevision || proposal.baseRevision !== input.currentRevision) diagnostics.push({ code: "base-revision-mismatch", message: "Proposal was produced for a stale project revision." });

  return diagnostics.length > 0 ? { ok: false, diagnostics } : { ok: true, request, proposal };
}

export function decodeHeroProposalJson(json: string): { ok: true; value: unknown } | { ok: false; diagnostic: ProposalDiagnostic } {
  try {
    return { ok: true, value: JSON.parse(json) as unknown };
  } catch {
    return { ok: false, diagnostic: { code: "invalid-proposal-json", message: "Provider output is not valid JSON." } };
  }
}
