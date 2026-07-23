/**
 * castPillarAudition — the scene behind `public/cast-pillar-audition.html`,
 * the review page for the cast-telegraph light pillar (same role as the #93
 * firework audition and the #80 ground audition: a place the work can be
 * LOOKED at and screenshotted without winning your way into a match).
 *
 * The owner specified this effect with a PICTURE (a Final Fantasy VII limit
 * break), and no table of alpha values can be approved against a picture. So
 * this runs the shipped `CastPillarFx` against a real Babylon camera at the
 * arena's own pitch, with stand-in bodies at champion scale, and exposes the
 * three things that actually have to be judged:
 *
 *   · the LOOK of one column per element (an ice cast must not read as fire);
 *   · the CROWD case — up to twelve columns at once must not white out;
 *   · the READ — the body stays visible inside the column, the ground ring is
 *     not drowned, and an interrupt is visibly different from a resolve.
 *
 * Like the firework page it supports a PINNED, FRAME-STEPPED clock so the same
 * moment can be compared across iterations instead of whatever frame a
 * screenshot happened to catch.
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
import { CastPillarFx } from "./CastPillarFx";
import { Telegraph } from "./Telegraph";
import { pillarPalette, RELEASE_MS, EXTINGUISH_MS } from "./castPillar";
import { ELEMENT_NAMES, type Element } from "../render/vfx/elements";

/** Champion body height the stand-ins are drawn at (normalized roster scale). */
const BODY_HEIGHT = 1.85;
const BODY_RADIUS = 0.42;

export interface CastPillarAuditionHandle {
  /** Raise `count` columns of `element` with a `castMs` window. */
  play(element: Element | null, count: number, castMs: number): void;
  /** Resolve every live column (the release flash). */
  resolveAll(): void;
  /** Interrupt every live column (the snuff). */
  interruptAll(): void;
  /** Pin the clock to `ms` after the cast started; null resumes real time. */
  pin(ms: number | null): void;
  /** Frame-step from the cast start and stop dead at `ms` (screenshot use). */
  stepTo(ms: number): Promise<void>;
  /** Live readout for the HUD. */
  stats(): { active: number; slots: number; meshes: number; systems: number; clockMs: number };
  /** The Babylon scene (screenshot automation / inspection seam). */
  readonly scene: Scene;
  dispose(): void;
}

interface Caster {
  id: number;
  x: number;
  z: number;
}

/** Ring of stand-in bodies, so 12 casters are all visible at once. */
function castersFor(count: number): Caster[] {
  const out: Caster[] = [];
  if (count === 1) return [{ id: 1, x: 0, z: 0 }];
  const r = count <= 4 ? 3.4 : count <= 8 ? 5.0 : 6.2;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    out.push({ id: i + 1, x: Math.cos(a) * r, z: Math.sin(a) * r });
  }
  return out;
}

export function startCastPillarAudition(canvas: HTMLCanvasElement): CastPillarAuditionHandle {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.04, 0.045, 0.06, 1);

  const camera = new FreeCamera("cam", new Vector3(0, 11.5, -12.5), scene);
  camera.setTarget(new Vector3(0, 1.6, 0));
  camera.minZ = 0.1;
  const light = new HemisphericLight("l", new Vector3(0.2, 1, 0.1), scene);
  light.intensity = 0.55;

  // ground: dark, matte, so an additive column reads against it exactly as it
  // does over the arena floor
  const ground = MeshBuilder.CreateGround("ground", { width: 40, height: 40 }, scene);
  const gmat = new StandardMaterial("gmat", scene);
  gmat.diffuseColor = new Color3(0.16, 0.155, 0.15);
  gmat.specularColor = new Color3(0, 0, 0);
  ground.material = gmat;

  // stand-in bodies at champion scale — the FF7 read is "the character is
  // SILHOUETTED inside the column", which cannot be judged without a body
  const bodyMat = new StandardMaterial("body", scene);
  bodyMat.diffuseColor = new Color3(0.5, 0.53, 0.6);
  bodyMat.specularColor = new Color3(0.05, 0.05, 0.05);
  const bodies: ReturnType<typeof MeshBuilder.CreateCapsule>[] = [];

  const positions = new Map<number, { x: number; z: number }>();
  const fx = new CastPillarFx(scene, { entityPos: (id) => positions.get(id) ?? null });

  let telegraphs: Telegraph[] = [];
  let startWall = 0;
  let pinned: number | null = null;
  let castMsCur = 600;
  let live: Caster[] = [];

  function clearBodies(): void {
    for (const b of bodies) b.dispose();
    bodies.length = 0;
  }

  function clockMs(): number {
    return pinned ?? performance.now() - startWall;
  }

  function play(element: Element | null, count: number, castMs: number): void {
    fx.clear();
    for (const t of telegraphs) t.dispose();
    telegraphs = [];
    clearBodies();
    positions.clear();

    castMsCur = castMs;
    live = castersFor(count);
    const palette = pillarPalette(element ? `fx.prim.${element}.nova` : undefined, null);
    startWall = performance.now();
    pinned = null;
    const now = 0;
    for (const c of live) {
      positions.set(c.id, { x: c.x, z: c.z });
      const body = MeshBuilder.CreateCapsule(
        `body-${c.id}`,
        { height: BODY_HEIGHT, radius: BODY_RADIUS },
        scene,
      );
      body.position.set(c.x, BODY_HEIGHT / 2, c.z);
      body.material = bodyMat;
      bodies.push(body);
      fx.begin(c.id, castMs, palette, now);
      // the ground AoE ring the column must never drown: same call VfxSystem
      // makes, filling over the same real cast window
      telegraphs.push(new Telegraph(scene, c.x + 2.4, c.z, 1.8, now, castMs));
    }
    fx.update(now);
  }

  function resolveAll(): void {
    const t = clockMs();
    for (const c of live) fx.finish(c.id, t);
  }

  function interruptAll(): void {
    const t = clockMs();
    for (const c of live) fx.interrupt(c.id, t);
  }

  function frame(t: number): void {
    fx.update(t);
    for (const tg of telegraphs) tg.update(t);
    // auto-resolve at the end of the window, exactly as the sim's castEnd does
    if (t >= castMsCur && t < castMsCur + 16) resolveAll();
    scene.render();
  }

  engine.runRenderLoop(() => {
    if (pinned !== null) return; // a pinned frame is rendered by pin()/stepTo()
    frame(clockMs());
  });
  window.addEventListener("resize", () => engine.resize());
  // The canvas can still be 0-sized when the module runs (fonts/layout), which
  // leaves Babylon on its 300x150 default and makes every screenshot useless.
  // Watch the element instead of trusting the first measurement.
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => {
      engine.resize();
      frame(clockMs());
    }).observe(canvas);
  }

  return {
    scene,
    play,
    resolveAll,
    interruptAll,
    pin(ms: number | null): void {
      pinned = ms;
      if (ms !== null) frame(ms);
      else startWall = performance.now();
    },
    async stepTo(ms: number): Promise<void> {
      pinned = 0;
      const dt = 1000 / 60;
      for (let t = 0; t <= ms; t += dt) {
        pinned = Math.min(t, ms);
        frame(pinned);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
      }
    },
    stats(): { active: number; slots: number; meshes: number; systems: number; clockMs: number } {
      return {
        active: fx.activeCount,
        slots: fx.slotCount,
        meshes: scene.meshes.length,
        systems: scene.particleSystems.length,
        clockMs: Math.round(clockMs()),
      };
    },
    dispose(): void {
      fx.dispose();
      for (const t of telegraphs) t.dispose();
      clearBodies();
      scene.dispose();
      engine.dispose();
    },
  };
}

/** Element list for the page's buttons (plus the no-element FF7 gold default). */
export const AUDITION_ELEMENTS: (Element | null)[] = [null, ...ELEMENT_NAMES];
export { RELEASE_MS, EXTINGUISH_MS };
