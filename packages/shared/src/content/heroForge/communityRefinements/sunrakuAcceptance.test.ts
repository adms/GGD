import { beforeAll, expect, it } from "vitest";
import { communityCombatFixture } from "../../../../testkit/communityCombatFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { runHeroAbilityScenario, runHeroKitScenario } from "../scenario";
import { createHeroSimulationBaseline } from "../simulationBaseline";
import { DEFAULT_HERO_SCENARIO_SETUP } from "../scenarioSetup";
import type { AbilityDef, ChampionDef } from "../../../sim/content/defs";

beforeAll(registerSkeletonContent);
function fixture() {
  const r = communityCombatFixture("31");
  const champion = r.compiled.champion as unknown as ChampionDef;
  const abilities = r.compiled.abilityDrafts as unknown as Record<"PASSIVE" | "Q" | "W" | "E" | "R" | "EX", AbilityDef>;
  const options = { baseline: createHeroSimulationBaseline(r.source.catalog.documents), relatedAbilities: Object.values(abilities), ticks: 120 };
  return { ...r, champion, abilities, options };
}
it("single-slot preview earns target engagement through real enemy combat and reports its prepared self-resource", () => {
  const r = fixture(); const original = JSON.stringify(r.project);
  const result = runHeroAbilityScenario(r.champion, r.abilities.EX, r.options);
  expect(result.status).toBe("accepted");
  expect(result.resourceCost).toMatchObject({ subject: "self", before: 3, after: 0 });
  const castIndex = result.events.findIndex(e => e.type === "abilityCast" && e.data.abilityId === r.abilities.EX.id);
  expect(result.events.slice(0, castIndex).some(e => e.type === "damage" && e.data.origin === "basic" && Number(e.data.amount) > 0)).toBe(true);
  expect(result.assertions.some(a => a.summaryZh.includes("3") && a.summaryZh.includes("資源"))).toBe(true);
  expect(JSON.stringify(r.project)).toBe(original);
  expect(runHeroAbilityScenario(r.champion, r.abilities.EX, r.options).digestTrail).toEqual(result.digestTrail);
});
it("idle preview cannot fabricate target engagement even when three reads are prepared", () => {
  const r = fixture(); const result = runHeroAbilityScenario(r.champion, r.abilities.EX, { ...r.options,
    setup: { ...DEFAULT_HERO_SCENARIO_SETUP, opponentPreparation: "idle" } });
  expect(result.rejectionReason).toBe("target-condition");
  expect(result.resourceCost).toMatchObject({ before: 3, after: 3 });
  expect(result.before.casterMana).toBe(result.after.casterMana);
});
it("the ordinary six-slot smoke sequence cannot invent three successful slide dodges", () => {
  const r = fixture(); const result = runHeroKitScenario(r.champion, r.abilities, r.options);
  expect(result.rejectedSlots).toContain("EX");
  expect(result.resourceCostsBySlot?.EX).toMatchObject({ before: 0, after: 0 });
  expect(result.rejectionReasonsBySlot.EX).toContain("no-resource");
});
