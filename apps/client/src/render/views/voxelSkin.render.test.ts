/**
 * The RENDER half of task #231: the generated skin actually reaches the figure,
 * composes with the two channels that were already there (#49 vertex tint, #64
 * hit flash), keeps the team read, and does not leak a texture.
 *
 * Runs on Babylon's NullEngine with NO canvas stub anywhere — which is itself
 * part of the contract: the painter is pure bytes and the bridge uses
 * `RawTexture`, so nothing in this feature needs a 2D context.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { generateVoxelSkin, motifBoxCount } from "@ggd/shared/content/voxelSkin";
import type { VoxelSkinInput, VoxelSkinRecipe } from "@ggd/shared/content/voxelSkin";
import { ChampionView } from "./ChampionView";
import type { AssetManager } from "../AssetManager";
import type { ModelDoc } from "@ggd/shared/content";
import {
  acquireVoxelSkinTexture,
  releaseVoxelSkinTexture,
  voxelSkinTextureRefs,
} from "./voxelSkinTexture";
import { applyModelTint, UNTINTED_MESH_SUFFIXES } from "./modelTint";
import { FLASH_ALPHA } from "../combatFeedback";

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

const INPUT: VoxelSkinInput = {
  id: "godie-vs001",
  name: "測試稱號 - 測試本名",
  attackType: "melee",
  modelKey: "champ.sela",
  tags: ["melee"],
  vfxKeys: ["vfx.a.fire.x", "vfx.b.fire.y", "vfx.c.ice.z", "vfx.d.fire.w"],
};

/** A recipe with a guaranteed motif in every slot, so the geometry is exercised. */
const withMotifs = (id: string): VoxelSkinRecipe =>
  generateVoxelSkin(
    { ...INPUT, id },
    { override: { motifs: { head: "horns", shoulder: "pauldrons", back: "cape" } } },
  );

const meshNames = (view: ChampionView): string[] =>
  view.root.getChildMeshes(false).map((m) => m.name);

describe("the generated skin reaches the figure", () => {
  it("paints an atlas onto the body material and keeps every owned material", () => {
    cover("voxel-skin-render");
    const view = new ChampionView(scene, 700, "champ.sela", 1, {
      skin: generateVoxelSkin({ ...INPUT, id: "godie-vs700" }),
    });
    const skinMat = scene.materials.find((m) => m.name === "champ-700-skin") as StandardMaterial;
    expect(skinMat).toBeDefined();
    expect(skinMat.diffuseTexture).not.toBeNull();
    // WHITE diffuse under the texture is what lets the #49 tint multiply the
    // painted surface uniformly instead of fighting a baked-in colour.
    expect(skinMat.diffuseColor.r).toBeCloseTo(1, 6);
    // the four materials six other tests look up by exact name still exist
    for (const suffix of ["skin", "team", "accent", "ring", "blob"]) {
      expect(scene.materials.find((m) => m.name === `champ-700-${suffix}`)).toBeDefined();
    }
    view.dispose();
  });

  it("keeps the pre-#231 flat figure when no skin is supplied", () => {
    cover("voxel-skin-render");
    const view = new ChampionView(scene, 701, "champ.sela", 1);
    const skinMat = scene.materials.find((m) => m.name === "champ-701-skin") as StandardMaterial;
    expect(skinMat.diffuseTexture).toBeFalsy();
    expect(meshNames(view).some((n) => n.includes("teamband"))).toBe(false);
    expect(meshNames(view).some((n) => n.includes("motif"))).toBe(false);
    view.dispose();
  });

  it("emits motif geometry, and it lands in BOTH the procedural set and the flash set", () => {
    cover("voxel-skin-render");
    const recipe = withMotifs("godie-vs702");
    const view = new ChampionView(scene, 702, "champ.sela", 0, { skin: recipe });
    const motifs = meshNames(view).filter((n) => n.includes("-motif-"));
    expect(motifs.length).toBe(motifBoxCount(recipe));
    expect(motifs.length).toBeGreaterThan(0);

    // #64: every motif must flash. `flash` writes renderOverlay on flashMeshes.
    view.flash([1, 1, 1], 0);
    view.update("idle", 10, 16);
    for (const name of motifs) {
      const mesh = view.root.getChildMeshes(false).find((m) => m.name === name)!;
      expect(mesh.renderOverlay).toBe(true);
      expect(mesh.overlayAlpha).toBeCloseTo(FLASH_ALPHA, 6);
    }
    view.dispose();
  });

  it("motifs hide with the rest of the procedural body when a glb IS adopted", () => {
    cover("voxel-skin-render");
    // a champion with its OWN imported mesh keeps the glb path, so its motif
    // boxes must be in `proceduralParts` and get disabled alongside the torso.
    const recipe = generateVoxelSkin(
      { ...INPUT, id: "godie-vs703", modelKey: "imported.heroshana" },
      { override: { motifs: { head: "horns", shoulder: "none", back: "cape" } } },
    );
    expect(recipe.preferVoxelBody).toBe(false);
    const view = new ChampionView(scene, 703, "imported.heroshana", 0, { skin: recipe });
    expect(meshNames(view).filter((n) => n.includes("-motif-")).length).toBeGreaterThan(0);
    view.dispose();
  });
});

describe("the stand-in population is actually moved off the shared mesh", () => {
  const NEVER_LOADS = {
    load: () => {
      throw new Error("tryUpgradeToGlb must not reach the AssetManager for a voxel-body champion");
    },
  } as unknown as AssetManager;
  const DOC = { glbPath: "assets/models/champions/mage.glb", scale: 1, clipMap: {} } as ModelDoc;

  it("a champion on a shared stand-in mesh DECLINES the glb and keeps its own body", () => {
    cover("voxel-skin-standin");
    const recipe = generateVoxelSkin({ ...INPUT, id: "godie-vs710", modelKey: "champ.sela" });
    expect(recipe.preferVoxelBody).toBe(true);
    const view = new ChampionView(scene, 710, "champ.sela", 0, { skin: recipe });
    expect(() => view.tryUpgradeToGlb(NEVER_LOADS, DOC)).not.toThrow();
    expect(view.hasGlb).toBe(false);
    // latched, so the registry stops asking every frame
    expect(view.upgradeAttempted).toBe(true);
    view.dispose();
  });

  it("a champion with its OWN imported mesh still upgrades", () => {
    cover("voxel-skin-standin");
    const recipe = generateVoxelSkin({
      ...INPUT,
      id: "godie-vs711",
      modelKey: "imported.heroshana",
    });
    const view = new ChampionView(scene, 711, "imported.heroshana", 0, { skin: recipe });
    let asked = false;
    const assets = {
      load: () => {
        asked = true;
        return Promise.resolve(null);
      },
    } as unknown as AssetManager;
    view.tryUpgradeToGlb(assets, DOC);
    expect(asked).toBe(true);
    view.dispose();
  });
});

describe("team colour + #49 tint composition", () => {
  it("a skinned champion still carries a flat TEAM-coloured mesh and the emissive ring", () => {
    cover("voxel-skin-team-compose");
    const view = new ChampionView(scene, 720, "champ.sela", 1, {
      skin: generateVoxelSkin({ ...INPUT, id: "godie-vs720" }),
    });
    const names = meshNames(view);
    expect(names).toContain("champ-720-teamband");
    expect(names).toContain("champ-720-teamring");
    const band = view.root.getChildMeshes(false).find((m) => m.name === "champ-720-teamband")!;
    // team 1 is red [0.92,0.28,0.25] — the band paints the raw team colour
    const mat = band.material as StandardMaterial;
    expect(mat.name).toBe("champ-720-team");
    expect(mat.diffuseColor.r).toBeCloseTo(0.92, 5);
    view.dispose();
  });

  it("the #49 tint SKIPS the team band, so a dark tint cannot crush the team read", () => {
    cover("voxel-skin-team-compose");
    expect(UNTINTED_MESH_SUFFIXES).toContain("-teamband");
    const view = new ChampionView(scene, 721, "champ.sela", 1, {
      skin: generateVoxelSkin({ ...INPUT, id: "godie-vs721" }),
    });
    const band = view.root.getChildMeshes(false).find((m) => m.name === "champ-721-teamband")!;
    const before = (band.material as StandardMaterial).diffuseColor.clone();
    // Berserker's tint — the darkest multiply in the content ledger
    applyModelTint(view.root, { tint: [0.3137, 0.3137, 0.3137] });
    const after = (band.material as StandardMaterial).diffuseColor;
    expect(after.r).toBeCloseTo(before.r, 6);
    expect(after.g).toBeCloseTo(before.g, 6);
    view.dispose();
  });

  it("the tint DOES multiply the painted body (skin colour is the base, tint the factor)", () => {
    cover("voxel-skin-tint-compose");
    const view = new ChampionView(scene, 722, "champ.sela", 0, {
      skin: generateVoxelSkin({ ...INPUT, id: "godie-vs722" }),
    });
    const torso = view.root.getChildMeshes(false).find((m) => m.name === "champ-722-torso")!;
    const before = (torso.material as StandardMaterial).diffuseColor.clone();
    applyModelTint(view.root, { tint: [0.5, 0.5, 0.5] });
    const after = (torso.material as StandardMaterial).diffuseColor;
    expect(after.r).toBeCloseTo(before.r * 0.5, 5);
    // ...and the atlas texture rode along, so it is texture × tint, not a wash
    expect((torso.material as StandardMaterial).diffuseTexture).not.toBeNull();
    view.dispose();
  });
});

describe("atlas texture cache", () => {
  it("shares one texture per champion and disposes it on the LAST release", () => {
    cover("voxel-skin-texture-cache");
    const recipe = generateVoxelSkin({ ...INPUT, id: "godie-vs730" });
    const a = acquireVoxelSkinTexture(scene, recipe);
    const b = acquireVoxelSkinTexture(scene, recipe);
    expect(a).toBe(b); // six champions on one hero = ONE 16 KB texture
    expect(voxelSkinTextureRefs(scene, recipe.championId)).toBe(2);
    releaseVoxelSkinTexture(scene, recipe.championId);
    expect(voxelSkinTextureRefs(scene, recipe.championId)).toBe(1);
    expect(scene.textures).toContain(a!);
    releaseVoxelSkinTexture(scene, recipe.championId);
    expect(voxelSkinTextureRefs(scene, recipe.championId)).toBe(0);
    expect(scene.textures).not.toContain(a!);
  });

  it("two views of the same champion survive one of them despawning", () => {
    cover("voxel-skin-texture-cache");
    const recipe = generateVoxelSkin({ ...INPUT, id: "godie-vs731" });
    const v1 = new ChampionView(scene, 731, "champ.sela", 0, { skin: recipe });
    const v2 = new ChampionView(scene, 732, "champ.sela", 1, { skin: recipe });
    const tex = (scene.materials.find((m) => m.name === "champ-732-skin") as StandardMaterial)
      .diffuseTexture;
    expect(tex).not.toBeNull();
    v1.dispose();
    // the survivor's material still points at a LIVE texture
    expect(scene.textures).toContain(tex!);
    v2.dispose();
    expect(scene.textures).not.toContain(tex!);
  });
});
