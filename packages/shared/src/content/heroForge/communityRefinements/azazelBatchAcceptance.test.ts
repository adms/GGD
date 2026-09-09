import { beforeAll, expect, it } from "vitest";
import { communityCombatFixture } from "../../../../testkit/communityCombatFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { runHeroAbilityScenario } from "../scenario";
import { createHeroSimulationBaseline } from "../simulationBaseline";
import { DEFAULT_HERO_SCENARIO_SETUP } from "../scenarioSetup";
import { compileHeroPackageProject, type HeroPackageReplay } from "../../import/heroPackage";
import type { AbilityDef, ChampionDef, ProjectileDef } from "../../../sim/content/defs";
import { applyCommunityDesignRefinement } from "./apply";

beforeAll(registerSkeletonContent);
function setup() {
  const r = communityCombatFixture("32");
  const champion = r.compiled.champion as unknown as ChampionDef;
  const abilities = r.compiled.abilityDrafts as unknown as Record<"PASSIVE" | "Q" | "W" | "E" | "R" | "EX", AbilityDef>;
  const options = { baseline: createHeroSimulationBaseline(r.source.catalog.documents), relatedAbilities: Object.values(abilities),
    relatedProjectiles: [r.source.catalog.documents.get("projectiles/imported.bolt.void") as unknown as ProjectileDef], ticks: 90,
    setup: { ...DEFAULT_HERO_SCENARIO_SETUP, opponentPreparation: "idle" as const } };
  return { ...r, champion, abilities, options };
}
it("the trusted importer runs the current six-slot kit with its real earned resources", () => {
  const r = setup(); const original = JSON.stringify(r.project);
  const result = compileHeroPackageProject(r.project, r.source.catalog);
  const replay = (result.scenarios as { replay: HeroPackageReplay }).replay;
  expect(replay.kit.status).toBe("accepted"); expect(replay.errors).toEqual([]);
  expect(replay.kit.rejectedSlots).toEqual([]);
  expect(JSON.stringify(r.project)).toBe(original);
});
it("Editor prior R establishes the real curse, while empty energy still rejects EX", () => {
  const r = setup(); const priorCast = { slot: "R" as const, waitSec: 1.5 };
  const empty = runHeroAbilityScenario(r.champion, r.abilities.EX, { ...r.options, setup: { ...r.options.setup, resourceSetup: "empty", priorCast } });
  expect(empty.rejectionReason).toBe("no-resource"); expect(empty.resourceCost).toMatchObject({ before: 1, after: 1 });
  const ready = runHeroAbilityScenario(r.champion, r.abilities.EX, { ...r.options, setup: { ...r.options.setup, resourceSetup: "ready", priorCast } });
  expect(ready.status).toBe("accepted"); expect(JSON.stringify(ready.events)).toContain("反轉增益");
  expect(ready.events.filter(e => e.type === "damage" && e.data.origin === `ability:${r.abilities.EX.id}`)).toHaveLength(0);
  expect(ready.assertions.some(a => a.id === "single-slot-resource-setup")).toBe(true);
});
it("refinement preserves original text and isolates templates and other instantiated heroes", () => {
  const r = setup(); const source = JSON.stringify(r.source.project), templates = JSON.stringify(r.templates);
  const second = applyCommunityDesignRefinement(r.source.project, r.source.refinement, r.templates);
  const other = JSON.stringify(second);
  r.project.acceptedPlan!.slots.R.products[0]!.template.params!.effects = [];
  expect(JSON.stringify(second)).toBe(other); expect(JSON.stringify(r.source.project)).toBe(source);
  expect(JSON.stringify(r.templates)).toBe(templates); expect(second.sourceDesign).toEqual(r.source.project.sourceDesign);
  expect(() => applyCommunityDesignRefinement(r.source.project, { ...r.source.refinement, projectId: "another-hero" }, r.templates)).toThrow("REFINEMENT_SOURCE_MISMATCH");
});
