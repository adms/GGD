import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { communityCombatFixture } from "../../../../packages/shared/testkit/communityCombatFixture";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { runHeroAbilityScenario } from "@ggd/shared/content/heroForge/scenario";
import { createHeroSimulationBaseline } from "@ggd/shared/content/heroForge/simulationBaseline";
import { TimeStopReplay } from "./TimeStopReplay";
import { scheduleSimEvents } from "./model";
it("real Jotaro R events render the shipped boundary and clear it on expiry and seeking", () => {
  registerSkeletonContent(); const r = communityCombatFixture("04");
  const scenario = runHeroAbilityScenario(r.compiled.champion as never, r.compiled.abilityDrafts.R as never, {
    baseline: createHeroSimulationBaseline(r.source.catalog.documents), relatedAbilities: Object.values(r.compiled.abilityDrafts) as never, ticks: 70 });
  const schedule = scheduleSimEvents(scenario.events, r.compiled.abilityDrafts.R.id);
  const engine = new NullEngine(), scene = new Scene(engine), replay = new TimeStopReplay(scene);
  const start = schedule.find(x => x.event.type === "timeStopStart")!, end = schedule.find(x => x.event.type === "timeStopEnd")!;
  expect(start.actorPose?.timeStopped?.target).toBe(true); expect(end.actorPose?.timeStopped?.target).toBe(false);
  replay.onEvent(start.event); const ring = scene.getMeshByName("timeStopBoundary")!;
  expect(ring.isEnabled()).toBe(true); expect(ring.scaling.x).toBe(6);
  expect((ring.parent as import("@babylonjs/core/Meshes/transformNode").TransformNode).position.x).toBe(start.event.data.x);
  replay.onEvent(end.event); expect(ring.isEnabled()).toBe(false);
  replay.onEvent(start.event); expect(ring.isEnabled()).toBe(true); expect(scene.meshes).toHaveLength(2);
  replay.reset(); expect(ring.isEnabled()).toBe(false); replay.dispose(); expect(scene.meshes).toHaveLength(0); scene.dispose(); engine.dispose();
});
