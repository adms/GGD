import { beforeAll, expect, it } from "vitest";
import { communityCombatFixture } from "../../../../testkit/communityCombatFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { runHeroAbilityScenario } from "../scenario";
import { createHeroSimulationBaseline } from "../simulationBaseline";
import { DEFAULT_HERO_SCENARIO_SETUP } from "../scenarioSetup";
import { compileHeroPackageProject, type HeroPackageReplay } from "../../import/heroPackage";
import { applyCommunityDesignRefinement } from "./apply";
import { heroProductTemplate } from "../templateVersions";
import type { AbilityDef, ChampionDef } from "../../../sim/content/defs";

beforeAll(registerSkeletonContent);
it("trusted recompile retains the recast program and accepts the existing kit", () => {
  const r = communityCombatFixture("02"); const before = JSON.stringify(r.project);
  const result = compileHeroPackageProject(r.project, r.source.catalog);
  const replay = (result.scenarios as { replay: HeroPackageReplay }).replay;
  expect(replay.kit.status).toBe("accepted"); expect(replay.errors).toEqual([]);
  expect(r.compiled.abilityDrafts.E.recast?.stages).toHaveLength(2);
  expect(JSON.stringify(r.project)).toBe(before);
});
it.each([[[], 1], [[.3, .6], 3], [[.01, .02], 1], [[1.3], 1]] as [number[], number][])("Editor explicit inputs %j use real casts and preserve the source", (recastPresses, count) => {
  const r = communityCombatFixture("02"), before = JSON.stringify(r.project);
  const result = runHeroAbilityScenario(r.compiled.champion as unknown as ChampionDef, r.compiled.abilityDrafts.E as unknown as AbilityDef, {
    baseline: createHeroSimulationBaseline(r.source.catalog.documents), relatedAbilities: Object.values(r.compiled.abilityDrafts) as unknown as AbilityDef[], ticks: 60,
    setup: { ...DEFAULT_HERO_SCENARIO_SETUP, recastPresses, opponentPreparation: "idle", resourceSetup: "empty",
      caster: { ...DEFAULT_HERO_SCENARIO_SETUP.caster, x: -1 }, target: { ...DEFAULT_HERO_SCENARIO_SETUP.target, x: 1, hp: 100 } },
  });
  expect(result.events.filter(e => e.type === "abilityCast" && e.data.abilityId === r.compiled.abilityDrafts.E.id)).toHaveLength(count);
  expect(result.events.filter(e => e.type === "damage" && e.data.origin === `ability:${r.compiled.abilityDrafts.E.id}`)).toHaveLength(count);
  if (recastPresses.length && count === 1) expect(result.events.some(e => e.type === "castRejected")).toBe(true);
  expect(JSON.stringify(r.project)).toBe(before);
});
it("template and stage programs are pinned and isolated from other instantiated heroes", () => {
  const r = communityCombatFixture("02"); const second = applyCommunityDesignRefinement(r.source.project, r.source.refinement, r.templates);
  const before = JSON.stringify(second), catalog = JSON.stringify(r.templates);
  const product = r.project.acceptedPlan!.slots.E.products[0]!;
  expect(heroProductTemplate(r.project.acceptedPlan!, product, [])!.params.recast!.type).toBe("recast");
  (product.template.params!.recast as { stages: unknown[] }).stages.length = 0;
  expect(JSON.stringify(second)).toBe(before); expect(JSON.stringify(r.templates)).toBe(catalog);
  expect(second.sourceDesign).toEqual(r.source.project.sourceDesign);
});
