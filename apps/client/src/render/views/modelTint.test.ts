/**
 * tint-render-apply (vtint-06) — RENDERER HALF of the w3x vertex-colour port
 * (task #49). The content half lives in shared/content/vertexTint.test.ts;
 * this pins that the ported `tint` actually reaches the pixels:
 *
 *   • `tint` is a per-material MULTIPLY on diffuse/albedo, not an overlay;
 *   • it lands on the procedural voxel figure AND on late-arriving .glb meshes;
 *   • `alpha < 1` puts the material into alpha blending;
 *   • it never fights the hit flash (#3) — different channels, both survive;
 *   • an absent/neutral tint leaves every material byte-identical;
 *   • the team-colour ring and blob shadow are NEVER tinted;
 *   • shared .glb materials are cloned, so one champion cannot repaint another;
 *   • skin `tint` overrides champion `tint`.
 *
 * Runs on Babylon's NullEngine (headless).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import {
  applyModelTint,
  releaseModelTint,
  resolveModelTint,
  isNeutralTint,
  isIdentityTint,
  tintedMeshes,
  UNTINTED_MESH_SUFFIXES,
} from "./modelTint";
import { ChampionView, TEAM_COLORS } from "./ChampionView";
import { FLASH_ALPHA } from "../combatFeedback";
import { EntityViewRegistry, type EntityViewState } from "../EntityViewRegistry";
import { AssetManager } from "../AssetManager";

/** 海克力斯 Berserker's ported w3u colour: 80/255 on every channel. */
const BERSERKER_TINT = [0.3137, 0.3137, 0.3137] as const;

/**
 * WC3 multiplies the DISPLAYED (gamma) texel, so a PBR material — whose
 * albedoColor multiplies in LINEAR light before the frame is gamma-encoded —
 * has to carry `tint^2.2` to land on the same pixel. StandardMaterial is
 * already a gamma-space pipeline and takes the value verbatim. Measured live
 * on Berserker's Hapm.glb: without this the 0.3137 tint rendered at ~0.6 of
 * stock brightness instead of ~0.32. See `colorSlot` in modelTint.ts.
 */
const pbr22 = (t: number): number => Math.pow(t, 2.2);

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

/** A stand-in for a loaded .glb: a root with PBR-material child meshes. */
function fakeGlbRoot(name: string, shared: PBRMaterial): TransformNode {
  const root = new TransformNode(name, scene);
  for (const part of ["body", "weapon"]) {
    const m = MeshBuilder.CreateBox(`${name}-${part}`, { size: 1 }, scene);
    m.parent = root;
    m.material = shared;
  }
  return root;
}

describe("modelTint — MULTIPLY semantics (tint-render-apply)", () => {
  it("multiplies the diffuse colour instead of replacing it", () => {
    cover("tint-render-apply");
    const root = new TransformNode("mul", scene);
    const mesh = MeshBuilder.CreateBox("mul-box", { size: 1 }, scene);
    mesh.parent = root;
    const mat = new StandardMaterial("mul-mat", scene);
    mat.diffuseColor = new Color3(0.8, 0.4, 0.2);
    mesh.material = mat;

    applyModelTint(root, { tint: [0.5, 1, 0] });

    const out = mesh.material as StandardMaterial;
    expect(out).not.toBe(mat); // shared-material safety: a clone was installed
    expect(out.diffuseColor.r).toBeCloseTo(0.8 * 0.5, 6);
    expect(out.diffuseColor.g).toBeCloseTo(0.4 * 1, 6);
    expect(out.diffuseColor.b).toBeCloseTo(0.2 * 0, 6);
    // the SOURCE material is untouched — the whole point of cloning
    expect(mat.diffuseColor.r).toBeCloseTo(0.8, 6);

    // ...and the SAME tint on a linear-space PBR slot carries `tint^2.2`, so
    // both material families land on the same displayed pixel (WC3 parity).
    const pbrRoot = new TransformNode("mul-pbr", scene);
    const pbrMesh = MeshBuilder.CreateBox("mul-pbr-box", { size: 1 }, scene);
    pbrMesh.parent = pbrRoot;
    const pbrMat = new PBRMaterial("mul-pbr-mat", scene);
    pbrMat.albedoColor = new Color3(1, 1, 1);
    pbrMesh.material = pbrMat;
    applyModelTint(pbrRoot, { tint: [0.5, 0.5, 0.5] });
    expect((pbrMesh.material as PBRMaterial).albedoColor.r).toBeCloseTo(pbr22(0.5), 6);
    expect((pbrMesh.material as PBRMaterial).albedoColor.r).toBeLessThan(0.5);
    releaseModelTint(pbrRoot);
    pbrRoot.dispose();

    releaseModelTint(root);
    expect(mesh.material).toBe(mat);
    root.dispose();
  });

  it("is idempotent, and re-tinting recomputes from the source colour", () => {
    cover("tint-render-apply");
    const root = new TransformNode("idem", scene);
    const mesh = MeshBuilder.CreateBox("idem-box", { size: 1 }, scene);
    mesh.parent = root;
    const mat = new StandardMaterial("idem-mat", scene);
    mat.diffuseColor = new Color3(1, 1, 1);
    mesh.material = mat;

    expect(applyModelTint(root, { tint: [0.5, 0.5, 0.5] })).toBe(1);
    expect(applyModelTint(root, { tint: [0.5, 0.5, 0.5] })).toBe(0); // no-op
    expect((mesh.material as StandardMaterial).diffuseColor.r).toBeCloseTo(0.5, 6);

    // a DIFFERENT tint must not compound onto the already-darkened value
    applyModelTint(root, { tint: [0.25, 0.25, 0.25] });
    expect((mesh.material as StandardMaterial).diffuseColor.r).toBeCloseTo(0.25, 6);
    releaseModelTint(root);
    root.dispose();
  });

  it("leaves materials untouched for an absent or neutral tint", () => {
    cover("tint-render-apply");
    const root = new TransformNode("neutral", scene);
    const mesh = MeshBuilder.CreateBox("neutral-box", { size: 1 }, scene);
    mesh.parent = root;
    const mat = new StandardMaterial("neutral-mat", scene);
    mat.diffuseColor = new Color3(0.7, 0.6, 0.5);
    mesh.material = mat;

    expect(isNeutralTint(undefined)).toBe(true);
    expect(isNeutralTint([1, 1, 1])).toBe(true);
    expect(isIdentityTint({ tint: [1, 1, 1], alpha: 1 })).toBe(true);
    expect(applyModelTint(root, null)).toBe(0);
    expect(applyModelTint(root, {})).toBe(0);
    expect(applyModelTint(root, { tint: [1, 1, 1] })).toBe(0);
    expect(applyModelTint(root, { tint: [1, 1, 1], alpha: 1 })).toBe(0);

    expect(mesh.material).toBe(mat); // same object, never cloned
    expect(mat.diffuseColor.r).toBeCloseTo(0.7, 6);
    expect(mat.alpha).toBe(1);
    expect(tintedMeshes(root)).toHaveLength(0);
    root.dispose();
  });
});

describe("modelTint — alpha blending (tint-render-apply)", () => {
  it("alpha < 1 sets material alpha AND the alpha-blend transparency mode", () => {
    cover("tint-render-apply");
    const pbr = new PBRMaterial("alpha-src", scene);
    pbr.albedoColor = new Color3(1, 1, 1);
    const root = fakeGlbRoot("alpha-glb", pbr);

    applyModelTint(root, { tint: [1, 0.5, 0.5], alpha: 0.4 });

    const out = root.getChildMeshes(false)[0]!.material as PBRMaterial;
    expect(out.alpha).toBeCloseTo(0.4, 6);
    expect(out.transparencyMode).toBe(Material.MATERIAL_ALPHABLEND);
    expect(out.needAlphaBlending()).toBe(true);
    // translucent models self-overlap without a back-face pass
    expect(out.separateCullingPass).toBe(true);
    expect(out.albedoColor.g).toBeCloseTo(pbr22(0.5), 6); // linear-space albedo

    // the source stays opaque for every other champion on this mesh
    expect(pbr.alpha).toBe(1);
    expect(pbr.needAlphaBlending()).toBe(false);

    releaseModelTint(root);
    root.dispose();
  });

  it("an opaque tint never puts the model into the blend pass", () => {
    cover("tint-render-apply");
    const root = new TransformNode("opaque", scene);
    const mesh = MeshBuilder.CreateBox("opaque-box", { size: 1 }, scene);
    mesh.parent = root;
    mesh.material = new StandardMaterial("opaque-mat", scene);

    applyModelTint(root, { tint: BERSERKER_TINT });
    const out = mesh.material as StandardMaterial;
    expect(out.alpha).toBe(1);
    expect(out.needAlphaBlending()).toBeFalsy();
    expect(out.separateCullingPass).toBe(false);
    releaseModelTint(root);
    root.dispose();
  });
});

describe("modelTint — shared .glb materials (tint-render-apply)", () => {
  it("two champions on one cached mesh get independent tints", () => {
    cover("tint-render-apply");
    // exactly what AssetManager does: ONE AssetContainer material, N instances
    const shared = new PBRMaterial("kaykit-knight", scene);
    shared.albedoColor = new Color3(1, 1, 1);
    const a = fakeGlbRoot("champ-a", shared);
    const b = fakeGlbRoot("champ-b", shared);

    applyModelTint(a, { tint: BERSERKER_TINT }); // 海克力斯 renders dark
    // b is untinted and must keep the stock palette
    expect((b.getChildMeshes(false)[0]!.material as PBRMaterial).albedoColor.r).toBeCloseTo(1, 6);

    applyModelTint(b, { tint: [1, 1, 0] }); // 金鋼狼 yellow
    const aMat = a.getChildMeshes(false)[0]!.material as PBRMaterial;
    const bMat = b.getChildMeshes(false)[0]!.material as PBRMaterial;
    expect(aMat).not.toBe(bMat);
    expect(aMat.albedoColor.r).toBeCloseTo(pbr22(BERSERKER_TINT[0]), 4);
    expect(bMat.albedoColor.b).toBeCloseTo(0, 6);
    expect(shared.albedoColor.r).toBeCloseTo(1, 6);

    // meshes sharing ONE source material inside a model share ONE clone
    expect(a.getChildMeshes(false)[1]!.material).toBe(aMat);

    // release puts the cached container material back into the meshes, so the
    // clone is what gets dropped and the cache keeps serving future spawns
    expect(releaseModelTint(a)).toBe(2);
    expect(a.getChildMeshes(false)[0]!.material).toBe(shared);
    expect(scene.materials).toContain(shared); // not disposed with the clone
    releaseModelTint(b);
    a.dispose();
    b.dispose();
  });
});

describe("modelTint — skin override (tint-render-apply)", () => {
  it("skin tint/alpha override the champion's, field by field", () => {
    cover("tint-render-apply");
    const champ = { tint: BERSERKER_TINT, alpha: 0.5 };
    expect(resolveModelTint(champ, { tint: [1, 0, 0] })).toEqual({
      tint: [1, 0, 0],
      alpha: 0.5, // not restated by the skin → champion value survives
    });
    // an explicit [1,1,1] CLEARS a tinted champion back to neutral
    expect(resolveModelTint({ tint: BERSERKER_TINT }, { tint: [1, 1, 1] })).toBeNull();
    expect(resolveModelTint({ tint: BERSERKER_TINT })).toEqual({ tint: BERSERKER_TINT });
    expect(resolveModelTint(null, null)).toBeNull();
    expect(resolveModelTint({})).toBeNull();
  });
});

describe("EntityViewRegistry wiring (tint-render-apply)", () => {
  const champ = (id: number): EntityViewState => ({
    id,
    kind: 0,
    seatId: 0,
    key: "champ.thorne",
    teamId: 1,
    x: 0,
    z: 0,
    fx: 0,
    fz: 1,
    alive: true,
  });
  const sync = (reg: EntityViewRegistry, e: EntityViewState, nowMs: number): void =>
    reg.sync({
      entities: [e],
      poseFor: (s) => ({ x: s.x, z: s.z, fx: s.fx, fz: s.fz }),
      nowMs,
      dtMs: 16,
      loadModels: false,
    });

  it("retries an unresolved seat, then paints the figure and the late .glb once", () => {
    cover("tint-render-apply");
    let resolvable = false;
    const reg = new EntityViewRegistry(scene, new AssetManager(scene), {
      // `undefined` = seat table not populated yet (the real race at spawn)
      championTintFor: () => (resolvable ? { tint: BERSERKER_TINT } : undefined),
    });
    const e = champ(4902);

    sync(reg, e, 0); // seat unknown → nothing tinted, and NOT cached as neutral
    const view = reg.getChampionView(4902)!;
    const torso = view.root.getChildMeshes(false).find((m) => m.name.endsWith("-torso"))!;
    const stock = (torso.material as StandardMaterial).diffuseColor.clone();
    expect(tintedMeshes(view.root)).toHaveLength(0);

    resolvable = true;
    sync(reg, e, 16); // seat arrives → the procedural figure is tinted
    expect((torso.material as StandardMaterial).diffuseColor.r).toBeCloseTo(
      stock.r * BERSERKER_TINT[0],
      5,
    );
    const painted = tintedMeshes(view.root).length;
    expect(painted).toBeGreaterThan(0);

    // the .glb lands later: new meshes under the same root, shared material
    const shared = new PBRMaterial("late-glb-mat", scene);
    shared.albedoColor = new Color3(1, 1, 1);
    const glb = fakeGlbRoot("champ-4902-glb", shared);
    glb.parent = view.root;
    Object.defineProperty(view, "hasGlb", { get: () => true, configurable: true });

    sync(reg, e, 32);
    const glbMat = glb.getChildMeshes(false)[0]!.material as PBRMaterial;
    expect(glbMat).not.toBe(shared);
    expect(glbMat.albedoColor.r).toBeCloseTo(pbr22(BERSERKER_TINT[0]), 4);
    expect(tintedMeshes(view.root).length).toBeGreaterThan(painted);

    // Despawn hands every source material back BEFORE ChampionView.dispose()
    // runs, so material lifetime is byte-for-byte what it was pre-#49: the
    // tint clones are gone from the scene and nothing else changed shape.
    reg.sync({ entities: [], poseFor: () => ({ x: 0, z: 0, fx: 0, fz: 1 }), nowMs: 48, dtMs: 16 });
    const ours = scene.materials.filter(
      (m) => m.name.endsWith("#tint") && /late-glb-mat|champ-4902/.test(m.name),
    );
    expect(ours).toHaveLength(0);
    // ...and the cached container material outlives the despawn, for every
    // champion still on this model and every future spawn. (ChampionView.dispose
    // used to `root.dispose(false, true)` and take it down with the view — see
    // the material-ownership test in ChampionView.test.ts.)
    expect(scene.materials).toContain(shared);
    reg.dispose();
  });

  it("an untinted champion leaves every material untouched", () => {
    cover("tint-render-apply");
    const reg = new EntityViewRegistry(scene, new AssetManager(scene), {
      championTintFor: () => null, // resolved: this champion has no tint
    });
    const e = champ(4903);
    sync(reg, e, 0);
    const view = reg.getChampionView(4903)!;
    const torso = view.root.getChildMeshes(false).find((m) => m.name.endsWith("-torso"))!;
    const before = torso.material;
    sync(reg, e, 16);
    sync(reg, e, 32);
    expect(torso.material).toBe(before); // never cloned, never repainted
    expect(tintedMeshes(view.root)).toHaveLength(0);
    reg.dispose();
  });
});

describe("modelTint on a real ChampionView (tint-render-apply)", () => {
  it("tints the procedural figure, spares the team ring, and composes with the hit flash", () => {
    cover("tint-render-apply");
    const view = new ChampionView(scene, 4901, "champ.thorne", 1);
    view.setPose(0, 0, 0, 1);
    const torso = scene.meshes.find((m) => m.name === "champ-4901-torso")!;
    const ring = scene.meshes.find((m) => m.name === "champ-4901-teamring")!;
    const shadow = scene.meshes.find((m) => m.name === "champ-4901-shadow")!;
    const team = TEAM_COLORS[1]!;
    const torsoBefore = (torso.material as StandardMaterial).diffuseColor.clone();

    applyModelTint(view.root, { tint: BERSERKER_TINT });

    // body art is multiplied down to Berserker's near-black
    const torsoMat = torso.material as StandardMaterial;
    expect(torsoMat.diffuseColor.r).toBeCloseTo(torsoBefore.r * BERSERKER_TINT[0], 5);
    expect(torsoMat.diffuseColor.r).toBeLessThan(0.4);

    // MUST NOT BREAK: the team-colour selection ring and the blob shadow are
    // team/UI reads, not champion art — a dark tint may never touch them.
    const ringMat = ring.material as StandardMaterial;
    expect(ringMat.emissiveColor.r).toBeCloseTo(team[0], 6);
    expect(ringMat.emissiveColor.g).toBeCloseTo(team[1], 6);
    expect(ringMat.emissiveColor.b).toBeCloseTo(team[2], 6);
    expect(ringMat.alpha).toBeCloseTo(0.85, 6);
    expect((shadow.material as StandardMaterial).alpha).toBeCloseTo(0.38, 6);
    expect(UNTINTED_MESH_SUFFIXES.some((s) => ring.name.endsWith(s))).toBe(true);
    expect(UNTINTED_MESH_SUFFIXES.some((s) => shadow.name.endsWith(s))).toBe(true);

    // MUST NOT BREAK: the #3 hit flash is a per-mesh render OVERLAY, a
    // different channel from the material tint. Both must survive together —
    // a dark champion still has to read as "hit".
    view.flash([1, 0.25, 0.25], 1000);
    view.update("idle", 1010, 16);
    expect(torso.renderOverlay).toBe(true);
    expect(torso.overlayColor.r).toBeCloseTo(1, 6);
    expect(torso.overlayAlpha).toBeCloseTo(FLASH_ALPHA, 5);
    // ...and the tint is still on the material underneath, not overwritten
    expect((torso.material as StandardMaterial).diffuseColor.r).toBeCloseTo(
      torsoBefore.r * BERSERKER_TINT[0],
      5,
    );

    releaseModelTint(view.root);
    expect((torso.material as StandardMaterial).diffuseColor.r).toBeCloseTo(torsoBefore.r, 5);
    view.dispose();
  });
});
