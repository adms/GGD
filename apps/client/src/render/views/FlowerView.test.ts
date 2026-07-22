/**
 * flower-view-dispatch: the healing-flower view is a procedural glowing
 * BEACON (bobbing bloom + additive light column + pulsing ground halo +
 * rising motes), not the tiny flat waterlily .glb. Verifies it builds the
 * beacon meshes + a mote particle system, pools cleanly (activate/deactivate
 * reuse, no per-cycle geometry), gates motes with visibility, disposes
 * cleanly, and that the idle bob/pulse are pure functions. Runs on NullEngine.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FlowerView, bobOffset, pulse01 } from "./FlowerView";

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

describe("FlowerView beacon (flower-view-dispatch)", () => {
  it("builds the beacon meshes + a mote particle system, then disposes cleanly", () => {
    cover("flower-view-dispatch");
    const meshesBefore = scene.meshes.length;
    const psBefore = scene.particleSystems.length;

    const view = new FlowerView(scene, "desktop");

    // core + petals + pistil + light column + ground ring → many meshes
    expect(view.partCount).toBeGreaterThanOrEqual(4);
    expect(scene.meshes.length - meshesBefore).toBe(view.partCount);
    // named beacon parts exist
    const names = scene.meshes.map((m) => m.name);
    expect(names.some((n) => n.endsWith("-core"))).toBe(true);
    expect(names.some((n) => n.includes("-petal-"))).toBe(true);
    expect(names.some((n) => n.endsWith("-column"))).toBe(true);
    expect(names.some((n) => n.endsWith("-ring"))).toBe(true);
    // a mote particle system was registered
    expect(scene.particleSystems.length - psBefore).toBe(1);
    expect(view.moteSystem).toBeTruthy();

    view.dispose();
    // meshes and the particle system are gone again
    expect(scene.meshes.length).toBe(meshesBefore);
    expect(scene.particleSystems.length).toBe(psBefore);
  });

  it("starts hidden; activate shows + emits, deactivate hides + stops (pool gate)", () => {
    cover("flower-view-dispatch");
    const view = new FlowerView(scene, "desktop");
    // constructed disabled, motes never started (isStarted stays true after
    // stop() in Babylon, so gauge stop() via a call-spy instead)
    expect(view.root.isEnabled()).toBe(false);
    expect(view.moteSystem.isStarted()).toBe(false);

    const sys = view.moteSystem;
    let starts = 0;
    let stops = 0;
    const origStart = sys.start.bind(sys);
    const origStop = sys.stop.bind(sys);
    sys.start = (...a: Parameters<typeof origStart>) => (starts++, origStart(...a));
    sys.stop = (...a: Parameters<typeof origStop>) => (stops++, origStop(...a));

    view.activate(3);
    view.setPose(5, -2);
    expect(view.root.isEnabled()).toBe(true);
    expect(starts).toBe(1);
    expect(view.moteSystem.isStarted()).toBe(true);
    // emitter follows the flower (world-space Vector3)
    const emitter = view.moteSystem.emitter as { x: number; z: number };
    expect(emitter.x).toBe(5);
    expect(emitter.z).toBe(-2);

    view.deactivate();
    expect(view.root.isEnabled()).toBe(false);
    expect(stops).toBe(1);

    view.dispose();
  });

  it("pools across activate/deactivate cycles without creating geometry", () => {
    cover("flower-view-dispatch");
    const view = new FlowerView(scene, "desktop");
    const meshCount = scene.meshes.length;

    for (let i = 0; i < 3; i++) {
      view.activate(i);
      view.setPose(i, i);
      view.update(i * 100);
      view.deactivate();
    }
    // reuse only: no meshes allocated or leaked per cycle
    expect(scene.meshes.length).toBe(meshCount);

    view.dispose();
  });

  it("a dead flower hides while active; reviving shows it again", () => {
    cover("flower-view-dispatch");
    const view = new FlowerView(scene, "desktop");
    const sys = view.moteSystem;
    let stops = 0;
    const origStop = sys.stop.bind(sys);
    sys.stop = (...a: Parameters<typeof origStop>) => (stops++, origStop(...a));

    view.activate(1);
    expect(view.root.isEnabled()).toBe(true);
    expect(view.moteSystem.isStarted()).toBe(true);
    view.setAlive(false);
    expect(view.root.isEnabled()).toBe(false);
    expect(stops).toBe(1); // motes halted with the hide
    view.setAlive(true);
    expect(view.root.isEnabled()).toBe(true);
    expect(view.moteSystem.isStarted()).toBe(true);
    view.dispose();
  });

  it("mobile tier keeps the beacon geometry but cuts the mote budget", () => {
    cover("flower-view-dispatch");
    const desktop = new FlowerView(scene, "desktop");
    const mobile = new FlowerView(scene, "mobile");
    // same readable geometry on both tiers
    expect(mobile.partCount).toBe(desktop.partCount);
    // cheaper particles on mobile (halved budget)
    expect(mobile.moteSystem.emitRate).toBeLessThan(desktop.moteSystem.emitRate);
    expect(mobile.moteSystem.getCapacity()).toBeLessThan(desktop.moteSystem.getCapacity());
    desktop.dispose();
    mobile.dispose();
  });
});

describe("FlowerView idle motion is pure (flower-view-dispatch)", () => {
  it("bobOffset is deterministic, bounded by amplitude, and phase-sensitive", () => {
    cover("flower-view-dispatch");
    // deterministic
    expect(bobOffset(1234, 0.5)).toBe(bobOffset(1234, 0.5));
    // bounded by the default amplitude
    for (let t = 0; t < 4000; t += 37) {
      expect(Math.abs(bobOffset(t, 1.1))).toBeLessThanOrEqual(0.1 + 1e-9);
    }
    // different phase → different sway (de-syncs a field of flowers)
    expect(bobOffset(1000, 0)).not.toBe(bobOffset(1000, 2.0));
  });

  it("pulse01 is deterministic and stays within [0,1]", () => {
    cover("flower-view-dispatch");
    expect(pulse01(500, 0.3)).toBe(pulse01(500, 0.3));
    for (let t = 0; t < 4000; t += 41) {
      const p = pulse01(t, 0.7);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});
