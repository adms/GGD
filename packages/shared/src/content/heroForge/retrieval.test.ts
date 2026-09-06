import { describe, expect, it } from "vitest";
import { buildCapabilityManifest } from "../editorCapabilities";
import type { TemplateDoc } from "../schema/template";
import { buildProposalRequest } from "./retrieval";
import { HERO_PROJECT_SCHEMA, HERO_SECTION_IDS } from "./constants";
import type { HeroProject } from "./schema";
import { defaultHeroPresentation } from "./presentation";

const state = () => ({ revision: 0, state: "draft" as const, fieldOwnership: {} });
const validation = () => ({ revision: 0, status: "idle" as const, diagnosticCodes: [] });
const project: HeroProject = {
  schema: HERO_PROJECT_SCHEMA,
  projectId: "watcher",
  revision: 4,
  sourceLock: { canonicalId: "watcher", versionId: "anime-2011" },
  brief: { name: "守望者", concept: "救人「這是台詞」", moveNames: {} },
  sections: Object.fromEntries(HERO_SECTION_IDS.map((id) => [id, state()])) as HeroProject["sections"],
  acceptedPlan: null,
  presentation: defaultHeroPresentation(),
  validationState: Object.fromEntries(HERO_SECTION_IDS.map((id) => [id, validation()])) as unknown as HeroProject["validationState"],
  receipts: [],
};
const template = (id: string, requires: string[], gapScore: number): TemplateDoc => ({
  id, schema: "template@1", name: id, description: `${id} 說明`, family: id, status: "enabled", params: {}, requires, gapScore,
  exemplar: { skill: "fixture", jass: "fixture" },
});

describe("hero proposal retrieval", () => {
  it("exposes only the deterministic supported shortlist and strips Owner quotes", () => {
    const request = buildProposalRequest({
      task: "three-concepts", sectionId: "identity", project,
      templates: [template("tpl-a", [], 4), template("tpl-b", ["dash"], 8), template("tpl-c", ["leap"], 6), template("tpl-no", ["effect:unshipped-fixture"], 10)],
      capabilityManifest: buildCapabilityManifest(),
    });
    expect(request.legalTemplateIds).toEqual(["tpl-b", "tpl-c", "tpl-a"]);
    expect(request.legalTemplateIds).not.toContain("tpl-no");
    expect(JSON.stringify(request)).not.toContain("這是台詞");
    expect(request.legalPatchPaths).toEqual([["brief", "concept"]]);
  });
});
