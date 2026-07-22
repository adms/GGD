/**
 * editor-07 (editor-model-inspector): the model inspector's two load-bearing
 * mechanics — clipMap resolution against the GLB's AnimationGroup list (KayKit
 * style names) and the collision-radius hitbox overlay — exercised for real
 * under NullEngine.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { cover } from "@ggd/shared/testkit/cover";
import { zModelDoc, type ModelDoc } from "@ggd/shared/content";
import { resolveClip, clipMapStatus, CLIP_STATES } from "./clips";
import {
  createCollisionCylinder,
  setCollisionRadius,
  createGroundGrid,
  COLLISION_CYLINDER_HEIGHT,
} from "./stage";

/** stub AnimationGroup list — names as they appear in the KayKit champion GLBs */
const KAYKIT_CLIPS = [
  "Idle",
  "Running_A",
  "Spellcast_Shoot",
  "Spellcast_Long",
  "1H_Melee_Attack_Slice_Diagonal",
  "2H_Melee_Attack_Spin",
  "Hit_A",
  "Death_A",
].map((name) => ({ name }));

const SELA: ModelDoc = zModelDoc.parse({
  id: "champ.sela",
  schema: "model@1",
  glbPath: "assets/models/champions/mage.glb",
  scale: 0.55,
  collisionRadius: 0.6,
  clipMap: {
    idle: "Idle",
    run: "Running_A",
    attack: "Spellcast_Shoot",
    cast: "Spellcast_Long",
    hurt: "Hit_A",
    death: "Death_A",
  },
});

describe("clipMap resolution (stub AnimationGroup list)", () => {
  it("resolves exact names, case-insensitive fallback, null when missing", () => {
    cover("editor-model-inspector");
    expect(resolveClip(KAYKIT_CLIPS, "Idle")?.name).toBe("Idle");
    expect(resolveClip(KAYKIT_CLIPS, "1H_Melee_Attack_Slice_Diagonal")?.name).toBe(
      "1H_Melee_Attack_Slice_Diagonal",
    );
    // author typo forgiveness: case-insensitive fallback
    expect(resolveClip(KAYKIT_CLIPS, "idle")?.name).toBe("Idle");
    expect(resolveClip(KAYKIT_CLIPS, "running_a")?.name).toBe("Running_A");
    // genuinely missing -> null (inspector marks the state red)
    expect(resolveClip(KAYKIT_CLIPS, "Walk")).toBeNull();
  });

  it("clipMapStatus reports every logical state and flags mapping mistakes", () => {
    const ok = clipMapStatus(SELA.clipMap, KAYKIT_CLIPS);
    expect(ok.map((e) => e.state)).toEqual([...CLIP_STATES]);
    expect(ok.every((e) => e.found)).toBe(true);

    const broken = clipMapStatus({ ...SELA.clipMap, cast: "Spellcast_Loong" }, KAYKIT_CLIPS);
    const cast = broken.find((e) => e.state === "cast")!;
    expect(cast.found).toBe(false);
    expect(cast.clip).toBe("Spellcast_Loong");
    expect(broken.filter((e) => !e.found)).toHaveLength(1);
  });
});

describe("hitbox overlay (NullEngine)", () => {
  let engine: NullEngine;
  let scene: Scene;

  beforeEach(() => {
    engine = new NullEngine();
    scene = new Scene(engine);
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it("collision cylinder is unit-radius scaled to collisionRadius, wireframe, grounded", () => {
    const cyl = createCollisionCylinder(scene, SELA.collisionRadius);
    // x/z scaling IS the radius (live edits are a scaling write, not a rebuild)
    expect(cyl.scaling.x).toBe(0.6);
    expect(cyl.scaling.z).toBe(0.6);
    expect(cyl.scaling.y).toBe(1);
    expect(cyl.position.y).toBeCloseTo(COLLISION_CYLINDER_HEIGHT / 2, 10);
    expect((cyl.material as { wireframe?: boolean }).wireframe).toBe(true);

    setCollisionRadius(cyl, 1.25);
    expect(cyl.scaling.x).toBe(1.25);
    expect(cyl.scaling.z).toBe(1.25);

    // unit cylinder: local bounds are radius 1 wide; world = scaled
    cyl.computeWorldMatrix(true);
    const bb = cyl.getBoundingInfo().boundingBox;
    expect(bb.maximumWorld.x).toBeCloseTo(1.25, 5);
    expect(bb.minimumWorld.x).toBeCloseTo(-1.25, 5);
  });

  it("ground grid builds a line system in the scene", () => {
    const before = scene.meshes.length;
    const grid = createGroundGrid(scene, 8, 1);
    expect(scene.meshes.length).toBe(before + 1);
    expect(grid.isPickable).toBe(false);
  });
});
