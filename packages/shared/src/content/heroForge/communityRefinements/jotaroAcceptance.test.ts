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
export function jotaroScenario() {
  const r = communityCombatFixture("04");
  const champion = r.compiled.champion as unknown as ChampionDef;
  const abilities = r.compiled.abilityDrafts as unknown as Record<"PASSIVE" | "Q" | "W" | "E" | "R" | "EX", AbilityDef>;
  const baseline = createHeroSimulationBaseline(r.source.catalog.documents);
  return { ...r, champion, abilities, baseline };
}
it("Editor R preparation queues actual EX then releases it; actor hold comes from Sim", () => {
  const r = jotaroScenario();
  const result = runHeroAbilityScenario(r.champion, r.abilities.EX, { baseline: r.baseline, relatedAbilities: Object.values(r.abilities), ticks: 65,
    setup: { ...DEFAULT_HERO_SCENARIO_SETUP, opponentPreparation: "idle", resourceSetup: "empty",
      caster: { ...DEFAULT_HERO_SCENARIO_SETUP.caster, x: -1 }, target: { ...DEFAULT_HERO_SCENARIO_SETUP.target, x: .5 },
      priorCast: { slot: "R", waitSec: .5 } } });
  expect(result.status).toBe("accepted");
  const queued = result.events.find(e => e.type === "timeStopHitQueued")!;
  const end = result.events.find(e => e.type === "timeStopEnd")!;
  const damage = result.events.filter(e => e.type === "damage" && e.data.origin === `ability:${r.abilities.EX.id}`);
  expect(queued.actorPose.timeStopped).toEqual({ caster: false, target: true });
  expect(end.actorPose.timeStopped).toEqual({ caster: false, target: false });
  expect(damage).toHaveLength(1); expect(damage[0]!.tick).toBeGreaterThanOrEqual(end.tick);
  expect(queued.tick).toBeLessThan(end.tick);
});
it("trusted importer and Editor use the same six-slot compilation and untouched owner text", () => {
  const r = jotaroScenario(), out = compileHeroPackageProject(r.project, r.source.catalog);
  const replay = (out.scenarios as { replay: HeroPackageReplay }).replay;
  const kit = runHeroKitScenario(r.champion, r.abilities, { baseline: r.baseline });
  expect(replay.kit.status).toBe("accepted"); expect(kit.rejectedSlots).toEqual([]);
  expect(r.project.sourceDesign).toEqual(r.source.project.sourceDesign); expect(r.project.brief).toEqual(r.source.project.brief);
});
it("v1 products have independent templates and retain the prior revision for rollback", () => {
  const r = jotaroScenario(), before = JSON.stringify(r.source.project), templates = JSON.stringify(r.templates);
  const second = applyCommunityDesignRefinement(r.source.project, r.source.refinement, r.templates), copy = JSON.stringify(second);
  r.project.acceptedPlan!.slots.R.products[0]!.template.params!.effects = [];
  expect(JSON.stringify(second)).toBe(copy); expect(JSON.stringify(r.source.project)).toBe(before); expect(JSON.stringify(r.templates)).toBe(templates);
  expect(second.revision).toBe(r.source.project.revision + 1);
  expect(() => applyCommunityDesignRefinement(r.source.project, { ...r.source.refinement, sourceSha256: "0".repeat(64) }, r.templates)).toThrow("REFINEMENT_SOURCE_MISMATCH");
});
