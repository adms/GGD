/**
 * couch-viewport-follow: one camera per local player on ONE scene, each
 * clipped to its own viewport rect and following its OWN champion.
 * Runs on Babylon's NullEngine (headless).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ViewportManager } from "./ViewportManager";

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

const CENTER = { x: 0, z: 0 };

function settle(vm: ViewportManager, player: number, pos: { x: number; z: number }): void {
  // exp-smoothed follow converges over repeated frames
  for (let i = 0; i < 200; i++) {
    vm.rigFor(player).update({
      dtMs: 16,
      localPos: pos,
      cursor: null,
      panKeys: null,
      viewportWidth: 800,
      viewportHeight: 600,
    });
  }
}

describe("ViewportManager (couch cameras)", () => {
  it("single player: one full-screen camera, classic activeCamera", () => {
    cover("couch-viewport-follow");
    const vm = new ViewportManager(scene, CENTER, 1);
    expect(vm.count).toBe(1);
    expect(scene.activeCamera).toBe(vm.primary.camera);
    expect(vm.primary.camera.viewport.width).toBe(1);
    expect(vm.primary.camera.viewport.height).toBe(1);
  });

  it("two players: two cameras on activeCameras, each clipped to its half", () => {
    cover("couch-viewport-follow");
    const vm = new ViewportManager(scene, CENTER, 2);
    expect(vm.count).toBe(2);
    expect(scene.activeCameras).toHaveLength(2);
    const v0 = vm.rigFor(0).camera.viewport;
    const v1 = vm.rigFor(1).camera.viewport;
    expect([v0.x, v0.width, v0.height]).toEqual([0, 0.5, 1]);
    expect([v1.x, v1.width, v1.height]).toEqual([0.5, 0.5, 1]);
  });

  it("each camera follows its OWN champion", () => {
    cover("couch-viewport-follow");
    const vm = new ViewportManager(scene, CENTER, 2);
    settle(vm, 0, { x: -20, z: 4 });
    settle(vm, 1, { x: 17, z: -9 });

    const c0 = vm.rigFor(0).camera;
    const c1 = vm.rigFor(1).camera;
    // camera x tracks the target x exactly; z sits behind the target
    expect(c0.position.x).toBeCloseTo(-20, 0);
    expect(c1.position.x).toBeCloseTo(17, 0);
    expect(c0.position.z).toBeLessThan(4);
    expect(c1.position.z).toBeLessThan(-9);
    // and the two rigs never share state
    expect(c0.position.x).not.toBeCloseTo(c1.position.x, 0);
  });

  it("four players: quadrant viewports in reading order", () => {
    cover("couch-viewport-follow");
    const vm = new ViewportManager(scene, CENTER, 4);
    expect(scene.activeCameras).toHaveLength(4);
    const tl = vm.rigFor(0).camera.viewport;
    const br = vm.rigFor(3).camera.viewport;
    expect([tl.x, tl.y]).toEqual([0, 0.5]); // Babylon y: bottom-up
    expect([br.x, br.y]).toEqual([0.5, 0]);
  });
});
