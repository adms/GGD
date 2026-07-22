/**
 * client-preview: the champ-select / store 3D preview (task #129). A champion's
 * .glb must actually MOUNT on the stage and be FRAMED — the bug was an off-origin
 * imported model (e.g. 皮卡丘 `imported.picacugy`, body ~1 u off the origin)
 * falling outside a camera that hard-targeted (0, 1, 0), so the box rendered
 * blank/black. Runs on Babylon's NullEngine via the Scene-injection ctor path.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import type { AssetManager } from "./AssetManager";
import type { ModelDoc } from "@ggd/shared/content";
import { StorePreview, computePreviewFraming } from "./StorePreview";

let engine: NullEngine;
let scene: Scene;

beforeAll(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
});
afterAll(() => {
  scene.dispose();
  engine.dispose();
});

/**
 * A stand-in for the AssetManager's cached container: one box whose bounding box
 * is OFFSET from the origin (like an imported w3x champion), so the framing math
 * is actually exercised. Native glb path (yaw offset 0) keeps geometry predictable.
 */
function makeAssets(center: { x: number; y: number; z: number }): AssetManager {
  const container = new AssetContainer(scene);
  const box = MeshBuilder.CreateBox("body", { size: 1 }, scene);
  box.position.set(center.x, center.y, center.z);
  container.meshes.push(box);
  container.rootNodes.push(box);
  container.removeAllFromScene();
  return { load: () => Promise.resolve(container) } as unknown as AssetManager;
}

const DOC = (id: string): ModelDoc =>
  ({
    id,
    schema: "model@1",
    glbPath: "assets/models/champions/mage.glb", // native → no yaw rotation
    scale: 1,
    collisionRadius: 0.5,
    clipMap: { idle: "Idle", run: "Walk", attack: "Atk", cast: "Cast", hurt: "Hit", death: "Die" },
  }) as ModelDoc;

describe("StorePreview mounts + frames a champion glb (client-preview)", () => {
  it("mounts the glb on the stage (client-preview-mounts)", async () => {
    cover("client-preview-mounts");
    const preview = new StorePreview(scene, makeAssets({ x: 0, y: 1, z: 0 }));
    expect(preview.modelNode).toBeNull();
    await preview.show(DOC("champ.centered"));
    // the model is actually mounted, with the glb's meshes under its root
    expect(preview.modelNode).not.toBeNull();
    expect(preview.modelNode!.getChildMeshes(false).length).toBeGreaterThan(0);
    preview.dispose();
  });

  it("frames + grounds an OFF-ORIGIN imported-style model (client-preview-frames)", async () => {
    cover("client-preview-frames");
    // body offset +2 in x and floating (min.y = 1.5): the exact shape that made
    // the fixed (0,1,0) camera render blank for 皮卡丘.
    const preview = new StorePreview(scene, makeAssets({ x: 2, y: 2, z: 0 }));
    await preview.show(DOC("champ.offset"));
    const root = preview.modelNode!;
    root.computeWorldMatrix(true);
    const { min, max } = root.getHierarchyBoundingVectors(true);

    // grounded: the model's lowest point now sits on the podium (y ≈ 0)
    expect(min.y).toBeCloseTo(0, 4);
    // camera is aimed at the model, NOT the old hard-coded (0,1,0)
    const cx = (min.x + max.x) / 2;
    expect(preview.camera.target.x).toBeCloseTo(cx, 3);
    expect(preview.camera.target.x).not.toBeCloseTo(0, 1);
    // a finite, positive orbit radius within the (rescaled) limits
    expect(preview.camera.radius).toBeGreaterThan(0);
    expect(Number.isFinite(preview.camera.radius)).toBe(true);
    expect(preview.camera.radius).toBeLessThanOrEqual(preview.camera.upperRadiusLimit ?? Infinity);
    preview.dispose();
  });

  it("re-frames when a different champion is shown (client-preview-frames)", async () => {
    cover("client-preview-frames");
    const preview = new StorePreview(scene, makeAssets({ x: -1.5, y: 0.6, z: 0 }));
    await preview.show(DOC("champ.a"));
    const targetA = preview.camera.target.clone();
    // swap in a container whose model sits elsewhere → target must move
    (preview as unknown as { assets: AssetManager }).assets = makeAssets({ x: 3, y: 2.5, z: 0 });
    await preview.show(DOC("champ.b"));
    expect(preview.camera.target.x).not.toBeCloseTo(targetA.x, 1);
    preview.dispose();
  });
});

describe("computePreviewFraming (client-preview-frames)", () => {
  it("centres the target, grounds the feet, fits with headroom", () => {
    cover("client-preview-frames");
    // picacugy-like world bbox
    const f = computePreviewFraming({ x: -2, y: -0.58, z: -0.61 }, { x: 0.47, y: 1.71, z: 0.61 }, 0.8);
    expect(f.groundShiftY).toBeCloseTo(0.58, 4); // lift feet from -0.58 to 0
    expect(f.targetX).toBeCloseTo((-2 + 0.47) / 2, 4);
    expect(f.targetY).toBeCloseTo((1.71 - -0.58) / 2, 4); // half height above ground
    expect(f.radius).toBeGreaterThan(0);
    expect(Number.isFinite(f.radius)).toBe(true);
  });

  it("never returns a zero/negative radius for a degenerate box", () => {
    cover("client-preview-frames");
    const f = computePreviewFraming({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 0.8);
    expect(f.radius).toBeGreaterThan(0);
  });
});
