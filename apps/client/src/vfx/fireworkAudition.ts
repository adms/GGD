/**
 * fireworkAudition — the scene behind `public/firework-audition.html`, the
 * review page for the task #93 victory fireworks (same role as the task #80
 * ground audition and the task #52 BGM audition: a place the work can actually
 * be LOOKED at, and screenshotted, without winning a match to get there).
 *
 * It is not a mock-up. It runs the shipped `ChickenFireworkFx` and
 * `SmallFireworkFx` against a real Babylon camera, so what is approved here is
 * what plays in a match.
 *
 * The one thing it adds is a PINNED CLOCK. The acceptance criterion for the
 * chicken is "can a player tell it is a roast chicken", which is answered by
 * looking at the formation at several points across the burst — and a shot
 * grabbed off a free-running 4.3 s animation lands wherever the screenshot
 * happened to fire. `?t=1400` drives the effect's clock to exactly 1400 ms and
 * holds it there, so the same moment can be compared across iterations.
 *
 * Nothing in the shipped app imports this — `public/*.html` is not a build
 * entry, so it never reaches the bundle.
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ChickenFireworkFx } from "./ChickenFireworkFx";
import { SmallFireworkFx } from "./SmallFireworkFx";
import { CHICKEN_TOTAL_MS, SMALL_VOLLEY_MS, chickenBurstState } from "./fireworkMath";

export interface FireworkAuditionHandle {
  /** Play the tier-2 roast chicken from the top, in real time. */
  playChicken(): void;
  /** Play a tier-1 round-win volley (seeded by `round`). */
  playVolley(round: number): void;
  /** Pin the chicken's clock to `ms`; null resumes real time. */
  pin(ms: number | null): void;
  /**
   * Play from the top on a FRAME-STEPPED clock (a fixed 1/60 s per rendered
   * frame) and stop dead at `ms`, leaving that exact frame in the buffer.
   *
   * Two separate reasons this exists and `pin` is not enough:
   *
   *   1. `pin` cannot show the pooled layers AT ALL. The launch comet, the
   *      break flash and the glitter are Babylon ParticleSystems; they advance
   *      on the engine's own delta, not on the clock the formation is driven
   *      by, so a pinned frame shows a formation and no particles. An earlier
   *      screenshot pass here "proved" a missing launch comet that was working
   *      the whole time.
   *   2. Wall-clock playback cannot be captured reliably. Under software
   *      rendering the first frame can take a second to appear, so "freeze
   *      380 ms after play" freezes at whatever the first frame happened to
   *      be. Stepping the clock per FRAME instead of per millisecond makes the
   *      capture independent of how slow the renderer is — 23 frames is 380 ms
   *      whether each frame took 2 ms or 2 s.
   *
   * `scene.useConstantAnimationDeltaTime` pins Babylon's own animation ratio
   * to the same fixed step, so the particle layers march in lockstep with the
   * formation instead of racing ahead on real time.
   */
  stepTo(ms: number, volleyRound?: number): void;
  /** Scene darkness 0..1 — tier 2 darkens, tier 1 greys. */
  setDim(v: number): void;
  /** Live readout for the page's HUD. */
  readout(): string;
  dispose(): void;
}

/** A stand-in arena so "the screen darkens" has something to darken. */
function buildBackdrop(scene: Scene): void {
  const light = new HemisphericLight("aud-light", new Vector3(0.3, 1, 0.2), scene);
  light.intensity = 0.85;

  const floorMat = new StandardMaterial("aud-floor", scene);
  floorMat.diffuseColor = new Color3(0.20, 0.22, 0.27);
  floorMat.specularColor = new Color3(0.02, 0.02, 0.03);
  const floor = MeshBuilder.CreateDisc("aud-disc", { radius: 24, tessellation: 64 }, scene);
  floor.rotation.x = Math.PI / 2;
  floor.material = floorMat;

  // a few blocks at champion scale, so the firework has a sense of size
  const bodyMat = new StandardMaterial("aud-body", scene);
  bodyMat.diffuseColor = new Color3(0.55, 0.45, 0.38);
  for (const [x, z] of [[-3, 2], [0, 3.5], [3.2, 1.6], [-6, -1]] as const) {
    const b = MeshBuilder.CreateBox("aud-champ", { width: 0.7, height: 1.7, depth: 0.7 }, scene);
    b.position.set(x, 0.85, z);
    b.material = bodyMat;
  }
}

export function startFireworkAudition(canvas: HTMLCanvasElement): FireworkAuditionHandle {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.04, 0.05, 0.08, 1);

  const camera = new FreeCamera("aud-cam", new Vector3(0, 6.5, -13), scene);
  camera.setTarget(new Vector3(0, 1.4, 0));
  camera.fov = 0.8;
  camera.minZ = 0.1;
  camera.maxZ = 400;
  scene.activeCamera = camera;

  buildBackdrop(scene);

  const chicken = new ChickenFireworkFx(scene, { cameraFor: () => camera });
  const small = new SmallFireworkFx(scene, { cameraFor: () => camera });

  let pinnedMs: number | null = null;
  let chickenStart = -1;
  let volleyStart = -1;
  let dim = 0;
  let lastPhase = "idle";
  /** Fixed clock step per rendered frame in step mode (1/60 s). */
  const STEP_MS = 1000 / 60;
  let stepTargetMs: number | null = null;
  let stepNowMs = 0;
  let frozen = false;

  const applyDim = (): void => {
    const k = 1 - dim * 0.92;
    scene.clearColor.set(0.04 * k, 0.05 * k, 0.08 * k, 1);
    for (const m of scene.materials) {
      const sm = m as StandardMaterial;
      if (sm.diffuseColor && m.name.startsWith("aud-")) sm.alpha = 1;
    }
    scene.imageProcessingConfiguration.exposure = 1 - dim * 0.75;
  };
  scene.imageProcessingConfiguration.isEnabled = true;
  applyDim();

  engine.runRenderLoop(() => {
    // frozen: stop rendering entirely. preserveDrawingBuffer keeps the last
    // frame on the canvas, so a screenshot grabbed at any later moment still
    // shows exactly the moment that was asked for.
    if (frozen) return;
    if (stepTargetMs !== null) {
      // frame-stepped: one fixed tick per frame, then stop dead on target
      chicken.update(stepNowMs);
      small.update(stepNowMs);
      lastPhase = chickenBurstState(stepNowMs - chickenStart).phase;
      scene.render();
      if (stepNowMs >= stepTargetMs) frozen = true;
      stepNowMs += STEP_MS;
      return;
    }
    const real = performance.now();
    if (pinnedMs !== null) {
      // hold the formation at an exact moment: play once at t=0, then drive
      // update() with the pinned clock every frame
      if (chickenStart < 0) {
        chicken.play(0);
        chickenStart = 0;
      }
      chicken.update(pinnedMs);
      lastPhase = chickenBurstState(pinnedMs).phase;
    } else {
      chicken.update(real);
      small.update(real);
      lastPhase = chickenStart >= 0 ? chickenBurstState(real - chickenStart).phase : "idle";
    }
    scene.render();
  });

  const onResize = (): void => engine.resize();
  window.addEventListener("resize", onResize);

  return {
    playChicken(): void {
      pinnedMs = null;
      stepTargetMs = null;
      frozen = false;
      chickenStart = performance.now();
      chicken.play(chickenStart);
    },
    playVolley(round: number): void {
      pinnedMs = null;
      stepTargetMs = null;
      frozen = false;
      volleyStart = performance.now();
      small.play(volleyStart, round);
    },
    stepTo(ms: number, volleyRound?: number): void {
      pinnedMs = null;
      frozen = false;
      scene.useConstantAnimationDeltaTime = true;
      stepNowMs = 0;
      stepTargetMs = ms;
      chickenStart = 0;
      volleyStart = 0;
      if (volleyRound === undefined) chicken.play(0);
      else small.play(0, volleyRound);
    },
    pin(ms: number | null): void {
      pinnedMs = ms;
      frozen = false;
      stepTargetMs = null;
      chickenStart = -1;
      if (ms === null) chicken.stop();
    },
    setDim(v: number): void {
      dim = Math.min(1, Math.max(0, v));
      applyDim();
    },
    readout(): string {
      const t =
        pinnedMs !== null
          ? pinnedMs
          : stepTargetMs !== null
            ? stepNowMs
            : chickenStart >= 0
            ? Math.round(performance.now() - chickenStart)
            : -1;
      const s = chickenBurstState(t < 0 ? -1 : t);
      return [
        `points ${chicken.pointCount}`,
        `t ${t < 0 ? "—" : `${Math.round(t)} / ${CHICKEN_TOTAL_MS}`} ms`,
        `phase ${lastPhase}`,
        `expand ${s.expand.toFixed(3)}`,
        `droop ${s.droop.toFixed(3)}`,
        `alpha ${s.alpha.toFixed(2)}`,
        `volley ${SMALL_VOLLEY_MS} ms${small.active ? " (playing)" : ""}`,
        volleyStart > 0 ? `shots ${small.volley.length}` : "",
        // pooled-particle liveness: how many systems exist and how many are
        // actually drawing particles this frame (the launch/flash/glitter layer)
        `ps ${scene.particleSystems.length} live ${scene.particleSystems.reduce(
          (n, p) => n + ((p as { getActiveCount?: () => number }).getActiveCount?.() ?? 0),
          0,
        )}`,
      ]
        .filter(Boolean)
        .join("  ·  ");
    },
    dispose(): void {
      window.removeEventListener("resize", onResize);
      chicken.dispose();
      small.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
