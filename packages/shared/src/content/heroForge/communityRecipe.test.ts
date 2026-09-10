import { describe, expect, it } from "vitest";
import { shippedHeroCatalog } from "../../../testkit/heroPackageFixture";
import type { TemplateDoc } from "../schema/template";
import { COMMUNITY_HERO_EXAMPLES, createCommunityHeroRecipe, type CommunityHeroExample } from "./communityExamples";
import { compileGeneratedHeroDraft, generateHeroDraft } from "./generator";

const templates = [...shippedHeroCatalog().documents].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);
const recipe = (): CommunityHeroExample => structuredClone(COMMUNITY_HERO_EXAMPLES.find((entry) => entry.id === "karthus")!);

describe("community recipe factory", () => {
  it("scopes template params, extra effects and explicit overrides without sharing author state", () => {
    const source = recipe();
    source.moves.Q.effects = [{ kind: "shield", amount: { flat: 120, ratios: [] }, duration: 3, absorbs: "all", stackKey: "$hero.guard", onExisting: "keepLarger" }];
    source.moves.Q.abilityOverrides = { rangeTier: "大", manaCostTier: "中" };
    source.moves.W.abilityOverrides = { effects: [{ kind: "applyStatus", statusId: "$hero.slow", duration: 2, applyTo: "target", moveSpeedMult: 0.65 }] };
    const original = JSON.stringify(source);
    const first = createCommunityHeroRecipe(source, "recipe-author-one", templates);
    const second = createCommunityHeroRecipe(source, "recipe-author-two", templates);
    const slots = first.acceptedPlan!.slots;
    expect(slots.PASSIVE.products[0]!.template.params.markId).toBe("recipe-author-one.last-song");
    expect(slots.Q.abilityOverrides).toMatchObject({ provenance: "editor-json", rangeTier: "大", manaCostTier: "中", effects: [{ stackKey: "recipe-author-one.guard" }] });
    expect(slots.W.abilityOverrides.effects).toEqual([{ kind: "applyStatus", statusId: "recipe-author-one.slow", duration: 2, applyTo: "target", moveSpeedMult: 0.65 }]);
    expect(JSON.stringify(first)).not.toContain("$hero");
    expect(JSON.stringify(second)).toContain("recipe-author-two.guard");
    expect(JSON.stringify(source)).toBe(original);

    const compiled = compileGeneratedHeroDraft(generateHeroDraft(first.acceptedPlan!, { heroId: first.projectId, heroName: first.brief.name }), templates);
    expect(compiled.ok, JSON.stringify(compiled)).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.draft.abilityDrafts.Q.effects).toContainEqual(expect.objectContaining({ kind: "shield", stackKey: "recipe-author-one.guard" }));

    const digest = slots.Q.products[0]!.template.contentSha256!;
    expect(first.acceptedPlan!.templateVersions![digest]).toEqual(second.acceptedPlan!.templateVersions![digest]);
    expect(first.acceptedPlan!.templateVersions![digest]).not.toBe(second.acceptedPlan!.templateVersions![digest]);
    slots.Q.name = "作者自行修改";
    expect(second.acceptedPlan!.slots.Q.name).toBe(source.moves.Q.name);
  });

  it("uses an explicit catalog model while preserving the original fallback description", () => {
    const source = recipe();
    const fallback = createCommunityHeroRecipe(source, "recipe-fallback", templates);
    expect(fallback.presentation.modelKey).toBe("champ.sela");
    expect(fallback.brief.concept).toContain("外觀為驗收用替身");
    source.modelKey = "community.body.selected";
    const selected = createCommunityHeroRecipe(source, "recipe-selected", templates);
    expect(selected.presentation.modelKey).toBe(source.modelKey);
    expect(selected.brief.concept).toContain("採用所選 GGD 模型與特效。");
    expect(selected.brief.concept).not.toContain("替身");
  });

  it("keeps the existing schema guard against overriding generated ability identity", () => {
    const source = recipe();
    source.moves.Q.abilityOverrides = { id: "another-hero.q" };
    expect(() => createCommunityHeroRecipe(source, "recipe-guard", templates)).toThrow("技能身分與名稱請在各自欄位編輯");
  });
});
