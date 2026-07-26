/**
 * presentationAudition — the review scene behind `public/presentation-audition.html`.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS PAGE EXISTS AND WHY IT IS NOT `firework-audition.html`
 * ---------------------------------------------------------------------------
 * The #93 firework audition page built its own camera at `(0, 6.5, -13)` — a
 * ~21° eye-level shot. The unit tests used `(0, 6, -12)` ≈ 24.6°. NEITHER
 * CAMERA EXISTS IN THE GAME. The shipped combat camera is 68° and looks down
 * from 9.27 u; through it the round-win volley lands under an opaque floor.
 * Every screenshot that "proved" the celebration was fine was taken through a
 * camera no player will ever have.
 *
 * So this page has exactly one rule, and it is the reason it replaces the old
 * one for framing questions:
 *
 *      THE CAMERA IS THE REAL `CameraRig`, AND THE FLOOR IS THE REAL
 *      `buildZoneGround`. Nothing here constructs a camera of its own.
 *
 * `?cam=combat` instantiates the shipped rig at its shipped default dolly and
 * pitch; `?cam=settlement` drives the SAME rig through `setSettlement`, which
 * is the cinematic the match-win chicken is actually watched through. The
 * floor, rim and champion stand-ins come from the arena builders, so occlusion
 * — the axis #93 never tested — is real occlusion by the real mesh.
 *
 * FRAME-STEPPED CLOCK (`?step=1400`). Inherited from the #93 audition and kept
 * for the same reason: under headless software rendering the first frame can
 * take a second, so "screenshot 380 ms after play" screenshots whatever the
 * renderer happened to reach. Stepping a fixed 1/60 s per RENDERED frame makes
 * the captured moment independent of renderer speed, and
 * `useConstantAnimationDeltaTime` marches the Babylon particle layers in
 * lockstep with it.
 *
 * Nothing in the shipped app imports this — `public/*.html` is not a build
 * entry, so it never reaches the bundle.
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";

import { CameraRig } from "./CameraRig";
import { buildZoneGround } from "./ArenaGround";
import { VictoryFireworks } from "../vfx/VictoryFireworks";
import { CastPillarFx } from "../vfx/CastPillarFx";
import { pillarPalette } from "../vfx/castPillar";
import { CHICKEN_TOTAL_MS } from "../vfx/fireworkMath";
import { castBeamPlan } from "../vfx/castBeam";
import { combatCameraPose, verticalHeadroom } from "./effectFraming";

/** Which effect the page is auditioning. */
export type AuditionFx = "none" | "volley" | "chicken" | "pillar";

export interface PresentationAuditionOptions {
  fx?: AuditionFx;
  cam?: "combat" | "settlement";
  /** round seed for the tier-1 volley */
  round?: number;
  /** caster offset from the camera's ground target, world units (pillar only) */
  casterX?: number;
  casterZ?: number;
  /** cast window in ms for the pillar (real content values are 300–900) */
  castMs?: number;
}

export interface PresentationAuditionHandle {
  /** Play from the top on a FRAME-STEPPED clock and stop dead at `ms`. */
  stepTo(ms: number): void;
  /** True once the requested step has been reached and the frame is frozen. */
  readonly settled: boolean;
  /** Live numbers for the page HUD and for the capture script to assert on. */
  probe(): Record<string, unknown>;
  dispose(): void;
}

const CASTER_ID = 7;
/** Champion stand-in height — the roster's normalised on-screen height (#150). */
const BODY_H = 1.7;

function buildArena(scene: Scene): TransformNode {
  const root = new TransformNode("aud-arena", scene);
  const hemi = new HemisphericLight("aud-hemi", new Vector3(0.3, 1, 0.2), scene);
  hemi.intensity = 0.75;
  const sun = new DirectionalLight("aud-sun", new Vector3(-0.4, -1, 0.35), scene);
  sun.intensity = 1.1;

  // THE REAL FLOOR. `boundaryRadius: 24` is what every shipped arena zone uses,
  // and this mesh is opaque + depth-writing exactly as it is in a match — which
  // is the entire point: it is what hides the #93 volley.
  buildZoneGround(scene, root, { center: { x: 0, z: 0 }, boundaryRadius: 24 }, 0, "stone");

  const bodyMat = new StandardMaterial("aud-body", scene);
  bodyMat.diffuseColor = new Color3(0.62, 0.5, 0.42);
  for (const [x, z] of [[0, 0], [-3.2, 2.1], [2.8, 1.4], [-1.4, -2.6]] as const) {
    const b = MeshBuilder.CreateBox("aud-champ", { width: 0.7, height: BODY_H, depth: 0.7 }, scene);
    b.position.set(x, BODY_H / 2, z);
    b.material = bodyMat;
  }
  return root;
}

export function startPresentationAudition(
  canvas: HTMLCanvasElement,
  opts: PresentationAuditionOptions = {},
): PresentationAuditionHandle {
  const fx: AuditionFx = opts.fx ?? "none";
  const camMode = opts.cam ?? "combat";
  const casterX = opts.casterX ?? 0;
  const casterZ = opts.casterZ ?? 0;
  const castMs = opts.castMs ?? 600;

  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.05, 0.06, 0.10, 1);

  buildArena(scene);

  // THE REAL RIG — same class, same constants, same defaults the match uses.
  const rig = new CameraRig(scene, { x: 0, z: 0 });
  if (camMode === "settlement") rig.setSettlement({ x: 0, z: 0 }, { x: 0, z: -1 });
  rig.update({
    dtMs: 16,
    localPos: { x: 0, z: 0 },
    cursor: null,
    panKeys: null,
    viewportWidth: canvas.clientWidth || 1280,
    viewportHeight: canvas.clientHeight || 720,
  });

  const victory = new VictoryFireworks(scene, { cameraFor: () => rig.camera });
  const pillars = new CastPillarFx(scene, {
    entityPos: (id) => (id === CASTER_ID ? { x: casterX, z: casterZ } : null),
    headroomAt: (x, z) =>
      verticalHeadroom(combatCameraPose({ x: 0, z: 0 }), { x, z }, {
        aspect: engine.getAspectRatio(rig.camera),
      }),
  });

  const STEP_MS = 1000 / 60;
  scene.useConstantAnimationDeltaTime = true;
  scene.getAnimationRatio(); // prime
  let stepTargetMs: number | null = null;
  let nowMs = 0;
  let frozen = false;
  let started = false;

  const start = (): void => {
    if (started) return;
    started = true;
    if (fx === "volley") victory.playRoundVolley(nowMs, opts.round ?? 1);
    else if (fx === "chicken") victory.playChicken(nowMs);
    else if (fx === "pillar") pillars.begin(CASTER_ID, castMs, pillarPalette("fire", null), nowMs);
  };

  engine.runRenderLoop(() => {
    // frozen: stop rendering. `preserveDrawingBuffer` keeps the last frame on
    // the canvas so a screenshot taken any time later shows the asked-for ms.
    if (frozen) return;
    if (stepTargetMs !== null) {
      start();
      victory.update(nowMs);
      pillars.update(nowMs);
      rig.update({
        dtMs: STEP_MS,
        localPos: camMode === "settlement" ? null : { x: 0, z: 0 },
        cursor: null,
        panKeys: null,
        viewportWidth: canvas.clientWidth || 1280,
        viewportHeight: canvas.clientHeight || 720,
      });
      scene.render();
      if (nowMs >= stepTargetMs) {
        frozen = true;
        return;
      }
      nowMs += STEP_MS;
      return;
    }
    nowMs += STEP_MS;
    start();
    victory.update(nowMs);
    pillars.update(nowMs);
    scene.render();
  });

  return {
    stepTo(ms: number): void {
      stepTargetMs = ms;
      frozen = false;
    },
    get settled(): boolean {
      return frozen;
    },
    probe(): Record<string, unknown> {
      const cam = rig.camera;
      const pose = combatCameraPose({ x: 0, z: 0 });
      return {
        fx,
        cam: camMode,
        nowMs,
        frozen,
        eye: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
        fov: cam.fov,
        aspect: engine.getAspectRatio(cam),
        headroomAboveTarget: verticalHeadroom(pose, { x: 0, z: 0 }),
        beamPlan: castBeamPlan({
          headroom: verticalHeadroom(pose, { x: casterX, z: casterZ }, {
            aspect: engine.getAspectRatio(cam),
          }),
        }),
        pillarActive: pillars.activeCount,
        pillarPhase: pillars.phaseOf(CASTER_ID),
        chickenPoints: victory.chickenPointCount,
        chickenTotalMs: CHICKEN_TOTAL_MS,
        meshes: scene.meshes.length,
        particleSystems: scene.particleSystems.length,
      };
    },
    dispose(): void {
      engine.stopRenderLoop();
      victory.dispose();
      pillars.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
