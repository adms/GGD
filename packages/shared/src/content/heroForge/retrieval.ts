import type { RuntimeCapabilityManifest } from "../editorCapabilities";
import type { TemplateDoc } from "../schema/template";
import { capabilityAvailable } from "./adoptionContract";
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

// ⛔ 這裡在 GH#1159 之前有一份**私有**的 `capabilityAvailable()`，而
// `validation.ts` 有另一份私有的 `capabilityState()` —— 同一個問題兩個答案，
// 在三種 id 上不一致（見 `adoptionContract.ts` 檔頭那張表）。⭐ 兩邊現在共用
// 同一個判定，所以「retrieval 把它濾掉」與「validation 把它擋下」不可能再
// 互相矛盾。
//
// ⚠️ 這一行的濾除本身仍然是**安靜**的（回傳型別是出貨契約，⛔ 不能為了報錯
// 多一格欄位）。⇒ 讓它不再靜默的是出貨側的閘：`adoptionContract.test.ts`
// 逐格走過每一份社群配方，宣告了而目標做不到的能力當場紅。

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
