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
import type { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { makeSoftDotTexture } from "./sprites";
import {
  DragonController,
  BeamController,
  ExplosionController,
  CombatFlashController,
  type FxController,
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
