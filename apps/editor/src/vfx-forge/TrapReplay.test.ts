import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TrapReplay } from "./TrapReplay";
it("replays trap arming, consumption and seeking with the shipped view", () => {
  const engine = new NullEngine(), scene = new Scene(engine), replay = new TrapReplay(scene);
  const place = { type: "trapPlaced", tick: 3, data: { id: 1, x: 3, z: 4, radius: 2.5, teamId: 0, armDelayMs: 300 } };
  replay.onEvent(place, 100); const rim = scene.meshes.find(m => m.name === "trapRange")!;
  expect(rim.scaling.x).toBe(2.5); replay.update(399); expect(rim.material!.alpha).toBe(0.35);
  replay.update(400); expect(rim.material!.alpha).toBe(0.95);
  replay.onEvent({ type: "trapRemoved", tick: 20, data: { id: 1 } }, 600); expect(rim.isEnabled()).toBe(false);
  replay.reset(); replay.onEvent(place, 100); expect(rim.isEnabled()).toBe(true); expect(rim.material!.alpha).toBe(0.35);
  expect(scene.meshes).toHaveLength(2); replay.dispose(); expect(scene.meshes).toHaveLength(0); scene.dispose(); engine.dispose();
});
