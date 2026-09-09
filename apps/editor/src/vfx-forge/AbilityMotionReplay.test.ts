import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { AbilityMotionReplay } from "./AbilityMotionReplay";
it("replays movement phases, real tether geometry, the test wall and seek reset", () => {
  const engine = new NullEngine(), scene = new Scene(engine), replay = new AbilityMotionReplay(scene);
  const emit = (motionState: string) => replay.onEvent({ type: "abilityMotion", tick: 1, data: { id: 1, motionState, x: 3, z: 4, fx: 1, fz: 0, tetherX: 8, tetherZ: 6 } });
  emit("accelerating"); const deck = scene.getMeshByName("driveDeck")!;
  expect(deck.isEnabled()).toBe(true); emit("braking"); expect(deck.isEnabled()).toBe(true);
  emit("pulling"); const rope = scene.getMeshByName("grappleTether")!;
  expect(deck.isEnabled()).toBe(false); expect(rope.isEnabled()).toBe(true);
  const positions = rope.getVerticesData(VertexBuffer.PositionKind)!; expect(positions[3]).toBe(5); expect(positions[5]).toBe(2);
  replay.onEvent({ type: "previewObstacle", tick: 1, data: { x: 7, z: 4, halfW: 0.15, halfD: 3 } });
  expect(scene.getMeshByName("previewCollisionWall")!.scaling.x).toBeCloseTo(0.3);
  replay.reset(); expect(rope.isEnabled()).toBe(false); expect(scene.getMeshByName("previewCollisionWall")!.isEnabled()).toBe(false);
  emit("collision"); expect(deck.isEnabled()).toBe(true); emit(""); expect(deck.isEnabled()).toBe(false);
  replay.dispose(); expect(scene.meshes).toHaveLength(0); scene.dispose(); engine.dispose();
});

it("keeps the board on the real scenario actor and uses the latest braking state", async () => {
  const { communityCombatFixture } = await import("../../../../packages/shared/testkit/communityCombatFixture");
  const { registerSkeletonContent } = await import("@ggd/shared/sim/content/skeleton");
  const { runHeroAbilityScenario } = await import("@ggd/shared/content/heroForge/scenario");
  const { createHeroSimulationBaseline } = await import("@ggd/shared/content/heroForge/simulationBaseline");
  const { DEFAULT_HERO_SCENARIO_SETUP } = await import("@ggd/shared/content/heroForge/scenarioSetup");
  const { scheduleSimEvents } = await import("./model");
  registerSkeletonContent(); const r = communityCombatFixture("26");
  const scenario = runHeroAbilityScenario(r.compiled.champion as never, r.compiled.abilityDrafts.E as never, {
    baseline: createHeroSimulationBaseline(r.source.catalog.documents), ticks: 110,
    relatedAbilities: Object.values(r.compiled.abilityDrafts) as never,
    setup: { ...DEFAULT_HERO_SCENARIO_SETUP, movementOrders: [
      { atSec: 0.2, kind: "move", x: -3, z: 10 }, { atSec: 1.3, kind: "move", x: -11, z: -6 }, { atSec: 2.2, kind: "hold" },
    ] },
  });
  const stop = scenario.events.find(e => e.type === "abilityMotion" && e.data.motionState === "braking")!;
  expect(stop).toBeDefined(); const engine = new NullEngine(), scene = new Scene(engine), replay = new AbilityMotionReplay(scene);
  for (const { event } of scheduleSimEvents(scenario.events, r.compiled.abilityDrafts.E.id)) {
    if (event.tick > stop.tick) break; replay.onEvent(event);
  }
  const root = scene.getTransformNodeByName("abilityMotion")!;
  expect(replay.snapshot()).toMatchObject([{ state: "braking", label: "煞車", x: stop.actorPose.caster.x, z: stop.actorPose.caster.z }]);
  expect(root.position.x).toBeCloseTo(stop.actorPose.caster.x, 5);
  expect(root.position.z).toBeCloseTo(stop.actorPose.caster.z, 5);
  expect((scene.getMaterialByName("motionStateColor") as import("@babylonjs/core/Materials/standardMaterial").StandardMaterial).emissiveColor.asArray()).toEqual([1, 0.85, 0.1]);
  replay.dispose(); scene.dispose(); engine.dispose();
});
