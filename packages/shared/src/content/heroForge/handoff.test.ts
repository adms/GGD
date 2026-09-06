import { expect, it } from "vitest";
import { HERO_PROJECT_SCHEMA, HERO_SECTION_IDS, HERO_SLOTS } from "./constants";
import { createDeterministicHeroPlans } from "./planner";
import { defaultHeroPresentation } from "./presentation";
import { zHeroProject } from "./schema";
import { importHeroHandoff, importHeroHandoffBatch } from "./handoff";
import { sha256Hex } from "../sha256";

function fixture() {
  const brief = { name: "交接英雄", concept: "保留原始設計", moveNames: {} };
  const sourceLock = { canonicalId: null, versionId: null };
  const plan = createDeterministicHeroPlans({ projectId: "handoff-hero", brief, origin: "鬥士", sourceLock,
    availableTemplateIds: ["tpl-on-attack", "tpl-single-strike", "tpl-buff-self", "tpl-leap-strike", "tpl-ground-nova", "tpl-instant-blast"],
  })[0]!;
  const project = zHeroProject.parse({ schema: HERO_PROJECT_SCHEMA, projectId: "handoff-hero", revision: 0, brief, sourceLock, acceptedPlan: plan, presentation: defaultHeroPresentation(), receipts: [],
    sections: Object.fromEntries(HERO_SECTION_IDS.map((id) => [id, { revision: 0, state: "draft", fieldOwnership: {} }])),
    validationState: Object.fromEntries(HERO_SECTION_IDS.map((id) => [id, { revision: 0, status: "idle", diagnosticCodes: [] }])),
  });
  const recipe = { schema: "ggd-workflow-upload-sidecar@1", projectId: project.projectId, displayName: brief.name, identity: "原作與採用版本", sourceOwnerText: "\n原始對白\n「照原文保留。」  \n\n", reviewText: "逐槽檢查機制。", slots: HERO_SLOTS.map((slot) => ({ slot, name: plan.slots[slot].name, ownerDescription: `${slot} 原文\n保留換行與全形〔符號〕。`, currentBehavior: "目前模板", requiredRefinement: `${slot} 尚待完成的機制。`, refinementContracts: ["M01"], acceptance: { originalMechanic: "passed" } })), effectiveHero: { untrusted: true } };
  const index = { schema: "ggd-workflow-handoff-index@1", heroCount: 1, slotCount: 6, heroes: [{ index: "01", projectId: project.projectId, name: brief.name, project: "projects/01.hero-project.json", recipe: "recipes/01.upload-recipe.json" }] };
  return { project, recipe, index };
}

it("preserves all original text and refinements while leaving template and effect data unchanged", () => {
  const { project, recipe } = fixture(); const original = structuredClone(project); const text = JSON.stringify(recipe, null, 2);
  const imported = importHeroHandoff(project, text);
  expect(imported.sourceDesign?.ownerText).toBe(recipe.sourceOwnerText);
  expect(imported.sourceDesign?.sourceSha256).toBe(sha256Hex(text));
  for (const slot of recipe.slots) {
    expect(imported.sourceDesign?.slots[slot.slot]).toEqual({ name: slot.name, ownerDescription: slot.ownerDescription, baselineBehavior: slot.currentBehavior, requiredRefinement: slot.requiredRefinement, refinementContracts: slot.refinementContracts });
    expect(imported.sections.skills.fieldOwnership[`acceptedPlan.slots.${slot.slot}.name`]).toBe("locked");
  }
  expect(imported.acceptedPlan).toEqual(project.acceptedPlan);
  expect(imported.presentation).toEqual(project.presentation);
  expect(imported.refinementNotes).toBeUndefined();
  expect(project).toEqual(original);
  expect(JSON.stringify(imported.sourceDesign)).not.toContain("originalMechanic");
  expect(zHeroProject.parse(JSON.parse(JSON.stringify(imported))).sourceDesign).toEqual(imported.sourceDesign);
});

it("rejects mismatched identities, missing or duplicate slots and misplaced source files", () => {
  const { project, recipe, index } = fixture();
  expect(() => importHeroHandoff(project, JSON.stringify({ ...recipe, projectId: "different" }))).toThrow(/身分/);
  expect(() => importHeroHandoff(project, JSON.stringify({ ...recipe, slots: [...recipe.slots.slice(1), recipe.slots[1]] }))).toThrow(/不重複/);
  const files = new Map([[index.heroes[0]!.project, JSON.stringify(project)], [index.heroes[0]!.recipe, JSON.stringify(recipe)]]);
  expect(importHeroHandoffBatch(JSON.stringify(index), files)).toHaveLength(1);
  expect(() => importHeroHandoffBatch(JSON.stringify({ ...index, slotCount: 12 }), files)).toThrow(/技能槽數/);
  files.delete(index.heroes[0]!.recipe);
  expect(() => importHeroHandoffBatch(JSON.stringify(index), files)).toThrow(/缺少/);
  index.heroes[0]!.recipe = "../escape.json";
  expect(() => importHeroHandoffBatch(JSON.stringify(index), files)).toThrow(/路徑/);
});

it("requires model source statements to match the active uploaded bytes", () => {
  const { project } = fixture();
  const provenance = { schema: "ggd-hero-model-provenance@1", modelSha256: "a".repeat(64), sourceAssetId: "library:body", sourceCharacter: "素材角色", sourceWork: "素材作品", relationship: "style-proxy", notes: "風格替代" };
  const presentation = { ...project.presentation, modelProvenance: provenance };
  expect(zHeroProject.safeParse({ ...project, presentation }).success).toBe(false);
  const uploadedModel = { schema: "ggd-uploaded-hero-model@1", sha256: "a".repeat(64), byteSize: 100, yawOffsetDeg: 0, clipMap: { idle: "idle", run: "run", attack: "attack", cast: "cast", hurt: "hurt", death: "death" } };
  expect(zHeroProject.safeParse({ ...project, presentation: { ...presentation, uploadedModel } }).success).toBe(true);
  expect(zHeroProject.safeParse({ ...project, presentation: { ...presentation, uploadedModel: { ...uploadedModel, sha256: "b".repeat(64) } } }).success).toBe(false);
});
