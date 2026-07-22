/**
 * spectator-cam: the death-spectator camera state machine on CameraRig.
 * ALIVE→DEAD unlocks follow + widens the zoom-out clamp + centers on the fight;
 * DEAD→ALIVE (respawn) re-locks + snaps to the hero + restores the clamp. Runs
 * on Babylon's NullEngine (headless).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { CameraRig, DOLLY_DEFAULT, DOLLY_MIN } from "./CameraRig";

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

/** Flush the current dolly/target to the camera transform (as the loop does). */
function applyFrame(rig: CameraRig): void {
  rig.update({ dtMs: 16, localPos: null, cursor: null, panKeys: null, viewportWidth: 800, viewportHeight: 600 });
}

describe("death spectator camera", () => {
  it("starts alive: follow-locked, not spectating", () => {
    cover("spectator-cam");
    const rig = new CameraRig(scene, { x: 0, z: 0 });
    expect(rig.followLock).toBe(true);
    expect(rig.spectating).toBe(false);
  });

  it("ALIVE→DEAD unlocks follow and centers on the fight", () => {
    cover("spectator-cam");
    const rig = new CameraRig(scene, { x: 0, z: 0 });
    rig.setDead(true, { x: 30, z: -10 });
    expect(rig.spectating).toBe(true);
    expect(rig.followLock).toBe(false); // free pan across the arena
    expect(rig.camera.position.x).toBeCloseTo(30, 0); // recentered on the fight
  });

  it("widens the zoom-out clamp while dead", () => {
    cover("spectator-cam");
    const alive = new CameraRig(scene, { x: 0, z: 0 });
    alive.zoomBy(1e6); // clamps at the alive max
    applyFrame(alive);
    const aliveHeight = alive.camera.position.y;

    const dead = new CameraRig(scene, { x: 0, z: 0 });
    dead.setDead(true, null);
    dead.zoomBy(1e6); // clamps at the wider dead max
    applyFrame(dead);
    expect(dead.camera.position.y).toBeGreaterThan(aliveHeight);
  });

  it("DEAD→ALIVE re-locks, snaps to the hero, and restores the clamp", () => {
    cover("spectator-cam");
    const rig = new CameraRig(scene, { x: 0, z: 0 });
    rig.setDead(true, { x: 30, z: 30 });
    rig.zoomBy(1e6); // zoom way out while spectating
    rig.setDead(false, { x: 5, z: 7 }); // respawn next round
    expect(rig.spectating).toBe(false);
    expect(rig.followLock).toBe(true); // re-locked on the hero
    expect(rig.camera.position.x).toBeCloseTo(5, 0); // snapped back

    // clamp restored to the alive max — matches a fresh alive rig maxed out
    rig.zoomBy(1e6);
    applyFrame(rig);
    const ref = new CameraRig(scene, { x: 5, z: 7 });
    ref.zoomBy(1e6);
    applyFrame(ref);
    expect(rig.camera.position.y).toBeCloseTo(ref.camera.position.y, 3);
  });

  it("is idempotent per frame and respects a manual Space re-follow while dead", () => {
    cover("spectator-cam");
    const rig = new CameraRig(scene, { x: 0, z: 0 });
    rig.setDead(false); // already alive → no-op
    expect(rig.followLock).toBe(true);
    rig.setDead(true, { x: 1, z: 1 });
    expect(rig.followLock).toBe(false);
    rig.toggleFollow(); // player presses Space to follow again while dead
    expect(rig.followLock).toBe(true);
    rig.setDead(true, { x: 2, z: 2 }); // same (dead) state → no-op, respects the toggle
    expect(rig.followLock).toBe(true);
    rig.setDead(false, { x: 0, z: 0 }); // respawn still re-locks
    expect(rig.followLock).toBe(true);
    expect(rig.spectating).toBe(false);
  });
});

describe("default zoom (camera-default-closest)", () => {
  it("defaults to the closest allowed zoom-in; zooming in further is a no-op, zooming out still works", () => {
    cover("camera-default-closest");
    // the default is DERIVED from the limit — they can never drift apart
    expect(DOLLY_DEFAULT).toBe(DOLLY_MIN);

    const rig = new CameraRig(scene, { x: 0, z: 0 });
    applyFrame(rig);
    const defaultY = rig.camera.position.y;

    rig.zoomBy(-1e6); // try to zoom in past the clamp
    applyFrame(rig);
    expect(rig.camera.position.y).toBeCloseTo(defaultY, 6); // already at the closest limit

    rig.zoomBy(1e6); // zoom range unchanged — player can still zoom out
    applyFrame(rig);
    expect(rig.camera.position.y).toBeGreaterThan(defaultY);
  });
});

describe("settlement front-view freeze (settle-cam-freeze)", () => {
  /** Advance a rig one frame with the given movement input. */
  function step(rig: CameraRig, localPos: { x: number; z: number } | null): void {
    rig.update({ dtMs: 16, localPos, cursor: null, panKeys: null, viewportWidth: 800, viewportHeight: 600 });
  }

  it("enters settlement, framing the hero from the front at a low angle", () => {
    cover("settle-cam-freeze");
    const rig = new CameraRig(scene, { x: 0, z: 0 });
    expect(rig.inSettlement).toBe(false);
    rig.setSettlement({ x: 10, z: 4 }, { x: 0, z: 1 });
    expect(rig.inSettlement).toBe(true);
    step(rig, null);
    // camera sits on the facing (+Z) side of the hero, below the look target
    expect(rig.camera.position.z).toBeGreaterThan(4);
    expect(rig.camera.position.y).toBeLessThan(1.55);
  });

  it("ignores movement/pan input while frozen (still hero)", () => {
    cover("settle-cam-freeze");
    const a = new CameraRig(scene, { x: 0, z: 0 });
    const b = new CameraRig(scene, { x: 0, z: 0 });
    a.setSettlement({ x: 0, z: 0 }, { x: 0, z: 1 });
    b.setSettlement({ x: 0, z: 0 }, { x: 0, z: 1 });
    // drive identical time on both, but feed b a moving champion + follow
    for (let i = 0; i < 20; i++) {
      step(a, null);
      step(b, { x: i * 3, z: i * -2 }); // would steer a normal follow cam
    }
    // input had no effect: both cameras are at the same settlement pose
    expect(b.camera.position.x).toBeCloseTo(a.camera.position.x, 6);
    expect(b.camera.position.y).toBeCloseTo(a.camera.position.y, 6);
    expect(b.camera.position.z).toBeCloseTo(a.camera.position.z, 6);
  });

  it("does not restart the animation when re-set to the same position", () => {
    cover("settle-cam-freeze");
    const rig = new CameraRig(scene, { x: 0, z: 0 });
    rig.setSettlement({ x: 5, z: 5 }, { x: 1, z: 0 });
    for (let i = 0; i < 30; i++) step(rig, null); // dolly in a while
    const before = { x: rig.camera.position.x, y: rig.camera.position.y, z: rig.camera.position.z };
    rig.setSettlement({ x: 5, z: 5 }, { x: 1, z: 0 }); // same target → no reset
    step(rig, null);
    // a reset would jump back to the far dolly start; instead it barely moves
    expect(Math.hypot(rig.camera.position.x - before.x, rig.camera.position.z - before.z)).toBeLessThan(0.2);
  });

  it("clearSettlement restores the normal follow camera", () => {
    cover("settle-cam-freeze");
    const rig = new CameraRig(scene, { x: 0, z: 0 });
    rig.setSettlement({ x: 3, z: 3 }, { x: 0, z: 1 });
    step(rig, null);
    rig.clearSettlement();
    expect(rig.inSettlement).toBe(false);
    // follow-lock is intact → the rig recenters on the followed champion
    step(rig, { x: 20, z: 0 });
    step(rig, { x: 20, z: 0 });
    expect(rig.camera.position.x).toBeGreaterThan(3); // moved toward the hero
  });
});

describe("camera shake (juice-camera-shake)", () => {
  /** Baseline camera position at (0,0) with no shake, follow off. */
  function restPosition(): { x: number; y: number; z: number } {
    const rig = new CameraRig(scene, { x: 0, z: 0 });
    applyFrame(rig);
    return { x: rig.camera.position.x, y: rig.camera.position.y, z: rig.camera.position.z };
  }

  it("addShake offsets the camera position, then decays back to rest", () => {
    cover("juice-camera-shake");
    const rest = restPosition();
    const rig = new CameraRig(scene, { x: 0, z: 0 });
    applyFrame(rig); // settle at rest
    rig.addShake(0.6, 300);
    // advance a frame — the camera should now be offset from rest
    rig.update({ dtMs: 16, localPos: null, cursor: null, panKeys: null, viewportWidth: 800, viewportHeight: 600 });
    const dx = rig.camera.position.x - rest.x;
    const dy = rig.camera.position.y - rest.y;
    expect(Math.hypot(dx, dy)).toBeGreaterThan(1e-3);

    // run past the impulse duration — the offset must fully decay to rest
    for (let t = 0; t < 30; t++) {
      rig.update({ dtMs: 16, localPos: null, cursor: null, panKeys: null, viewportWidth: 800, viewportHeight: 600 });
    }
    expect(rig.camera.position.x).toBeCloseTo(rest.x, 5);
    expect(rig.camera.position.y).toBeCloseTo(rest.y, 5);
  });

  it("ignores a zero/negative amplitude or duration", () => {
    cover("juice-camera-shake");
    const rest = restPosition();
    const rig = new CameraRig(scene, { x: 0, z: 0 });
    rig.addShake(0, 300);
    rig.addShake(0.5, 0);
    applyFrame(rig);
    expect(rig.camera.position.x).toBeCloseTo(rest.x, 5);
    expect(rig.camera.position.y).toBeCloseTo(rest.y, 5);
  });
});
