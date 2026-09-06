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
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { Animation } from "@babylonjs/core/Animations/animation";
import type { ModelDoc } from "@ggd/shared/content";
import { ChampionView, TARGET_HEIGHT } from "./ChampionView";
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
    glbPath: "assets/models/champions/blocky-mage.glb",
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

describe("ChampionView hit flash on the LOADED model (juice-flash-glb, task #64)", () => {
  /** A container with real GEOMETRY + clips — the normal loaded-champion case. */
  const makeMeshContainer = (clipNames: string[]): AssetContainer => {
    const container = new AssetContainer(scene);
    const mesh = MeshBuilder.CreateBox("glb-body", { size: 1 }, scene);
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
    container.removeAllFromScene();
    return container;
  };

  const MESH_DOC = {
    id: "model.mesh",
    schema: "model@1",
    glbPath: "assets/models/champions/blocky-mage.glb",
    scale: 1,
    collisionRadius: 0.5,
    clipMap: {
      idle: "Idle",
      run: "Running_A",
      attack: "Attack_A",
      cast: "Cast_A",
      hurt: "Hit_A",
      death: "Death_A",
    },
  } as ModelDoc;

  it("flash() tints the .glb child meshes, then clears — not only the voxel fallback", async () => {
    cover("juice-flash-glb");
    const container = makeMeshContainer(["Idle", "Running_A", "Attack_A", "Cast_A", "Hit_A", "Death_A"]);
    const assets = { load: (): Promise<AssetContainer> => Promise.resolve(container) } as unknown as AssetManager;

    const view = new ChampionView(scene, 770, "champ.sela", 1);
    view.setPose(0, 0, 0, 1);
    view.tryUpgradeToGlb(assets, MESH_DOC);
    await Promise.resolve();
    await Promise.resolve();
    expect(view.hasGlb).toBe(true);

    // the LOADED model's mesh (cloned as "<id>-glb-body"), not a procedural box
    const glbMesh = view.root.getChildMeshes(false).find((m) => m.name.endsWith("glb-body"))!;
    expect(glbMesh).toBeTruthy();

    view.update("idle", 100, 16); // settle — no flash yet
    expect(glbMesh.renderOverlay).toBeFalsy();

    view.flash([1, 0.15, 0.15], 100); // a landed hit
    view.update("idle", 110, 16);
    expect(glbMesh.renderOverlay).toBe(true); // the 3D model paints, not just the voxels
    expect(glbMesh.overlayAlpha).toBeCloseTo(FLASH_ALPHA, 5);

    view.update("idle", 100 + FLASH_MS + 20, 16); // past the window → cleared
    expect(glbMesh.renderOverlay).toBe(false);

    view.dispose();
  });
});

describe("ChampionView empty-glb procedural fallback (client-empty-glb-fallback, task #69)", () => {
  /**
   * Reproduces `imported.collision` (godie-u011's model): a geometry-LESS WC3
   * dummy — 0 meshes, one static "Stand" clip. Adopting it hid the voxel figure
   * and left the champion invisible with an attack that resolved to "Stand".
   */
  const makeEmptyContainer = (clipNames: string[]): AssetContainer => {
    const container = new AssetContainer(scene);
    const bone = new TransformNode("collision-root", scene);
    container.transformNodes.push(bone);
    container.rootNodes.push(bone);
    for (const name of clipNames) {
      const group = new AnimationGroup(name, scene);
      const anim = new Animation(`${name}-y`, "position.y", 60, Animation.ANIMATIONTYPE_FLOAT);
      anim.setKeys([
        { frame: 0, value: 0 },
        { frame: 30, value: 1 },
      ]);
      group.addTargetedAnimation(anim, bone);
      container.animationGroups.push(group);
    }
    container.removeAllFromScene();
    return container;
  };

  const EMPTY_DOC = {
    id: "imported.collision",
    schema: "model@1",
    glbPath: "assets/models/imported/collision.glb",
    scale: 1.5,
    collisionRadius: 0.55,
    clipMap: {
      idle: "Stand",
      run: "Stand",
      attack: "Stand",
      cast: "Stand",
      hurt: "Stand",
      death: "Stand",
    },
  } as ModelDoc;

  it("keeps the procedural figure (visible + attack-animated) instead of a 0-mesh glb", async () => {
    cover("client-empty-glb-fallback");
    const baseline = scene.animationGroups.length;
    const container = makeEmptyContainer(["Stand"]);
    const assets = { load: (): Promise<AssetContainer> => Promise.resolve(container) } as unknown as AssetManager;

    const view = new ChampionView(scene, 611, "imported.collision", 0);
    view.setPose(0, 0, 0, 1);
    const torso = view.root.getChildMeshes(false).find((m) => m.name === "champ-611-torso")!;
    expect(torso).toBeTruthy();

    view.tryUpgradeToGlb(assets, EMPTY_DOC);
    await Promise.resolve();
    await Promise.resolve();

    // the geometry-less glb is NOT adopted — the champion stays the voxel figure
    expect(view.hasGlb).toBe(false);
    expect(torso.isEnabled()).toBe(true);
    // ...and it did not strand the cloned "Stand" animation group in the scene
    expect(scene.animationGroups.length).toBe(baseline);

    // the procedural ATTACK gesture actually drives the limbs (armR → raised strike)
    const armR = view.root.getChildTransformNodes(false).find((n) => n.name.endsWith("-armR-pivot"))!;
    for (let i = 0; i < 80; i++) view.update("attack", 100 + i * 16, 16);
    expect(Math.abs(armR.rotation.x)).toBeGreaterThan(1); // eases toward the -2.0 strike pose

    view.dispose();
  });
});

describe("ChampionView grounds + preserves declared scale (task #61 flying / #77)", () => {
  /**
   * A container whose single mesh's feet sit at world y=`footY` (an imported rig
   * bakes its feet at an arbitrary local Y — `imported.ma` floats 0.72u, others
   * dip below the origin). tryUpgradeToGlb must lift the model so its lowest
   * vertex lands on the arena floor (y≈0), the same shift StorePreview/#129 and
   * the intermission mount/#111 apply — otherwise the champion floats or sinks.
   */
  const makeFloatingContainer = (footY: number): AssetContainer => {
    const container = new AssetContainer(scene);
    const mesh = MeshBuilder.CreateBox("kaykit-body", { size: 1 }, scene);
    mesh.position.y = footY + 0.5; // a unit box: feet (min.y) = footY
    container.meshes.push(mesh);
    container.rootNodes.push(mesh);
    const group = new AnimationGroup("Idle", scene);
    const anim = new Animation("Idle-y", "rotation.y", 60, Animation.ANIMATIONTYPE_FLOAT);
    anim.setKeys([{ frame: 0, value: 0 }, { frame: 30, value: 0 }]);
    group.addTargetedAnimation(anim, mesh);
    container.animationGroups.push(group);
    container.removeAllFromScene();
    return container;
  };

  const DOC = (scale: number): ModelDoc => ({
    id: "model.test",
    schema: "model@1",
    glbPath: "assets/models/champions/blocky-mage.glb",
    scale,
    collisionRadius: 0.5,
    clipMap: { idle: "Idle", run: "Idle", attack: "Idle", cast: "Idle", hurt: "Idle", death: "Idle" },
  } as ModelDoc);

  const worldMinY = (view: ChampionView): number => {
    let min = Infinity;
    for (const m of view.root.getChildMeshes(false)) {
      if (!m.isEnabled()) continue;
      if (m.name.includes("shadow") || m.name.includes("teamring")) continue;
      m.computeWorldMatrix(true);
      const y = m.getBoundingInfo().boundingBox.minimumWorld.y;
      if (y < min) min = y;
    }
    return min;
  };

  it("lifts a floating rig so its feet sit on the arena floor (y≈0)", async () => {
    cover("client-model-grounded");
    const container = makeFloatingContainer(0.72); // feet 0.72u above the origin
    const assets = { load: (): Promise<AssetContainer> => Promise.resolve(container) } as unknown as AssetManager;
    const view = new ChampionView(scene, 720, "champ.sela", 0);
    view.setPose(0, 0, 0, 1);
    view.tryUpgradeToGlb(assets, DOC(1));
    await Promise.resolve();
    await Promise.resolve();
    expect(view.hasGlb).toBe(true);
    expect(worldMinY(view)).toBeCloseTo(0, 1); // no longer floats
    view.dispose();
  });

  it("lifts a sunk rig (feet below the origin) up onto the floor too", async () => {
    const container = makeFloatingContainer(-0.6); // half-buried below the origin
    const assets = { load: (): Promise<AssetContainer> => Promise.resolve(container) } as unknown as AssetManager;
    const view = new ChampionView(scene, 721, "champ.sela", 0);
    view.setPose(0, 0, 0, 1);
    view.tryUpgradeToGlb(assets, DOC(1));
    await Promise.resolve();
    await Promise.resolve();
    expect(worldMinY(view)).toBeCloseTo(0, 1); // lifted out of the ground
    view.dispose();
  });

  it("reports a DETERMINED render scale, never a silent default — #77/#150", async () => {
    cover("client-declared-scale");
    // makeFloatingContainer's body is a unit box → native height 1u, so the
    // #150 height-normalization factor is exactly TARGET_HEIGHT / 1.
    const container = makeFloatingContainer(0);
    const assets = { load: (): Promise<AssetContainer> => Promise.resolve(container) } as unknown as AssetManager;
    // before any doc, the champion is on its procedural stand-in (no declared scale)
    const view = new ChampionView(scene, 722, "champ.sela", 0);
    expect(view.declaredScale).toBeNull();
    // the doc's raw scale (0.6) is NO LONGER the render size (task #150): the glb
    // is normalized to the target height instead of applied as an absolute.
    view.tryUpgradeToGlb(assets, DOC(0.6));
    await Promise.resolve();
    await Promise.resolve();
    expect(view.hasGlb).toBe(true);
    expect(view.declaredScale).toBeCloseTo(TARGET_HEIGHT, 5); // normalized, not 0.6
    view.dispose();
  });
});

describe("ChampionView height-normalization (task #150)", () => {
  /**
   * A container whose body is a single box of arbitrary native HEIGHT `h` (feet
   * at y=0) — stands in for champions whose glbs have wildly different native
   * mesh heights (the roster measured 1.70u..2.32u rendered before #150).
   */
  const makeBoxContainer = (h: number): AssetContainer => {
    const container = new AssetContainer(scene);
    const mesh = MeshBuilder.CreateBox("kaykit-body", { width: 0.5, height: h, depth: 0.5 }, scene);
    mesh.position.y = h / 2; // feet at y=0, head at y=h → native height = h
    container.meshes.push(mesh);
    container.rootNodes.push(mesh);
    const group = new AnimationGroup("Idle", scene);
    const anim = new Animation("Idle-y", "rotation.y", 60, Animation.ANIMATIONTYPE_FLOAT);
    anim.setKeys([{ frame: 0, value: 0 }, { frame: 30, value: 0 }]);
    group.addTargetedAnimation(anim, mesh);
    container.animationGroups.push(group);
    container.removeAllFromScene();
    return container;
  };

  const NORM_DOC = {
    id: "model.norm",
    schema: "model@1",
    glbPath: "assets/models/champions/blocky-mage.glb",
    scale: 1, // #150 ignores this for sizing — normalization sets the render scale
    collisionRadius: 0.5,
    clipMap: { idle: "Idle", run: "Idle", attack: "Idle", cast: "Idle", hurt: "Idle", death: "Idle" },
  } as ModelDoc;

  /** Rendered full-silhouette height of the loaded glb (world space, minus ring/shadow). */
  const renderedHeight = (view: ChampionView): number => {
    let min = Infinity, max = -Infinity;
    for (const m of view.root.getChildMeshes(false)) {
      if (!m.isEnabled()) continue;
      if (m.name.includes("shadow") || m.name.includes("teamring")) continue;
      m.computeWorldMatrix(true);
      const bb = m.getBoundingInfo().boundingBox;
      if (bb.minimumWorld.y < min) min = bb.minimumWorld.y;
      if (bb.maximumWorld.y > max) max = bb.maximumWorld.y;
    }
    return max - min;
  };

  const load = async (view: ChampionView, container: AssetContainer, rel?: number): Promise<void> => {
    const assets = { load: (): Promise<AssetContainer> => Promise.resolve(container) } as unknown as AssetManager;
    view.setPose(0, 0, 0, 1);
    view.tryUpgradeToGlb(assets, NORM_DOC, rel);
    await Promise.resolve();
    await Promise.resolve();
  };

  it("two champions with very different native sizes render to the same target height", async () => {
    cover("client-model-normalized");
    // champion A: a SHORT native mesh (1u); champion B: a TALL one (4u) — a 4×
    // native spread, the pre-#150 root cause of inconsistent on-screen sizes.
    const small = new ChampionView(scene, 810, "imported.a", 0);
    const big = new ChampionView(scene, 811, "imported.b", 1);
    await load(small, makeBoxContainer(1));
    await load(big, makeBoxContainer(4));
    expect(small.hasGlb).toBe(true);
    expect(big.hasGlb).toBe(true);

    const hSmall = renderedHeight(small);
    const hBig = renderedHeight(big);
    // both land within tolerance of the common target despite 4× native spread
    expect(hSmall).toBeCloseTo(TARGET_HEIGHT, 1);
    expect(hBig).toBeCloseTo(TARGET_HEIGHT, 1);
    expect(Math.abs(hSmall - hBig)).toBeLessThan(0.1); // consistent with each other
    small.dispose();
    big.dispose();
  });

  it("a relativeScale override renders a champion DELIBERATELY smaller than the target", async () => {
    cover("client-model-normalized");
    cover("client-model-relative-scale");
    const normal = new ChampionView(scene, 812, "imported.a", 0);
    const tiny = new ChampionView(scene, 813, "imported.a", 1);
    await load(normal, makeBoxContainer(1)); // default relativeScale 1.0
    await load(tiny, makeBoxContainer(1), 0.6); // intentional small creature

    const hNormal = renderedHeight(normal);
    const hTiny = renderedHeight(tiny);
    expect(hNormal).toBeCloseTo(TARGET_HEIGHT, 1);
    expect(hTiny).toBeCloseTo(TARGET_HEIGHT * 0.6, 1); // ~1.08u, the override size
    expect(hTiny).toBeLessThan(hNormal * 0.75); // clearly, deliberately smaller
    normal.dispose();
    tiny.dispose();
  });

  it("falls back to the doc's declared scale for a degenerate (unmeasurable) glb", async () => {
    cover("client-model-normalized");
    cover("client-model-degenerate-fallback");
    // a near-zero-height body (below MIN_NATIVE_HEIGHT) can't yield a sane
    // normalization factor → honor the doc's declared scale instead of dividing
    // the target by ~0 and exploding the model.
    const view = new ChampionView(scene, 814, "imported.degenerate", 0);
    const doc = { ...NORM_DOC, scale: 1.23 } as ModelDoc;
    const assets = { load: (): Promise<AssetContainer> => Promise.resolve(makeBoxContainer(0.001)) } as unknown as AssetManager;
    view.setPose(0, 0, 0, 1);
    view.tryUpgradeToGlb(assets, doc);
    await Promise.resolve();
    await Promise.resolve();
    expect(view.hasGlb).toBe(true);
    expect(view.declaredScale).toBe(1.23); // fell back to the declared scale
    view.dispose();
  });
});

/**
 * revive-dissolve-view (playtest directive #220): a champion that DIED lies on
 * the ground for 3 s, then rises while fading, then is fully gone — and never
 * dissolves at all while its revive circle is still claimable. Headless, so the
 * body under test is the PROCEDURAL voxel figure (loadModels is off in CI).
 */
describe("ChampionView corpse dissolve (#220)", () => {
  const bodyMeshes = (v: ChampionView): AbstractMesh[] =>
    v.root.getChildMeshes(false).filter((m) => /-(torso|head|armL|armR|legL|legR)$/.test(m.name));

  it("lies for 3 s, then rises + fades, then vanishes", () => {
    cover("revive-dissolve-view");
    const view = new ChampionView(scene, 2201, "champ.sela", 0);
    view.setPose(3, 4, 0, 1);
    view.noteDeath(1000);

    // t+2.9 s: still on the ground, still opaque — 「倒在地上」
    view.update("death", 3900, 16);
    expect(view.root.position.y).toBe(0);
    expect(view.vanished).toBe(false);
    for (const m of bodyMeshes(view)) expect(m.visibility).toBe(1);

    // t+3.5 s: rising and half-transparent
    view.update("death", 4500, 16);
    expect(view.root.position.y).toBeGreaterThan(0);
    expect(view.vanished).toBe(false);
    for (const m of bodyMeshes(view)) {
      expect(m.visibility).toBeLessThan(1); // < 1 → Babylon alpha-blends it
      expect(m.visibility).toBeGreaterThan(0);
    }

    // t+5 s: gone. Nothing visible, and the ROOT is left enabled — the registry's
    // draw-distance cull owns root.setEnabled and would undo a vanish written there.
    view.update("death", 20000, 16);
    expect(view.vanished).toBe(true);
    expect(view.root.isEnabled(false)).toBe(true);
    for (const m of bodyMeshes(view)) expect(m.visibility).toBe(0);
    expect(bodyMeshes(view).every((m) => !m.isEnabled())).toBe(true);
    view.dispose();
  });

  it("NEVER dissolves while a revive circle is still claimable, and resumes after", () => {
    cover("revive-dissolve-view");
    const view = new ChampionView(scene, 2202, "champ.sela", 0);
    view.setPose(0, 0, 0, 1);
    view.noteDeath(0);

    // 30 s of protected corpse (a circle has no expiry since #196): the body must
    // stay exactly where the teammate is channelling, fully opaque.
    for (let t = 0; t <= 30000; t += 250) {
      view.setReviveProtected(true);
      view.update("death", t, 250);
    }
    expect(view.vanished).toBe(false);
    expect(view.root.position.y).toBe(0);
    for (const m of bodyMeshes(view)) expect(m.visibility).toBe(1);

    // the rescue is spent / the circle ended → the 3 s clock starts from THERE
    view.setReviveProtected(false);
    view.update("death", 32000, 16); // only 2 s later: still lying
    expect(view.root.position.y).toBe(0);
    view.update("death", 33500, 16); // 3.5 s later: rising
    expect(view.root.position.y).toBeGreaterThan(0);
    view.update("death", 40000, 16);
    expect(view.vanished).toBe(true);
    view.dispose();
  });

  it("does not dissolve a body that never got a death EVENT (parked/bye seat)", () => {
    cover("revive-dissolve-view");
    // `alive === false` is also champ-select, the whole intermission, a bye seat
    // and settlement — dissolving those would empty the screen outside combat.
    const view = new ChampionView(scene, 2203, "champ.sela", 0);
    view.setPose(0, 0, 0, 1);
    for (let t = 0; t <= 20000; t += 500) view.update("death", t, 500);
    expect(view.vanished).toBe(false);
    expect(view.root.position.y).toBe(0);
    for (const m of bodyMeshes(view)) expect(m.visibility).toBe(1);
    view.dispose();
  });

  it("a revive restores the body completely (and re-arms for the next death)", () => {
    cover("revive-dissolve-view");
    const view = new ChampionView(scene, 2204, "champ.sela", 0);
    view.setPose(0, 0, 0, 1);
    view.noteDeath(0);
    view.update("death", 9000, 16); // fully vanished
    expect(view.vanished).toBe(true);

    view.update("idle", 9016, 16); // revived → alive state
    expect(view.vanished).toBe(false);
    expect(view.root.position.y).toBe(0);
    for (const m of bodyMeshes(view)) {
      expect(m.visibility).toBe(1);
      expect(m.isEnabled()).toBe(true);
    }
    expect(view.deathElapsedMs(9016)).toBeNull(); // clock cleared

    // dies again → the whole cycle runs again from the new event
    view.noteDeath(10000);
    view.update("death", 12000, 16);
    expect(view.root.position.y).toBe(0); // still inside the new 3 s
    view.update("death", 16000, 16);
    expect(view.vanished).toBe(true);
    view.dispose();
  });

  it("a duplicated death event does not restart the lie-down", () => {
    cover("revive-dissolve-view");
    const view = new ChampionView(scene, 2205, "champ.sela", 0);
    view.setPose(0, 0, 0, 1);
    view.noteDeath(1000);
    view.noteDeath(3500); // replayed / duplicated packet
    expect(view.deathElapsedMs(4600)).toBe(3600); // measured from the FIRST one
    view.update("death", 4600, 16);
    expect(view.root.position.y).toBeGreaterThan(0);
    view.dispose();
  });
});
