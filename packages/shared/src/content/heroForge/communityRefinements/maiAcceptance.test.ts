import { beforeAll, expect, it } from "vitest";
import { communityCombatFixture } from "../../../../testkit/communityCombatFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { runHeroAbilityScenario } from "../scenario";
import { createHeroSimulationBaseline } from "../simulationBaseline";
import { DEFAULT_HERO_SCENARIO_SETUP } from "../scenarioSetup";
import { compileHeroPackageProject, type HeroPackageReplay } from "../../import/heroPackage";
import { applyCommunityDesignRefinement } from "./apply";
import type { AbilityDef, ChampionDef, ProjectileDef } from "../../../sim/content/defs";

beforeAll(registerSkeletonContent);
it("the trusted importer accepts the current six-slot kit without source mutation", () => {
  const r = communityCombatFixture("03"); const before = JSON.stringify(r.project);
  const result = compileHeroPackageProject(r.project, r.source.catalog);
  const replay = (result.scenarios as { replay: HeroPackageReplay }).replay;
  expect(replay.kit.status).toBe("accepted"); expect(replay.kit.rejectedSlots).toEqual([]); expect(replay.errors).toEqual([]);
  expect(JSON.stringify(r.project)).toBe(before);
});
it("Editor EX preparation follows a real W hit once without altering the authored project", () => {
  const r = communityCombatFixture("03"); const before = JSON.stringify(r.project);
  const champion = r.compiled.champion as unknown as ChampionDef;
  const abilities = r.compiled.abilityDrafts as unknown as Record<"PASSIVE" | "Q" | "W" | "E" | "R" | "EX", AbilityDef>;
  const result = runHeroAbilityScenario(champion, abilities.W, {
    baseline: createHeroSimulationBaseline(r.source.catalog.documents), relatedAbilities: Object.values(abilities),
    relatedProjectiles: [r.source.catalog.documents.get("projectiles/imported.wave.fire") as unknown as ProjectileDef], ticks: 45,
    setup: { ...DEFAULT_HERO_SCENARIO_SETUP, opponentPreparation: "idle", resourceSetup: "empty",
      caster: { ...DEFAULT_HERO_SCENARIO_SETUP.caster, x: -1 }, target: { ...DEFAULT_HERO_SCENARIO_SETUP.target, x: 1, hp: 100 },
      priorCast: { slot: "EX", waitSec: .1 } },
  });
  expect(result.status).toBe("accepted");
  expect(result.events.filter(e => e.type === "damage" && String(e.data.origin).includes("afterimage"))).toHaveLength(1);
  expect(result.assertions.some(a => a.id === "single-slot-resource-setup")).toBe(false);
  expect(JSON.stringify(r.project)).toBe(before);
});
it("new dash recipes remain pinned, source-locked and independent of other instantiated heroes", () => {
  const r = communityCombatFixture("03"); const before = JSON.stringify(r.source.project), templates = JSON.stringify(r.templates);
  const second = applyCommunityDesignRefinement(r.source.project, r.source.refinement, r.templates); const saved = JSON.stringify(second);
  r.project.acceptedPlan!.slots.E.products[0]!.template.params!.effects = [];
  expect(JSON.stringify(second)).toBe(saved); expect(JSON.stringify(r.source.project)).toBe(before); expect(JSON.stringify(r.templates)).toBe(templates);
  expect(second.sourceDesign).toEqual(r.source.project.sourceDesign);
  expect(() => applyCommunityDesignRefinement(r.source.project, { ...r.source.refinement, sourceSha256: "0".repeat(64) }, r.templates)).toThrow("REFINEMENT_SOURCE_MISMATCH");
});
