/**
 * render/beatDance — THE VISIBILITY GATE, plus the pose algebra it rests on.
 *
 * This project has shipped three features nobody could see (#93's firework,
 * #247's leap 77% off-frame, a combo that could never fire). The point of this
 * file is that "you can see the dance" is a MEASURED claim through the real
 * combat rig, not a claim from having written the code. It also records the
 * limits honestly — including the one zoom level where the dance goes marginal.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ChampionView } from "./views/ChampionView";
import { CAMERA_PITCH_RAD, DOLLY_DEFAULT, DOLLY_MIN } from "./CameraRig";
import {
  DANCE_JOINTS,
  DEFAULT_FOV_RAD,
  MIN_ASPECT,
  MIN_SCREEN_TRAVEL,
  REST_POSE,
  SLIDE_AMP,
  STEP_AMP,
  ZOMBIEX_BODY_HEIGHT,
  applyDancePose,
  checkDanceFraming,
  clearPose,
  dancePose,
  type PoseTarget,
} from "./beatDance";

function node(x = 0, y = 0, z = 0, yaw = 0): PoseTarget {
  return { position: { x, y, z }, rotation: { x: 0, y: yaw, z: 0 } };
}

describe("the pose is pure and deterministic", () => {
  it("is the rest pose at zero energy — a champion who is not dancing does not move", () => {
    expect(dancePose({ beats: 3.21, energy: 0 })).toEqual(REST_POSE);
    expect(dancePose({ beats: 3.21, energy: -5 })).toEqual(REST_POSE);
  });

  it("same input, same output — no rng anywhere in the presentation path", () => {
    for (const beats of [0, 0.37, 1.5, 7.9]) {
      const a = dancePose({ beats, energy: 0.8, spin: 0.3 });
      const b = dancePose({ beats, energy: 0.8, spin: 0.3 });
      expect(a).toEqual(b);
    }
  });

  it("never leaves the body further from its hitbox than its own collision radius (0.6)", () => {
    let worst = 0;
    for (let i = 0; i <= 2000; i++) {
      const p = dancePose({ beats: i / 100, energy: 1, spin: (i % 200) / 200 });
      worst = Math.max(worst, Math.hypot(p.dx, p.dz));
    }
    expect(worst).toBeCloseTo(Math.max(SLIDE_AMP, STEP_AMP), 3);
    expect(worst).toBeLessThan(0.6);
  });

  it("the payoff spin is a full turn, and only during the payoff", () => {
    const none = dancePose({ beats: 0, energy: 1, spin: 0 });
    const half = dancePose({ beats: 0, energy: 1, spin: 0.5 });
    const done = dancePose({ beats: 0, energy: 1, spin: 1 });
    expect(half.yawRad - none.yawRad).toBeCloseTo(Math.PI, 6);
    expect(done.yawRad - none.yawRad).toBeCloseTo(2 * Math.PI, 6);
  });

  it("the lean leads the glide (weight transfer, not a dragged model)", () => {
    // at beat 0 the glide is at zero and moving fastest; the lean is at its peak
    const p0 = dancePose({ beats: 0, energy: 1 });
    const p1 = dancePose({ beats: 0.5, energy: 1 });
    expect(Math.abs(p0.dx)).toBeLessThan(Math.abs(p1.dx));
    expect(Math.abs(p0.rollRad)).toBeGreaterThan(Math.abs(p1.rollRad));
  });
});

describe("THE GATE: you can actually see it, at the shipped combat camera", () => {
  it("the rig the gate models is the rig the game ships", () => {
    expect(CAMERA_PITCH_RAD).toBeCloseTo((68 * Math.PI) / 180, 9);
    expect(DOLLY_MIN).toBe(10); // 最貼地 = 這個 gate 的最好情況
    // ⚠️ GH#361：出貨預設**不再等於** DOLLY_MIN，它搬到了區間的最遠端。
    //    所以 gate 現在量的是「玩家一進場真的看到的那個距離」。
    expect(DOLLY_DEFAULT).toBeGreaterThanOrEqual(DOLLY_MIN);
    expect(DEFAULT_FOV_RAD).toBe(0.8);
  });

  it("passes at the SHIPPED DEFAULT zoom: framed, and moving far more than the minimum", () => {
    const r = checkDanceFraming({ energy: 1, dolly: DOLLY_DEFAULT });
    expect(r.ok).toBe(true);
    expect(r.reason).toBeUndefined();
    // ⚠️ screen travel 與鏡頭距離成**反比**，而 GH#361 把出貨預設從最近端搬到了
    //    最遠端 —— 所以這個百分比整個變小了。⛔ 不是回歸，是玩家看到的鏡頭換了。
    //    釘的是「還有明顯餘裕」，⛔ 不是某一個量到的百分比（第二守則：驗機制不驗數字）。
    expect(r.screenTravel).toBeGreaterThan(MIN_SCREEN_TRAVEL * 1.8);
    // and it does so with the whole body comfortably inside the safe frustum
    expect(r.worstVertical).toBeLessThan(0.4);
    expect(r.worstHorizontal).toBeLessThan(0.4);
  });

  it("the busiest thing on screen is an EXTREMITY, which is why the gate samples joints", () => {
    const r = checkDanceFraming({ energy: 1 });
    expect(["handLeft", "handRight"]).toContain(r.busiestJoint);
    expect(DANCE_JOINTS.some((j) => j.name === "hips")).toBe(true);
  });

  it("passes on EVERY rung of the build-up, so stack 1 is already visible", () => {
    const travels = [0.4, 0.6, 0.8, 1].map((energy) => checkDanceFraming({ energy }));
    for (const r of travels) expect(r.ok).toBe(true);
    // and it escalates monotonically — the body says how far into the combo he is
    for (let i = 1; i < travels.length; i++) {
      expect(travels[i]!.screenTravel).toBeGreaterThan(travels[i - 1]!.screenTravel);
    }
  });

  it("the payoff spin is the biggest thing the dance does", () => {
    const plain = checkDanceFraming({ energy: 1, beats: 2 });
    const spun = checkDanceFraming({ energy: 1, beats: 2, spin: true });
    expect(spun.ok).toBe(true);
    expect(spun.screenTravel).toBeGreaterThan(plain.screenTravel);
  });

  it("still passes when the camera is following someone else 3 units away", () => {
    const r = checkDanceFraming({ energy: 1, target: { x: 3, z: 0 } });
    expect(r.ok).toBe(true);
  });
});

describe("the gate can fail — which is the only reason to trust it when it passes", () => {
  it("rejects a dance too small to notice", () => {
    const r = checkDanceFraming({ energy: 0.02 });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("viewport height");
    expect(r.screenTravel).toBeLessThan(MIN_SCREEN_TRAVEL);
  });

  it("rejects a body that leaves the frame", () => {
    const r = checkDanceFraming({ energy: 1, target: { x: 9, z: 0 } });
    expect(r.ok).toBe(false);
    expect(r.worstHorizontal).toBeGreaterThan(1);
    expect(r.reason).toContain("leaves the frame horizontally");
    // ...and that is the CAMERA, not the dance: a champion standing perfectly
    // still 5 units off the followed target is already outside the safe frame.
    const still = checkDanceFraming({ energy: 0, target: { x: 5, z: 0 } });
    expect(still.screenTravel).toBe(0);
    expect(still.worstHorizontal).toBeGreaterThan(1);
  });
});

describe("MEASURED LIMITS, recorded rather than hidden", () => {
  it("at dolly 40 — beyond the shipped clamp — the dance falls just under the threshold", () => {
    // Honest limit, kept as an OVER-RANGE probe: 40 was the original maxDolly,
    // then 36 (owner 2026-08-15), and is now 18 (GH#361). At 40 the champion is
    // himself only a few percent of the frame; 4.1% travel is still a visible
    // wiggle but below the 5% bar this gate holds the shipped zooms to. Pinned
    // as a ratchet so a future change that makes the far zoom worse is caught —
    // and, since the clamp came down, the whole SHIPPED range now clears the bar.
    const r = checkDanceFraming({ energy: 1, dolly: 40 });
    expect(r.screenTravel).toBeGreaterThan(0.04);
    expect(r.screenTravel).toBeLessThan(MIN_SCREEN_TRAVEL);
    expect(r.worstVertical).toBeLessThan(1); // still framed, just small
  });

  it("vertical motion is worth only cos(68°) on screen — which is why the dance is a glide", () => {
    const groundGain = 1; // world x maps straight onto the camera's right axis
    const verticalGain = Math.cos(CAMERA_PITCH_RAD);
    expect(verticalGain).toBeLessThan(0.4);
    expect(groundGain / verticalGain).toBeGreaterThan(2.5);
  });

  it("the champion himself is only about a tenth of the frame at this camera", () => {
    // half-height visible at the camera's target distance, in world units
    const visibleHeight = 2 * DOLLY_MIN * Math.tan(DEFAULT_FOV_RAD / 2);
    const onScreen = (ZOMBIEX_BODY_HEIGHT * Math.cos(CAMERA_PITCH_RAD)) / visibleHeight;
    expect(onScreen).toBeGreaterThan(0.08);
    expect(onScreen).toBeLessThan(0.12);
    // so the 5% threshold really is ~half a body height of travel
    expect(MIN_SCREEN_TRAVEL / onScreen).toBeGreaterThan(0.4);
    expect(MIN_ASPECT).toBe(4 / 3);
  });
});

describe("applying the pose cannot damage the champion", () => {
  it("adds to the synced pose and sets only the two tilts nothing else owns", () => {
    const n = node(5, 0, -2, 1.1);
    const pose = dancePose({ beats: 0.4, energy: 1 });
    applyDancePose(n, pose);
    expect(n.position.x).toBeCloseTo(5 + pose.dx, 9);
    expect(n.position.z).toBeCloseTo(-2 + pose.dz, 9);
    expect(n.rotation.y).toBeCloseTo(1.1 + pose.yawRad, 9);
    expect(n.rotation.x).toBe(pose.pitchRad);
    expect(n.rotation.z).toBe(pose.rollRad);
  });

  it("cannot accumulate across frames, because sync re-authors the base every frame", () => {
    const pose = dancePose({ beats: 0.4, energy: 1 });
    let n = node(5, 0, -2, 1.1);
    for (let frame = 0; frame < 100; frame++) {
      n = node(5, 0, -2, 1.1); // what ChampionView.sync writes, every frame
      applyDancePose(n, pose);
    }
    expect(n.position.x).toBeCloseTo(5 + pose.dx, 9);
    expect(n.rotation.y).toBeCloseTo(1.1 + pose.yawRad, 9);
  });

  it("clearPose puts back exactly the two channels sync does not own", () => {
    const n = node(1, 0, 1, 0.5);
    applyDancePose(n, dancePose({ beats: 0.4, energy: 1 }));
    clearPose(n);
    expect(n.rotation.x).toBe(0);
    expect(n.rotation.z).toBe(0);
  });
});

/**
 * The seam is only real if it lands on the OBJECT the wiring actually hands us.
 * `GameApp` passes `EntityViewRegistry.getChampionView(id).root`, so these run
 * against a live `ChampionView` on Babylon's NullEngine rather than a stub.
 */
describe("the pose lands on a live ChampionView root", () => {
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

  it("the root uses EULER rotation, so writing .rotation is not silently ignored", () => {
    // If ChampionView ever adopted `rotationQuaternion`, Babylon would ignore
    // `rotation` entirely and this whole feature would become invisible with no
    // error anywhere. That is exactly the failure mode this repo keeps hitting,
    // so it gets a guard rather than a comment.
    const view = new ChampionView(scene, 1, "champ.godie-zombiex", 1);
    view.setPose(0, 0, 0, 1);
    view.update("idle", 0, 16);
    expect(view.root.rotationQuaternion).toBeNull();
    view.dispose();
  });

  it("moves the real body, and sync re-authors the base so nothing accumulates", () => {
    const view = new ChampionView(scene, 2, "champ.godie-zombiex", 1);
    view.setPose(4, 0, 0, 1);
    view.update("idle", 0, 16);
    const baseX = view.root.position.x;
    const baseYaw = view.root.rotation.y;

    const pose = dancePose({ beats: 0.4, energy: 1 });
    applyDancePose(view.root, pose);
    expect(view.root.position.x).toBeCloseTo(baseX + pose.dx, 6);
    expect(view.root.rotation.y).toBeCloseTo(baseYaw + pose.yawRad, 6);
    expect(view.root.rotation.z).toBeCloseTo(pose.rollRad, 6);

    // 600 frames of "sync, then dance" — the offset must stay an offset
    for (let f = 0; f < 600; f++) {
      view.setPose(4, 0, 0, 1);
      view.update("idle", 16 * (f + 1), 16);
      applyDancePose(view.root, pose);
    }
    expect(view.root.position.x).toBeCloseTo(baseX + pose.dx, 6);
    expect(Math.abs(view.root.rotation.y - baseYaw - pose.yawRad)).toBeLessThan(1e-6);

    // and the two channels we own go back to zero
    view.setPose(4, 0, 0, 1);
    view.update("idle", 16 * 601, 16);
    clearPose(view.root);
    expect(view.root.rotation.x).toBe(0);
    expect(view.root.rotation.z).toBe(0);
    view.dispose();
  });

  // The first version of this module asserted that `sync` re-authors
  // position.y along with x/z. It does not — `ChampionView.setPose` writes x
  // and z only, and for a living body nothing else touches y. `+=` therefore
  // accumulated: dy has a positive mean, so the dancer levitated ~2.3 units a
  // second and left a 9.27-unit-high camera inside one phrase, permanently.
  // The old 600-frame test missed it by asserting only the channels that ARE
  // re-authored. This one asserts the one that is not, and walks a real
  // phrase (changing `beats`) rather than re-applying a frozen pose.
  it("does not levitate the body over a long phrase — position.y never drifts", () => {
    const view = new ChampionView(scene, 3, "champ.godie-zombiex", 1);
    view.setPose(4, 0, 0, 1);
    view.update("idle", 0, 16);
    const baseY = view.root.position.y;

    let peak = 0;
    for (let f = 0; f < 900; f++) {
      view.setPose(4, 0, 0, 1); // sync writes x/z, never y
      view.update("idle", 16 * (f + 1), 16);
      const pose = dancePose({ beats: f * 0.05, energy: 1 });
      applyDancePose(view.root, pose);
      peak = Math.max(peak, Math.abs(view.root.position.y - baseY));
      // at every single frame the body is exactly base + that frame's dy
      expect(view.root.position.y).toBeCloseTo(baseY + pose.dy, 6);
    }
    // 15 seconds of dancing: the bob stays a bob, it never becomes a climb
    expect(peak).toBeLessThan(1);

    // and letting go puts him back on the floor, not at whatever height he
    // happened to be at when the music stopped
    clearPose(view.root);
    expect(view.root.position.y).toBeCloseTo(baseY, 6);
    view.dispose();
  });

  it("applying twice in one frame is idempotent, not doubled", () => {
    const view = new ChampionView(scene, 4, "champ.godie-zombiex", 1);
    view.setPose(4, 0, 0, 1);
    view.update("idle", 0, 16);
    const baseY = view.root.position.y;
    const pose = dancePose({ beats: 0.4, energy: 1 });
    applyDancePose(view.root, pose);
    applyDancePose(view.root, pose);
    expect(view.root.position.y).toBeCloseTo(baseY + pose.dy, 6);
    view.dispose();
  });
});
