/**
 * LoginScene lifecycle under NullEngine (headless): it builds the full
 * procedural cast, runs no render loop until asked, and disposes cleanly with
 * no engine/scene leaks — which is exactly what AuthScreen's unmount does.
 *
 * DynamicTexture (sky/cloud/mote sprites) needs an OffscreenCanvas; headless
 * has none, so a tiny 2D stub is installed.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { LoginScene, type LoginSceneOptions } from "./LoginScene";

const FX_PREFIXES = ["login-dragon", "login-beam", "login-expl", "login-flash"];
const fxMeshCount = (s: LoginScene): number =>
  s.scene.meshes.filter((m) => FX_PREFIXES.some((p) => m.name.startsWith(p))).length;

// --- OffscreenCanvas 2D stub (same as sprites.test) --------------------------
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

function makeScene(extra: Partial<LoginSceneOptions> = {}): { scene: LoginScene; engine: NullEngine } {
  let engine!: NullEngine;
  const scene = new LoginScene(null as unknown as HTMLCanvasElement, {
    engineFactory: () => (engine = new NullEngine()) as unknown as Engine,
    autoStart: false,
    islandCount: 4,
    now: () => 0,
    ...extra,
  });
  return { scene, engine };
}

describe("LoginScene", () => {
  it("constructs the procedural cast under NullEngine without a render loop", () => {
    cover("login-scene-lifecycle");
    cover("login-scene-contents");
    const { scene } = makeScene();
    // sky dome + arena islands + magic sigils + moon + shafts + mist + FX geometry
    expect(scene.scene.meshes.length).toBeGreaterThan(10);
    // ambient embers + stars, plus the capped FX particle systems (dragon trails
    // + explosion sparks) — bounded, never unbounded
    expect(scene.scene.particleSystems.length).toBeGreaterThanOrEqual(2);
    expect(scene.scene.particleSystems.length).toBeLessThanOrEqual(12);
    // the boss-battle FX geometry is present in the default (epic) build
    expect(fxMeshCount(scene)).toBeGreaterThan(0);
    // a camera exists and is the active one
    expect(scene.scene.activeCamera).toBeTruthy();
    expect(scene.isRunning).toBe(false);
    scene.dispose();
  });

  it("applies the dark-epic palette: EXP2 depth fog + near-black clear colour", () => {
    cover("login-dark-palette");
    const { scene } = makeScene();
    expect(scene.scene.fogMode).toBe(Scene.FOGMODE_EXP2);
    expect(scene.scene.fogDensity).toBeGreaterThan(0);
    const c = scene.scene.clearColor;
    expect(c.r).toBeLessThan(0.1);
    expect(c.g).toBeLessThan(0.1);
    expect(c.b).toBeLessThan(0.15);
    scene.dispose();
  });

  it("calm mode (epicFx:false) omits the strobing dragon/beam/explosion/flash FX", () => {
    cover("login-calm-mode");
    const calm = makeScene({ epicFx: false });
    // no photosensitivity-risk FX geometry, and only the 2 ambient drift systems
    expect(fxMeshCount(calm.scene)).toBe(0);
    expect(calm.scene.scene.particleSystems.length).toBe(2); // embers + stars only
    calm.scene.dispose();
    // …whereas the default epic build DOES create them (guards against a silent no-op)
    const epic = makeScene();
    expect(fxMeshCount(epic.scene)).toBeGreaterThan(0);
    expect(epic.scene.scene.particleSystems.length).toBeGreaterThan(2);
    epic.scene.dispose();
  });

  it("pumping many frames grows nothing — the hot loop is allocation-free", () => {
    cover("login-fx-alloc-free");
    let clock = 0;
    const scene = new LoginScene(null as unknown as HTMLCanvasElement, {
      engineFactory: () => new NullEngine() as unknown as Engine,
      autoStart: false,
      islandCount: 4,
      now: () => clock,
    });
    const snap = (): [number, number, number] => [
      scene.scene.meshes.length,
      scene.scene.particleSystems.length,
      scene.scene.materials.length,
    ];
    clock = 1000;
    (scene as unknown as { frame(): void }).frame();
    const before = snap();
    for (let i = 0; i < 150; i++) {
      clock += 100; // > MIN_FRAME_MS so the draw + FX advance every step
      (scene as unknown as { frame(): void }).frame();
    }
    expect(snap()).toEqual(before);
    scene.dispose();
  });

  it("disposes cleanly — no engine/scene leak (idempotent)", () => {
    cover("login-scene-dispose");
    const { scene, engine } = makeScene();
    expect(engine.isDisposed).toBe(false);
    scene.dispose();
    expect(scene.scene.isDisposed).toBe(true);
    expect(engine.isDisposed).toBe(true);
    // second dispose is a safe no-op (React StrictMode double-invoke / re-unmount)
    expect(() => scene.dispose()).not.toThrow();
  });

  it("start/stop toggles the render loop flag", () => {
    cover("login-scene-runloop");
    const { scene } = makeScene();
    expect(scene.isRunning).toBe(false);
    scene.start();
    expect(scene.isRunning).toBe(true);
    scene.start(); // idempotent
    expect(scene.isRunning).toBe(true);
    scene.stop();
    expect(scene.isRunning).toBe(false);
    scene.dispose();
    scene.start(); // disposed → cannot restart
    expect(scene.isRunning).toBe(false);
  });

  it("advances animation deterministically when a frame is pumped", () => {
    cover("login-scene-contents");
    let clock = 0;
    const scene = new LoginScene(null as unknown as HTMLCanvasElement, {
      engineFactory: () => new NullEngine() as unknown as Engine,
      autoStart: false,
      islandCount: 3,
      now: () => clock,
    });
    const cam = scene.scene.activeCamera as unknown as { alpha: number };
    const a0 = cam.alpha;
    // drive frames directly (bypass rAF scheduling); the fps-cap needs the
    // clock to advance past the min-frame budget for the draw to take effect
    clock = 1000;
    (scene as unknown as { frame(): void }).frame();
    clock = 2000;
    (scene as unknown as { frame(): void }).frame();
    expect(cam.alpha).not.toBe(a0); // camera drifted
    scene.dispose();
  });

  // --- dragon roars (near/far, panned) -------------------------------------

  it("dragons roar on their breath edges → onRoar fires with bounded volume+pan", () => {
    cover("login-roar-emit");
    let clock = 0;
    const roars: { volume: number; pan: number; big: boolean }[] = [];
    const scene = new LoginScene(null as unknown as HTMLCanvasElement, {
      engineFactory: () => new NullEngine() as unknown as Engine,
      autoStart: false,
      islandCount: 4,
      now: () => clock,
      onRoar: (ev) => roars.push(ev),
    });
    // pump across several breath cycles (dragon periods 11 s & 13 s, 40 s total)
    for (let i = 0; i < 400; i++) {
      clock += 100;
      (scene as unknown as { frame(): void }).frame();
    }
    expect(roars.length).toBeGreaterThan(0);
    for (const r of roars) {
      expect(Number.isFinite(r.volume)).toBe(true);
      expect(r.volume).toBeGreaterThan(0);
      expect(r.pan).toBeGreaterThanOrEqual(-1);
      expect(r.pan).toBeLessThanOrEqual(1);
      expect(r.big).toBe(false); // ambient roars are never the scripted "big" one
    }
    scene.dispose();
  });

  // --- enter transition (swoop → white flash → onComplete) -----------------

  it("playEnterTransition swoops, drives the flash to 1, fires a big roar + onComplete once", () => {
    cover("login-enter-transition");
    let clock = 0;
    let completes = 0;
    let lastFlash = -1;
    const roars: { big: boolean; volume: number }[] = [];
    const scene = new LoginScene(null as unknown as HTMLCanvasElement, {
      engineFactory: () => new NullEngine() as unknown as Engine,
      autoStart: false,
      islandCount: 4,
      now: () => clock,
      onFlash: (a) => {
        lastFlash = a;
      },
      onRoar: (ev) => roars.push(ev),
    });
    clock = 1000;
    scene.playEnterTransition(() => completes++);
    // the scripted swoop roar is loud + centred and fires immediately
    expect(roars.some((r) => r.big && r.volume > 1)).toBe(true);
    // pump past the swoop duration (~1.4 s) in 60 ms steps
    for (let i = 0; i < 60; i++) {
      clock += 60;
      (scene as unknown as { frame(): void }).frame();
    }
    expect(completes).toBe(1);
    expect(lastFlash).toBeCloseTo(1); // ends fully white
    // extra frames never re-fire onComplete (exactly-once)
    for (let i = 0; i < 20; i++) {
      clock += 60;
      (scene as unknown as { frame(): void }).frame();
    }
    expect(completes).toBe(1);
    scene.dispose();
  });

  it("playEnterTransition always completes — disposed scene fires onComplete immediately", () => {
    cover("login-enter-oncomplete");
    const { scene } = makeScene();
    scene.dispose();
    let n = 0;
    scene.playEnterTransition(() => n++);
    expect(n).toBe(1);
  });

  it("disposing mid-swoop still fires onComplete exactly once (hard fallback)", () => {
    cover("login-enter-oncomplete");
    let clock = 0;
    let n = 0;
    const scene = new LoginScene(null as unknown as HTMLCanvasElement, {
      engineFactory: () => new NullEngine() as unknown as Engine,
      autoStart: false,
      islandCount: 3,
      now: () => clock,
    });
    clock = 500;
    scene.playEnterTransition(() => n++);
    clock = 700;
    (scene as unknown as { frame(): void }).frame(); // partway through — flash not full yet
    expect(n).toBe(0);
    scene.dispose(); // teardown mid-swoop must still proceed
    expect(n).toBe(1);
  });

  // --- return intro (reverse pull-back, app → login, task #26) --------------

  it("playReturnIntro starts ON the island, roars big once, and eases back to the drift vista", () => {
    cover("login-return-intro");
    let clock = 0;
    let completes = 0;
    const roars: { volume: number; pan: number; big: boolean }[] = [];
    const scene = new LoginScene(null as unknown as HTMLCanvasElement, {
      engineFactory: () => new NullEngine() as unknown as Engine,
      autoStart: false,
      islandCount: 4,
      now: () => clock,
      onRoar: (ev) => roars.push(ev),
    });
    const cam = scene.scene.activeCamera as unknown as { radius: number };
    clock = 1000;
    scene.playReturnIntro(() => completes++);
    // the big ANGRY roar fires immediately, loud + centred (→ dragonRoarBig)
    expect(roars.length).toBe(1);
    expect(roars[0]!.big).toBe(true);
    expect(roars[0]!.volume).toBeGreaterThan(1);
    expect(roars[0]!.pan).toBe(0);
    // the camera SNAPPED onto the island close-up (the enter-transition end-state)
    expect(cam.radius).toBeLessThan(10); // approachRadius 7 ≪ the resting 40+ vista
    const startRadius = cam.radius;
    // pump past the pull-back (~1.4 s) in 60 ms steps — radius eases back OUT
    let prevRadius = startRadius;
    for (let i = 0; i < 60; i++) {
      clock += 60;
      (scene as unknown as { frame(): void }).frame();
      expect(cam.radius).toBeGreaterThanOrEqual(prevRadius - 0.3); // monotone-ish (drift bob tolerance)
      prevRadius = cam.radius;
    }
    expect(completes).toBe(1);
    // ended back OUT at the resting sky vista (radius ≫ the island close-up)
    expect(cam.radius).toBeGreaterThan(30);
    // extra frames never re-fire onComplete (exactly-once) and drift keeps running
    for (let i = 0; i < 20; i++) {
      clock += 60;
      (scene as unknown as { frame(): void }).frame();
    }
    expect(completes).toBe(1);
    expect(roars.filter((r) => r.big).length).toBe(1); // ONE scripted roar total
    scene.dispose();
  });

  it("playReturnIntro always completes — disposed scene fires onComplete immediately", () => {
    cover("login-return-oncomplete");
    const { scene } = makeScene();
    scene.dispose();
    let n = 0;
    scene.playReturnIntro(() => n++);
    expect(n).toBe(1);
  });

  it("disposing mid-pull-back still fires onComplete exactly once", () => {
    cover("login-return-oncomplete");
    let clock = 0;
    let n = 0;
    const scene = new LoginScene(null as unknown as HTMLCanvasElement, {
      engineFactory: () => new NullEngine() as unknown as Engine,
      autoStart: false,
      islandCount: 3,
      now: () => clock,
    });
    clock = 500;
    scene.playReturnIntro(() => n++);
    clock = 700;
    (scene as unknown as { frame(): void }).frame(); // partway through the pull-back
    expect(n).toBe(0);
    scene.dispose(); // teardown mid-pull-back must still complete
    expect(n).toBe(1);
    expect(() => scene.dispose()).not.toThrow(); // and stays exactly-once
    expect(n).toBe(1);
  });

  it("playReturnIntro without a callback is safe and a double-invoke is ignored", () => {
    cover("login-return-intro");
    let clock = 0;
    const roars: { big: boolean }[] = [];
    const scene = new LoginScene(null as unknown as HTMLCanvasElement, {
      engineFactory: () => new NullEngine() as unknown as Engine,
      autoStart: false,
      islandCount: 3,
      now: () => clock,
      onRoar: (ev) => roars.push(ev),
    });
    clock = 100;
    expect(() => scene.playReturnIntro()).not.toThrow();
    scene.playReturnIntro(); // second call while animating — ignored (no 2nd roar)
    expect(roars.filter((r) => r.big).length).toBe(1);
    for (let i = 0; i < 60; i++) {
      clock += 60;
      (scene as unknown as { frame(): void }).frame();
    }
    scene.dispose();
  });
});
