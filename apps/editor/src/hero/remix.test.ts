import { expect, it } from "vitest";
import { createDeterministicHeroPlans } from "@ggd/shared/content";
import { createHeroProject, acceptHeroPlan } from "./projectModel";
import { remixHeroDraft, remixHeroProject } from "./remix";
import type { HeroSnapshot } from "@ggd/shared/content/communityHero";

it("rebinds only a new work's own skill references and preserves full author text, locks, scripts and asset pins", () => {
  let source = createHeroProject("original-hero");
  source.brief = { name: "原始名字", concept: "\noriginal-hero.q\n「這是台詞，不是技能引用。」\n", moveNames: { Q: "original-hero.q" } };
  const plan = createDeterministicHeroPlans({ projectId: source.projectId, brief: source.brief, sourceLock: source.sourceLock, origin: "鬥士", availableTemplateIds: ["tpl-on-attack", "tpl-single-strike", "tpl-instant-blast", "tpl-ground-nova", "tpl-leap-strike", "tpl-buff-self"] })[0]!;
  source = acceptHeroPlan(source, plan);
  source.acceptedPlan!.slots.Q.abilityOverrides = { augment: { targets: [{ abilityId: "original-hero.w" }, { abilityId: "other.e" }] } };
  source.presentation.slots.Q.script = { schema: "vfx-script@1", id: "original-hero.q", abilityId: "original-hero.q", segments: [{ kind: "floatingText", on: "castEffect", text: "original-hero.q" }] };
  source.sections.skills.fieldOwnership = { "acceptedPlan.slots.Q.purpose": "locked" };
  source.presentation.championIcon = `assets/icons/community/${"a".repeat(64)}.webp`;
  const before = structuredClone(source);
  const copy = remixHeroProject(source, "remix-hero");
  expect(source).toEqual(before);
  expect(copy.projectId).toBe("remix-hero");
  expect(copy.brief).toEqual(source.brief);
  expect(copy.acceptedPlan!.slots.Q.purpose).toBe(source.acceptedPlan!.slots.Q.purpose);
  expect(copy.acceptedPlan!.slots.Q.abilityOverrides).toEqual({ augment: { targets: [{ abilityId: "remix-hero.w" }, { abilityId: "other.e" }] } });
  expect(copy.presentation.slots.Q.script).toMatchObject({ id: "remix-hero.q", abilityId: "remix-hero.q", segments: source.presentation.slots.Q.script.segments });
  expect(copy.presentation.championIcon).toBe(source.presentation.championIcon);
  expect(copy.sections.skills.fieldOwnership).toEqual(source.sections.skills.fieldOwnership);
  expect(copy.receipts).toEqual([]);
  expect(copy.revision).toBe(0);
  expect(() => remixHeroProject(source, source.projectId)).toThrow("新的作品身分");
});

it("does not create a remix from an unlicensed source", () => {
  expect(() => remixHeroDraft({ allowAttributionRemix: false } as HeroSnapshot, "new-hero")).toThrow("未授權");
});
