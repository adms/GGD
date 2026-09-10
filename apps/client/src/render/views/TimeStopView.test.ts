import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TimeStopView } from "./TimeStopView";
import { EntityViewRegistry, type EntityViewState } from "../EntityViewRegistry";
import { AssetManager } from "../AssetManager";
import { ENTITY_FLAG, ENTITY_KIND } from "@ggd/shared/protocol/schema";
import { hasOverheadBar, KIND_TIME_STOP } from "../overheadAnchors";

let engine: NullEngine, scene: Scene;
beforeEach(() => { engine = new NullEngine(); scene = new Scene(engine); });
afterEach(() => { scene.dispose(); engine.dispose(); });
const field = (id: number, radius = 6): EntityViewState => ({ id, kind: ENTITY_KIND.TIME_STOP, seatId: -1, key: "prop.time-stop", teamId: 0,
  x: 4, z: 3, fx: 1, fz: 0, alive: true, timeStop: { radius, teamId: 0, ticks: 36 } });
function registry() {
  const reg = new EntityViewRegistry(scene, new AssetManager(scene));
  const sync = (entities: EntityViewState[], nowMs = 0, dtMs = 33.333) => reg.sync({ entities, nowMs, dtMs,
    poseFor: e => ({ x: e.x, z: e.z, fx: e.fx, fz: e.fz }), content: {} } as Parameters<EntityViewRegistry["sync"]>[0]);
  return { reg, sync };
}
describe("authoritative time stop presentation", () => {
  it("draws the exact local radius as non-targetable ground geometry", () => {
    const v = new TimeStopView(scene); v.activate(6); v.setPose(4, 3);
    expect(v.root.getChildMeshes().find(m => m.name === "timeStopBoundary")!.scaling.x).toBe(6);
    expect(v.root.getChildMeshes().every(m => !m.isPickable)).toBe(true);
    expect(v.root.position.x).toBe(4); v.dispose(); expect(scene.meshes).toHaveLength(0);
  });
  it("removes an expired field and reuses its view without stale radius or champion geometry", () => {
    const { reg, sync } = registry(); sync([field(20)]);
    expect(reg.getChampionView(20)).toBeUndefined(); expect(KIND_TIME_STOP).toBe(ENTITY_KIND.TIME_STOP);
    expect(hasOverheadBar(KIND_TIME_STOP)).toBe(false);
    const root = scene.transformNodes.find(n => n.name === "timeStop")!, count = scene.meshes.length;
    sync([]); expect(root.isEnabled()).toBe(false);
    sync([field(21, 3)]); expect(root.isEnabled()).toBe(true); expect(scene.meshes.length).toBe(count);
    expect(root.getChildMeshes().find(m => m.name === "timeStopBoundary")!.scaling.x).toBe(3);
    reg.dispose(); expect(root.isDisposed()).toBe(true);
  });
  it("a stopped champion keeps its active animation window instead of expiring into idle", () => {
    const { reg, sync } = registry();
    const hero: EntityViewState = { id: 1, kind: ENTITY_KIND.CHAMPION, seatId: 0, key: "fixture", teamId: 0,
      x: 0, z: 0, fx: 1, fz: 0, alive: true, flags: 0 };
    sync([hero]); const view = reg.getChampionView(1)!; view.anim.trigger("cast", 0, 500);
    hero.flags = ENTITY_FLAG.TIME_STOPPED;
    for (let i = 1; i <= 10; i++) sync([hero], i * 100, 100);
    expect(view.anim.state).toBe("cast");
    hero.flags = 0; sync([hero], 1100, 100); expect(view.anim.state).toBe("cast");
    sync([hero], 1600, 500); expect(view.anim.state).toBe("idle"); reg.dispose();
  });
});
