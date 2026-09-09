import { beforeAll, expect, it } from "vitest";
import { communityCombatFixture } from "../../../../testkit/communityCombatFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { runHeroAbilityScenario, runHeroKitScenario } from "../scenario";
import { createHeroSimulationBaseline } from "../simulationBaseline";
import { DEFAULT_HERO_SCENARIO_SETUP } from "../scenarioSetup";
import { applyCommunityDesignRefinement } from "./apply";
import { compileHeroPackageProject, type HeroPackageReplay } from "../../import/heroPackage";
import type { AbilityDef, ChampionDef } from "../../../sim/content/defs";

beforeAll(registerSkeletonContent);
function fixture() {
  const r = communityCombatFixture("35");
  return { ...r, champion: r.compiled.champion as unknown as ChampionDef,
    abilities: r.compiled.abilityDrafts as unknown as Record<"PASSIVE" | "Q" | "W" | "E" | "R" | "EX", AbilityDef>,
    baseline: createHeroSimulationBaseline(r.source.catalog.documents) };
}
it("Editor EX preparation uses real fire stance and keeps the same one-breath Q cost", () => {
  const r = fixture(), before = JSON.stringify(r.project);
  const options = { baseline: r.baseline, relatedAbilities: Object.values(r.abilities), ticks: 30,
    setup: { ...DEFAULT_HERO_SCENARIO_SETUP, opponentPreparation: "idle" as const, resourceSetup: "empty" as const,
      caster: { ...DEFAULT_HERO_SCENARIO_SETUP.caster, x: -1 }, target: { ...DEFAULT_HERO_SCENARIO_SETUP.target, x: .5 } } };
  const water = runHeroAbilityScenario(r.champion, r.abilities.Q, options);
  const fire = runHeroAbilityScenario(r.champion, r.abilities.Q, { ...options, setup: { ...options.setup, priorCast: { slot: "EX", waitSec: .3 } } });
  expect(water.status).toBe("accepted"); expect(fire.status).toBe("accepted");
  expect(water.resourceCost).toMatchObject({ before: 6, after: 5 }); expect(fire.resourceCost).toMatchObject({ before: 6, after: 5 });
  expect(fire.events.some(e => e.type === "abilityCast" && e.data.abilityId === r.abilities.EX.id)).toBe(true);
  expect(JSON.stringify(r.project)).toBe(before);
});
it("trusted import and Editor exercise the same six-slot kit, original text and model binding", () => {
  const r = fixture(); const out = compileHeroPackageProject(r.project, r.source.catalog);
  const replay = (out.scenarios as { replay: HeroPackageReplay }).replay;
  const kit = runHeroKitScenario(r.champion, r.abilities, { baseline: r.baseline });
  expect(replay.kit.status).toBe("accepted"); expect(kit.rejectedSlots).toEqual([]);
  expect(r.project.sourceDesign).toEqual(r.source.project.sourceDesign); expect(r.project.brief).toEqual(r.source.project.brief);
  expect(r.project.presentation.modelKey).toBe(r.source.project.presentation.modelKey);
});
it("stance cost is pinned in independent products, and old revisions remain restorable", () => {
  const r = fixture(), original = JSON.stringify(r.source.project), templates = JSON.stringify(r.templates);
  const second = applyCommunityDesignRefinement(r.source.project, r.source.refinement, r.templates), snapshot = JSON.stringify(second);
  r.project.acceptedPlan!.slots.Q.abilityOverrides.statusCost = undefined;
  r.project.acceptedPlan!.slots.EX.products[0]!.template.params!.effects = [];
  expect(JSON.stringify(second)).toBe(snapshot); expect(JSON.stringify(r.source.project)).toBe(original); expect(JSON.stringify(r.templates)).toBe(templates);
  expect(second.revision).toBe(r.source.project.revision + 2);
  expect(() => applyCommunityDesignRefinement(r.source.project, { ...r.source.refinement, sourceSha256: "0".repeat(64) }, r.templates)).toThrow("REFINEMENT_SOURCE_MISMATCH");
});
