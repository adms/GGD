/**
 * LoginScene — a self-contained, fully-procedural DARK-EPIC isekai BOSS-BATTLE
 * background for the login card. It owns its OWN Babylon Engine + Scene + canvas
 * + render loop (it does NOT touch the gameplay GameApp/Renderer), so leaving
 * the auth screen and entering a match never leaves two engines fighting for
 * the GPU: AuthScreen calls `dispose()` on unmount.
 *
 * Aesthetic (異世界ボス戦): a near-black atmospheric sky + depth fog, floating
 * GLOWING ARENA islands (tiered colosseum stands + magic-circle floors + light
 * beams), a blood-eclipse moon, a huge vertical sky sigil, god-ray shafts, and
 * the boss-battle FX weaving through it — fire DRAGONS with ember trails,
 * kamehameha BEAM/shockwave pillars, EXPLOSIONS and clash FLASHES — all on
 * independent staggered timers so something is always happening but never
 * everything at once. Heavy bloom makes the emissive POP against the dark.
 *
 * Perf: the menu doesn't need retina. We cap the render buffer at ~1.25× device
 * pixels (setHardwareScalingLevel), soft-cap the loop near 60 fps, clamp dt, and
 * pause rendering entirely while the tab is hidden. The vista is otherwise
 * procedural (Babylon DynamicTexture / mesh builders); the ONE streamed asset is
 * `dragon2.glb`, which the two boss-dragons SHARE — it is fetched + parsed exactly
 * once and both dragons instantiate from that single template (see
 * ModelDragonController), so it never double-downloads at login. Each dragon shows
 * its procedural stand-in immediately and swaps to the model when it resolves, so
 * the glb never blocks the login card. The hot loop is allocation-free (reused
 * pose/scratch objects, in-place mutation).
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import {
  writeCameraDrift,
  glowPulse,
  wrapDrift,
  analyserLevel,
  islandLayout,
  staggerOffset,
  roarVolume,
  panFromScreenX,
  type CameraDriftConfig,
  type CameraPose,
  type GlowPulseConfig,
  type IslandSpec,
  type BeamPhaseConfig,
  type ExplosionPhaseConfig,
  type FlashPhaseConfig,
  type RoarVolumeConfig,
  type Vec3Like,
} from "./procedural/math";
import {
  enterCameraPose,
  enterFlashAlpha,
  islandApproachPose,
  returnCameraPose,
  DEFAULT_ENTER_TRANSITION,
  DEFAULT_RETURN_TRANSITION,
} from "./procedural/transition";
import { makeSoftDotTexture, makeCloudTexture, makeSkyTexture } from "./procedural/sprites";
import {
  buildSky,
  buildClouds,
  buildFloatingIsland,
  buildMagicCircle,
  buildMoon,
  buildLightShafts,
  buildLighting,
  buildMotes,
  buildPetals,
  arenaAccent,
  type CloudHandle,
  type MagicRing,
  type MoonHandle,
} from "./procedural/builders";
import {
  DragonController,
  ModelDragonController,
  BeamController,
  ExplosionController,
  CombatFlashController,
  type FxController,
} from "./procedural/fx";

/**
 * Semi-realistic Western fire dragon (炎龍) served from the content mount:
 * CC-BY 4.0 "Animated Dragon Three Motion Loops" by LasquetiSpice — see
 * content/assets/CREDITS.md (attribution is MANDATORY; surfaces on the in-game
 * credits screen, task #13). Faces +Z with a real baked wing-flap loop.
 */
const DRAGON_URL = "/content/assets/models/menu/dragon2.glb";

/**
 * A dragon roar the scene wants played (login-immersion #20/#26). The scene has
 * already resolved the near/far VOLUME (camera distance × dragon size) and the
 * stereo PAN (dragon screen-x); AuthScreen — which owns the AudioSystem — routes
 * it by `big`: the scripted action roars play the ANGRY `dragonRoarBig` clip,
 * the ambient breath roars keep the near/far `dragonRoar` long-howl pool
 * (see `roarSfx.ts`).
 */
export interface RoarEvent {
  /** near/far volume multiplier (loud when close/big, quiet when far) */
  volume: number;
  /** stereo pan -1..1 from the dragon's screen position */
  pan: number;
  /**
   * true = a loud, centred SCRIPTED roar (the enter-transition swoop or the
   * return-intro pull-back) — routed to the distinct angry `dragonRoarBig`
   */
  big: boolean;
}

export interface LoginSceneOptions {
  /** swap in a NullEngine for headless tests; defaults to a real WebGL Engine */
  engineFactory?: (canvas: HTMLCanvasElement) => Engine;
  /** start the render loop immediately (default true; tests pass false) */
  autoStart?: boolean;
  /** ms clock (default performance.now) */
  now?: () => number;
  /** number of floating arena islands (default 5) */
  islandCount?: number;
  /**
   * Build the boss-battle DYNAMIC FX (dragons / beams / explosions / flashes).
   * Default true. Set false for a CALM variant (dark vista, ambient drift, NO
   * strobing/flashing) — a photosensitivity-safe seam. AuthScreen never mounts
   * the scene at all under prefers-reduced-motion (see background.ts), so the
   * reduced-motion user only ever sees the static dark gradient; this flag is
   * the in-scene equivalent for anyone who wants the calm build.
   */
  epicFx?: boolean;
  /**
   * OPTIONAL audio-reactive glow. If supplied and it returns a live
   * AnalyserNode, the sigils' emissive + bloom breathe with the music.
   * AuthScreen does NOT supply one today (see docs/todo/login-scene.md) — so
   * the constant sine breathing runs.
   */
  getAnalyser?: () => AnalyserNode | null;
  /**
   * Called when a dragon roars (login-immersion #20): the scene resolves the
   * near/far volume + stereo pan and hands a {@link RoarEvent} to AuthScreen,
   * which plays it through the AudioSystem. Fires ~once per dragon breath cycle
   * (the two dragons are out of phase) plus once — loud + centred — at the start
   * of the enter-transition swoop.
   */
  onRoar?: (ev: RoarEvent) => void;
  /**
   * Called each frame of the enter-transition with the white-flash overlay
   * alpha (0..1). AuthScreen drives its DOM flash div straight off this (no
   * React re-render). Reaches 1 exactly at completion. Only fires during
   * {@link LoginScene.playEnterTransition}.
   */
  onFlash?: (alpha: number) => void;
}

const DRIFT: CameraDriftConfig = {
  baseAlpha: -Math.PI / 2,
  baseBeta: 1.05,
  baseRadius: 40,
  baseTargetY: 4,
  orbitSpeed: 0.012, // very slow continuous orbit
  alphaAmp: 0.05,
  alphaSpeed: 0.08,
  betaAmp: 0.05,
  betaSpeed: 0.05,
  radiusAmp: 2.6,
  radiusSpeed: 0.04,
  targetYAmp: 1.0,
  targetYSpeed: 0.06,
  revealRadius: 14, // slow majestic reveal: start pulled back…
  revealTau: 8, // …and ease in over ~8 s
};

const GLOW: GlowPulseConfig = { base: 0.85, amp: 0.4, speed: 1.1, audioBoost: 0.5 };

const BEAM_CFG: BeamPhaseConfig = { period: 9, charge: 1.6, fire: 1.1, shockwave: 0.7, maxRadius: 5 };
const EXPL_CFG: ExplosionPhaseConfig = { period: 7, duration: 1.4, maxRadius: 3.4 };
const FLASH_CFG: FlashPhaseConfig = { period: 2.4, duration: 0.5 };

const BLOOM_BASE = 0.8;
/** hard cap on the FX bloom boost so a beam/explosion never blinds/strobes */
const BLOOM_BOOST_CAP = 0.6;

/**
 * Dragon-roar near/far attenuation (login-immersion #20). Camera sits ~40 units
 * back and the dragons weave ~20–70 units away, so this band spans a loud close
 * roar down to a quiet distant one; the emitter also nudges by the dragon's size.
 */
const ROAR_CFG: RoarVolumeConfig = { nearDist: 14, farDist: 62, nearVolume: 1.15, farVolume: 0.4 };
/** the loud, centred scripted roar that fires as the enter-transition swoop begins */
const BIG_ROAR_VOLUME = 1.5;
/** enter-transition (swoop + flash) timing/shape — spec: ~1.2–1.6 s cinematic */
const ENTER_CFG = DEFAULT_ENTER_TRANSITION;
/** return-intro (reverse pull-back, app → login) timing — mirrors the enter swoop */
const RETURN_CFG = DEFAULT_RETURN_TRANSITION;

/** Live enter-transition bookkeeping (one at a time). */
interface TransitionState {
  /** ms clock captured on the first advanced frame (null until then) */
  startMs: number | null;
  from: CameraPose;
  to: CameraPose;
  onComplete: () => void;
  /** camera reached the island (pose frozen fully-white) */
  done: boolean;
  /** onComplete has been invoked exactly once */
  completed: boolean;
}

/** Live return-intro bookkeeping (reverse of the enter swoop; one at a time). */
interface ReturnState {
  /** ms clock captured on the first advanced frame (null until then) */
  startMs: number | null;
  /** the on-island close-up the pull-back starts FROM (≈ the enter end-state) */
  from: CameraPose;
  onComplete: (() => void) | null;
  /** onComplete has been invoked exactly once */
  completed: boolean;
}

/** soft cap so a 120 Hz ProMotion panel doesn't render the menu at 120 fps */
const MIN_FRAME_MS = 1000 / 62;
/** clamp per-frame dt so a hidden-then-shown tab doesn't fast-forward the scene */
const MAX_DT = 0.1;

interface IslandHandle {
  root: TransformNode;
  spec: IslandSpec;
}

export class LoginScene {
  readonly engine: Engine;
  readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private pipeline: DefaultRenderingPipeline | null = null;

  private readonly islands: IslandHandle[] = [];
  private readonly clouds: CloudHandle[] = [];
  private readonly rings: MagicRing[] = [];
  private readonly particleSystems: ParticleSystem[] = [];
  private readonly fx: FxController[] = [];
  private moon: MoonHandle | null = null;

  private readonly now: () => number;
  private readonly getAnalyser?: () => AnalyserNode | null;
  private analyserBuf: Uint8Array<ArrayBuffer> | null = null;

  private readonly onRoar?: (ev: RoarEvent) => void;
  private readonly onFlash?: (alpha: number) => void;
  /** reused scratch for the world→screen roar-pan projection (rare event) */
  private readonly roarProj = new Vector3();
  private transition: TransitionState | null = null;
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;
  private returnState: ReturnState | null = null;
  private returnTimer: ReturnType<typeof setTimeout> | null = null;
  /** reused scratch: the live drift pose the return pull-back eases toward */
  private readonly returnTarget: CameraPose = { alpha: 0, beta: 0, radius: 0, targetY: 0 };

  private readonly pose: CameraPose = { alpha: 0, beta: 0, radius: 0, targetY: 0 };
  private elapsed = 0; // accumulated animated seconds (dt-clamped)
  private lastFrameMs: number | null = null;
  private lastRenderMs = 0;
  private running = false;
  private disposed = false;

  private readonly onResize = (): void => this.engine.resize();
  private readonly onVisibility = (): void => {
    if (typeof document === "undefined") return;
    if (document.hidden) this.stop();
    else this.start();
  };

  constructor(canvas: HTMLCanvasElement, opts: LoginSceneOptions = {}) {
    this.now = opts.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    this.getAnalyser = opts.getAnalyser;
    this.onRoar = opts.onRoar;
    this.onFlash = opts.onFlash;

    this.engine = opts.engineFactory
      ? opts.engineFactory(canvas)
      : new Engine(canvas, true, { stencil: false, doNotHandleContextLost: true, powerPreference: "low-power" });
    this.applyHardwareScaling();

    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.02, 0.02, 0.05, 1); // near-black void (also the fallback flash)
    this.scene.skipPointerMovePicking = true;
    this.scene.autoClearDepthAndStencil = true;
    // depth fog swallows the far arenas into the dark — the whole moody look
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogColor = new Color3(0.03, 0.03, 0.07);
    this.scene.fogDensity = 0.011;

    this.camera = new ArcRotateCamera(
      "login-cam",
      DRIFT.baseAlpha,
      DRIFT.baseBeta,
      DRIFT.baseRadius,
      new Vector3(0, DRIFT.baseTargetY, 0),
      this.scene,
    );
    this.camera.minZ = 0.1;
    this.camera.maxZ = 500;
    this.camera.fov = 0.95;
    // NO attachControl: this is a non-interactive background (the canvas is
    // pointer-events:none anyway so the login form stays fully clickable).

    this.build(opts.islandCount ?? 5, opts.epicFx !== false);

    if (opts.autoStart !== false) {
      this.start();
      if (typeof window !== "undefined") window.addEventListener("resize", this.onResize);
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.onVisibility);
    }
  }

  /** Cap the render buffer at ~1.25× device pixels — crisp enough, cheap fill. */
  private applyHardwareScaling(): void {
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const target = Math.min(dpr, 1.25);
    try {
      this.engine.setHardwareScalingLevel(1 / target);
    } catch {
      /* NullEngine / headless: ignore */
    }
  }

  private build(islandCount: number, epicFx: boolean): void {
    buildLighting(this.scene);

    const skyTex = makeSkyTexture(this.scene);
    buildSky(this.scene, skyTex);

    // blood-eclipse moon + god-ray shafts (calm ambient, no strobing)
    this.moon = buildMoon(this.scene, new Vector3(-40, 34, -90), 24);
    buildLightShafts(this.scene, 4);

    const cloudTex = makeCloudTexture(this.scene);
    for (const c of buildClouds(this.scene, cloudTex, 7)) this.clouds.push(c);

    const specs = islandLayout(islandCount);
    for (const [i, spec] of specs.entries()) {
      const root = buildFloatingIsland(this.scene, spec, i);
      this.islands.push({ root, spec });
    }

    // central arena hub circle (flat) + huge vertical sky sigil far behind
    const hub = buildMagicCircle(this.scene, new Vector3(0, 1.5, 0), { radii: [6.5, 4.4, 2.6] });
    for (const r of hub.rings) this.rings.push(r);
    const sigil = buildMagicCircle(this.scene, new Vector3(0, 30, -82), {
      flat: false,
      scale: 2.4,
      disc: false,
      palette: [
        [0.6, 0.3, 1.0],
        [1.0, 0.4, 0.4],
        [0.4, 0.72, 1.0],
      ],
    });
    for (const r of sigil.rings) this.rings.push(r);

    const dotTex = makeSoftDotTexture(this.scene);
    const embers = buildMotes(this.scene, dotTex);
    const stars = buildPetals(this.scene, dotTex);
    embers.start();
    stars.start();
    this.particleSystems.push(embers, stars);

    if (epicFx) this.buildFx(specs, dotTex);

    // heavy bloom for the emissive pop — guarded so a headless/edge GPU can't break boot
    try {
      const pipe = new DefaultRenderingPipeline("login-pipe", true, this.scene, [this.camera]);
      pipe.bloomEnabled = true;
      pipe.bloomThreshold = 0.35; // low → emissive blows out against the dark
      pipe.bloomWeight = BLOOM_BASE;
      pipe.bloomKernel = 96;
      pipe.bloomScale = 0.5;
      pipe.fxaaEnabled = true;
      pipe.imageProcessingEnabled = true;
      pipe.imageProcessing.toneMappingEnabled = true;
      pipe.imageProcessing.contrast = 1.2;
      pipe.imageProcessing.exposure = 1.05;
      this.pipeline = pipe;
    } catch {
      this.pipeline = null; // no post-fx — the scene still renders
    }
  }

  /** Construct the staggered boss-battle FX controllers around the arenas. */
  private buildFx(specs: IslandSpec[], dotTex: ReturnType<typeof makeSoftDotTexture>): void {
    // 2 fire dragons SOARING the vista on grand, slow ellipses that cross the
    // view — big radius + slow loop + gentle vertical weave = a majestic arc, not
    // a hover. The hero dragon is larger and lower; the second is higher, slower,
    // and counter-rotating so they sweep past each other.
    // roar hook: each dragon's breath edge → a near/far, panned roar. Only wired
    // when AuthScreen supplied onRoar (keeps the hot loop free otherwise).
    const roarHook = this.onRoar
      ? (pos: Vec3Like, scale: number): void => this.emitRoar(pos, scale, false)
      : undefined;
    this.fx.push(
      new ModelDragonController(this.scene, dotTex, {
        url: DRAGON_URL,
        scale: 3.0,
        path: { centerX: 0, centerY: 11, centerZ: -6, radiusX: 30, radiusZ: 24, height: 4, loopSpeed: 0.1, weaveSpeed: 0.42, phase: 0 },
        breathPeriod: 11,
        breathDuration: 1.6,
        breathOffset: 0,
        onRoar: roarHook,
      }),
    );
    this.fx.push(
      new ModelDragonController(this.scene, dotTex, {
        url: DRAGON_URL,
        scale: 2.3,
        path: { centerX: 2, centerY: 16, centerZ: -8, radiusX: 26, radiusZ: 28, height: 3.5, loopSpeed: -0.08, weaveSpeed: 0.5, phase: Math.PI },
        segments: 14,
        breathPeriod: 13,
        breathDuration: 1.4,
        breathOffset: 6.5, // out of phase with dragon #1
        onRoar: roarHook,
      }),
    );

    // kamehameha beam pillars from the first arenas — ALL fire straight UP
    // (skyward pillars only; no island↔island crossfire — the horizontal beams
    // read as visual clutter, so every beam is a clean vertical shockwave).
    const beamN = Math.min(3, specs.length);
    for (let i = 0; i < beamN; i++) {
      const s = specs[i]!;
      const start = new Vector3(s.x, s.y + 1.6, s.z);
      const end = new Vector3(s.x, s.y + 24, s.z); // skyward pillar
      this.fx.push(
        new BeamController(this.scene, {
          start,
          end,
          offset: staggerOffset(i, beamN, BEAM_CFG.period),
          cfg: BEAM_CFG,
          color: arenaAccent(i),
        }),
      );
    }

    // explosions scattered around the arenas on loose per-index timers
    const explN = 4;
    for (let i = 0; i < explN; i++) {
      const a = i * 1.9 + 0.5;
      const site = new Vector3(Math.cos(a) * 20, 2.5 + (i % 2) * 6, Math.sin(a) * 20);
      this.fx.push(
        new ExplosionController(this.scene, dotTex, { site, index: i, cfg: EXPL_CFG, color: arenaAccent(i + 1) }),
      );
    }

    // quick clash flashes between the islands (unseen fighters)
    const flashPts: Vector3[] = [];
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + 0.2;
      flashPts.push(new Vector3(Math.cos(a) * 14, 4 + (i % 3) * 3, Math.sin(a) * 14));
    }
    this.fx.push(new CombatFlashController(this.scene, dotTex, { points: flashPts, cfg: FLASH_CFG }));
  }

  /** Read the optional analyser (0..1); 0 when none wired (constant breathing). */
  private audioLevel(): number {
    const node = this.getAnalyser?.();
    if (!node) return 0;
    try {
      if (!this.analyserBuf || this.analyserBuf.length !== node.frequencyBinCount) {
        this.analyserBuf = new Uint8Array(node.frequencyBinCount);
      }
      node.getByteFrequencyData(this.analyserBuf);
      return analyserLevel(this.analyserBuf);
    } catch {
      return 0;
    }
  }

  // -------------------------------------------------------------------------
  // dragon roars (near/far, panned) + enter transition (swoop → white flash)
  // -------------------------------------------------------------------------

  /**
   * Resolve a dragon roar into a {@link RoarEvent} and hand it to AuthScreen.
   * Volume attenuates with camera distance (a `big` scripted roar overrides to
   * loud + centred); pan comes from the dragon's projected screen-x. Called only
   * on a roar edge (~every 11–13 s) or once at swoop start — a rare event, so
   * the small projection alloc is fine (the per-frame loop stays clean).
   */
  private emitRoar(pos: Vec3Like, scale: number, big: boolean): void {
    const onRoar = this.onRoar;
    if (!onRoar) return;
    const cam = this.camera.position;
    const dx = pos.x - cam.x;
    const dy = pos.y - cam.y;
    const dz = pos.z - cam.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const sizeBoost = 0.8 + (0.2 * Math.min(scale, 3.5)) / 3.5; // bigger dragon → a touch louder
    const volume = big ? BIG_ROAR_VOLUME : roarVolume(dist, ROAR_CFG) * sizeBoost;
    let pan = 0;
    if (!big) {
      try {
        const engine = this.scene.getEngine();
        const w = engine.getRenderWidth();
        const h = engine.getRenderHeight();
        this.roarProj.set(pos.x, pos.y, pos.z);
        const screen = Vector3.Project(
          this.roarProj,
          Matrix.IdentityReadOnly,
          this.scene.getTransformMatrix(),
          this.camera.viewport.toGlobal(w, h),
        );
        pan = panFromScreenX(screen.x, w);
      } catch {
        pan = 0; // projection unavailable (pre-first-render / headless) → centred
      }
    }
    onRoar({ volume, pan, big });
  }

  /** Nearest floating island to the camera — the one we swoop onto ("mount"). */
  private pickApproachIsland(): Vec3Like {
    if (this.islands.length === 0) return { x: 0, y: 4, z: 0 };
    const cam = this.camera.position;
    let best = this.islands[0]!.spec;
    let bestD = Infinity;
    for (const isl of this.islands) {
      const s = isl.spec;
      const dx = s.x - cam.x;
      const dy = s.y - cam.y;
      const dz = s.z - cam.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return { x: best.x, y: best.y, z: best.z };
  }

  /**
   * Start the cinematic enter transition: swoop the camera FORWARD + zoom onto
   * the nearest arena island, roar once (loud), and fade a white flash in, then
   * call `onComplete`. Guarantees `onComplete` fires EXACTLY once — on the
   * disposed scene (immediately), on completion (finishTransition), or via the
   * hard safety timer if the loop stalls (tab hidden mid-swoop). AuthScreen also
   * keeps its own outer fallback, so the screen always proceeds.
   */
  playEnterTransition(onComplete: () => void): void {
    if (this.disposed) {
      onComplete();
      return;
    }
    if (this.transition) return; // already swooping — ignore a double-invoke
    const from = writeCameraDrift({ alpha: 0, beta: 0, radius: 0, targetY: 0 }, this.elapsed, DRIFT);
    const island = this.pickApproachIsland();
    const to = islandApproachPose(island, from, ENTER_CFG);
    this.transition = { startMs: null, from, to, onComplete, done: false, completed: false };
    // big scripted roar (loud, centred) as the dive begins
    this.emitRoar(island, 3.2, true);
    // hard safety net: proceed even if frames stop advancing mid-swoop
    if (typeof setTimeout === "function") {
      this.transitionTimer = setTimeout(() => this.finishTransition(), ENTER_CFG.durationMs + 500);
    }
    this.start(); // ensure the loop is running so the swoop actually animates
  }

  /** Advance the swoop pose + white flash for wall-clock `nowMs`. */
  private advanceTransition(nowMs: number): void {
    const tr = this.transition;
    if (!tr || tr.done) return;
    if (tr.startMs === null) tr.startMs = nowMs;
    const raw = ENTER_CFG.durationMs > 0 ? (nowMs - tr.startMs) / ENTER_CFG.durationMs : 1;
    const p = raw < 0 ? 0 : raw > 1 ? 1 : raw;
    enterCameraPose(this.pose, p, tr.from, tr.to);
    this.camera.alpha = this.pose.alpha;
    this.camera.beta = this.pose.beta;
    this.camera.radius = this.pose.radius;
    this.camera.target.y = this.pose.targetY;
    this.onFlash?.(enterFlashAlpha(p, ENTER_CFG.flashStart));
    if (raw >= 1) this.finishTransition();
  }

  /** Freeze on the full white flash + fire onComplete once. Idempotent. */
  private finishTransition(): void {
    const tr = this.transition;
    if (!tr) return;
    if (this.transitionTimer !== null) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
    tr.done = true;
    this.onFlash?.(1);
    if (!tr.completed) {
      tr.completed = true;
      tr.onComplete();
    }
  }

  /**
   * Start the cinematic RETURN intro (task #26: app → login): the scene begins
   * at the enter-transition END-STATE — camera close on the nearest arena
   * island — and eases back OUT/UP to the resting sky vista over ~1.4 s (the
   * reverse of the enter swoop), roaring once (big + angry) as the pull-back
   * begins. No white flash: the resting drift simply resumes at the end.
   * Real-elapsed-ms driven (frame-skip-safe, like playEnterTransition), and the
   * optional `onComplete` fires EXACTLY once — on the disposed scene
   * (immediately), on completion, or via the hard safety timer / dispose.
   */
  playReturnIntro(onComplete?: () => void): void {
    if (this.disposed) {
      onComplete?.();
      return;
    }
    if (this.transition || this.returnState) return; // already animating — ignore
    // resting vista = the drift pose the pull-back would land on RIGHT NOW; the
    // per-frame advance re-targets the LIVE drift pose so the hand-off is seamless.
    const resting = writeCameraDrift({ alpha: 0, beta: 0, radius: 0, targetY: 0 }, this.elapsed, DRIFT);
    const island = this.pickApproachIsland();
    const from = islandApproachPose(island, resting, ENTER_CFG); // ≈ enter end-state
    // snap onto the island NOW so the very first painted frame is the close-up
    this.camera.alpha = from.alpha;
    this.camera.beta = from.beta;
    this.camera.radius = from.radius;
    this.camera.target.y = from.targetY;
    this.returnState = { startMs: null, from, onComplete: onComplete ?? null, completed: false };
    // big scripted ANGRY roar (loud, centred) as the pull-back begins
    this.emitRoar(island, 3.2, true);
    // hard safety net: complete even if frames stop advancing mid-pull-back
    if (typeof setTimeout === "function") {
      this.returnTimer = setTimeout(() => this.finishReturn(), RETURN_CFG.durationMs + 500);
    }
    this.start(); // ensure the loop is running so the pull-back actually animates
  }

  /**
   * Advance the return pull-back for wall-clock `nowMs`. `this.pose` holds the
   * LIVE drift pose (written by frame() just before) — that is the pull-back
   * target, so at p=1 the camera exactly matches the resumed drift (no jump).
   */
  private advanceReturn(nowMs: number): void {
    const tr = this.returnState;
    if (!tr) return;
    if (tr.startMs === null) tr.startMs = nowMs;
    const raw = RETURN_CFG.durationMs > 0 ? (nowMs - tr.startMs) / RETURN_CFG.durationMs : 1;
    const p = raw < 0 ? 0 : raw > 1 ? 1 : raw;
    this.returnTarget.alpha = this.pose.alpha;
    this.returnTarget.beta = this.pose.beta;
    this.returnTarget.radius = this.pose.radius;
    this.returnTarget.targetY = this.pose.targetY;
    returnCameraPose(this.pose, p, tr.from, this.returnTarget);
    this.camera.alpha = this.pose.alpha;
    this.camera.beta = this.pose.beta;
    this.camera.radius = this.pose.radius;
    this.camera.target.y = this.pose.targetY;
    if (raw >= 1) this.finishReturn();
  }

  /** End the return intro (drift resumes) + fire onComplete once. Idempotent. */
  private finishReturn(): void {
    const tr = this.returnState;
    if (!tr) return;
    if (this.returnTimer !== null) {
      clearTimeout(this.returnTimer);
      this.returnTimer = null;
    }
    this.returnState = null; // drift takes over on the next frame
    if (!tr.completed) {
      tr.completed = true;
      tr.onComplete?.();
    }
  }

  /** Advance + render one frame. Allocation-free hot path (reused vectors). */
  private frame(): void {
    if (this.disposed) return;
    const t = this.now();
    const dtRaw = this.lastFrameMs === null ? 0 : (t - this.lastFrameMs) / 1000;
    this.lastFrameMs = t;
    const dt = dtRaw < 0 ? 0 : dtRaw > MAX_DT ? MAX_DT : dtRaw;
    // soft fps cap: skip the draw (but keep the clock) if we're ahead of budget
    if (t - this.lastRenderMs < MIN_FRAME_MS) return;
    this.lastRenderMs = t;
    this.elapsed += dt;
    const e = this.elapsed;

    // camera: slow continuous orbit + gentle multi-axis bob + majestic reveal
    writeCameraDrift(this.pose, e, DRIFT);
    this.camera.alpha = this.pose.alpha;
    this.camera.beta = this.pose.beta;
    this.camera.radius = this.pose.radius;
    this.camera.target.y = this.pose.targetY; // mutate in place (no setTarget → keeps alpha/beta)

    // ENTER-TRANSITION swoop overrides the drift: interpolate the on-island pose
    // by real elapsed ms (frame-skip-safe) + drive the white flash + finish once.
    if (this.transition && !this.transition.done) this.advanceTransition(t);
    // RETURN intro (reverse): island close-up eases back to the live drift pose.
    else if (this.returnState) this.advanceReturn(t);

    // arena islands bob + slowly spin, each at its own phase
    for (const isl of this.islands) {
      const s = isl.spec;
      isl.root.position.y = s.y + Math.sin(e * s.bobSpeed + s.bobPhase) * s.bobAmp;
      isl.root.rotation.y = s.spinPhase + e * s.spinSpeed;
    }

    // drifting mist wraps horizontally
    for (const c of this.clouds) {
      c.mesh.position.x = wrapDrift(c.mesh.position.x, c.speed, dt, c.minX, c.maxX);
    }

    // magic sigils: counter-rotate the rings + breathe the emissive
    const level = this.audioLevel();
    const k = glowPulse(e, GLOW, level);
    for (const ring of this.rings) {
      ring.node.rotation.y = e * ring.spinSpeed;
      for (const m of ring.mats) m.emissiveColor.set(ring.baseR * k, ring.baseG * k, ring.baseB * k);
    }

    // blood-moon slow breathing (non-strobing)
    if (this.moon) {
      const mk = 0.85 + 0.15 * Math.sin(e * 0.5);
      this.moon.mat.emissiveColor.set(this.moon.baseR * mk, this.moon.baseG * mk, this.moon.baseB * mk);
    }

    // boss-battle FX — each advances itself and contributes a bloom boost
    let boost = 0;
    for (const fx of this.fx) boost += fx.update(e, dt);
    if (boost > BLOOM_BOOST_CAP) boost = BLOOM_BOOST_CAP;

    if (this.pipeline) this.pipeline.bloomWeight = BLOOM_BASE + (k - GLOW.base) * 0.35 + boost;

    this.scene.render();
  }

  /** Whether the render loop is currently running (diagnostics / tests). */
  get isRunning(): boolean {
    return this.running;
  }

  /** Begin the render loop (idempotent). */
  start(): void {
    if (this.disposed || this.running) return;
    this.running = true;
    this.lastFrameMs = null; // avoid a dt spike after a pause
    this.engine.runRenderLoop(() => this.frame());
  }

  /** Pause the render loop without tearing anything down (idempotent). */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.engine.stopRenderLoop();
  }

  /** Tear down the engine, scene, textures and listeners. Safe to call twice. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    // a transition still in flight (screen switched out from under the swoop):
    // clear the safety timer and guarantee onComplete fired so nothing hangs.
    if (this.transitionTimer !== null) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
    const tr = this.transition;
    this.transition = null;
    if (tr && !tr.completed) {
      tr.completed = true;
      try {
        tr.onComplete();
      } catch {
        /* callback owner is unmounting — ignore */
      }
    }
    // same guarantee for a return intro still in flight (dispose-mid-pull-back)
    if (this.returnTimer !== null) {
      clearTimeout(this.returnTimer);
      this.returnTimer = null;
    }
    const rt = this.returnState;
    this.returnState = null;
    if (rt && !rt.completed) {
      rt.completed = true;
      try {
        rt.onComplete?.();
      } catch {
        /* callback owner is unmounting — ignore */
      }
    }
    if (typeof window !== "undefined") window.removeEventListener("resize", this.onResize);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisibility);
    this.engine.stopRenderLoop();
    for (const fx of this.fx) fx.dispose();
    this.fx.length = 0;
    for (const ps of this.particleSystems) ps.dispose();
    this.particleSystems.length = 0;
    this.pipeline?.dispose();
    this.pipeline = null;
    this.moon = null;
    this.scene.dispose();
    this.engine.dispose();
  }
}
