import { beforeAll, expect, it } from "vitest";
import { communityCombatFixture } from "../../../../testkit/communityCombatFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { createHeroSimulationBaseline } from "../simulationBaseline";
import { runHeroAdmissionScenarios } from "../scenarioAdmission";
import { runHeroKitScenario } from "../scenario";

beforeAll(registerSkeletonContent);
function fixture(number: string) {
  const r = communityCombatFixture(number);
  const options = { baseline: createHeroSimulationBaseline(r.source.catalog.documents),
    relatedAbilities: Object.values(r.compiled.abilityDrafts), relatedChampions: r.compiled.relatedChampions };
  return { ...r, options };
}
it.each(["01", "23", "24", "28", "31"])("%s admits through actual prerequisite inputs without changing the hero", number => {
  const r = fixture(number); const before = JSON.stringify(r.compiled);
  const result = runHeroAdmissionScenarios(r.compiled.champion, r.compiled.abilityDrafts, r.options);
  expect(result.slots.every(slot => slot.status !== "rejected")).toBe(true);
  expect(result.kit.status).toBe("accepted");
  expect(result.kit.rejectedSlots).toEqual([]);
  expect(JSON.stringify(r.compiled)).toBe(before);
  if (number !== "28") {
    const slot = number === "23" ? "W" : "EX";
    const paid = result.kit.resourceCostsBySlot![slot]!;
    expect(paid.before).toBeGreaterThan(0); expect(paid.after).toBeLessThan(paid.before);
    expect(result.kit.prerequisiteActionsBySlot![slot]!.actions.length).toBeGreaterThan(0);
  }
  if (number === "31") expect(result.kit.eventCountsBySlot.EX!.evade).toBeGreaterThanOrEqual(3);
});
it("keeps the negative smoke result and deterministically earns real slide reads in admission", () => {
  const r = fixture("31");
  expect(runHeroKitScenario(r.compiled.champion, r.compiled.abilityDrafts, r.options).rejectedSlots).toContain("EX");
  const first = runHeroAdmissionScenarios(r.compiled.champion, r.compiled.abilityDrafts, r.options);
  const second = runHeroAdmissionScenarios(r.compiled.champion, r.compiled.abilityDrafts, r.options);
  expect(second.kit.digestTrail).toEqual(first.kit.digestTrail);
  expect(first.kit.resourceCostsBySlot!.EX).toMatchObject({ before: 3, after: 0 });
});
it("removing the actual evade resource producer still prevents admission", () => {
  const r = fixture("31");
  function removeHook(value: unknown): unknown {
    if (Array.isArray(value)) return value.filter(item => item?.on !== "onEvade").map(removeHook);
    return value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, removeHook(entry)])) : value;
  }
  const abilities = removeHook(r.compiled.abilityDrafts) as typeof r.compiled.abilityDrafts;
  const result = runHeroAdmissionScenarios(removeHook(r.compiled.champion) as typeof r.compiled.champion, abilities, { ...r.options, relatedAbilities: Object.values(abilities) });
  expect(result.kit.rejectedSlots).toContain("EX");
  expect(result.kit.resourceCostsBySlot!.EX).toMatchObject({ before: 0, after: 0 });
});
