/**
 * client-yaw-view: the ChampionView eases its rendered yaw toward the
 * authoritative facing instead of snapping. Runs on Babylon's NullEngine.
 * roster-10 (client-teleport-snap): the distance-driven walk cycle ignores a
 * relocation, so a respawn/blink cannot spin the limbs to a random phase.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { Animation } from "@babylonjs/core/Animations/animation";
import type { ModelDoc } from "@ggd/shared/content";
import { ChampionView } from "./ChampionView";
import type { AssetManager } from "../AssetManager";
import { FLASH_ALPHA, FLASH_MS } from "../combatFeedback";

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

describe("ChampionView yaw smoothing (client-yaw-view)", () => {
  it("snaps facing on the first pose but eases thereafter", () => {
    cover("client-yaw-view");
    const view = new ChampionView(scene, 1, "champ.sela", 1);

    // first pose: no prior orientation → snap to +Z (yaw 0)
    view.setPose(0, 0, 0, 1);
    view.update("idle", 0, 16);
    expect(view.root.rotation.y).toBeCloseTo(0, 6);

    // new authoritative facing +X (yaw π/2). One frame must NOT snap there.
    view.setPose(0, 0, 1, 0);
    view.update("idle", 16, 16);
    const afterOne = view.root.rotation.y;
    expect(afterOne).toBeGreaterThan(0);
    expect(afterOne).toBeLessThan(Math.PI / 2 - 0.2);

    // keep feeding the target: it converges to +X over time
    for (let i = 0; i < 120; i++) {
      view.setPose(0, 0, 1, 0);
      view.update("idle", 16 * (i + 2), 16);
    }
    expect(view.root.rotation.y).toBeCloseTo(Math.PI / 2, 3);

    view.dispose();
  });
});

describe("ChampionView hit flash + hitstop", () => {
  it("installs the overlay PASS, not just the property (juice-flash)", () => {
    cover("juice-flash");
    // `mesh.renderOverlay = true` succeeds on ANY mesh — as a plain expando
    // nobody reads — unless @babylonjs/core/Rendering/outlineRenderer has been
    // imported for its side effects. That is exactly how the hit flash shipped
    // invisible: the property was set every hit and no pass ever drew it.
    // Assert the CAPABILITY (prototype accessor + scene component), not the
    // assignment, so dropping the import fails here instead of on screen.
    const desc = Object.getOwnPropertyDescriptor(Mesh.prototype, "renderOverlay");
    expect(typeof desc?.set).toBe("function");
    expect(typeof scene.getOutlineRenderer).toBe("function");
    expect(scene.getOutlineRenderer()).toBeTruthy();
  });

  it("flashes the struck model then clears (juice-flash)", () => {
    cover("juice-flash");
    const view = new ChampionView(scene, 7, "champ.thorne", 0);
    view.setPose(0, 0, 0, 1);
    const torso = scene.meshes.find((m) => m.name === "champ-7-torso")!;
    expect(torso).toBeTruthy();

    view.update("idle", 100, 16); // settle, no flash yet
    expect(torso.renderOverlay).toBeFalsy();

    view.flash([1, 0.25, 0.25], 100); // magic (red) flash at t=100
    view.update("idle", 110, 16);
    expect(torso.renderOverlay).toBe(true);
    expect(torso.overlayAlpha).toBeCloseTo(FLASH_ALPHA, 5);

    // past the ~80ms flash window → overlay cleared
    view.update("idle", 100 + FLASH_MS + 20, 16);
    expect(torso.renderOverlay).toBe(false);

    view.dispose();
  });

  it("hitstop update path holds during the freeze then resumes (juice-hitstop)", () => {
    cover("juice-hitstop");
    const view = new ChampionView(scene, 8, "champ.sela", 1);
    view.setPose(0, 0, 0, 1);
    view.update("idle", 0, 16);
    view.setHitstop(100, 0); // freeze until t=100
    expect(() => view.update("run", 50, 16)).not.toThrow(); // within freeze
    expect(() => view.update("run", 200, 16)).not.toThrow(); // after freeze
    view.dispose();
  });
});

describe("ChampionView walk cycle vs. relocation (roster-10)", () => {
  /** Converged left-arm swing target: sin(walkPhase) * 0.8 once the ease settles. */
  const settledSwing = (view: ChampionView, fromMs: number): number => {
    for (let i = 0; i < 200; i++) view.update("run", fromMs + i * 16, 16);
    return view.root.getChildTransformNodes(false).find((n) => n.name.endsWith("-armL-pivot"))!
      .rotation.x;
  };

  it("a teleport does not spin the walk phase (limbs hold, no phantom stride)", () => {
    cover("client-teleport-snap");
    const view = new ChampionView(scene, 30, "champ.sela", 1);
    view.setPose(0, 0, 0, 1); // phase 0
    const before = settledSwing(view, 0);
    expect(before).toBeCloseTo(0, 6); // sin(0) * 0.8

    // relocation: 80 units in one frame. Distance-driven phase would advance by
    // 80 * 4.2 = 336 rad and land the limbs somewhere arbitrary.
    view.setPose(80, 0, 0, 1);
    const after = settledSwing(view, 4000);
    expect(after).toBeCloseTo(before, 6);
    expect(view.root.position.x).toBe(80); // the POSITION still snapped

    view.dispose();
  });

  it("ordinary walking still advances the walk phase", () => {
    cover("client-teleport-snap");
    const view = new ChampionView(scene, 31, "champ.sela", 1);
    view.setPose(0, 0, 0, 1);
    const before = settledSwing(view, 0);
    view.setPose(0.25, 0, 0, 1); // a plausible per-frame step → phase += 1.05 rad
    const after = settledSwing(view, 4000);
    expect(Math.abs(after - before)).toBeGreaterThan(0.1);
    view.dispose();
  });
});

describe("ChampionView.dispose material ownership", () => {
  /**
   * Reproduces `tryUpgradeToGlb`: `instantiateModelsToScene(fn, false, ...)`
   * passes `cloneMaterials: false`, so the instantiated meshes point straight
   * at the AssetContainer's material — the one AssetManager CACHES per glb path
   * and hands to every champion on that model.
   */
  const attachFakeGlb = (view: ChampionView, shared: PBRMaterial): void => {
    const glbRoot = new TransformNode(`champ-${view.entityId}-glb`, scene);
    glbRoot.parent = view.root;
    for (const part of ["body", "weapon"]) {
      const m = MeshBuilder.CreateBox(`${view.entityId}-${part}`, { size: 1 }, scene);
      m.parent = glbRoot;
      m.material = shared; // NOT a clone — the cache's own material
    }
  };

  it("despawning one champion leaves the cached .glb material and textures alive", () => {
    // one AssetContainer material + texture, shared by every champ on this model
    const tex = RawTexture.CreateRGBATexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
      scene,
      false,
    );
    const shared = new PBRMaterial("kaykit-knight", scene);
    shared.albedoTexture = tex;

    const a = new ChampionView(scene, 900, "champ.thorne", 0);
    const b = new ChampionView(scene, 901, "champ.thorne", 1);
    attachFakeGlb(a, shared);
    attachFakeGlb(b, shared);

    a.dispose(); // first death / entity removal in EntityViewRegistry.sync

    // THE REGRESSION: `root.dispose(false, true)` used to run
    // `material.dispose(false, true)` on every child mesh, taking the shared
    // material AND its textures out of the scene — and out of the cache — for
    // every champion still alive and every future spawn on this model.
    expect(scene.materials).toContain(shared);
    expect(scene.textures).toContain(tex);
    expect(shared.albedoTexture).toBe(tex);

    // the surviving champion still renders with it
    const bMesh = b.root.getChildMeshes(false).find((m) => m.name === "901-body")!;
    expect(bMesh.material).toBe(shared);

    // ...while the materials the view CREATED are gone — no leak either way
    for (const suffix of ["skin", "team", "accent", "ring", "blob"]) {
      expect(scene.materials.find((m) => m.name === `champ-900-${suffix}`)).toBeUndefined();
      expect(scene.materials.find((m) => m.name === `champ-901-${suffix}`)).toBeDefined();
    }

    b.dispose();
    expect(scene.materials).toContain(shared); // cache survives for a respawn
    for (const suffix of ["skin", "team", "accent", "ring", "blob"]) {
      expect(scene.materials.find((m) => m.name === `champ-901-${suffix}`)).toBeUndefined();
    }

    shared.dispose(false, true);
    expect(scene.textures).not.toContain(tex); // the cache owner CAN still free it
  });
});

describe("ChampionView.dispose animation groups", () => {
  /**
   * A stand-in for the AssetManager's cached container: one skinned-ish mesh
   * plus the model's clips. `instantiateModelsToScene` CLONES every group in
   * here (assetContainer.js `this.animationGroups.forEach` → `o.clone(...)`),
   * and each clone's constructor registers it in `scene.animationGroups`.
   */
  const makeContainer = (clipNames: string[]): AssetContainer => {
    const container = new AssetContainer(scene);
    const mesh = MeshBuilder.CreateBox("kaykit-body", { size: 1 }, scene);
    container.meshes.push(mesh);
    container.rootNodes.push(mesh);
    for (const name of clipNames) {
      const group = new AnimationGroup(name, scene);
      const anim = new Animation(`${name}-y`, "position.y", 60, Animation.ANIMATIONTYPE_FLOAT);
      anim.setKeys([
        { frame: 0, value: 0 },
        { frame: 30, value: 1 },
      ]);
      group.addTargetedAnimation(anim, mesh);
      container.animationGroups.push(group);
    }
    // a real LoadAssetContainerAsync leaves nothing of its own in the scene
    container.removeAllFromScene();
    return container;
  };

  const DOC = {
    id: "model.kaykit",
    schema: "model@1",
    glbPath: "assets/models/champions/mage.glb",
    scale: 1,
    collisionRadius: 0.5,
    clipMap: {
      idle: "Idle",
      run: "Running_A",
      attack: "Spellcast_Shoot",
      cast: "Spellcast_Long",
      hurt: "Hit_A",
      death: "Death_A",
    },
  } as ModelDoc;

  /** the clip list includes "Cheer", which no AnimState maps to — it clones too */
  const CLIPS = [
    "Idle",
    "Running_A",
    "Spellcast_Shoot",
    "Spellcast_Long",
    "Hit_A",
    "Death_A",
    "Cheer",
  ];

  it("a despawn returns scene.animationGroups to its baseline (no per-death leak)", async () => {
    const container = makeContainer(CLIPS);
    const assets = {
      load: (): Promise<AssetContainer> => Promise.resolve(container),
    } as unknown as AssetManager;

    const baseline = scene.animationGroups.length;

    // spawn → despawn a champion five times, as death cleanup / entity removal
    // in EntityViewRegistry.sync does over a match
    for (let i = 0; i < 5; i++) {
      const view = new ChampionView(scene, 500 + i, "champ.sela", 0);
      view.tryUpgradeToGlb(assets, DOC);
      await Promise.resolve(); // let the load().then() instantiation land
      await Promise.resolve();

      expect(view.hasGlb).toBe(true);
      // THE LEAK: every clip in the container was cloned into the scene
      expect(scene.animationGroups.length).toBe(baseline + CLIPS.length);

      view.update("run", 0, 16); // drive a clip so a group is actually started
      view.dispose();

      // ...and dispose() must take all of them back out — including "Cheer",
      // which no AnimState resolved to. Before the fix this grew by 7 per
      // death, forever, with each group's targetedAnimations pointing at
      // TransformNodes root.dispose() had already destroyed.
      expect(scene.animationGroups.length).toBe(baseline);
    }

    // the CACHED container is untouched — the next spawn can still instantiate
    expect(container.animationGroups).toHaveLength(CLIPS.length);
    for (const g of container.animationGroups) expect(g.targetedAnimations).toHaveLength(1);
  });
});
