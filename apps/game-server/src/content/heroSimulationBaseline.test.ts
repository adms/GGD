import { expect, it } from "vitest";
import { shippedHeroCatalog } from "../../../../packages/shared/testkit/heroPackageFixture";
import { createHeroSimulationBaseline } from "@ggd/shared/content/heroForge/simulationBaseline";
import { Configs } from "@ggd/shared/content/registries";
import { Items, Statuses, Champions } from "@ggd/shared/sim/content/registry";
import { withRegistryContext, extendRegistryContext } from "@ggd/shared/sim/content/registryContext";
import { MatchController } from "../match/MatchController";
import { THORNE } from "@ggd/shared/sim/content/skeleton";

it("loads full Main data independent of previous rooms and uses the game's combat rules", () => {
  const catalog = shippedHeroCatalog();
  const baseline = createHeroSimulationBaseline(catalog.documents);
  expect(baseline.counts.items).toBeGreaterThan(100);
  expect(baseline.counts.config).toBeGreaterThan(50);
  const controller = withRegistryContext(baseline.context, () => new MatchController("hero-baseline-proof", 17, [], undefined, undefined, undefined, baseline.arena, undefined, baseline.rules.combatEnv));
  for (const [key, value] of Object.entries(baseline.rules)) expect(controller.world[key as keyof typeof controller.world], key).toEqual(value);
  const statusId = [...catalog.documents.keys()].find((key) => key.startsWith("status-effects/"))!.split("/")[1]!;
  const originalStatus = withRegistryContext(baseline.context, () => Statuses.get(statusId));
  const polluted = extendRegistryContext(baseline.context, "another-room", () => {
    Statuses.register(statusId, { polarity: "buff", tags: [] });
    Items.clear();
    Configs.clear();
  });
  const reloaded = withRegistryContext(polluted, () => createHeroSimulationBaseline(catalog.documents));
  expect(reloaded.digest).toBe(baseline.digest);
  expect(reloaded.rules).toEqual(baseline.rules);
  expect(withRegistryContext(reloaded.context, () => Items.ids().length)).toBe(withRegistryContext(baseline.context, () => Items.ids().length));
  expect(withRegistryContext(reloaded.context, () => Statuses.get(statusId))).toEqual(originalStatus);
  expect(withRegistryContext(reloaded.context, () => Champions.get(THORNE.id).baseStats)).toEqual(withRegistryContext(baseline.context, () => Champions.get(THORNE.id).baseStats));
  const incomplete = new Map([...catalog.documents].filter(([key]) => !key.startsWith("status-effects/")));
  expect(() => createHeroSimulationBaseline(incomplete)).toThrow("缺少 status-effects");
});
