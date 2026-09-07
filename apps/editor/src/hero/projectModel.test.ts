import { expect, it } from "vitest";
import { createDeterministicHeroPlans } from "@ggd/shared/content";
import { acceptHeroPlan, createHeroProject, editHeroProject, fieldOwner, moveHeroProduct, replaceHeroProducts, setHeroFieldOwner } from "./projectModel";
import { importHeroHandoff, HERO_SLOTS } from "@ggd/shared/content";
import { heroPackageProject, shippedHeroCatalog } from "@ggd/shared/testkit/heroPackageFixture";
import type { TemplateDoc } from "@ggd/shared/content";
import { heroProductTemplate } from "@ggd/shared/content/heroForge/templateVersions";

it("keeps a manually tuned product and its old template when accepting a newly generated plan", () => {
  const catalog = shippedHeroCatalog();
  const project = heroPackageProject(catalog);
  const old = structuredClone(project.acceptedPlan!.slots.Q.products);
  const templates = [...catalog.documents].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => structuredClone(doc) as TemplateDoc);
  for (const template of templates) template.name += " next";
  const candidate = createDeterministicHeroPlans({ projectId: project.projectId, brief: project.brief, sourceLock: project.sourceLock, origin: "鬥士", availableTemplateIds: templates.map((t) => t.id), availableTemplates: templates })[0]!;
  const accepted = acceptHeroPlan(project, candidate, templates);
  expect(accepted.acceptedPlan!.slots.Q.products).toEqual(old);
  const source = heroProductTemplate(accepted.acceptedPlan!, old[0]!, templates);
  expect(source).toEqual(catalog.documents.get(`ability-templates/${old[0]!.template.ref}`));
  expect(accepted.brief).toEqual(project.brief);
  expect(project.acceptedPlan!.slots.Q.products).toEqual(old);
});

it("keeps full owner text and locks attached to product instances through reorder and regeneration", () => {
  let project = createHeroProject("lock-proof");
  project.brief = { name: "我的英雄", concept: "\n完整原文\n「不是機制的台詞」\n", moveNames: {} };
  const plan = createDeterministicHeroPlans({ projectId: project.projectId, brief: project.brief, sourceLock: project.sourceLock, origin: "鬥士",
    availableTemplateIds: ["tpl-on-attack", "tpl-single-strike", "tpl-instant-blast", "tpl-ground-nova", "tpl-leap-strike", "tpl-buff-self"] })[0]!;
  project = acceptHeroPlan(project, plan);
  const first = project.acceptedPlan!.slots.Q.products[0]!;
  project.acceptedPlan!.slots.Q.products = [{ ...first, instanceId: "first" }, { ...structuredClone(first), instanceId: "second" }];
  const originalPath = "acceptedPlan.slots.Q.products.1.template.params.damage";
  project = editHeroProject(project, "skills", originalPath, { perRank: [777] });
  project = setHeroFieldOwner(project, "skills", originalPath, "locked");
  project = moveHeroProduct(project, "Q", 1, 0);
  const movedPath = "acceptedPlan.slots.Q.products.0.template.params.damage";
  expect(fieldOwner(project, "skills", movedPath)).toBe("locked");
  project = editHeroProject(project, "skills", "acceptedPlan.slots.Q.products.0.template.params", { damage: { perRank: [1] } });
  expect(project.acceptedPlan!.slots.Q.products[0]!.template.params.damage).toEqual({ perRank: [777] });
  expect(project.acceptedPlan!.slots.Q.products[0]!.instanceId).toBe("second");
  project = replaceHeroProducts(project, "Q", [project.acceptedPlan!.slots.Q.products[1]!]);
  expect(project.acceptedPlan!.slots.Q.products).toHaveLength(2);
  project = moveHeroProduct(project, "Q", 0, 1);
  project = replaceHeroProducts(project, "Q", [project.acceptedPlan!.slots.Q.products[1]!]);
  expect(project.acceptedPlan!.slots.Q.products).toHaveLength(1);
  expect(project.acceptedPlan!.slots.Q.products[0]!.instanceId).toBe("second");
  expect(fieldOwner(project, "skills", movedPath)).toBe("locked");
  expect(Object.keys(project.sections.skills.fieldOwnership).some((key) => key.includes(".-1."))).toBe(false);
  project = acceptHeroPlan(project, plan);
  expect(project.acceptedPlan!.slots.Q.products[0]!.template.params.damage).toEqual({ perRank: [777] });
  expect(project.brief.concept).toBe("\n完整原文\n「不是機制的台詞」\n");
});

it("keeps imported names and source text while editing refinements and clears stale model provenance", () => {
  let project = createHeroProject("handoff-editor-proof");
  project.brief = { name: "阿薩謝爾", concept: "保留原文", moveNames: {} };
  const plan = createDeterministicHeroPlans({ projectId: project.projectId, brief: project.brief, sourceLock: project.sourceLock, origin: "鬥士",
    availableTemplateIds: ["tpl-on-attack", "tpl-single-strike", "tpl-instant-blast", "tpl-ground-nova", "tpl-leap-strike", "tpl-buff-self"] })[0]!;
  project = acceptHeroPlan(project, plan);
  project = importHeroHandoff(project, JSON.stringify({ schema: "ggd-workflow-upload-sidecar@1", projectId: project.projectId, displayName: project.brief.name,
    identity: "原稿", sourceOwnerText: "敵人重複詛咒反轉增益\n保留換行", reviewText: "逐槽驗收", slots: HERO_SLOTS.map((slot) => ({
      slot, name: plan.slots[slot].name, ownerDescription: "THE END OF SON", currentBehavior: "尚未實作", requiredRefinement: "移除自己的詛咒並對敵人增益", refinementContracts: ["M10"],
    })),
  }));
  const original = structuredClone(project.sourceDesign);
  project = editHeroProject(project, "identity", "brief", { ...project.brief, name: "被換掉" });
  expect(project.brief.name).toBe("阿薩謝爾");
  project = editHeroProject(project, "skills", "acceptedPlan.slots.EX", { ...project.acceptedPlan!.slots.EX, name: "被換掉" });
  expect(project.acceptedPlan!.slots.EX.name).toBe(plan.slots.EX.name);
  expect(editHeroProject(project, "mechanics", "sourceDesign.slots.EX.requiredRefinement", "完成")).toBe(project);
  project = editHeroProject(project, "mechanics", "refinementNotes.EX", "已補測試，畫面尚待檢查");
  expect(project.refinementNotes?.EX).toBe("已補測試，畫面尚待檢查");
  expect(project.sourceDesign).toEqual(original);
  project.presentation.modelProvenance = { schema: "ggd-hero-model-provenance@1", modelSha256: "a".repeat(64), sourceAssetId: "library:model", sourceCharacter: "替代角色", sourceWork: "原作品", relationship: "style-proxy", notes: "替代造型" };
  project = editHeroProject(project, "presentation", "presentation.modelKey", "replacement.body");
  expect(project.presentation.modelProvenance).toBeUndefined();
  expect(project.sourceDesign).toEqual(original);
});
