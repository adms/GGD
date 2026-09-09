import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ENTITY_FLAG } from "@ggd/shared/protocol/schema";
import { EntityViewRegistry, type EntityViewState } from "../EntityViewRegistry";
import { AssetManager } from "../AssetManager";
it("the shipped registry consumes motion snapshots, hides unseen enemies and retires their geometry", () => {
  const engine = new NullEngine(), scene = new Scene(engine), reg = new EntityViewRegistry(scene, new AssetManager(scene));
  const e: EntityViewState = { id: 9001, kind: 0, key: "champ.sela", seatId: 0, teamId: 1, x: 3, z: 4, fx: 1, fz: 0, alive: true, motionState: "turning", tetherX: 8, tetherZ: 6 };
  const sync = (entities: EntityViewState[]) => reg.sync({ entities, nowMs: 0, dtMs: 33.333, loadModels: false, poseFor: e => ({ x: e.x, z: e.z, fx: e.fx, fz: e.fz }) });
  sync([e]); const root = scene.getTransformNodeByName("abilityMotion")!; const deck = scene.getMeshByName("driveDeck")!;
  expect(root.position.x).toBe(3); expect(deck.isEnabled()).toBe(true);
  e.motionState = "pulling"; sync([e]); expect(deck.isEnabled()).toBe(false); expect(scene.getMeshByName("grappleTether")!.isEnabled()).toBe(true);
  e.flags = ENTITY_FLAG.INVISIBLE; sync([e]); expect(root.isEnabled()).toBe(false);
  e.flags = 0; e.motionState = ""; sync([e]); expect(root.isEnabled()).toBe(false);
  sync([]); expect(root.isDisposed()).toBe(true); reg.dispose(); scene.dispose(); engine.dispose();
});
