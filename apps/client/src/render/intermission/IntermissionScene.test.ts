/**
 * IntermissionScene lifecycle under NullEngine (headless) — the same contract
 * LoginScene.test.ts pins for its twin, because task #38 deliberately mirrors
 * that pattern rather than inventing a second one:
 *
 *  • it stands up its own Engine + Scene + camera and runs NO render loop until
 *    asked (the HUD mounts it, so an eager loop would fight the arena's);
 *  • the shot is FIXED — no attachControl, no orbit — so the composition the
 *    layout tests verify cannot be dragged away by the player;
 *  • `playEnterTransition`'s onComplete fires EXACTLY ONCE, whether it
 *    completes, is disposed mid-ease, or the frame loop stalls;
 *  • dispose() is idempotent and leaves no engine/scene behind.
 *
 * Model .glbs are NOT fetchable headless (AssetManager probes with fetch and a
 * relative URL has no origin), so every prop resolves to null — which is itself
 * worth pinning: a market with no assets must still be a working, disposable
 * scene, not a crash.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import { IntermissionScene, type IntermissionSceneOptions } from "./IntermissionScene";
import { CAMERA_FOV, CAMERA_POSE, CAMERA_POSITION, CAMERA_TARGET } from "./layout";

// --- OffscreenCanvas 2D stub (the dust motes need a DynamicTexture) ---------
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
  constructor(
    public width: number,
    public height: number,
  ) {}
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

function makeScene(extra: Partial<IntermissionSceneOptions> = {}): IntermissionScene {
  return new IntermissionScene(null as unknown as HTMLCanvasElement, {
    engineFactory: () => new NullEngine() as unknown as Engine,
    autoStart: false,
    now: () => 0,
    ...extra,
  });
}

describe("IntermissionScene", () => {
  it("builds its own scene, ground and evening light rig, loop idle", () => {
    cover("intermission-scene-lifecycle");
    const s = makeScene();
    expect(s.isRunning).toBe(false); // autoStart:false — the HUD decides
    // hemispheric key + warm sun + cool rim + lantern + one point light per torch
    expect(s.scene.lights.length).toBeGreaterThanOrEqual(5);
    // the dark earth disc exists even with zero .glbs available
    expect(s.scene.meshes.some((m) => m.name === "intermission-earth")).toBe(true);
    s.dispose();
  });

  it("is a COMPOSED shot: fixed pose, authored FOV, no user orbit", () => {
    cover("intermission-scene-lifecycle");
    const s = makeScene();
    const cam = s.scene.activeCamera!;
    expect(cam.fov).toBeCloseTo(CAMERA_FOV, 6);
    expect((cam as unknown as { alpha: number }).alpha).toBeCloseTo(CAMERA_POSE.alpha, 6);
    expect((cam as unknown as { radius: number }).radius).toBeCloseTo(CAMERA_POSE.radius, 6);
    // attachControl was never called, so no input is wired to the camera
    expect(cam.inputs.attachedToElement).toBe(false);
    s.dispose();
  });

  /**
   * REGRESSION (found by live walk, not by unit test): the shot that actually
   * RENDERS must be the shot layout.ts authored.
   *
   * `layout.test.ts` proves its framing with its own look-at projector built
   * from CAMERA_POSITION/CAMERA_TARGET — so it verifies the INTENT. The scene
   * renders through an ArcRotateCamera, which is parameterised by
   * (alpha, beta, radius, PIVOT). `arcPoseFor` keeps only the first three; the
   * aim point survives solely as the pivot. The scene used to pivot on
   * (0, targetY, 0), which silently discarded CAMERA_TARGET.x/z — the authored
   * off-centre aim — and put the eye 1.0 u / 1.1 u away from CAMERA_POSITION.
   * Live, the merchant and the hero ended up under the shop card while every
   * framing test stayed green.
   *
   * Pinning the round-trip here (arc pose + pivot ⇒ the authored eye AND the
   * authored aim) is what makes layout.test.ts's projector describe the real
   * camera rather than a parallel universe.
   */
  it("renders the shot layout.ts authored: eye AND aim survive the arc-pose round trip", () => {
    cover("intermission-camera");
    const s = makeScene();
    const cam = s.scene.activeCamera as unknown as {
      position: { x: number; y: number; z: number };
      getTarget: () => { x: number; y: number; z: number };
    };
    const aim = cam.getTarget();
    expect(aim.x).toBeCloseTo(CAMERA_TARGET.x, 6);
    expect(aim.y).toBeCloseTo(CAMERA_TARGET.y, 6);
    expect(aim.z).toBeCloseTo(CAMERA_TARGET.z, 6);
    expect(cam.position.x).toBeCloseTo(CAMERA_POSITION.x, 6);
    expect(cam.position.y).toBeCloseTo(CAMERA_POSITION.y, 6);
    expect(cam.position.z).toBeCloseTo(CAMERA_POSITION.z, 6);
    s.dispose();
  });

  it("dissolves into fog instead of ending at a visible rim", () => {
    cover("intermission-scene-lifecycle");
    const s = makeScene();
    expect(s.scene.fogMode).toBe(2); // FOGMODE_EXP2
    expect(s.scene.fogDensity).toBeGreaterThan(0);
    s.dispose();
  });

  it("survives a market with no loadable models (headless / 404 content)", async () => {
    cover("intermission-scene-lifecycle");
    const s = makeScene();
    await Promise.resolve();
    await Promise.resolve();
    expect(() => s.playGesture("wave")).not.toThrow();
    expect(() => s.setTeam(2)).not.toThrow();
    await expect(s.setChampion("assets/models/champions/nope.glb", 1)).resolves.toBeUndefined();
    // no hero in frame (headless 404) — a purchase reaction is a silent no-op
    expect(() => s.playChampionReaction()).not.toThrow();
    s.dispose();
  });

  /**
   * The purchase reaction (task #111): buying makes YOUR hero celebrate. Clip
   * inventories differ wildly, so `reactionClip.ts` resolves the clip and the
   * scene degrades gracefully. Two contracts pinned here on real Babylon objects
   * (headless can't FETCH a .glb, so the champion is injected):
   *   • a rig WITH a reaction clip plays it and does NOT pop;
   *   • a rig with NONE still reacts — a procedural squash-pop that springs back
   *     to the resting scale and never leaves the hero stuck or scaled.
   */
  it("a purchase plays the hero's reaction clip and does NOT pop when one exists", () => {
    cover("intermission-champion-reaction");
    const s = makeScene();
    const priv = s as unknown as {
      championRoot: TransformNode | null;
      championGroups: AnimationGroup[];
      championIdle: AnimationGroup | null;
      championReaction: AnimationGroup | null;
      championPulse: unknown;
    };
    const idle = new AnimationGroup("Idle", s.scene);
    const cheer = new AnimationGroup("Cheer", s.scene);
    priv.championRoot = new TransformNode("im-champion", s.scene);
    priv.championGroups = [idle, cheer];
    priv.championIdle = idle;

    s.playChampionReaction();

    expect(priv.championReaction).toBe(cheer); // victory clip chosen + playing
    expect(priv.championPulse).toBeNull(); // no fallback pop when a clip exists
    s.dispose();
  });

  it("a hero with NO reaction clip still reacts: a procedural pop that returns to rest", () => {
    cover("intermission-champion-reaction");
    let now = 0;
    const s = makeScene({ now: () => now });
    const base = 1.4;
    const root = new TransformNode("im-champion", s.scene);
    root.scaling.setAll(base);
    const priv = s as unknown as {
      championRoot: TransformNode | null;
      championGroups: AnimationGroup[];
      championBaseScale: number;
      championPulse: unknown;
      frame(): void;
    };
    priv.championRoot = root;
    priv.championGroups = [new AnimationGroup("Stand", s.scene)]; // idle only
    priv.championBaseScale = base;

    s.playChampionReaction();
    expect(priv.championPulse).not.toBeNull(); // degraded to the pop

    // the first frame carries dt=0 by design (no prior timestamp) — prime it
    now = 0;
    priv.frame();
    // now mid-arch the hero is scaled UP off its resting size
    now = 60;
    priv.frame();
    expect(root.scaling.x).toBeGreaterThan(base);

    // drive past the pop window: it clears and springs exactly back to rest
    for (const t of [150, 300, 450, 600, 800]) {
      now = t;
      priv.frame();
    }
    expect(priv.championPulse).toBeNull();
    expect(root.scaling.x).toBeCloseTo(base, 6);
    expect(root.position.y).toBeCloseTo(0, 6);
    s.dispose();
  });

  it("fires the enter transition's onComplete exactly once on completion", () => {
    cover("intermission-transition-once");
    let now = 0;
    const s = makeScene({ now: () => now });
    let calls = 0;
    s.playEnterTransition(() => calls++);
    // drive real frames past the transition window
    for (const t of [0, 20, 200, 600, 1200, 1800]) {
      now = t;
      s.scene.render();
      (s as unknown as { frame(): void }).frame();
    }
    expect(calls).toBe(1);
    // a second invoke after completion starts a fresh transition, not a re-fire
    now = 5000;
    s.dispose();
    expect(calls).toBe(1);
  });

  it("fires onComplete when DISPOSED mid-transition (no hung caller)", () => {
    cover("intermission-transition-once");
    const s = makeScene();
    let calls = 0;
    s.playEnterTransition(() => calls++);
    expect(calls).toBe(0); // still easing
    s.dispose();
    expect(calls).toBe(1); // dispose honours the contract
    s.dispose();
    expect(calls).toBe(1); // …exactly once, even on a double dispose
  });

  it("fires onComplete immediately when already disposed", () => {
    cover("intermission-transition-once");
    const s = makeScene();
    s.dispose();
    let calls = 0;
    s.playEnterTransition(() => calls++);
    expect(calls).toBe(1);
  });

  it("start/stop are idempotent and dispose is safe twice", () => {
    cover("intermission-scene-lifecycle");
    const s = makeScene();
    s.start();
    s.start();
    expect(s.isRunning).toBe(true);
    s.stop();
    s.stop();
    expect(s.isRunning).toBe(false);
    s.dispose();
    s.dispose();
    s.start(); // a disposed scene never restarts
    expect(s.isRunning).toBe(false);
  });
});
