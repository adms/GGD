import { describe, expect, it } from "vitest";
import { shippedHeroCatalog } from "../../../testkit/heroPackageFixture";
import type { TemplateDoc } from "../schema/template";
import type { VfxSubtypeDoc } from "../schema/vfxSubtype";
import { COMMUNITY_HERO_EXAMPLES, createCommunityHeroRecipe, type CommunityHeroExample } from "./communityExamples";
import { COMMUNITY_ACQUIRED_HEROES } from "./communityAcquired";
import { COMMUNITY_LOL_BATCH2_EXAMPLES } from "./communityLolBatch2";
import { HERO_SLOTS } from "./constants";
import { compileGeneratedHeroDraft, generateHeroDraft } from "./generator";

const catalog = shippedHeroCatalog();
const templates = [...catalog.documents].filter(([key]) => key.startsWith("ability-templates/")).map(([, doc]) => doc as TemplateDoc);
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

  it("shortens only oversized stack keys consistently across effects, overrides and extendBuff references", () => {
    const source = recipe();
    const projectId = "hero-12345678-1234-4234-8234-123456789abc";
    const key = "$hero.shared-shield", boundary = "$hero.123456";
    const shield = (stackKey: string) => ({ kind: "shield", amount: { flat: 120, ratios: [] }, duration: 3, absorbs: "all", stackKey, onExisting: "keepLarger" });
    source.moves.Q.effects = [shield(key), shield(boundary), shield(`${key}-other`)];
    source.moves.W.abilityOverrides = { effects: [{ kind: "applyBuff", stackKey: key, statusId: key, duration: 3, modifiers: [],
      hooks: [{ on: "onDamageTaken", effects: [{ kind: "extendBuff", shape: "single", stackKey: key, addSec: 0.1, perDamageFlat: 1, maxRemainingSec: 3 }] }] }] };
    source.moves.E.params.effects = [shield(key)];
    const original = JSON.stringify(source);
    const first = createCommunityHeroRecipe(source, projectId, templates);
    const again = createCommunityHeroRecipe(source, projectId, templates);
    const other = createCommunityHeroRecipe(source, "hero-12345678-1234-4234-8234-123456789abd", templates);
    const slots = first.acceptedPlan!.slots;
    const shieldEffects = slots.Q.abilityOverrides.effects as { stackKey: string }[];
    const buff = (slots.W.abilityOverrides.effects as { stackKey: string; statusId: string; hooks: { effects: { stackKey: string }[] }[] }[])[0]!;
    expect(shieldEffects[0]!.stackKey).toMatch(/^stack-[a-f0-9]{42}$/);
    expect(shieldEffects[1]!.stackKey).toBe(`${projectId}.123456`);
    expect(shieldEffects[1]!.stackKey).toHaveLength(48);
    expect(shieldEffects[2]!.stackKey).not.toBe(shieldEffects[0]!.stackKey);
    expect(buff.stackKey).toBe(shieldEffects[0]!.stackKey);
    expect(buff.hooks[0]!.effects[0]!.stackKey).toBe(buff.stackKey);
    expect(slots.E.products[0]!.template.params.effects).toEqual([shield(buff.stackKey)]);
    expect(buff.statusId).toBe(`${projectId}.shared-shield`);
    expect(first.projectId).toBe(projectId);
    expect(first).toEqual(again);
    expect((other.acceptedPlan!.slots.Q.abilityOverrides.effects as { stackKey: string }[])[0]!.stackKey).not.toBe(shieldEffects[0]!.stackKey);
    expect(JSON.stringify(source)).toBe(original);
  });

  it("compiles the acquired recipes with all six slots with real Editor UUID-length project identities", () => {
    const configs = [...catalog.documents].filter(([key]) => key.startsWith("config/")).map(([, doc]) => doc);
    const subtypes = [...catalog.documents].filter(([key]) => key.startsWith("vfx-subtypes/")).map(([, doc]) => doc as VfxSubtypeDoc);
    const failures: unknown[] = [];
    let slots = 0;
    for (const [index, source] of COMMUNITY_ACQUIRED_HEROES.entries()) {
      const projectId = `hero-12345678-1234-4234-8234-${String(index + 1).padStart(12, "0")}`;
      expect(projectId).toHaveLength(41);
      try {
        const project = createCommunityHeroRecipe(source, projectId, templates);
        const generated = generateHeroDraft(project.acceptedPlan!, { heroId: projectId, heroName: project.brief.name, presentation: project.presentation });
        const result = compileGeneratedHeroDraft(generated, templates, configs, subtypes);
        if (!result.ok) failures.push(...result.failures.map((failure) => ({ hero: source.id, ...failure })));
        else for (const slot of HERO_SLOTS) {
          expect(result.draft.abilityDrafts[slot].id).toBe(`${projectId}.${slot.toLowerCase()}`);
          slots++;
        }
      } catch (error) { failures.push({ hero: source.id, phase: "project-or-generation", message: String(error) }); }
    }
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
    expect(slots).toBe(COMMUNITY_ACQUIRED_HEROES.length * 6);
  });

  it("compiles all eleven LoL batch-two recipes and 66 slots with real Editor UUID-length project identities", () => {
    const configs = [...catalog.documents].filter(([key]) => key.startsWith("config/")).map(([, doc]) => doc);
    const subtypes = [...catalog.documents].filter(([key]) => key.startsWith("vfx-subtypes/")).map(([, doc]) => doc as VfxSubtypeDoc);
    const failures: unknown[] = [];
    let slots = 0;
    for (const [index, source] of COMMUNITY_LOL_BATCH2_EXAMPLES.entries()) {
      const projectId = `hero-12345678-1234-4234-8234-${String(index + 1).padStart(12, "0")}`;
      expect(projectId).toHaveLength(41);
      try {
        const project = createCommunityHeroRecipe(source, projectId, templates);
        const generated = generateHeroDraft(project.acceptedPlan!, { heroId: projectId, heroName: project.brief.name, presentation: project.presentation });
        const result = compileGeneratedHeroDraft(generated, templates, configs, subtypes);
        if (!result.ok) failures.push(...result.failures.map((failure) => ({ hero: source.id, ...failure })));
        else for (const slot of HERO_SLOTS) {
          expect(result.draft.abilityDrafts[slot].id).toBe(`${projectId}.${slot.toLowerCase()}`);
          slots++;
        }
      } catch (error) { failures.push({ hero: source.id, phase: "project-or-generation", message: String(error) }); }
    }
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
    expect(slots).toBe(COMMUNITY_LOL_BATCH2_EXAMPLES.length * 6);
  });
});
