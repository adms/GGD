import { beforeAll, expect, it } from "vitest";
import { communityCombatFixture } from "../../../../testkit/communityCombatFixture";
import { registerSkeletonContent } from "../../../sim/content/skeleton";
import { runHeroAbilityScenario } from "../scenario";
import { createHeroSimulationBaseline } from "../simulationBaseline";
import { DEFAULT_HERO_SCENARIO_SETUP } from "../scenarioSetup";
import type { AbilityDef, ChampionDef } from "../../../sim/content/defs";

beforeAll(registerSkeletonContent);
function fixture() {
  const r = communityCombatFixture("28");
  const champion = r.compiled.champion as unknown as ChampionDef;
  const abilities = r.compiled.abilityDrafts as unknown as Record<"PASSIVE" | "Q" | "W" | "E" | "R" | "EX", AbilityDef>;
  const setup = { ...DEFAULT_HERO_SCENARIO_SETUP, opponentPreparation: "idle" as const,
    caster: { ...DEFAULT_HERO_SCENARIO_SETUP.caster, x: -1 }, target: { ...DEFAULT_HERO_SCENARIO_SETUP.target, x: 1.3, hp: 100 } };
  const options = { baseline: createHeroSimulationBaseline(r.source.catalog.documents), relatedAbilities: Object.values(abilities), ticks: 100, setup };
  return { ...r, champion, abilities, options };
}
it.each(["Q", "R"] as const)("Editor EX follows a real %s hit without inventing a target mark", slot => {
  const r = fixture(); const original = JSON.stringify(r.project);
  const result = runHeroAbilityScenario(r.champion, r.abilities.EX, { ...r.options,
    setup: { ...r.options.setup, priorCast: { slot, waitSec: 1 } } });
  expect(result.status).toBe("accepted"); expect(result.resourceCost).toMatchObject({ subject: "target", before: 1, after: 0 });
  const cast = result.events.findIndex(e => e.type === "abilityCast" && e.data.abilityId === r.abilities.EX.id);
  expect(result.events.slice(0, cast).some(e => e.type === "damage" && e.data.origin === `ability:${r.abilities[slot].id}` && Number(e.data.amount) > 0)).toBe(true);
  expect(JSON.stringify(r.project)).toBe(original);
});
it("an empty preview and a harmless approach step cannot earn pursuit", () => {
  const r = fixture();
  for (const priorCast of [undefined, { slot: "E" as const, waitSec: 1 }]) {
    const result = runHeroAbilityScenario(r.champion, r.abilities.EX, { ...r.options, setup: { ...r.options.setup, priorCast } });
    expect(result.rejectionReason).toBe("target-condition");
    expect(result.resourceCost).toMatchObject({ before: 0, after: 0 });
  }
});
