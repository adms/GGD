import { beforeAll, expect, it } from "vitest";
import { communityCombatFixture } from "../../../../testkit/communityCombatFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { runHeroAbilityScenario } from "../scenario";
import { createHeroSimulationBaseline } from "../simulationBaseline";
import { DEFAULT_HERO_SCENARIO_SETUP } from "../scenarioSetup";
import type { AbilityDef, ChampionDef } from "../../../sim/content/defs";

beforeAll(registerSkeletonContent);
it("Editor can wait for actual procrastination then pay for EX without resource seeding", () => {
  const r = communityCombatFixture("30"); const original = JSON.stringify(r.project);
  const champion = r.compiled.champion as unknown as ChampionDef;
  const abilities = r.compiled.abilityDrafts as unknown as Record<"PASSIVE" | "Q" | "W" | "E" | "R" | "EX", AbilityDef>;
  const setup = { ...DEFAULT_HERO_SCENARIO_SETUP, resourceSetup: "empty" as const, opponentPreparation: "idle" as const,
    caster: { ...DEFAULT_HERO_SCENARIO_SETUP.caster, x: -1 }, target: { ...DEFAULT_HERO_SCENARIO_SETUP.target, x: 1.3, hp: 100 } };
  const options = { baseline: createHeroSimulationBaseline(r.source.catalog.documents), relatedAbilities: Object.values(abilities), ticks: 1, setup };
  const empty = runHeroAbilityScenario(champion, abilities.EX, options);
  expect(empty.rejectionReason).toBe("no-resource"); expect(empty.resourceCost).toMatchObject({ before: 0, after: 0 });
  const result = runHeroAbilityScenario(champion, abilities.EX, { ...options, setup: { ...setup, priorCast: { slot: "W", waitSec: 1.5 } } });
  expect(result.status).toBe("accepted"); expect(result.resourceCost).toMatchObject({ before: 1, after: 0 });
  expect(result.assertions.some(a => a.id === "single-slot-resource-setup")).toBe(false);
  expect(JSON.stringify(r.project)).toBe(original);
});
