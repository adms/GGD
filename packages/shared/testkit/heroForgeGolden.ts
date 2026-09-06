import type { RuntimeCapabilityManifest } from "../src/content/editorCapabilities";
import {
  HERO_PROPOSAL_REQUEST_SCHEMA,
  HERO_PROPOSAL_SCHEMA,
  proposalRequestDigest,
  type HeroProposal,
  type ProposalRequest,
} from "../src/content/heroForge/index";

export const HERO_FORGE_TEST_MANIFEST: Pick<
  RuntimeCapabilityManifest,
  "effectKinds" | "hookEvents" | "simCapabilities" | "planned" | "unsupported" | "knownBroken"
> = {
  effectKinds: ["dash", "teleport"],
  hookEvents: [],
  simCapabilities: {},
  planned: [],
  unsupported: [],
  knownBroken: [],
};

export function goldenProposalRequest(sectionId: ProposalRequest["sectionId"] = "mechanics"): ProposalRequest {
  return {
    schema: HERO_PROPOSAL_REQUEST_SCHEMA,
    task: sectionId === "identity" ? "rewrite-copy" : "fill-slot",
    projectRevision: 7,
    sectionId,
    targetSlot: sectionId === "identity" ? null : "E",
    sanitizedHeroSummary: {
      name: "守望者",
      concept: "救援隊友並守住成員。",
      moveNames: { E: "援護位移" },
      sourceLock: { canonicalId: "watcher", versionId: "anime-2011" },
    },
    currentPlan: null,
    diagnosticCodes: [],
    legalTemplateIds: ["tpl-single-strike", "tpl-buff-self", "tpl-leap-strike"],
    templateOptions: ["tpl-single-strike", "tpl-buff-self", "tpl-leap-strike"].map((id) => ({ id, name: id, description: id, requires: [] })),
    legalPatchPaths: sectionId === "identity"
      ? [["brief", "concept"]]
      : [["acceptedPlan", "slots", "E", "capabilityIds"], ["acceptedPlan", "slots", "E", "directionOptionIds"]],
    legalCapabilityIds: ["effect:dash", "effect:teleport"],
    legalDirectionOptions: [
      { id: "move.ally.to-self", subject: "ally", destination: "self", capabilityId: "effect:dash" },
    ],
    legalFallbackOptions: [
      {
        id: "fallback.dash-to-teleport",
        requestedCapabilityId: "effect:dash",
        fallbackCapabilityId: "effect:teleport",
        disclosure: "只保留終點，不保留移動途中互動。",
      },
    ],
    outputSchema: HERO_PROPOSAL_SCHEMA,
  };
}

export function goldenHeroProposal(request: ProposalRequest = goldenProposalRequest()): HeroProposal {
  const identity = request.sectionId === "identity";
  return {
    schema: HERO_PROPOSAL_SCHEMA,
    requestDigest: proposalRequestDigest(request),
    baseRevision: request.projectRevision,
    sectionId: request.sectionId,
    outcome: "proposed",
    patches: identity
      ? [{ op: "replace", path: ["brief", "concept"], value: "以援護與陣形交換保護隊友。" }]
      : [
          { op: "replace", path: ["acceptedPlan", "slots", "E", "capabilityIds"], value: ["effect:dash"] },
          { op: "replace", path: ["acceptedPlan", "slots", "E", "directionOptionIds"], value: ["move.ally.to-self"] },
        ],
    referencedTemplateIds: [],
    referencedCapabilityIds: identity ? [] : ["effect:dash"],
    selectedDirectionOptionIds: identity ? [] : ["move.ally.to-self"],
    selectedFallbackOptionIds: [],
    assumptions: [],
    explanation: "只使用請求內已核准的方向與 capability。",
    providerReceipt: {
      kind: "local",
      modelId: "qwen3-14b-q4-k-m",
      modelDigest: "a".repeat(64),
      runtimeDigest: "b".repeat(64),
      promptDigest: "c".repeat(64),
      grammarDigest: "d".repeat(64),
    },
  };
}
