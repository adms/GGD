import { expect, it } from "vitest";
import { createDeterministicHeroPlans } from "@ggd/shared/content";
import { acceptHeroPlan, createHeroProject, editHeroProject, fieldOwner, moveHeroProduct, replaceHeroProducts, setHeroFieldOwner } from "./projectModel";

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
