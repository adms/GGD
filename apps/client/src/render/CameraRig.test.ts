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
import { Configs, CAMERA_DOC_ID, DEFAULT_CAMERA } from "@ggd/shared/content";
import { CameraRig, DOLLY_DEFAULT, DOLLY_MIN, CAMERA_PITCH_RAD } from "./CameraRig";

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

describe("combat camera pitch (camera-pitch-topdown)", () => {
  it("pins a steep, top-down-but-not-overhead pitch (raised from the old 55°)", () => {
    const deg = (CAMERA_PITCH_RAD * 180) / Math.PI;
    expect(deg).toBeCloseTo(68, 5);
    // clearly steeper than the old 55° flat cam, but well short of a 90° overhead map
    expect(deg).toBeGreaterThan(60);
    expect(deg).toBeLessThan(75);
  });

  it("derives a finite, sane eye-height / standoff at the closest (worst-case) zoom", () => {
    const eyeHeight = DOLLY_MIN * Math.sin(CAMERA_PITCH_RAD);
    const standoff = DOLLY_MIN * Math.cos(CAMERA_PITCH_RAD);
    expect(Number.isFinite(eyeHeight)).toBe(true);
    expect(Number.isFinite(standoff)).toBe(true);
    // steeper pitch lifts the eye and shortens the standoff vs the old 55° cam
    // (eye 8.19u→9.27u, standoff 5.74u→3.75u)
    expect(eyeHeight).toBeGreaterThan(8.19); // above the old 55° eye height
    expect(eyeHeight).toBeLessThan(11);
    expect(standoff).toBeGreaterThan(2);
    expect(standoff).toBeLessThan(5.74); // below the old 55° standoff → more overhead
    // eye sits far above the 2.4u prop-height cap → occluders can't hide heroes (#29/#103)
    expect(eyeHeight).toBeGreaterThan(2.4 * 2);
  });

  it("places the rest camera on the pitch, unchanged framing distance", () => {
    const rig = new CameraRig(scene, { x: 0, z: 0 });
    applyFrame(rig);
    // eye = dolly·sin(pitch) up, dolly·cos(pitch) south (−Z) of the target
    expect(rig.camera.position.y).toBeCloseTo(DOLLY_DEFAULT * Math.sin(CAMERA_PITCH_RAD), 5);
    expect(rig.camera.position.z).toBeCloseTo(-DOLLY_DEFAULT * Math.cos(CAMERA_PITCH_RAD), 5);
    // the eye→target distance is exactly `dolly` for ANY pitch — steepening the
    // angle keeps champion size and the visible ground patch constant
    const dist = Math.hypot(rig.camera.position.y, rig.camera.position.z);
    expect(dist).toBeCloseTo(DOLLY_DEFAULT, 5);
  });
});

describe("開局預設鏡頭 = 區間的最遠端 (camera-default-closest / GH#361)", () => {
  // ⚠️ `cover` 的 token 是 `docs/todo/restart-cheats.md` rc-19 的 **join key**。
  //    #361 把行為整個翻面（#31a 的「預設＝最近」→「預設＝最遠」），但 ⛔ token
  //    不改名 —— 改名等於對 todo-check 宣稱「那一列沒有測試」。
  afterEach(() => Configs.clear());

  it("一進場就在最遠端（離地板最高），玩家只能往內拉近", () => {
    cover("camera-default-closest");
    const rig = new CameraRig(scene, { x: 0, z: 0 });
    applyFrame(rig);
    const startY = rig.camera.position.y;

    rig.zoomBy(1e6); // 已經在最遠端 → 再往外滾一動都不動
    applyFrame(rig);
    expect(rig.camera.position.y).toBeCloseTo(startY, 6);

    rig.zoomBy(-1e6); // 往內拉近 → 真的更貼地，而且停在 minDolly
    applyFrame(rig);
    expect(rig.camera.position.y).toBeLessThan(startY);
    expect(rig.camera.position.y).toBeCloseTo(DOLLY_MIN * Math.sin(CAMERA_PITCH_RAD), 5);
  });

  it("那個距離是**後台的一格**，⛔ 不是常數 —— 填成最近視野就一鍵 rollback 回 #31a", () => {
    cover("camera-default-closest");
    Configs.register({
      id: CAMERA_DOC_ID,
      schema: "config.camera@1",
      zoom: { ...DEFAULT_CAMERA, defaultDolly: DEFAULT_CAMERA.minDolly },
    });
    const rolledBack = new CameraRig(scene, { x: 0, z: 0 });
    applyFrame(rolledBack);
    expect(rolledBack.camera.position.y).toBeCloseTo(DOLLY_MIN * Math.sin(CAMERA_PITCH_RAD), 5);
    // …而手把 R3 的縮放圈跟著換邊，⛔ 不會變成三下 no-op
    expect(rolledBack.zoomAwaySign).toBe(1);
  });

  it("歸位是絕對回到設定的預設，⛔ 不是「往內推到撞牆」", () => {
    cover("camera-default-closest");
    const rig = new CameraRig(scene, { x: 0, z: 0 });
    applyFrame(rig);
    const startY = rig.camera.position.y;
    rig.zoomBy(-1e6); // 玩家自己拉到最貼地
    rig.homeZoom();
    applyFrame(rig);
    expect(rig.camera.position.y).toBeCloseTo(startY, 6);
    expect(rig.zoomAwaySign).toBe(-1); // 出貨預設在最遠端 → R3 一節一節往內
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

  it("a DIRECTIONAL shake kicks the eye along the ground-plane hit vector, then settles", () => {
    cover("juice-camera-directional");
    const rest = restPosition();
    const rig = new CameraRig(scene, { x: 0, z: 0 });
    applyFrame(rig);
    // a hit from -Z: knockback vector points +Z → the eye should lurch in Z
    rig.addShake(0.7, 260, { dir: { x: 0, z: 1 }, style: "directional", kick: 0.7 });
    rig.update({ dtMs: 16, localPos: null, cursor: null, panKeys: null, viewportWidth: 800, viewportHeight: 600 });
    // the ground-plane (Z) component moved — the directional kick, not just the ring
    expect(Math.abs(rig.camera.position.z - rest.z)).toBeGreaterThan(1e-2);
    // crisp settle: fully back to rest after the impulse window
    for (let t = 0; t < 30; t++) {
      rig.update({ dtMs: 16, localPos: null, cursor: null, panKeys: null, viewportWidth: 800, viewportHeight: 600 });
    }
    expect(rig.camera.position.z).toBeCloseTo(rest.z, 5);
    expect(rig.camera.position.x).toBeCloseTo(rest.x, 5);
  });

  it("an OMNI shake does not add a directional ground kick (radial ring only)", () => {
    cover("juice-camera-directional");
    const rig = new CameraRig(scene, { x: 0, z: 0 });
    applyFrame(rig);
    const restZ = rig.camera.position.z;
    // omni style with a dir present → the dir is ignored, no persistent Z lurch
    rig.addShake(0.7, 260, { dir: { x: 0, z: 1 }, style: "omni" });
    // average the Z offset across the ring — a pure radial jitter has none on Z
    let sumZ = 0;
    for (let t = 0; t < 8; t++) {
      rig.update({ dtMs: 16, localPos: null, cursor: null, panKeys: null, viewportWidth: 800, viewportHeight: 600 });
      sumZ += rig.camera.position.z - restZ;
    }
    expect(Math.abs(sumZ)).toBeLessThan(1e-6); // Z is untouched by an omni shake
  });

  it("clamps the SUMMED offset so a pile-up cannot become a screen-quake", () => {
    cover("juice-camera-directional");
    const rest = restPosition();
    const rig = new CameraRig(scene, { x: 0, z: 0 });
    applyFrame(rig);
    // fill the whole impulse pool with max-strength kicks on the same frame
    for (let i = 0; i < 6; i++) {
      rig.addShake(0.85, 260, { dir: { x: 1, z: 0 }, style: "directional", kick: 0.6 });
    }
    let peak = 0;
    for (let t = 0; t < 20; t++) {
      rig.update({ dtMs: 16, localPos: null, cursor: null, panKeys: null, viewportWidth: 800, viewportHeight: 600 });
      peak = Math.max(
        peak,
        Math.hypot(
          rig.camera.position.x - rest.x,
          rig.camera.position.y - rest.y,
          rig.camera.position.z - rest.z,
        ),
      );
    }
    // six unclamped max impulses would displace the eye by >5u; the rig caps it
    expect(peak).toBeGreaterThan(0.5); // still reads as a heavy hit
    expect(peak).toBeLessThan(2); // …but never as a quake
    // a LONE max impulse is below the cap, so single hits are untouched
    const solo = new CameraRig(scene, { x: 0, z: 0 });
    applyFrame(solo);
    solo.addShake(0.85, 260, { dir: { x: 1, z: 0 }, style: "directional", kick: 0.6 });
    let soloPeak = 0;
    for (let t = 0; t < 20; t++) {
      solo.update({ dtMs: 16, localPos: null, cursor: null, panKeys: null, viewportWidth: 800, viewportHeight: 600 });
      soloPeak = Math.max(
        soloPeak,
        Math.hypot(
          solo.camera.position.x - rest.x,
          solo.camera.position.y - rest.y,
          solo.camera.position.z - rest.z,
        ),
      );
    }
    expect(soloPeak).toBeLessThan(peak); // the pile-up is still the bigger read
    // and everything settles back to rest
    for (let t = 0; t < 30; t++) {
      rig.update({ dtMs: 16, localPos: null, cursor: null, panKeys: null, viewportWidth: 800, viewportHeight: 600 });
    }
    expect(rig.camera.position.x).toBeCloseTo(rest.x, 5);
    expect(rig.camera.position.z).toBeCloseTo(rest.z, 5);
  });

  it("exPunchIn dollies the eye toward the target then eases back crisp (EX 特寫)", () => {
    cover("juice-camera-expunch");
    const rest = restPosition();
    const rig = new CameraRig(scene, { x: 0, z: 0 });
    applyFrame(rig);
    rig.exPunchIn(2.5, 200);
    rig.update({ dtMs: 16, localPos: null, cursor: null, panKeys: null, viewportWidth: 800, viewportHeight: 600 });
    // pulling the eye toward the target lowers it (up = dolly·sin pitch shrinks)
    expect(rig.camera.position.y).toBeLessThan(rest.y - 1e-3);
    // never dives past the closest allowed dolly
    expect(rig.camera.position.y).toBeGreaterThan(0);
    // recovers fully once the beat ends
    for (let t = 0; t < 20; t++) {
      rig.update({ dtMs: 16, localPos: null, cursor: null, panKeys: null, viewportWidth: 800, viewportHeight: 600 });
    }
    expect(rig.camera.position.y).toBeCloseTo(rest.y, 4);
  });
});
