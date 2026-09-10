import { beforeAll, expect, it } from "vitest";
import { communityCombatFixture } from "../../../../testkit/communityCombatFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { runHeroAbilityScenario, runHeroKitScenario } from "../scenario";
import { createHeroSimulationBaseline } from "../simulationBaseline";
import { DEFAULT_HERO_SCENARIO_SETUP } from "../scenarioSetup";
import type { AbilityDef, ChampionDef } from "../../../sim/content/defs";

beforeAll(registerSkeletonContent);
function fixture() {
  const r = communityCombatFixture("26");
  const champion = r.compiled.champion as unknown as ChampionDef;
  const abilities = r.compiled.abilityDrafts as unknown as Record<"PASSIVE" | "Q" | "W" | "E" | "R" | "EX", AbilityDef>;
  const options = { baseline: createHeroSimulationBaseline(r.source.catalog.documents), relatedAbilities: Object.values(abilities), ticks: 180 };
  return { ...r, champion, abilities, options };
}
it("earns a real observed clue from the opponent before R, then consumes it", () => {
  const r = fixture(); const original = JSON.stringify(r.project);
  const result = runHeroAbilityScenario(r.champion, r.abilities.R, r.options);
  expect(result.status).toBe("accepted");
  expect(result.resourceCost).toMatchObject({ subject: "target", before: 1, after: 0 });
  expect(result.ticks).toBe(271);
  expect(result.digestTrail).toHaveLength(result.ticks);
  const castIndex = result.events.findIndex(e => e.type === "abilityCast" && e.data.abilityId === r.abilities.R.id);
  expect(result.events.slice(0, castIndex).some(e => e.type === "damage" && e.data.origin === "basic" && Number(e.data.amount) > 0)).toBe(true);
  expect(result.assertions.find(a => a.id === "opponent-preparation")?.summaryZh).toContain("實際普攻");
  expect(JSON.stringify(r.project)).toBe(original);
  expect(runHeroAbilityScenario(r.champion, r.abilities.R, r.options).digestTrail).toEqual(result.digestTrail);
});
it("keeps the idle-opponent negative case and never invents target clues", () => {
  const r = fixture();
  const result = runHeroAbilityScenario(r.champion, r.abilities.R, { ...r.options,
    setup: { ...DEFAULT_HERO_SCENARIO_SETUP, opponentPreparation: "idle" },
  });
  expect(result.rejectionReason).toBe("no-resource");
  expect(result.resourceCost).toMatchObject({ before: 0, after: 0 });
  expect(result.before.casterMana).toBe(result.after.casterMana);
});
it("runs the whole authored kit in live combat without seeding the target resource", () => {
  const r = fixture();
  const result = runHeroKitScenario(r.champion, r.abilities, r.options);
  expect(result.rejectedSlots).toEqual([]);
  expect(result.status).toBe("accepted");
  expect(result.resourceCostsBySlot?.R).toMatchObject({ subject: "target", before: 1, after: 0 });
  const empty = runHeroKitScenario(r.champion, r.abilities, { ...r.options, opponentPreparation: "idle" });
  expect(empty.rejectedSlots).toContain("R");
  expect(empty.resourceCostsBySlot?.R).toMatchObject({ before: 0, after: 0 });
});
it("cannot manufacture a clue when the observer passive is absent", () => {
  const r = fixture();
  const result = runHeroAbilityScenario({ ...r.champion, passiveAbility: undefined }, r.abilities.R, r.options);
  expect(result.rejectionReason).toBe("no-resource");
  expect(result.resourceCost).toMatchObject({ before: 0, after: 0 });
  expect(result.events.some(e => e.type === "damage" && e.data.origin === "basic" && Number(e.data.amount) > 0)).toBe(true);
});
it("rejects an unearned larger cost instead of topping up or partially consuming the clue", () => {
  const r = fixture();
  const result = runHeroAbilityScenario(r.champion, { ...r.abilities.R,
    statusCost: { ...r.abilities.R.statusCost!, count: 3 } }, r.options);
  expect(result.rejectionReason).toBe("no-resource");
  expect(result.resourceCost).toMatchObject({ before: 1, after: 1 });
  expect(result.before.casterMana).toBe(result.after.casterMana);
});
