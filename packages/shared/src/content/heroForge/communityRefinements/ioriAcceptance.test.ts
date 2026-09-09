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
  const r = communityCombatFixture("02");
  return { ...r, champion: r.compiled.champion as unknown as ChampionDef,
    abilities: r.compiled.abilityDrafts as unknown as Record<"PASSIVE" | "Q" | "W" | "E" | "R" | "EX", AbilityDef>,
    baseline: createHeroSimulationBaseline(r.source.catalog.documents) };
}
it("defaults place a non-approaching melee EX within range but explicit out-of-range inputs still reject", () => {
  const r = fixture(), before = JSON.stringify(r.project);
  const options = { baseline: r.baseline, relatedAbilities: Object.values(r.abilities), ticks: 60 };
  const automatic = runHeroAbilityScenario(r.champion, r.abilities.EX, options);
  expect(automatic.status).toBe("accepted"); expect(automatic.before.targetPos.x - automatic.before.casterPos.x).toBeLessThan(3);
  const manual = runHeroAbilityScenario(r.champion, r.abilities.EX, { ...options, setup: { ...DEFAULT_HERO_SCENARIO_SETUP, opponentPreparation: "idle", resourceSetup: "empty" } });
  expect(manual.status).toBe("rejected"); expect(manual.rejectionReason).toBe("out-of-range");
  expect(manual.after.casterMana).toBe(manual.before.casterMana); expect(JSON.stringify(r.project)).toBe(before);
});
it("Editor R preparation reaches an actual completion window before EX without seeding a marker", () => {
  const r = fixture(), before = JSON.stringify(r.project);
  const result = runHeroAbilityScenario(r.champion, r.abilities.EX, { baseline: r.baseline, relatedAbilities: Object.values(r.abilities), ticks: 45,
    setup: { ...DEFAULT_HERO_SCENARIO_SETUP, opponentPreparation: "idle", resourceSetup: "empty",
      caster: { ...DEFAULT_HERO_SCENARIO_SETUP.caster, x: -1, hp: 100 }, target: { ...DEFAULT_HERO_SCENARIO_SETUP.target, x: .5, hp: 100 },
      priorCast: { slot: "R", waitSec: 1.7 } } });
  expect(result.status).toBe("accepted");
  const contact = result.events.filter(e => e.type === "damage" && e.data.origin === `ability:${r.abilities.R.id}`);
  const combo = result.events.filter(e => e.type === "damage" && String(e.data.origin).endsWith(".r-contact"));
  const ex = result.events.filter(e => e.type === "damage" && e.data.origin === `ability:${r.abilities.EX.id}`);
  expect(contact).toHaveLength(1); expect(combo).toHaveLength(5); expect(ex).toHaveLength(5);
  expect(result.assertions.some(a => a.id === "single-slot-resource-setup")).toBe(false); expect(JSON.stringify(r.project)).toBe(before);
});
it("trusted import and Editor kit use the same actual six-slot compilation and preserve source text", () => {
  const r = fixture(); const out = compileHeroPackageProject(r.project, r.source.catalog);
  const replay = (out.scenarios as { replay: HeroPackageReplay }).replay;
  const kit = runHeroKitScenario(r.champion, r.abilities, { baseline: r.baseline });
  expect(replay.kit.status).toBe("accepted"); expect(kit.status).toBe("accepted"); expect(kit.rejectedSlots).toEqual([]);
  expect(r.project.sourceDesign).toEqual(r.source.project.sourceDesign); expect(r.project.brief).toEqual(r.source.project.brief);
});
it("v2 products remain isolated and preserve the previously implemented three-input E", () => {
  const r = fixture(), baseline = JSON.stringify(r.source.project), templates = JSON.stringify(r.templates);
  const second = applyCommunityDesignRefinement(r.source.project, r.source.refinement, r.templates), before = JSON.stringify(second);
  r.project.acceptedPlan!.slots.PASSIVE.products[0]!.template.params!.hooks = [];
  expect(JSON.stringify(second)).toBe(before); expect(JSON.stringify(r.source.project)).toBe(baseline); expect(JSON.stringify(r.templates)).toBe(templates);
  expect(second.revision).toBe(r.source.project.revision + 2); expect(r.abilities.E.recast?.stages).toHaveLength(2);
  expect(() => applyCommunityDesignRefinement(r.source.project, { ...r.source.refinement, sourceSha256: "0".repeat(64) }, r.templates)).toThrow("REFINEMENT_SOURCE_MISMATCH");
});
