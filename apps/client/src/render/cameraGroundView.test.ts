/**
 * hud-minimap-camera (rig half): the minimap's viewport box must be the REAL
 * camera frustum, not a drawn-on approximation.
 *
 * `CameraRig.groundView()` publishes the rig's live target/dolly/pitch/yaw/fov/
 * aspect to the frameBus, and `ui/hud/minimapMath.cameraGroundQuad` turns those
 * into four ground points. This test closes the loop on a headless NullEngine:
 * it compares that pure quad against Babylon's OWN picking rays through the four
 * viewport corners (`rig.screenToGround`, the exact code path a mouse click
 * uses). If anyone re-tunes the pitch, the dolly clamps or the fov, the drawn
 * box follows automatically — and if the math ever drifts from Babylon's
 * conventions, this fails.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
// side-effect: registers Scene.createPickingRay (as render/Renderer.ts does)
import "@babylonjs/core/Culling/ray";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { CameraRig, CAMERA_PITCH_RAD, DOLLY_DEFAULT } from "./CameraRig";
import { cameraGroundQuad } from "../ui/hud/minimapMath";

const W = 1280;
const H = 720;

let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
  engine = new NullEngine({
    renderWidth: W,
    renderHeight: H,
    textureSize: 4,
    deterministicLockstep: false,
    lockstepMaxSteps: 1,
  });
  scene = new Scene(engine);
});
afterEach(() => {
  scene.dispose();
  engine.dispose();
});

function frame(rig: CameraRig): void {
  rig.update({ dtMs: 16, localPos: null, cursor: null, panKeys: null, viewportWidth: W, viewportHeight: H });
  scene.render(); // flush the view/projection matrices the picking ray reads
}

describe("camera ground view → minimap viewport box (hud-minimap-camera)", () => {
  it("publishes the rig's OWN pitch/dolly/fov/aspect, not copies of them", () => {
    cover("hud-minimap-camera");
    const rig = new CameraRig(scene, { x: 12, z: -4 });
    frame(rig);
    const view = rig.groundView();
    expect(view.targetX).toBeCloseTo(12, 3);
    expect(view.targetZ).toBeCloseTo(-4, 3);
    expect(view.dolly).toBeCloseTo(DOLLY_DEFAULT, 3);
    expect(view.pitchRad).toBeCloseTo(CAMERA_PITCH_RAD, 5);
    expect(view.yawRad).toBeCloseTo(0, 6); // the fixed rig looks along +Z
    expect(view.fovRad).toBe(rig.camera.fov);
    expect(view.aspect).toBeCloseTo(W / H, 6);
  });

  it("GUARD: the drawn quad matches Babylon's picking rays at the viewport corners", () => {
    cover("hud-minimap-camera");
    const rig = new CameraRig(scene, { x: 5, z: -3 });
    frame(rig);
    const quad = cameraGroundQuad(rig.groundView())!;
    expect(quad.clamped).toBe(false);
    // same order as cameraGroundQuad: near-left, near-right, far-right, far-left.
    // Screen y grows DOWN, so the NEAR edge is the BOTTOM of the viewport.
    const picked = [
      rig.screenToGround(0, H),
      rig.screenToGround(W, H),
      rig.screenToGround(W, 0),
      rig.screenToGround(0, 0),
    ];
    picked.forEach((p, i) => {
      expect(p, `corner ${i}`).not.toBeNull();
      expect(quad.points[i]!.x, `corner ${i} x`).toBeCloseTo(p!.x, 3);
      expect(quad.points[i]!.z, `corner ${i} z`).toBeCloseTo(p!.z, 3);
    });
  });

  it("keeps matching after a zoom and a pan (it tracks the live rig)", () => {
    cover("hud-minimap-camera");
    const rig = new CameraRig(scene, { x: 0, z: 0 });
    rig.zoomBy(600); // dolly out
    rig.jumpTo({ x: -37, z: 11 });
    frame(rig);
    const quad = cameraGroundQuad(rig.groundView())!;
    const picked = [
      rig.screenToGround(0, H),
      rig.screenToGround(W, H),
      rig.screenToGround(W, 0),
      rig.screenToGround(0, 0),
    ];
    picked.forEach((p, i) => {
      expect(quad.points[i]!.x, `corner ${i} x`).toBeCloseTo(p!.x, 3);
      expect(quad.points[i]!.z, `corner ${i} z`).toBeCloseTo(p!.z, 3);
    });
    // and the box really did grow + move with the rig
    expect(quad.points[0]!.x).toBeLessThan(-37);
    expect(quad.points[1]!.x).toBeGreaterThan(-37);
  });

  it("split-screen: each rig reports ITS viewport's aspect", () => {
    cover("hud-minimap-camera");
    const rig = new CameraRig(scene, { x: 0, z: 0 });
    frame(rig);
    const full = rig.groundView().aspect;
    // couch play clips a rig to a quadrant (see render/ViewportManager)
    rig.camera.viewport.width = 0.5;
    rig.camera.viewport.height = 0.5;
    expect(rig.groundView().aspect).toBeCloseTo(full, 6); // same shape, half size
    rig.camera.viewport.width = 0.5;
    rig.camera.viewport.height = 1;
    expect(rig.groundView().aspect).toBeCloseTo(full / 2, 6);
  });

  it("REGRESSION: the view never lags the applied transform (getTarget is stale)", () => {
    cover("hud-minimap-camera");
    // Babylon refreshes TargetCamera._currentTarget when it recomputes the view
    // matrix, NOT when setTarget is called — so reading getTarget() here would
    // report the PREVIOUS frame's target (and, before the first render, the
    // origin), drawing the viewport box in the wrong place after every jump.
    const rig = new CameraRig(scene, { x: 0, z: 0 });
    rig.jumpTo({ x: 40, z: -12 });
    expect(rig.camera.getTarget().x).not.toBeCloseTo(40, 1); // stale, on purpose
    const view = rig.groundView(); // …but the published view is already correct
    expect(view.targetX).toBeCloseTo(40, 3);
    expect(view.targetZ).toBeCloseTo(-12, 3);
    // self-consistency: eyeY === dolly·sin(pitch), which cameraGroundQuad assumes
    expect(rig.camera.position.y).toBeCloseTo(view.dolly * Math.sin(view.pitchRad), 6);
  });

  it("minimap focus breaks follow-lock without touching the order path", () => {
    cover("hud-minimap-camera");
    const rig = new CameraRig(scene, { x: 0, z: 0 });
    expect(rig.followLock).toBe(true);
    rig.focusOn({ x: 40, z: -12 });
    expect(rig.followLock).toBe(false); // free-look, like an edge-pan
    expect(rig.groundView().targetX).toBeCloseTo(40, 3);
    expect(rig.groundView().targetZ).toBeCloseTo(-12, 3);
    // Space re-locks, exactly as before
    rig.toggleFollow();
    expect(rig.followLock).toBe(true);
    // …and the settlement hero shot outranks a stray minimap click
    rig.setSettlement({ x: 0, z: 0 }, { x: 0, z: 1 });
    rig.focusOn({ x: 99, z: 99 });
    expect(rig.groundView().targetX).not.toBeCloseTo(99, 1);
  });
});
