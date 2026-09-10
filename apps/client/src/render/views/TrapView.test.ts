import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TrapView } from "./TrapView";
import { EntityViewRegistry, type EntityViewState } from "../EntityViewRegistry";
import { AssetManager } from "../AssetManager";
import { ENTITY_KIND } from "@ggd/shared/protocol/schema";
import { hasOverheadBar, KIND_TRAP } from "../overheadAnchors";
let engine: NullEngine, scene: Scene;
beforeEach(() => { engine = new NullEngine(); scene = new Scene(engine); });
afterEach(() => { scene.dispose(); engine.dispose(); });
const entity = (id: number, radius = 2.5, armed = false): EntityViewState => ({ id, kind: ENTITY_KIND.TRAP, seatId: -1, key: "prop.trap", teamId: 0,
  x: 4, z: 3, fx: 1, fz: 0, alive: true, trap: { radius, teamId: 0, armed } });
describe("single-use trap presentation", () => {
  it("paints authoritative radius, arming and team without a targetable body", () => {
    const v = new TrapView(scene); v.activate(2.5, 0, false); v.setPose(4, 3);
    const rim = v.root.getChildMeshes().find(m => m.name === "trapRange")!;
    expect(rim.scaling.x).toBe(2.5); expect(rim.material!.alpha).toBe(0.35);
    expect(v.root.getChildMeshes().every(m => !m.isPickable)).toBe(true);
    v.activate(4, 1, true); expect(rim.scaling.x).toBe(4); expect(rim.material!.alpha).toBe(0.95);
    expect(v.root.position.x).toBe(4); expect(v.root.position.z).toBe(3);
    v.dispose(); expect(scene.meshes).toHaveLength(0);
  });
  it("registry removes consumed traps immediately and reuses them with fresh state", () => {
    const reg = new EntityViewRegistry(scene, new AssetManager(scene));
    const sync = (entities: EntityViewState[]) => reg.sync({ entities, nowMs: 0, dtMs: 33.333, poseFor: e => ({ x: e.x, z: e.z, fx: e.fx, fz: e.fz }), content: {} } as Parameters<EntityViewRegistry["sync"]>[0]);
    sync([entity(10)]); expect(reg.getChampionView(10)).toBeUndefined(); expect(hasOverheadBar(KIND_TRAP)).toBe(false); expect(KIND_TRAP).toBe(ENTITY_KIND.TRAP);
    const root = scene.transformNodes.find(n => n.name === "trap")!; const meshes = scene.meshes.length;
    sync([]); expect(root.isEnabled()).toBe(false);
    sync([entity(11, 4, true)]); expect(root.isEnabled()).toBe(true); expect(scene.meshes.length).toBe(meshes);
    expect(root.getChildMeshes().find(m => m.name === "trapRange")!.scaling.x).toBe(4);
    reg.dispose(); expect(root.isDisposed()).toBe(true);
  });
});
