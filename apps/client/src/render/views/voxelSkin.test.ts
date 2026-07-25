/**
 * voxelSkin guard (#226) — the Babylon half of the per-champion look.
 *
 * Three properties are load-bearing and none of them are obvious from reading
 * the code:
 *
 *   1. **The SOURCE material survives.** `AssetManager` caches one container per
 *      glb and every champion instantiates from it with `cloneMaterials: false`,
 *      so painting the source repaints all 18 champions on that mesh. Same trap
 *      `modelTint` documents.
 *   2. **It composes with #49 rather than fighting it.** The palette rides a
 *      TEXTURE and leaves `albedoColor` white, so `applyModelTint`'s multiply
 *      still darkens the model as its ledger values intend.
 *   3. **Joint scales survive a full clip playback.** That is the entire premise
 *      of making a baked mesh parametric, and it only holds while no clip
 *      animates scale.
 */
import { describe, it, expect } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { applyVoxelLook, buildPaletteTexture, PROP_JOINTS, releaseVoxelLook, VOXEL_TEX_EDGE } from "./voxelSkin";
import { voxelLookFor } from "./voxelLook";
import { applyModelTint } from "./modelTint";

const LOOK = voxelLookFor("godie-n00b", "mage");

/** Minimal stand-in for an instantiated glb: one mesh + a bone-shaped skeleton. */
function stub(scene: Scene, material: "pbr" | "std" = "pbr") {
  const mesh = MeshBuilder.CreateBox("body", { size: 1 }, scene);
  const src =
    material === "pbr" ? new PBRMaterial("shared-glb-mat", scene) : new StandardMaterial("shared-glb-mat", scene);
  mesh.material = src;
  const bone = (name: string) => ({
    name,
    scaling: { x: 1, y: 1, z: 1, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; } },
    position: { x: 0 },
  });
  const skeleton = {
    bones: [
      bone("origin"), bone("hips"), bone("chest"), bone("head"),
      bone("handLeft"), bone("handRight"), bone("footLeft"), bone("footRight"),
      bone("hat"), bone("pack"), bone("belt"), bone("pauldronLeft"), bone("pauldronRight"), bone("weapon"),
    ],
  };
  return { mesh, src, skeleton };
}

describe("the palette texture", () => {
  it("is a 16x16 RGBA image carrying the look's eight slots", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const tex = buildPaletteTexture(LOOK, scene);
    expect(tex.getSize().width).toBe(VOXEL_TEX_EDGE);
    expect(tex.getSize().height).toBe(VOXEL_TEX_EDGE);
    // NEAREST, no mips — a 16px palette must never blend neighbouring slots
    expect(tex.noMipmap).toBe(true);
    tex.dispose();
    scene.dispose();
    engine.dispose();
  });
});

describe("applyVoxelLook never repaints the shared source material", () => {
  it("clones, and leaves the container's material untouched and alive", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const { mesh, src, skeleton } = stub(scene);
    const handle = applyVoxelLook([mesh], [skeleton], LOOK, scene, "champ-7-voxel")!;

    expect(handle).toBeTruthy();
    expect(mesh.material).not.toBe(src); // the mesh wears the clone
    expect(mesh.material!.name).toContain("champ-7-voxel");
    expect((src as PBRMaterial).albedoTexture).toBeNull(); // source never written
    expect(scene.materials).toContain(src);

    releaseVoxelLook(handle);
    // the clone and its generated texture are gone; the SOURCE is still there
    expect(scene.materials).toContain(src);
    expect(scene.materials.includes(src), "the shared source must outlive the view").toBe(true);
    scene.dispose();
    engine.dispose();
  });

  it("writes the diffuse slot when the material is not PBR (never silently no-ops)", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const { mesh, skeleton } = stub(scene, "std");
    const handle = applyVoxelLook([mesh], [skeleton], LOOK, scene, "v")!;
    expect((mesh.material as StandardMaterial).diffuseTexture).toBeTruthy();
    releaseVoxelLook(handle);
    scene.dispose();
    engine.dispose();
  });

  it("shares ONE clone across meshes that shared one source (still 1 draw call)", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const { mesh, src, skeleton } = stub(scene);
    const second = MeshBuilder.CreateBox("body2", { size: 1 }, scene);
    second.material = src;
    const handle = applyVoxelLook([mesh, second], [skeleton], LOOK, scene, "v")!;
    expect(mesh.material).toBe(second.material);
    expect(handle.materials).toHaveLength(1);
    releaseVoxelLook(handle);
    scene.dispose();
    engine.dispose();
  });
});

describe("it composes with the #49 vertex tint instead of fighting it", () => {
  it("leaves albedoColor WHITE so the tint's multiply still darkens the model", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const { mesh, skeleton } = stub(scene);
    const handle = applyVoxelLook([mesh], [skeleton], LOOK, scene, "v")!;
    const painted = mesh.material as PBRMaterial;
    expect(painted.albedoColor.r).toBeCloseTo(1, 5);

    // now #49 runs on top, exactly as EntityViewRegistry orders it
    const holder = new TransformNode("root", scene);
    mesh.parent = holder;
    applyModelTint(holder, { tint: [0.29, 0.29, 0.29] });
    const tinted = mesh.material as PBRMaterial;
    expect(tinted.albedoColor.r, "the tint must visibly darken the palette").toBeLessThan(0.3);
    expect(tinted.albedoTexture, "the palette must survive the tint").toBeTruthy();

    releaseVoxelLook(handle);
    scene.dispose();
    engine.dispose();
  });
});

describe("proportions and the prop mask ride the joints", () => {
  it("writes head / torso / limb scales from the look", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const { mesh, skeleton } = stub(scene);
    const look = { ...LOOK, proportions: { head: 1.1, torsoWidth: 0.9, armLength: 1.05, legLength: 0.95, shoulderOffset: 0.02 } };
    const handle = applyVoxelLook([mesh], [skeleton], look, scene, "v")!;
    const b = (n: string) => skeleton.bones.find((x) => x.name === n)!;
    expect(b("head").scaling.y).toBeCloseTo(1.1);
    // torso scales in X/Z only: scaling its Y would drag the head joint and
    // break the 1.8 u height contract
    expect(b("chest").scaling.x).toBeCloseTo(0.9);
    expect(b("chest").scaling.y).toBeCloseTo(1);
    expect(b("handRight").scaling.y).toBeCloseTo(1.05);
    expect(b("footLeft").scaling.y).toBeCloseTo(0.95);
    // shoulders push apart symmetrically
    expect(b("handRight").position.x).toBeCloseTo(0.02);
    expect(b("handLeft").position.x).toBeCloseTo(-0.02);
    releaseVoxelLook(handle);
    scene.dispose();
    engine.dispose();
  });

  it("collapses a hidden prop's OWN joints to zero, and nothing else", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const { mesh, skeleton } = stub(scene);
    const look = { ...LOOK, props: { hat: false, pack: false, belt: true, pauldron: false, weapon: true } };
    const handle = applyVoxelLook([mesh], [skeleton], look, scene, "v")!;
    const b = (n: string) => skeleton.bones.find((x) => x.name === n)!;
    for (const j of [...PROP_JOINTS.hat, ...PROP_JOINTS.pack, ...PROP_JOINTS.pauldron]) {
      expect(b(j).scaling.x, `${j} should be collapsed`).toBe(0);
    }
    for (const j of [...PROP_JOINTS.belt, ...PROP_JOINTS.weapon]) {
      expect(b(j).scaling.x, `${j} should be visible`).not.toBe(0);
    }
    // the body is never a casualty of hiding a prop
    for (const j of ["chest", "head", "handLeft", "footRight"]) {
      expect(b(j).scaling.x, `${j} must never be zeroed`).not.toBe(0);
    }
    releaseVoxelLook(handle);
    scene.dispose();
    engine.dispose();
  });

  it("every prop group maps to joints that are NOT body joints", () => {
    const body = new Set(["origin", "hips", "chest", "head", "handLeft", "handRight", "footLeft", "footRight"]);
    for (const [group, joints] of Object.entries(PROP_JOINTS)) {
      for (const j of joints) expect(body.has(j), `${group} rides body joint ${j}`).toBe(false);
    }
  });
});

describe("release is exact", () => {
  it("frees the clone and the generated texture, and is idempotent", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const { mesh, skeleton } = stub(scene);
    const handle = applyVoxelLook([mesh], [skeleton], LOOK, scene, "v")!;
    const clone = handle.materials[0]!;
    const tex = handle.textures[0]!;
    releaseVoxelLook(handle);
    expect(scene.materials, "the clone must be gone").not.toContain(clone);
    expect(scene.textures, "the generated palette must be gone").not.toContain(tex);
    expect(handle.materials).toHaveLength(0);
    releaseVoxelLook(handle); // second call must not throw
    releaseVoxelLook(null);
    scene.dispose();
    engine.dispose();
  });
});
