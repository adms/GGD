import { describe, expect, it } from "vitest";
import { HERO_FORGE_TEST_MANIFEST, goldenHeroProposal, goldenProposalRequest } from "../../../testkit/heroForgeGolden";
import { createDeterministicHeroPlans } from "./planner";
import { generateHeroDraft } from "./generator";
import { excludeOwnerQuotes, sanitizedSummaryFromProject, validateHeroProposal } from "./validation";

const codes = (result: ReturnType<typeof validateHeroProposal>) =>
  result.ok ? [] : result.diagnostics.map((entry) => entry.code);

describe("hero forge contracts", () => {
  it("builds three deterministic six-slot drafts without AI", () => {
    const plans = createDeterministicHeroPlans({
      projectId: "watcher",
      brief: { name: "守望者", concept: "用位移保護隊友", moveNames: { E: "援護位移" } },
      sourceLock: { canonicalId: "watcher", versionId: "anime-2011" },
      origin: "鬥士",
      availableTemplateIds: ["tpl-on-attack", "tpl-single-strike", "tpl-buff-self", "tpl-leap-strike", "tpl-ground-nova", "tpl-instant-blast"],
    });
    expect(plans).toHaveLength(3);
    expect(Object.keys(plans[0]!.slots)).toEqual(["PASSIVE", "Q", "W", "E", "R", "EX"]);
    const generated = generateHeroDraft(plans[0]!, { heroId: "watcher", heroName: "守望者" });
    expect(generated.champion.passiveAbility).toBe("watcher.passive");
    expect(generated.champion.exAbility).toBe("watcher.ex");
    expect(Object.keys(generated.abilityDrafts)).toHaveLength(6);
  });

  it("removes quoted Owner text from provider summaries", () => {
    expect(excludeOwnerQuotes("留下這句「台詞不是機制\n別解析」繼續")).toBe("留下這句〔Owner 引用已排除〕繼續");
    const summary = sanitizedSummaryFromProject({
      brief: { name: "守望者", concept: "救人「不要拉敵人」", moveNames: { E: "『回來吧』" } },
      sourceLock: { canonicalId: "watcher", versionId: "anime-2011" },
    });
    expect(JSON.stringify(summary)).not.toContain("不要拉敵人");
    expect(JSON.stringify(summary)).not.toContain("回來吧");
  });

  it("accepts a proposal only through the complete deterministic gate", () => {
    const request = goldenProposalRequest();
    expect(validateHeroProposal({ request, proposal: goldenHeroProposal(request), currentRevision: 7, capabilityManifest: HERO_FORGE_TEST_MANIFEST })).toMatchObject({ ok: true });
  });

  it.each([
    ["unknown field", (p: any) => { p.extra = true; }, "invalid-proposal-schema"],
    ["new slot", (p: any) => { p.patches[0].path[2] = "Z"; }, "patch-outside-section"],
    ["fake template", (p: any) => { p.referencedTemplateIds = ["tpl-invented"]; }, "template-not-allowlisted"],
    ["fake capability", (p: any) => { p.referencedCapabilityIds = ["effect:timewarp"]; }, "capability-not-allowlisted"],
    ["reversed movement", (p: any) => { p.selectedDirectionOptionIds = ["move.self.to-ally"]; }, "direction-not-allowlisted"],
    ["unapproved fallback", (p: any) => { p.selectedFallbackOptionIds = ["fallback.silent-downgrade"]; }, "fallback-not-allowlisted"],
    ["stale revision", (p: any) => { p.baseRevision = 6; }, "base-revision-mismatch"],
  ])("fails closed for %s", (_name, mutate, expected) => {
    const request = goldenProposalRequest();
    const proposal: any = structuredClone(goldenHeroProposal(request));
    mutate(proposal);
    expect(codes(validateHeroProposal({ request, proposal, currentRevision: 7, capabilityManifest: HERO_FORGE_TEST_MANIFEST }))).toContain(expected);
  });

  it("never patches protected Owner text", () => {
    const request = goldenProposalRequest("identity");
    const result = validateHeroProposal({ request, proposal: goldenHeroProposal(request), currentRevision: 7, capabilityManifest: HERO_FORGE_TEST_MANIFEST, immutableOwnerPaths: [["brief", "concept"]] });
    expect(codes(result)).toContain("owner-immutable");
  });

  it("never lets a provider change canonical identity or source version", () => {
    const request = goldenProposalRequest("identity");
    const proposal: any = goldenHeroProposal(request);
    proposal.patches = [{ op: "replace", path: ["sourceLock", "versionId"], value: "manga-1999" }];
    expect(codes(validateHeroProposal({ request, proposal, currentRevision: 7, capabilityManifest: HERO_FORGE_TEST_MANIFEST }))).toContain("patch-outside-section");
  });
});
