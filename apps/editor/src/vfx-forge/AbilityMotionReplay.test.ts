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
