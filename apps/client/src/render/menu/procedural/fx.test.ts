/**
 * Boss-battle FX controllers under NullEngine (headless): each builds a CAPPED
 * amount of procedural geometry / particles, advances allocation-free (pumping
 * N frames grows neither the mesh, particle-system nor material count), and
 * tears itself down cleanly. The DynamicTexture sprite needs an
 * OffscreenCanvas, so a tiny 2D stub is installed (same as sprites.test).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { Animation } from "@babylonjs/core/Animations/animation";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import type { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { makeSoftDotTexture } from "./sprites";
import {
  DragonController,
  ModelDragonController,
  BeamController,
  ExplosionController,
  CombatFlashController,
  type FxController,
  type DragonContainerLoader,
} from "./fx";
import type { BeamPhaseConfig, ExplosionPhaseConfig, FlashPhaseConfig, DragonPathConfig } from "./math";

// --- OffscreenCanvas 2D stub (headless has none) -----------------------------
class StubGradient {
  addColorStop(): void {}
}
class StubCtx {
  fillStyle: unknown = "";
  globalAlpha = 1;
  createRadialGradient(): StubGradient {
    return new StubGradient();
  }
  createLinearGradient(): StubGradient {
    return new StubGradient();
  }
  clearRect(): void {}
  fillRect(): void {}
  getImageData(): { data: Uint8ClampedArray } {
    return { data: new Uint8ClampedArray(4) };
  }
  putImageData(): void {}
}
class StubCanvas {
  width: number;
  height: number;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
  getContext(): StubCtx {
    return new StubCtx();
  }
}
let hadOffscreen: boolean;
beforeAll(() => {
  hadOffscreen = "OffscreenCanvas" in globalThis;
  if (!hadOffscreen) (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = StubCanvas;
});
afterAll(() => {
  if (!hadOffscreen) delete (globalThis as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas;
});

let engine: NullEngine;
let scene: Scene;
let dotTex: DynamicTexture;
beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  dotTex = makeSoftDotTexture(scene, 16);
});
afterEach(() => {
  scene.dispose();
  engine.dispose();
});

interface Counts {
  meshes: number;
  ps: number;
  mats: number;
}
const counts = (): Counts => ({ meshes: scene.meshes.length, ps: scene.particleSystems.length, mats: scene.materials.length });
/** drive `n` frames on an advancing clock (never allocates in the loop under test) */
function pump(fx: FxController, n: number): void {
  for (let i = 0; i < n; i++) fx.update(i * 0.1 + 0.05, 0.1);
}

const DRAGON_PATH: DragonPathConfig = {
  centerX: 0,
  centerY: 9,
  centerZ: -4,
  radiusX: 24,
  radiusZ: 18,
  height: 5,
  loopSpeed: 0.16,
  weaveSpeed: 0.9,
  phase: 0,
};

describe("DragonController", () => {
  it("builds a capped segmented body + one ember trail; allocation-free per frame", () => {
    cover("login-fx-dragon");
    const ctrl = new DragonController(scene, dotTex, { path: DRAGON_PATH, segments: 16 });
    // 16 body segments, exactly one trail particle system, capped
    expect(scene.meshes.length).toBe(16);
    expect(scene.particleSystems.length).toBe(1);
    expect(scene.particleSystems[0]!.getCapacity()).toBeLessThanOrEqual(120);

    const before = counts();
    pump(ctrl, 150);
    expect(counts()).toEqual(before); // no mesh / PS / material growth

    ctrl.dispose();
    expect(scene.particleSystems.length).toBe(0);
    expect(scene.meshes.filter((m) => m.name.startsWith("login-dragon")).length).toBe(0);
  });
});

describe("BeamController", () => {
  const cfg: BeamPhaseConfig = { period: 9, charge: 1.6, fire: 1.1, shockwave: 0.7, maxRadius: 5 };
  it("builds beam+charge+shock (no particles); allocation-free per frame", () => {
    cover("login-fx-beam");
    const ctrl = new BeamController(scene, {
      start: new Vector3(6, 2, 0),
      end: new Vector3(6, 24, 0),
      offset: 0,
      cfg,
      color: [1, 0.5, 0.2],
    });
    expect(scene.meshes.length).toBe(4); // beam core + glow sheath + charge orb + shock ring
    expect(scene.particleSystems.length).toBe(0);

    const before = counts();
    pump(ctrl, 200); // spans multiple charge→fire→idle cycles
    expect(counts()).toEqual(before);

    ctrl.dispose();
    expect(scene.meshes.filter((m) => m.name.startsWith("login-beam")).length).toBe(0);
  });
});

describe("ExplosionController", () => {
  const cfg: ExplosionPhaseConfig = { period: 6, duration: 1.4, maxRadius: 3 };
  it("builds core+smoke+capped sparks; allocation-free per frame", () => {
    cover("login-fx-explosion");
    const ctrl = new ExplosionController(scene, dotTex, {
      site: new Vector3(10, 4, -2),
      index: 0,
      cfg,
      color: [1, 0.4, 0.2],
    });
    expect(scene.meshes.length).toBe(2); // core + smoke sphere
    expect(scene.particleSystems.length).toBe(1);
    expect(scene.particleSystems[0]!.getCapacity()).toBeLessThanOrEqual(80);

    const before = counts();
    pump(ctrl, 200);
    expect(counts()).toEqual(before);

    ctrl.dispose();
    expect(scene.particleSystems.length).toBe(0);
    expect(scene.meshes.filter((m) => m.name.startsWith("login-expl")).length).toBe(0);
  });
});

describe("CombatFlashController", () => {
  const cfg: FlashPhaseConfig = { period: 2.4, duration: 0.5 };
  it("builds one capped sprite per clash point; allocation-free per frame", () => {
    cover("login-fx-flash");
    const points = [new Vector3(4, 4, 0), new Vector3(-4, 6, 2), new Vector3(0, 5, -5), new Vector3(8, 3, 3)];
    const ctrl = new CombatFlashController(scene, dotTex, { points, cfg });
    expect(scene.meshes.length).toBe(points.length); // one billboarded plane each
    expect(scene.particleSystems.length).toBe(0);

    const before = counts();
    pump(ctrl, 300); // many fast pops
    expect(counts()).toEqual(before);

    ctrl.dispose();
    expect(scene.meshes.filter((m) => m.name.startsWith("login-flash")).length).toBe(0);
  });
});

describe("ModelDragonController (shared glb template)", () => {
  /** A minimal stand-in for the loaded dragon2.glb: one skinned box + a Flying clip. */
  const makeDragonTemplate = (): AssetContainer => {
    const container = new AssetContainer(scene);
    const mesh = MeshBuilder.CreateBox("dragon-body", { size: 1 }, scene);
    const mat = new StandardMaterial("dragon-skin", scene);
    mat.emissiveColor = new Color3(0, 0, 0); // molten emissive is applied per-instance
    mesh.material = mat;
    container.meshes.push(mesh);
    container.materials.push(mat);
    container.rootNodes.push(mesh);
    const group = new AnimationGroup("Fast_Flying", scene);
    const anim = new Animation("flap", "rotation.y", 60, Animation.ANIMATIONTYPE_FLOAT);
    anim.setKeys([
      { frame: 0, value: 0 },
      { frame: 30, value: 1 },
    ]);
    group.addTargetedAnimation(anim, mesh);
    container.animationGroups.push(group);
    // a real LoadAssetContainerAsync leaves nothing of its own in the scene
    container.removeAllFromScene();
    return container;
  };

  /** let the async load().then() chains (acquire → instantiate) land */
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  };

  const mkOpts = (phase: number, loadContainer: DragonContainerLoader) => ({
    path: { ...DRAGON_PATH, phase },
    url: "/content/assets/models/menu/dragon2.glb",
    scale: 2,
    loadContainer,
  });

  const roots = (): unknown[] => scene.transformNodes.filter((n) => n.name === "login-model-dragon");

  it("two dragons sharing a url load the template ONCE, cloned independently", async () => {
    const template = makeDragonTemplate();
    let loads = 0;
    const loadContainer: DragonContainerLoader = () => {
      loads++;
      return Promise.resolve(template);
    };

    const a = new ModelDragonController(scene, dotTex, mkOpts(0, loadContainer));
    const b = new ModelDragonController(scene, dotTex, mkOpts(Math.PI, loadContainer));
    await flush();

    // THE DEDUP: one fetch+parse feeds both dragons (previously two ~4.3 MB loads).
    expect(loads).toBe(1);
    // each dragon instantiated its own model root
    expect(roots().length).toBe(2);

    // cloneMaterials: the SHARED template material is never mutated (stays black),
    // while each instance gets its own molten emissive → independent shimmer.
    expect((template.materials[0] as StandardMaterial).emissiveColor.r).toBe(0);
    const molten = scene.materials.filter(
      (m) => m instanceof StandardMaterial && m.emissiveColor.r > 1,
    );
    expect(molten.length).toBe(2);

    a.dispose();
    b.dispose();
    expect(roots().length).toBe(0); // both clones torn down
    // fallback procedural dragon is gone too (retired once the model took over)
    expect(scene.meshes.filter((m) => m.name.startsWith("login-dragon")).length).toBe(0);
  });

  it("a dispose that races the async load leaks nothing", async () => {
    const template = makeDragonTemplate();
    const loadContainer: DragonContainerLoader = () => Promise.resolve(template);

    const ctrl = new ModelDragonController(scene, dotTex, mkOpts(0, loadContainer));
    ctrl.dispose(); // tear down BEFORE the load().then instantiation lands
    await flush();

    expect(roots().length).toBe(0);
    expect(scene.meshes.filter((m) => m.name.startsWith("login-dragon")).length).toBe(0);
  });
});
