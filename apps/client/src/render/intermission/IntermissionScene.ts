/**
 * IntermissionScene — 中場, the travelling merchant's dusk market.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A WHOLE SCENE AND NOT A PROP (the bug it fixes)
 * ---------------------------------------------------------------------------
 * The user asked 「戰鬥場景一開始就能動跟 ready 按鈕才能動 是什麼意思？戰鬥還沒
 * 開始嗎？」. During INTERMISSION the sim runs and the champion is fully
 * controllable, so it LOOKS like combat; `MatchController` advances on
 * `expired || (allSeatsReady && offers.size === 0)`, i.e. Ready means "skip the
 * rest of my prep time", not "unlock movement". Nothing on screen said which
 * phase you were in.
 *
 * The user then ruled on the shape of the fix (2026-07-22):
 * 「中場是獨立於戰鬥場景外的一個新場景，所以戰鬥的時候商店不會出現」.
 * A SCENE CHANGE is the strongest possible phase signal — stronger than any
 * banner — and it makes "the shop is hidden during combat" STRUCTURAL rather
 * than a UI rule. (The server-side purchase gate still stands on its own: a
 * client can always send the command. See sim/economy/shopAccess.ts.)
 *
 * ---------------------------------------------------------------------------
 * PATTERN: this is LoginScene's twin, deliberately
 * ---------------------------------------------------------------------------
 * `render/menu/LoginScene.ts` is already a full separate Babylon scene with its
 * own Engine, Scene, camera, lifecycle and transitions. Rather than invent a
 * second pattern this file mirrors it exactly — own engine (swappable for a
 * NullEngine in tests), own camera, own `dispose()`, the same dt-clamped
 * soft-capped frame loop, the same visibility pause, and the SAME transition
 * machinery (`menu/procedural/transition.ts`) including task #26's guarantee
 * that `onComplete` fires EXACTLY ONCE — on completion, on a hard safety timer
 * if frames stall, or immediately on a disposed scene.
 *
 * It is the third `new Scene(engine)` site, alongside `Renderer.ts` (the arena)
 * and `StorePreview.ts` (the skin viewer). It never touches `ArenaScene.ts`.
 *
 * All staging numbers — placements, scales, camera, light rig, fog — live in
 * `./layout.ts` as plain data, so the composition is unit-tested without a GPU
 * and this file stays an imperative shell.
 */
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Rendering/depthRendererSceneComponent";

import { AssetManager } from "../AssetManager";
import { glbYawOffset } from "../views/glbFacing";
import { pickReactionClip } from "./reactionClip";
import { groundShiftY } from "./stance";
import { writeCameraDrift } from "../menu/procedural/math";
import { enterCameraPose } from "../menu/procedural/transition";
import { makeSoftDotTexture } from "../menu/procedural/sprites";
import {
  ATMOSPHERE,
  CAMERA_DRIFT,
  CAMERA_ENTER_POSE,
  CAMERA_FOV,
  CAMERA_POSE,
  CAMERA_TARGET,
  CART,
  CHAMPION_STAND,
  CHAMPION_YAW,
  DRESSING,
  ENTER_DURATION_MS,
  GROUND_RADIUS,
  LANTERN_POS,
  LIGHT_RIG,
  MERCHANT,
  MERCHANT_CLIPS,
  MERCHANT_HIDDEN_MESH_PREFIX,
  PLAZA_RADIUS,
  STALL,
  TILE_SCALE,
  TORCHES,
  bannerFor,
  grassRing,
  pavingTiles,
  silhouettes,
  type Placement,
  type Rgb,
} from "./layout";
import {
  SHELF_RACK,
  layoutShelfGoods,
  type ShelfGoodInput,
} from "./shelfDisplay";

/** soft cap so a 120 Hz panel doesn't render a static market at 120 fps */
const MIN_FRAME_MS = 1000 / 62;
/** clamp per-frame dt so a hidden-then-shown tab doesn't fast-forward the scene */
const MAX_DT = 0.1;

const color3 = (c: Rgb): Color3 => new Color3(c.r, c.g, c.b);

export interface IntermissionSceneOptions {
  /** swap in a NullEngine for headless tests; defaults to a real WebGL Engine */
  engineFactory?: (canvas: HTMLCanvasElement) => Engine;
  /** start the render loop immediately (default true; tests pass false) */
  autoStart?: boolean;
  /** ms clock (default performance.now) */
  now?: () => number;
  /**
   * Local team id — picks which KayKit shield banner flies over the pitch. May
   * be changed later with {@link setTeam}; -1/absent flies no banner.
   */
  teamId?: number;
  /**
   * The player's own champion: a content-relative .glb path plus the scale that
   * normalises it to 1.7 u (the same pair the arena's ChampionView uses). Absent
   * = no hero in frame, which is what champ-select-less dev boots get.
   */
  champion?: { glbPath: string; scale: number } | null;
}

/** Merchant animation the scene can be asked to play. */
export type MerchantGesture = "wave" | "interact";

interface Lantern {
  light: PointLight;
  baseIntensity: number;
  phase: number;
}

/** Live enter-transition bookkeeping (one at a time), mirroring LoginScene. */
interface TransitionState {
  startMs: number | null;
  onComplete: () => void;
  done: boolean;
  completed: boolean;
}

export class IntermissionScene {
  readonly engine: Engine;
  readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private readonly assets: AssetManager;
  private pipeline: DefaultRenderingPipeline | null = null;
  private shadows: ShadowGenerator | null = null;

  /** everything the market is built from, parented for one-line teardown */
  private readonly stage: TransformNode;
  /** re-parented per team change, so the banner can be swapped in place */
  private bannerRoot: TransformNode | null = null;
  /**
   * The functional shelf rack (task #94). `shelfRoot` is the carcass, built
   * once and procedurally (there is no shelf .glb, and building it means the
   * shelves also exist in the headless test where no model loads); `goodsRoot`
   * is its stock, torn down and rebuilt every time the catalogue changes so a
   * bought item leaves the shelf and an undone sale puts it back.
   */
  private shelfRoot: TransformNode | null = null;
  private goodsRoot: TransformNode | null = null;
  /** last stock pushed in, replayed once the carcass exists */
  private pendingGoods: readonly ShelfGoodInput[] = [];
  private championRoot: TransformNode | null = null;
  private championToken = 0;
  /** the hero's own baked clips, kept so a purchase can play a reaction */
  private championGroups: AnimationGroup[] = [];
  /** the idle loop we return TO after a reaction (null = hero stands still) */
  private championIdle: AnimationGroup | null = null;
  /** the one-shot purchase reaction currently overriding idle (null = idling) */
  private championReaction: AnimationGroup | null = null;
  /** the champion root's resting uniform scale, so the pop springs back to it */
  private championBaseScale = 1;
  /** live procedural "pop" for a hero with no usable reaction clip (null = none) */
  private championPulse: { start: number; dur: number } | null = null;

  private readonly particles: ParticleSystem[] = [];
  private readonly lanterns: Lantern[] = [];
  private merchantClips = new Map<string, AnimationGroup>();
  /** gesture currently overriding the Idle loop (null = idling) */
  private activeGesture: AnimationGroup | null = null;

  private readonly now: () => number;
  private teamId: number;
  private readonly pose = { alpha: 0, beta: 0, radius: 0, targetY: 0 };
  /** scratch: the live drift pose the enter-ease targets (never aliased) */
  private readonly enterTarget = { alpha: 0, beta: 0, radius: 0, targetY: 0 };
  private transition: TransitionState | null = null;
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;

  private elapsed = 0;
  private lastFrameMs: number | null = null;
  private lastRenderMs = 0;
  private running = false;
  private disposed = false;
  private built = false;

  private readonly onResize = (): void => this.engine.resize();
  private readonly onVisibility = (): void => {
    if (typeof document === "undefined") return;
    if (document.hidden) this.stop();
    else this.start();
  };

  constructor(canvas: HTMLCanvasElement, opts: IntermissionSceneOptions = {}) {
    this.now = opts.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    this.teamId = opts.teamId ?? -1;

    this.engine = opts.engineFactory
      ? opts.engineFactory(canvas)
      : new Engine(canvas, true, { stencil: false, doNotHandleContextLost: true, powerPreference: "low-power" });
    this.applyHardwareScaling();

    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(
      ATMOSPHERE.clearColor.r,
      ATMOSPHERE.clearColor.g,
      ATMOSPHERE.clearColor.b,
      1,
    );
    this.scene.skipPointerMovePicking = true;
    // The plaza has no rim: fog is what ENDS the world, so the market dissolves
    // into an indigo horizon instead of stopping at a visible edge.
    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogColor = color3(ATMOSPHERE.fogColor);
    this.scene.fogDensity = ATMOSPHERE.fogDensity;

    // The orbit PIVOT is CAMERA_TARGET, not the origin. `arcPoseFor` encodes
    // only the DIRECTION and distance from target to eye (alpha/beta/radius) —
    // the aim POINT survives solely as the pivot passed here. Pivoting on
    // (0, y, 0) instead silently threw away CAMERA_TARGET.x/z, which is the
    // authored off-centre aim that pans the whole cast into the free half:
    // with it dropped the merchant's head lands at ~53 % of screen width and
    // the hero sits behind the shop card, exactly the framing layout.ts says
    // the aim exists to prevent. layout.test.ts could not catch it — it
    // projects with a look-at model, so it verified the intent, not the shot.
    this.camera = new ArcRotateCamera(
      "intermission-cam",
      CAMERA_POSE.alpha,
      CAMERA_POSE.beta,
      CAMERA_POSE.radius,
      new Vector3(CAMERA_TARGET.x, CAMERA_POSE.targetY, CAMERA_TARGET.z),
      this.scene,
    );
    this.camera.minZ = 0.1;
    this.camera.maxZ = 200;
    this.camera.fov = CAMERA_FOV;
    // NO attachControl: this is a COMPOSED shot, not a viewer. Letting the user
    // orbit would break the guarantee that merchant/cart/hero stay in the free
    // 55% the LEFT-docked shop card does not cover — the RIGHT half, since the
    // whole scene is mirrored to match the card's side (see layout.ts /
    // layout.test.ts, keyed on SHOP_CARD_SIDE).

    // A fresh AssetManager per scene is REQUIRED, not sloppy: an AssetContainer
    // belongs to the Scene that created it and dies with it, so its cache can
    // never outlive `this.scene`. What DOES survive is the raw .glb bytes —
    // AssetManager keeps those in a module-level cache shared by every
    // instance, so re-opening the market on round 2 re-parses from memory and
    // downloads nothing (2,283,528 B / 14 requests saved per round; measured in
    // intermission/assetReuse.test.ts).
    this.assets = new AssetManager(this.scene);
    this.stage = new TransformNode("intermission-stage", this.scene);

    this.buildStatic();
    void this.buildProps(opts.champion ?? null);

    if (opts.autoStart !== false) {
      this.start();
      if (typeof window !== "undefined") window.addEventListener("resize", this.onResize);
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.onVisibility);
    }
  }

  /** Cap the render buffer at ~1.25× device pixels — crisp enough, cheap fill. */
  private applyHardwareScaling(): void {
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    try {
      this.engine.setHardwareScalingLevel(1 / Math.min(dpr, 1.25));
    } catch {
      /* NullEngine / headless: ignore */
    }
  }

  // -------------------------------------------------------------------------
  // build
  // -------------------------------------------------------------------------

  /** Ground, lights and atmosphere — everything that needs no asset fetch. */
  private buildStatic(): void {
    this.buildGround();
    this.buildLights();
    this.buildMotes();
    try {
      const pipe = new DefaultRenderingPipeline("intermission-pipe", true, this.scene, [this.camera]);
      pipe.bloomEnabled = true;
      // Gentle, high-threshold bloom: ONLY the lantern and torch flames glow.
      // Deliberately NOT the login scene's blown-out emissive — this is the
      // calm beat between fights, and nothing here may strobe or flash.
      pipe.bloomThreshold = ATMOSPHERE.bloomThreshold;
      pipe.bloomWeight = ATMOSPHERE.bloomWeight;
      pipe.bloomKernel = 64;
      pipe.bloomScale = 0.5;
      pipe.fxaaEnabled = true;
      pipe.imageProcessingEnabled = true;
      pipe.imageProcessing.toneMappingEnabled = true;
      pipe.imageProcessing.contrast = 1.1;
      pipe.imageProcessing.exposure = 1.0;
      this.pipeline = pipe;
    } catch {
      this.pipeline = null; // no post-fx — the scene still renders
    }
  }

  private buildGround(): void {
    // The dark earth: a wide disc so nothing ever ends in a void. The fog eats
    // it long before its edge, which is why there is no kerb and no rim.
    const earthMat = new StandardMaterial("intermission-earth", this.scene);
    earthMat.diffuseColor = new Color3(0.13, 0.1, 0.08);
    earthMat.specularColor = new Color3(0.02, 0.02, 0.02);
    const earth = MeshBuilder.CreateDisc(
      "intermission-earth",
      { radius: GROUND_RADIUS, tessellation: 64 },
      this.scene,
    );
    earth.rotation.x = Math.PI / 2;
    earth.position.y = -0.02;
    earth.material = earthMat;
    earth.parent = this.stage;
    earth.receiveShadows = true;
    earth.isPickable = false;
  }

  private buildLights(): void {
    const hemi = new HemisphericLight("intermission-hemi", new Vector3(0, 1, 0), this.scene);
    hemi.intensity = LIGHT_RIG.hemiIntensity;
    hemi.diffuse = color3(LIGHT_RIG.hemiSky);
    hemi.groundColor = color3(LIGHT_RIG.hemiGround);

    // "last light": a low warm sun from behind-left. Its long soft shadow of the
    // merchant across the paving is what GLUES him to the ground — without it
    // the whole set reads as decals floating on a plane.
    const el = (LIGHT_RIG.sunElevationDeg * Math.PI) / 180;
    const az = (LIGHT_RIG.sunAzimuthDeg * Math.PI) / 180;
    const dir = new Vector3(
      Math.cos(el) * Math.sin(az),
      -Math.sin(el),
      Math.cos(el) * Math.cos(az),
    );
    const sun = new DirectionalLight("intermission-sun", dir, this.scene);
    sun.intensity = LIGHT_RIG.sunIntensity;
    sun.diffuse = color3(LIGHT_RIG.sun);
    sun.position = new Vector3(-8, 6, -6);
    try {
      const sg = new ShadowGenerator(LIGHT_RIG.shadowMapSize, sun);
      sg.useExponentialShadowMap = true;
      sg.blurScale = 2;
      sg.darkness = 0.35;
      this.shadows = sg;
    } catch {
      this.shadows = null; // headless / unsupported — the scene still renders
    }

    // cool rim from behind-right: cuts the champion's silhouette out of the dark
    const rim = new DirectionalLight("intermission-rim", new Vector3(-0.55, -0.35, -0.75), this.scene);
    rim.intensity = LIGHT_RIG.rimIntensity;
    rim.diffuse = color3(LIGHT_RIG.rim);

    // the cart's hanging lantern — the warm practical the whole pool comes from
    this.addLantern(
      "intermission-lantern",
      new Vector3(LANTERN_POS.x, LANTERN_POS.y, LANTERN_POS.z),
      LIGHT_RIG.lantern,
      LIGHT_RIG.lanternIntensity,
      LIGHT_RIG.lanternRange,
      0,
    );
    // one small practical per torch, out of phase so the two never pulse together
    TORCHES.forEach((t, i) => {
      this.addLantern(
        `intermission-torch-${i}`,
        new Vector3(t.x, 1.35, t.z),
        LIGHT_RIG.torchLight,
        LIGHT_RIG.torchIntensity,
        LIGHT_RIG.torchRange,
        (i + 1) * 1.7,
      );
    });
  }

  private addLantern(name: string, pos: Vector3, tint: Rgb, intensity: number, range: number, phase: number): void {
    const light = new PointLight(name, pos, this.scene);
    light.diffuse = color3(tint);
    light.intensity = intensity;
    light.range = range;
    this.lanterns.push({ light, baseIntensity: intensity, phase });
  }

  /** ~40 slow dust motes drifting inside the light cone. */
  private buildMotes(): void {
    let dot;
    try {
      dot = makeSoftDotTexture(this.scene);
    } catch {
      return; // no 2D canvas (headless without a stub) — motes are pure flavour
    }
    const ps = new ParticleSystem("intermission-motes", ATMOSPHERE.moteCount, this.scene);
    ps.particleTexture = dot;
    ps.emitter = new Vector3(CART.x + 1, 1.4, CART.z - 1);
    ps.minEmitBox = new Vector3(-3.5, -1.2, -3);
    ps.maxEmitBox = new Vector3(3.5, 1.6, 3);
    ps.color1 = new Color4(1.0, 0.82, 0.55, 0.28);
    ps.color2 = new Color4(1.0, 0.7, 0.42, 0.16);
    ps.colorDead = new Color4(1, 0.8, 0.5, 0);
    ps.minSize = 0.025;
    ps.maxSize = 0.075;
    ps.minLifeTime = 6;
    ps.maxLifeTime = 12;
    ps.emitRate = 8;
    ps.blendMode = ParticleSystem.BLENDMODE_ADD;
    ps.gravity = new Vector3(0, 0.02, 0); // motes RISE, slowly — warm air
    ps.direction1 = new Vector3(-0.06, 0.02, -0.06);
    ps.direction2 = new Vector3(0.06, 0.08, 0.06);
    ps.minEmitPower = 0.02;
    ps.maxEmitPower = 0.09;
    ps.updateSpeed = 0.01;
    ps.start();
    this.particles.push(ps);
  }

  /**
   * Fetch and place every .glb. Fully tolerant: `AssetManager.load` resolves
   * null on any failure, so a missing model leaves a hole in the dressing
   * rather than an empty screen or a thrown boot.
   */
  private async buildProps(champion: { glbPath: string; scale: number } | null): Promise<void> {
    const placements: Placement[] = [STALL, CART, ...TORCHES, ...DRESSING, ...silhouettes()];
    const paths = new Set(placements.map((p) => p.model));
    paths.add(MERCHANT.model);
    paths.add("assets/models/props/floor_tile_large.glb");
    paths.add("assets/models/hex/hex_grass.glb");

    const containers = new Map<string, AssetContainer | null>();
    await Promise.all(
      [...paths].map(async (p) => {
        containers.set(p, await this.assets.load(p));
      }),
    );
    if (this.disposed) return;

    // ---- paving + grass ring -------------------------------------------------
    const tileC = containers.get("assets/models/props/floor_tile_large.glb");
    if (tileC) {
      for (const t of pavingTiles()) {
        this.place(tileC, { model: "", x: t.x, z: t.z, yaw: 0, scale: TILE_SCALE }, { receive: true });
      }
    }
    const grassC = containers.get("assets/models/hex/hex_grass.glb");
    if (grassC) {
      for (const h of grassRing()) {
        this.place(grassC, { model: "", x: h.x, z: h.z, yaw: 0, scale: 1 }, { receive: true });
      }
    }

    // ---- the pitch + its dressing -------------------------------------------
    for (const p of placements) {
      const c = containers.get(p.model);
      if (c) this.place(c, p, { cast: true, receive: true });
    }

    // ---- the 店員 ------------------------------------------------------------
    const merchantC = containers.get(MERCHANT.model);
    if (merchantC) this.placeMerchant(merchantC);

    // ---- the functional shelves (task #94) -----------------------------------
    this.buildShelfRack();

    this.setTeam(this.teamId);
    if (champion) await this.setChampion(champion.glbPath, champion.scale);
    this.built = true;
  }

  /**
   * Instantiate one container at a placement, parented under the stage.
   * Returns the animation groups too, because a skinned .glb (the merchant, the
   * player's champion) needs its idle clip started and the group only exists
   * on the instantiation.
   */
  private place(
    container: AssetContainer,
    p: Placement,
    opts: { cast?: boolean; receive?: boolean; name?: string } = {},
  ): { root: TransformNode; groups: AnimationGroup[] } {
    const inst = container.instantiateModelsToScene((n) => `im-${n}`, false, { doNotInstantiate: true });
    const root = new TransformNode(opts.name ?? "im-prop", this.scene);
    root.parent = this.stage;
    for (const node of inst.rootNodes) node.parent = root;
    root.position.set(p.x, 0, p.z);
    root.rotation.y = p.yaw;
    root.scaling.setAll(p.scale);
    for (const mesh of root.getChildMeshes(false)) {
      mesh.isPickable = false;
      if (opts.receive) mesh.receiveShadows = true;
      if (opts.cast) this.shadows?.addShadowCaster(mesh);
    }
    return { root, groups: inst.animationGroups };
  }

  /**
   * The merchant needs three things the other props do not: his sword hidden
   * (he is a MERCHANT, not a rogue — the Quaternius "Hooded Adventurer" carries
   * one on the same rig), his 24 baked clips indexed by name, and Idle looping.
   */
  private placeMerchant(container: AssetContainer): void {
    // his long shadow across the paving is what glues him to the ground
    const { root, groups } = this.place(container, MERCHANT, { cast: true, name: "im-merchant" });
    for (const mesh of root.getChildMeshes(false)) {
      if (isSword(mesh)) {
        mesh.setEnabled(false);
        this.shadows?.removeShadowCaster(mesh);
      }
    }

    this.merchantClips.clear();
    for (const g of groups) {
      g.stop();
      // instantiateModelsToScene prefixes cloned group names; index on the
      // authored suffix so "im-CharacterArmature|Idle" still matches.
      for (const clip of Object.values(MERCHANT_CLIPS)) {
        if (g.name === clip || g.name.endsWith(clip)) this.merchantClips.set(clip, g);
      }
    }
    this.playIdle();
  }

  private playIdle(): void {
    const idle = this.merchantClips.get(MERCHANT_CLIPS.idle);
    if (!idle) return;
    idle.play(true);
  }

  // -------------------------------------------------------------------------
  // public surface
  // -------------------------------------------------------------------------

  /** True once every .glb has been fetched and placed (tests / diagnostics). */
  get isBuilt(): boolean {
    return this.built;
  }

  /** Whether the render loop is currently running (diagnostics / tests). */
  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Play a one-shot merchant gesture over the Idle loop: `wave` on entering the
   * scene, `interact` on a completed purchase. Re-entrant — a second gesture
   * replaces the first, and Idle always resumes.
   */
  playGesture(gesture: MerchantGesture): void {
    if (this.disposed) return;
    const clip = this.merchantClips.get(
      gesture === "wave" ? MERCHANT_CLIPS.wave : MERCHANT_CLIPS.interact,
    );
    const idle = this.merchantClips.get(MERCHANT_CLIPS.idle);
    if (!clip) return;
    this.activeGesture?.stop();
    idle?.stop();
    this.activeGesture = clip;
    clip.onAnimationGroupEndObservable.addOnce(() => {
      if (this.disposed || this.activeGesture !== clip) return;
      this.activeGesture = null;
      this.playIdle();
    });
    clip.play(false);
  }

  // -------------------------------------------------------------------------
  // functional shelves (task #94)
  // -------------------------------------------------------------------------

  /**
   * Build the shelf CARCASS: four posts and N planks, all boxes.
   *
   * Procedural rather than a .glb on purpose — no shelf model ships in the CC0
   * packs (which is why this half of #94 stalled), and building it means the
   * shelves are also present in `IntermissionScene.test.ts`, where every
   * `AssetManager.load` resolves null and the entire loaded dressing vanishes.
   * The one prop that must be there to prove the feature is the one that does
   * not depend on a fetch.
   *
   * All numbers come from `shelfDisplay.SHELF_RACK`, so the sightline and
   * framing guarantees the pure tests assert are the ones actually built.
   */
  private buildShelfRack(): void {
    if (this.disposed || this.shelfRoot) return;
    const r = SHELF_RACK;
    const root = new TransformNode("im-shelf", this.scene);
    root.parent = this.stage;
    root.position.set(r.x, 0, r.z);
    root.rotation.y = r.yaw;
    this.shelfRoot = root;

    // weathered pine, lit by the market's warm practicals rather than by itself
    const wood = new StandardMaterial("im-shelf-wood", this.scene);
    wood.diffuseColor = new Color3(0.36, 0.24, 0.14);
    wood.specularColor = new Color3(0.06, 0.05, 0.04);

    const halfW = r.width / 2 - r.postSize / 2;
    const halfD = r.depth / 2 - r.postSize / 2;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = MeshBuilder.CreateBox(
          "im-shelf-post",
          { width: r.postSize, depth: r.postSize, height: r.height },
          this.scene,
        );
        post.parent = root;
        post.position.set(sx * halfW, r.height / 2, sz * halfD);
        post.material = wood;
        post.isPickable = false;
        post.receiveShadows = true;
        this.shadows?.addShadowCaster(post);
      }
    }
    for (const y of r.plankY) {
      const plank = MeshBuilder.CreateBox(
        "im-shelf-plank",
        { width: r.width, depth: r.depth, height: r.plankThickness },
        this.scene,
      );
      plank.parent = root;
      plank.position.set(0, y, 0);
      plank.material = wood;
      plank.isPickable = false;
      plank.receiveShadows = true;
      this.shadows?.addShadowCaster(plank);
    }

    // stock pushed in before the market finished building is applied now
    if (this.pendingGoods.length > 0) this.setShelfGoods(this.pendingGoods);
  }

  /**
   * Stock the shelves with the LIVE catalogue (task #94).
   *
   * This is what makes them functional rather than dressing: the caller
   * (`IntermissionStage`) hands over the very shelves the shop card is
   * rendering — #70's finals, the operator's whitelist applied, grouped by
   * `groupCatalogue` — and each good is a small primitive tinted by its shelf.
   * Goods the champion already OWNS go dark, so buying visibly takes something
   * off the shelf and undoing that sale (task #121) visibly puts it back.
   *
   * Cheap to call: the goods live under their own node which is disposed
   * wholesale, so a re-stock is O(goods) with no diffing and no leak. Safe to
   * call before the market has finished loading — the stock is remembered and
   * applied when the carcass appears.
   */
  setShelfGoods(goods: readonly ShelfGoodInput[]): void {
    if (this.disposed) return;
    this.pendingGoods = goods;
    if (!this.shelfRoot) return;
    this.goodsRoot?.dispose(false, true);
    this.goodsRoot = null;

    const placed = layoutShelfGoods(goods);
    if (placed.length === 0) return;
    const root = new TransformNode("im-shelf-goods", this.scene);
    root.parent = this.shelfRoot;
    this.goodsRoot = root;

    for (const g of placed) {
      // a good is ~14 px on screen, so SHAPE carries the shelf as well as hue:
      // offence is a crate, magic an orb, defence a squat drum.
      const mesh =
        g.shelf === "magic"
          ? MeshBuilder.CreateSphere("im-good", { diameter: g.size, segments: 8 }, this.scene)
          : g.shelf === "defense"
            ? MeshBuilder.CreateCylinder(
                "im-good",
                { diameter: g.size, height: g.size * 0.8, tessellation: 10 },
                this.scene,
              )
            : MeshBuilder.CreateBox("im-good", { size: g.size }, this.scene);
      mesh.parent = root;
      mesh.position.set(g.x, g.y, g.z);
      mesh.isPickable = false;
      const mat = new StandardMaterial("im-good-mat", this.scene);
      if (g.owned) {
        // ALREADY YOURS: unlit and desaturated — the slot reads as taken, not
        // as missing, so the shelf still shows you the full catalogue.
        mat.diffuseColor = new Color3(g.tint.r * 0.22, g.tint.g * 0.22, g.tint.b * 0.22);
        mat.emissiveColor = new Color3(0, 0, 0);
        mat.alpha = 0.55;
      } else {
        mat.diffuseColor = new Color3(g.tint.r * 0.7, g.tint.g * 0.7, g.tint.b * 0.7);
        // Self-lit, hard. The market is a DUSK scene — fog, a 0.45 hemispheric
        // key and two warm practicals — and at the first live look a 0.45
        // emissive left the goods as dark lumps indistinguishable from the
        // timber they sit on. They have to carry their own light to read.
        mat.emissiveColor = new Color3(g.tint.r * 0.85, g.tint.g * 0.85, g.tint.b * 0.85);
      }
      mat.specularColor = new Color3(0.18, 0.16, 0.12);
      mesh.material = mat;
      this.shadows?.addShadowCaster(mesh);
    }
  }

  /** Fly the local team's shield banner over the pitch (-1 = none). */
  setTeam(teamId: number): void {
    if (this.disposed) return;
    this.teamId = teamId;
    this.bannerRoot?.dispose(false, false);
    this.bannerRoot = null;
    if (teamId < 0) return;
    const p = bannerFor(teamId);
    void this.assets.load(p.model).then((c) => {
      if (!c || this.disposed || this.teamId !== teamId) return;
      this.bannerRoot = this.place(c, p, { cast: true, name: "im-banner" }).root;
    });
  }

  /**
   * Show the player's OWN champion at the counter, back to camera. Swapping is
   * token-guarded so a fast champion change cannot leave two heroes standing.
   * The yaw offset comes from the shared `glbYawOffset` rule, so an imported
   * w3x hero faces the merchant exactly like a KayKit one.
   */
  async setChampion(glbPath: string, scale: number, modelKey?: string): Promise<void> {
    if (this.disposed) return;
    const token = ++this.championToken;
    const container = await this.assets.load(glbPath);
    if (!container || this.disposed || token !== this.championToken) return;
    this.championRoot?.dispose(false, false);
    // a new hero inherits none of the previous one's reaction bookkeeping
    this.championReaction = null;
    this.championPulse = null;
    const { root, groups } = this.place(
      container,
      { model: glbPath, x: CHAMPION_STAND.x, z: CHAMPION_STAND.z, yaw: CHAMPION_YAW, scale },
      { cast: true, name: "im-champion" },
    );
    // the model's own baked-forward offset rides a child node, exactly as the
    // arena's ChampionView applies it, so facing means the same thing here
    const offset = glbYawOffset(glbPath, modelKey);
    for (const child of root.getChildren()) {
      if (child instanceof TransformNode) child.rotation.y += offset;
    }
    // GROUND the hero (task #111): measure the placed model and lift its feet
    // onto the paving, exactly as StorePreview does (#129). Without this an
    // imported rig whose bind box dips below the origin (皮卡丘 spans
    // y∈[-0.58, 1.71]) sits half-buried at position.y = 0 and reads as "lying
    // on the floor". A per-model root-transform, so it costs nothing on a rig
    // already grounded at 0.
    this.groundChampion(root);
    // loop an idle clip when the .glb ships one — a hero frozen in its bind
    // pose at a market stall looks broken, and every rig names it differently,
    // so this is a tolerant substring match that degrades to "stands still".
    const idle = groups.find((g) => /idle|stand/i.test(g.name)) ?? groups[0];
    for (const g of groups) g.stop();
    idle?.play(true);
    this.championRoot = root;
    this.championGroups = groups;
    this.championIdle = idle ?? null;
    this.championBaseScale = scale;
  }

  /**
   * Lift the champion root so its lowest mesh sits on the floor (y = 0),
   * mirroring StorePreview's grounding (#129). Measures the world bounding box
   * after the yaw offset is applied; a bone-only hierarchy (non-finite box)
   * leaves the model where it is. Safe headless — `getHierarchyBoundingVectors`
   * works under a NullEngine.
   */
  private groundChampion(root: TransformNode): void {
    root.computeWorldMatrix(true);
    const { min, max } = root.getHierarchyBoundingVectors(true);
    root.position.y += groundShiftY(min, max);
  }

  /**
   * React to a COMPLETED purchase: the player's hero plays a one-shot victory /
   * attack clip, then returns to idle. Clip inventories differ wildly across the
   * roster, so the clip is resolved by PREFERENCE ORDER (see reactionClip.ts)
   * over the .glb's real group names and degrades gracefully:
   *
   *   • a rig with a celebration/attack/cast clip plays it once and idles again;
   *   • a rig with none (an import that ships only an idle, task #69) still does
   *     something legible — a short procedural squash-pop;
   *   • no champion in frame at all is a silent no-op.
   *
   * Nothing here freezes on a non-looping clip or throws. Re-entrant: a second
   * purchase replaces the first reaction, and idle always resumes.
   *
   * NOTE: this does NOT correct the hero's resting POSE. A subset of imported
   * models bake a per-clip root-bone rotation that lays them down in idle
   * (皮卡丘 face-down — task #68); that is a model-data defect and must be fixed
   * at the model level, not counter-rotated here (it varies per clip, so no
   * single scene transform can fix it). See the #68 hand-off.
   */
  playChampionReaction(opts?: { celebratoryOnly?: boolean }): void {
    if (this.disposed || !this.championRoot) return;
    const pick = pickReactionClip(this.championGroups.map((g) => g.name));
    // The owner asked that a buy read as the hero RESPONDING, 「不只是擺出攻擊
    // 動作而已」 (task #146 follow-up). With `celebratoryOnly`, only a genuine
    // celebration clip (victory/cheer/dance — reactionClip's "victory" tier)
    // plays; an attack/cast pick falls through to the satisfied squash-pop
    // instead of swinging a weapon. So a hero WITH a cheer clip celebrates, and
    // one without does a content nod rather than an aggressive lunge — and the
    // in-character line (HeroReactionBubble) carries the personality either way.
    const usable = pick && (!opts?.celebratoryOnly || pick.kind === "victory") ? pick : null;
    const clip = usable ? (this.championGroups.find((g) => g.name === usable.clip) ?? null) : null;
    if (!clip) {
      // no usable reaction clip — a legible squash-pop so the buy still lands
      this.championPulse = { start: this.elapsed, dur: 0.5 };
      return;
    }
    this.championPulse = null;
    this.championReaction?.stop();
    this.championIdle?.stop();
    this.championReaction = clip;
    clip.onAnimationGroupEndObservable.addOnce(() => {
      if (this.disposed || this.championReaction !== clip) return;
      this.championReaction = null;
      this.championIdle?.play(true);
    });
    clip.play(false);
  }

  /**
   * Start the cinematic ENTER: the shot begins pulled back and higher, then
   * eases onto the resting composition while the merchant waves. Guarantees
   * `onComplete` fires EXACTLY ONCE — on the disposed scene (immediately), on
   * completion, or via the hard safety timer if the loop stalls (tab hidden
   * mid-transition). Same contract as LoginScene.playEnterTransition (task #26).
   */
  playEnterTransition(onComplete: () => void): void {
    if (this.disposed) {
      onComplete();
      return;
    }
    if (this.transition) return; // already animating — ignore a double-invoke
    this.transition = { startMs: null, onComplete, done: false, completed: false };
    this.playGesture("wave"); // 「いらっしゃい」 — he greets you as you walk up
    if (typeof setTimeout === "function") {
      this.transitionTimer = setTimeout(() => this.finishTransition(), ENTER_DURATION_MS + 500);
    }
    this.start(); // ensure the loop runs so the ease actually animates
  }

  private advanceTransition(nowMs: number): void {
    const tr = this.transition;
    if (!tr || tr.done) return;
    if (tr.startMs === null) tr.startMs = nowMs;
    const raw = ENTER_DURATION_MS > 0 ? (nowMs - tr.startMs) / ENTER_DURATION_MS : 1;
    const p = raw < 0 ? 0 : raw > 1 ? 1 : raw;
    // `this.pose` already holds the LIVE drift pose written by frame() just
    // above; copy it out as the ease target so at p = 1 the camera lands
    // exactly on the resting shot and the drift resumes with no jump.
    this.enterTarget.alpha = this.pose.alpha;
    this.enterTarget.beta = this.pose.beta;
    this.enterTarget.radius = this.pose.radius;
    this.enterTarget.targetY = this.pose.targetY;
    enterCameraPose(this.pose, p, CAMERA_ENTER_POSE, this.enterTarget);
    this.applyPose();
    if (raw >= 1) this.finishTransition();
  }

  /** End the enter transition + fire onComplete once. Idempotent. */
  private finishTransition(): void {
    const tr = this.transition;
    if (!tr) return;
    if (this.transitionTimer !== null) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
    tr.done = true;
    this.transition = null; // drift takes over on the next frame
    if (!tr.completed) {
      tr.completed = true;
      tr.onComplete();
    }
  }

  // -------------------------------------------------------------------------
  // loop
  // -------------------------------------------------------------------------

  private applyPose(): void {
    this.camera.alpha = this.pose.alpha;
    this.camera.beta = this.pose.beta;
    this.camera.radius = this.pose.radius;
    this.camera.target.y = this.pose.targetY;
  }

  /** Advance + render one frame. Allocation-free hot path. */
  private frame(): void {
    if (this.disposed) return;
    const t = this.now();
    const dtRaw = this.lastFrameMs === null ? 0 : (t - this.lastFrameMs) / 1000;
    this.lastFrameMs = t;
    const dt = dtRaw < 0 ? 0 : dtRaw > MAX_DT ? MAX_DT : dtRaw;
    if (t - this.lastRenderMs < MIN_FRAME_MS) return; // soft fps cap
    this.lastRenderMs = t;
    this.elapsed += dt;
    const e = this.elapsed;

    // fixed shot + very slow breathing drift (orbitSpeed is 0 by design)
    writeCameraDrift(this.pose, e, CAMERA_DRIFT);
    this.applyPose();
    if (this.transition) this.advanceTransition(t);

    // lantern + torch flicker: low amplitude, ~1.5 Hz, each on its own phase.
    // Deliberately gentle — this scene must never strobe.
    for (const l of this.lanterns) {
      const k = 1 + LIGHT_RIG.lanternFlickerAmp * Math.sin((e + l.phase) * LIGHT_RIG.lanternFlickerHz * Math.PI * 2);
      l.light.intensity = l.baseIntensity * k;
    }

    // purchase "pop": the graceful fallback for a hero with no reaction clip —
    // a single squash-and-hop that springs back to the resting scale. One arch
    // (sin 0→1→0), never a loop, so it cannot strobe or leave the hero stuck.
    if (this.championPulse && this.championRoot) {
      const k = (e - this.championPulse.start) / this.championPulse.dur;
      if (k >= 1) {
        this.championRoot.scaling.setAll(this.championBaseScale);
        this.championRoot.position.y = 0;
        this.championPulse = null;
      } else {
        const s = Math.sin(k * Math.PI);
        this.championRoot.scaling.setAll(this.championBaseScale * (1 + 0.12 * s));
        this.championRoot.position.y = 0.18 * s;
      }
    }

    this.scene.render();
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

  /** Tear down engine, scene, particles and listeners. Safe to call twice. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    // a transition still in flight (phase flipped out from under the ease):
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
    if (typeof window !== "undefined") window.removeEventListener("resize", this.onResize);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.onVisibility);
    this.engine.stopRenderLoop();
    for (const ps of this.particles) ps.dispose();
    this.particles.length = 0;
    this.lanterns.length = 0;
    this.merchantClips.clear();
    this.activeGesture = null;
    this.championGroups = [];
    this.championIdle = null;
    this.championReaction = null;
    this.championPulse = null;
    // shelf nodes hang off `stage`, which scene.dispose() takes with it; the
    // handles are cleared so a late setShelfGoods on a disposed scene cannot
    // reach into freed meshes.
    this.shelfRoot = null;
    this.goodsRoot = null;
    this.pendingGoods = [];
    this.shadows?.dispose();
    this.shadows = null;
    this.pipeline?.dispose();
    this.pipeline = null;
    this.scene.dispose();
    this.engine.dispose();
  }
}

/** The separate sword mesh on Quaternius' shared character rig. */
function isSword(mesh: AbstractMesh): boolean {
  return mesh.name.includes(MERCHANT_HIDDEN_MESH_PREFIX);
}
