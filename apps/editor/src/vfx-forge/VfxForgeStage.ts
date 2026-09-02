import type { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Shaders/postprocess.vertex";
import "@babylonjs/core/Shaders/rgbdDecode.fragment";
import "@babylonjs/core/Shaders/pbr.vertex";
import "@babylonjs/core/Shaders/pbr.fragment";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import type { ModelDoc, VfxDoc } from "@ggd/shared/content";
import type { AnimPulse } from "@ggd/shared/content/animPulse";
import { resolveAppearance } from "@ggd/shared/content/import/resolvedAppearance";
import { Models, VfxDefs, VfxScripts } from "@ggd/shared/content/registries";
import type { VfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import { abilityIdOfAuthoredOrigin, type ChampionDef } from "@ggd/shared/sim";
import type { AbilityVfxLayerOverride } from "@ggd/shared/content/schema/abilityVfx";
import { ABILITY_VFX_LAYER_OVERRIDE_FIELDS } from "@ggd/shared/content/schema/abilityVfx";
import type { ModelFxSpawnEvent } from "../../../client/src/render/modelFxPath";
import { ModelFxRig } from "../../../client/src/render/modelFxRig";
import { AssetManager } from "../../../client/src/render/AssetManager";
import { CameraRig } from "../../../client/src/render/CameraRig";
import { setupLighting, type LightingHandle } from "../../../client/src/render/Lighting";
import { Renderer } from "../../../client/src/render/Renderer";
import { buildZoneGround } from "../../../client/src/render/ArenaGround";
import { ChampionView } from "../../../client/src/render/views/ChampionView";
import {
  applyModelTint,
  releaseModelTint,
} from "../../../client/src/render/views/modelTint";
import { VfxScriptPlayer } from "../../../client/src/vfx/VfxScriptPlayer";
import { VfxSystem } from "../../../client/src/vfx/VfxSystem";
import { vfxHardMaxLifeSec } from "../../../client/src/vfx/vfxCleanupPolicy";
import {
  applyVfxOverrides,
  WC3_UNITS_PER_WORLD_UNIT,
} from "../../../client/src/render/vfx/abilityLayers";
import { applyAimYaw } from "../../../client/src/render/vfx/artParams";
import { yawDegToward } from "../../../client/src/vfx/orient";
import { api } from "../api/client";
import { assetUrl } from "../preview3d/assetUrl";
import { burstNow, toParticleSystem } from "../preview3d/particles";
import { projectileIdsOf, type ForgeAbility, type ScheduledSimEvent } from "./model";
import { calibrateTwoWay } from "../../../client/src/vfx/auditionCalibrate";
import type { PreviewActorPose } from "../preview/PreviewController";
import {
  auditBackdropFrame,
  automaticVisualHygieneScore,
  type BackdropFrameAudit,
} from "./backdropFrameAudit";
import { PRESENTATION_RECEIPT } from "./presentationContract";

const STEP_MS = 1000 / 60;
/**
 * A paused Forge has no natural render loop to carry Babylon over its first
 * PBR/texture-ready boundary. Wait briefly for the scene when preparing an
 * actor, but never make one unrelated lazy resource able to deadlock the
 * authoring surface.
 */
const ACTOR_READY_BUDGET_MS = 750;
/** Same short post-load settling window used by the shipped model audition. */
const ACTOR_WARMUP_FRAMES = 10;
/** A champion body must alter a meaningful patch of the real framebuffer. */
const MIN_ACTOR_VISIBLE_PIXELS = 250;
const MIN_ACTOR_PIXEL_DELTA = 24;
const CASTER_POS = { x: 0, z: 0 };
// PreviewController's real sandbox places the opponent on +z. Keeping the
// render stage on that same axis means point/direction payloads can pass to
// VfxSystem unchanged instead of inventing a second coordinate transform.
const TARGET_POS = { x: 0, z: 3 };

function homePoseOf(schedule: readonly ScheduledSimEvent[]): PreviewActorPose {
  const pose = schedule.find((item) => item.actorPose)?.actorPose;
  return pose
    ? { caster: { ...pose.caster }, target: { ...pose.target } }
    : { caster: { ...CASTER_POS }, target: { ...TARGET_POS } };
}

function castFocusOf(
  schedule: readonly ScheduledSimEvent[],
  home: PreviewActorPose,
): { x: number; z: number } | null {
  for (const item of schedule) {
    if (item.event.type !== "abilityCast") continue;
    const point = item.event.data.point;
    if (point === null || typeof point !== "object") continue;
    const x = Number((point as Record<string, unknown>).x);
    const z = Number((point as Record<string, unknown>).z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    return { x: (home.caster.x + x) / 2, z: (home.caster.z + z) / 2 };
  }
  return null;
}

export type VfxForgeStageMode = "script" | "runtime";

export interface ForgeOverlay {
  flash: { color: readonly [number, number, number]; alpha: number } | null;
  texts: readonly { id: number; text: string; x: number; z: number; untilMs: number }[];
  status: string;
  actors: { caster: string; target: string };
}

export interface BackdropTimelineAudit {
  safe: boolean;
  /** Framebuffer hygiene only; semantic/source fidelity remains manual. */
  autoVisualScore: number;
  sampledFrames: number;
  peakParticleCount: number;
  peakSystemCount: number;
  worstAtMs: number;
  worst: BackdropFrameAudit;
  suspects: readonly string[];
}

/** A candidate-bound framebuffer used by the one-page human review gate. */
export interface VfxVisualEvidenceFrame {
  label: string;
  dataUrl: string;
  atMs: number;
  view: "side" | "top";
  /** Exact keyframe readback; timeline sampling alone can skip a one-frame bad carrier. */
  frameAudit: BackdropFrameAudit;
}

export interface VfxForgeStageOptions {
  fetchDoc?<T>(collection: "models" | "vfx", id: string): Promise<T>;
  onOverlay?(overlay: ForgeOverlay): void;
  actors?: {
    caster?: ChampionDef | null;
    target?: ChampionDef | null;
  };
  /**
   * script: author the pure VFX script in isolation.
   * runtime: feed the real Sim trace through the shipped VfxSystem.
   */
  mode?: VfxForgeStageMode;
}

interface LiveParticle {
  ps: ParticleSystem;
  untilMs: number;
}

interface ForgeActor {
  readonly role: "caster" | "target";
  readonly fallback: Mesh;
  readonly position: { x: number; z: number };
  readonly facing: { x: number; z: number };
  champion: ChampionDef | null;
  /** The real gameplay actor presentation — Forge never reimplements its GLB attach path. */
  view: ChampionView | null;
  bodyRoot: TransformNode | null;
  glbRoot: TransformNode | null;
  /** Real GLB loaded but did not draw legibly; keep a marked local fallback instead. */
  fallbackForced: boolean;
  idleAfterMs: number;
  hiddenUntilMs: number;
}

/**
 * Frame-stepped Forge stage. Camera, floor, player, model rig and particle
 * factory are imported from the shipped client; this file is only an editor
 * adapter and contains no second playback semantics.
 */
export class VfxForgeStage {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly cameraRig: CameraRig;

  private script: VfxScriptDoc;
  private ability: ForgeAbility;
  private schedule: readonly ScheduledSimEvent[];
  private nowMs = 0;
  private nextEvent = 0;
  /** Last authored particle placement, surfaced in the Forge HUD for aim QA. */
  private lastVfxAim: string | null = null;
  private generation = 0;
  private textSerial = 0;
  private disposed = false;
  private teardownStarted = false;
  private homePose: PreviewActorPose;
  private castFocus: { x: number; z: number } | null;
  private flash: ForgeOverlay["flash"] = null;
  private readonly actorStatus = { caster: "替身", target: "替身" };
  /** A visually absent GLB must block evidence/promote rather than pass as a black frame. */
  private readonly visualAssetIssues = new Set<string>();
  private flashUntilMs = 0;
  private texts: { id: number; text: string; x: number; z: number; untilMs: number }[] = [];
  private particles: LiveParticle[] = [];
  private readonly models = new Map<string, ModelDoc>();
  private readonly vfx = new Map<string, VfxDoc>();
  private readonly modelFxContainerPromises = new Map<string, Promise<AssetContainer>>();
  /** The actual playable-client scene boot path, not an editor-owned Babylon variant. */
  private readonly renderer: Renderer;
  private readonly assets: AssetManager;
  /** Same scenery-aware lighting path as the playable client; Forge owns no light constants. */
  private readonly lighting: LightingHandle;
  private readonly fetchDoc: NonNullable<VfxForgeStageOptions["fetchDoc"]>;
  private readonly onOverlay: NonNullable<VfxForgeStageOptions["onOverlay"]>;
  private readonly modelRig: ModelFxRig;
  private readonly groundRoot: TransformNode;
  private readonly groundFloor: ReturnType<typeof buildZoneGround>["floor"];
  private readonly groundReady: Promise<void>;
  private readonly actors: { caster: ForgeActor; target: ForgeActor };
  private actorReady: Promise<void> = Promise.resolve();
  private contentReady: Promise<void> = Promise.resolve();
  private prepareSeq = 0;
  private seekTimer = 0;
  private seekSeq = 0;
  private player: VfxScriptPlayer;
  private mode: VfxForgeStageMode;
  /**
   * Gameplay keeps the shipped MOBA camera looking down the +z lane. That is
   * correct in a match, but it makes a +z projectile/beam collapse into the
   * depth axis in an authoring proof (the old eight-skill evidence literally
   * photographed horizontal beams as vertical columns). The Forge therefore
   * defaults to a 90-degree review orbit while retaining the real CameraRig's
   * pitch, dolly, shake and clamps. Authors can switch back to the gameplay
   * sightline at any time.
   */
  private sideReviewView = true;
  private readonly runtimeVfx: VfxSystem | null;
  private readonly canvas: HTMLCanvasElement;

  constructor(
    canvas: HTMLCanvasElement,
    script: VfxScriptDoc,
    ability: ForgeAbility,
    schedule: readonly ScheduledSimEvent[],
    opts: VfxForgeStageOptions = {},
  ) {
    this.canvas = canvas;
    this.mode = opts.mode ?? "script";
    this.script = script;
    this.ability = ability;
    this.schedule = schedule;
    this.homePose = homePoseOf(schedule);
    this.castFocus = castFocusOf(schedule, this.homePose);
    this.fetchDoc = opts.fetchDoc ?? ((collection, id) => api.doc(collection, id));
    this.onOverlay = opts.onOverlay ?? (() => undefined);
    // Use the Main renderer as-is.  Reconstructing just Engine + Scene in the
    // editor looked equivalent, but silently skipped the client render policy
    // (quality-backed resolution, scene setup and its module side effects).
    // That left real GLB meshes loaded and enabled yet visually absent in the
    // Forge.  This remains a local editor canvas; no game session is mounted.
    this.renderer = new Renderer(canvas);
    this.engine = this.renderer.engine;
    this.scene = this.renderer.scene;
    // Use the game's exact GLB byte cache, LOD resolver, texture deduplication
    // and source-container lifetime. Only the content mount differs: local or
    // remote editor reference assets are served through content-api.
    this.assets = new AssetManager(this.scene, "/content-api/");
    // PBR actors must be judged under the exact client lighting resolver.
    // A hand-written Forge hemi/sun pair had drifted in intensity, ground fill
    // and palette from the playable renderer, which made the paused scene
    // appear black even after a healthy GLB prewarm.  The shared resolver also
    // means a future content lighting change reaches the editor automatically.
    this.lighting = setupLighting(this.scene);
    this.lighting.applyScenery(undefined, false);
    this.scene.useConstantAnimationDeltaTime = true;

    const root = new TransformNode("vfx-forge-arena", this.scene);
    this.groundRoot = root;
    root.position.set(this.homePose.caster.x, 0, this.homePose.caster.z);
    const ground = buildZoneGround(
      this.scene,
      root,
      // Geometry is authored around local zero. The root follows the latest
      // SimWorld caster pose in setContent(); traces commonly place the duel at
      // x=-40, and leaving a constructor-time floor at x=0 makes its curved rim
      // fill the camera like a giant opaque VFX card.
      { center: { x: 0, z: 0 }, boundaryRadius: 24 },
      0,
      // VFX Forge can read a local workspace or a remote reference profile via
      // `/content-api/`; ArenaGround's shipped texture loader intentionally
      // targets the game's `/content/` mount. Asking it for `stone` here makes
      // a failed editor-route request settle to Babylon's opaque white texture
      // a moment later, washing the WHOLE arena out and looking exactly like
      // every particle/model forgot its alpha. Keep the real floor geometry
      // and lighting but use ArenaGround's textureless stone fallback.
      undefined,
    );
    // VFX acceptance needs a stable neutral card, not arena art. Keep the
    // shipped floor/rim geometry and camera scale, but replace the textureless
    // PBR fallback with deterministic unlit charcoal. The PBR fallback can
    // transiently resolve as Babylon white while imported GLBs compile; in a
    // frame-stepped editor that frame stays forever and is indistinguishable
    // from the exact missing-alpha defect this surface exists to reveal.
    for (const [mesh, tint] of [
      [ground.floor, new Color3(0.12, 0.13, 0.16)],
      [ground.rim, new Color3(0.065, 0.07, 0.09)],
    ] as const) {
      mesh.material?.dispose(false, false);
      const material = new StandardMaterial(`${mesh.name}-forge-neutral`, this.scene);
      material.disableLighting = true;
      material.diffuseColor = Color3.Black();
      material.specularColor = Color3.Black();
      material.emissiveColor = tint;
      mesh.material = material;
    }
    this.groundFloor = ground.floor;
    // The Forge is usually paused on frame zero. PBR's lazy first compilation
    // can therefore leave Babylon's white placeholder on screen forever,
    // visually indistinguishable from an unremoved texture background. The
    // game loop naturally advances past it; a frame-stepped editor must warm
    // both arena materials explicitly before declaring the preview ready.
    this.groundReady = Promise.all(
      [ground.floor, ground.rim].flatMap((mesh) =>
        mesh.material ? [mesh.material.forceCompilationAsync(mesh)] : [],
      ),
    ).then(() => undefined);
    this.groundFloor.isPickable = true;
    this.actors = {
      caster: this.makeActor("caster", "施法者", this.homePose.caster, { x: 0, z: 1 }, new Color3(0.24, 0.55, 0.95), opts.actors?.caster ?? null),
      target: this.makeActor("target", "目標", this.homePose.target, { x: 0, z: -1 }, new Color3(0.92, 0.28, 0.24), opts.actors?.target ?? null),
    };

    this.cameraRig = new CameraRig(this.scene, this.cameraFocus());
    // Forge is an authoring surface, not a spectator camera: the game's
    // config-backed default starts far enough away that a pair of 1.8u bodies
    // reads as dots and an author cannot judge a hit/action relation.  Move
    // only the SIDE REVIEW lens four steps closer; the explicit 實戰視角 toggle
    // keeps the Main camera's default unchanged, and long projectiles still
    // fit inside the normal 10–18u camera clamp through the visible controls.
    this.cameraRig.zoomBy(-400);
    this.cameraRig.update({
      dtMs: STEP_MS,
      localPos: this.cameraFocus(),
      cursor: null,
      panKeys: null,
      viewportWidth: canvas.clientWidth || 960,
      viewportHeight: canvas.clientHeight || 540,
    });
    this.applyReviewOrbit();

    this.modelRig = new ModelFxRig(this.scene, {
      resolveModel: (id) => this.models.get(id) ?? null,
      loadContainer: (path) => this.loadModelFxContainer(path),
      spawnTrail: (id, x, y, z) => void this.spawnVfx(id, x, z, y),
      maxEffectSec: vfxHardMaxLifeSec(),
    });
    this.player = this.makePlayer();
    // Both preview modes use the shipped VfxSystem for particle lifetime and
    // pooling.  "script" only changes who supplies the trigger events; it must
    // not fall back to a disposable one-off ParticleSystem path whose texture
    // is still loading every time the playhead seeks.
    this.runtimeVfx = new VfxSystem(this.scene, {
          entityPos: (id) => this.actorForEntity(id).position,
          championIdOf: (id) => this.actorForEntity(id).champion?.id ?? null,
          localEntityId: () => this.casterEntityId() ?? null,
          teamOf: (id) => id === this.casterEntityId() ? 0 : 1,
          vfxDoc: (id) => VfxDefs.tryGet(id) ?? this.vfx.get(id) ?? null,
          resolveTextureUrl: assetUrl,
          modelDocFor: (id) => Models.tryGet(id) ?? this.models.get(id) ?? null,
          loadModelContainer: (path) => this.loadModelFxContainer(path),
          pulseAnim: (id, kind, pulse) => this.pulseActor(id, kind, pulse?.clipWindowMs),
          hideBody: (id, ms) => this.hideActor(id, ms),
          screenFxHost: canvas.parentElement,
          // Runtime preview must render the unsaved authoring draft. The
          // shipped game leaves these callbacks absent and still reads the
          // registered content collection.
          vfxScriptFor: (id) => id === this.script.abilityId ? this.script : undefined,
          allVfxScripts: () => [this.script],
        });
    this.runtimeVfx?.installShakeSink((amplitude, durationMs) => {
      this.cameraRig.addShake(amplitude, durationMs);
    });
    this.reset();
    this.actorReady = Promise.all([
      this.loadActor(this.actors.caster),
      this.loadActor(this.actors.target),
    ]).then(() => undefined);
  }

  get timeMs(): number {
    return this.nowMs;
  }

  setContent(
    script: VfxScriptDoc,
    ability: ForgeAbility,
    schedule: readonly ScheduledSimEvent[],
  ): Promise<boolean> {
    const seq = ++this.prepareSeq;
    this.script = script;
    this.ability = ability;
    this.schedule = schedule;
    this.homePose = homePoseOf(schedule);
    this.castFocus = castFocusOf(schedule, this.homePose);
    this.groundRoot.position.set(this.homePose.caster.x, 0, this.homePose.caster.z);
    this.player.invalidate();
    this.runtimeVfx?.invalidateVfxScripts();
    this.emitOverlay("預載角色與腳本素材…");
    const ready = (async (): Promise<boolean> => {
      await Promise.all([
        this.groundReady,
        this.actorReady,
        this.mode === "runtime"
          ? this.preloadRuntimeAssets(ability)
          : this.preloadScriptAssets(script),
      ]);
      const previewAimYaw = yawDegToward(
        this.homePose.target.x - this.homePose.caster.x,
        this.homePose.target.z - this.homePose.caster.z,
      );
      const warmDocs = script.segments.flatMap((segment) => {
        if (segment.kind !== "vfx") return [];
        const doc = this.vfx.get(segment.vfxId) ?? VfxDefs.tryGet(segment.vfxId);
        if (!doc) return [];
        // Pool keys include every per-segment override and the resolved aim
        // yaw.  Warming only the base document leaves the first deterministic
        // seek to construct a brand-new textured pool entry; Babylon then
        // decodes that texture after the front-loaded burst has already been
        // consumed.  Real-time playback happens to work on the second pass,
        // while scrubbing photographs an empty frame.  Warm the exact shipped
        // variant instead so frame N is identical on the first and tenth seek.
        const override: Record<string, unknown> = {};
        for (const field of ABILITY_VFX_LAYER_OVERRIDE_FIELDS) {
          const value = (segment as unknown as Record<string, unknown>)[field];
          if (value !== undefined) override[field] = value;
        }
        const tuned = Object.keys(override).length > 0
          ? applyVfxOverrides(doc, override as AbilityVfxLayerOverride)
          : doc;
        return [applyAimYaw(tuned, previewAimYaw)];
      });
      this.runtimeVfx?.warmVfxDocs(warmDocs);
      // `warmVfxDocs` creates the exact shipped textures but emits nothing.
      // Wait once here; deterministic seeks below must never race image decode.
      await this.scene.whenReadyAsync();
      if (this.disposed || seq !== this.prepareSeq) return false;
      return true;
    });
    const result = ready();
    // The save-time GPU audit must not race the React setContent effect. Keep a
    // non-rejecting readiness latch; the caller still receives the real error.
    this.contentReady = result.then(() => undefined, () => undefined);
    return result;
  }

  /** Rebuild and deterministically replay from frame zero to the requested time. */
  seek(targetMs: number): void {
    // The shipped VfxSystem lazily finalises override-specific particle pools
    // on their first rendered spawn.  A cold deterministic scrub can therefore
    // consume a front-loaded burst before its texture is drawable, while the
    // exact same second scrub succeeds. Replay once as a GPU primer and once as
    // the authoritative frame. Real-time Play uses advance(), so only explicit
    // authoring seeks pay this correctness cost.
    clearTimeout(this.seekTimer);
    const seq = ++this.seekSeq;
    if (targetMs <= 0 || !this.runtimeVfx) {
      this.replayTo(targetMs, true);
      return;
    }
    this.replayTo(targetMs, false);
    // Yield across texture decode/upload (one rAF was still too early on a
    // cold imported model) before the authoritative burst is emitted. Two
    // synchronous replays are the same GPU frame and do not fix cold seek.
    this.seekTimer = window.setTimeout(() => {
      this.seekTimer = 0;
      void this.finishPrimedSeek(targetMs, seq);
    }, 150);
  }

  private async finishPrimedSeek(targetMs: number, seq: number): Promise<void> {
    // A modelFx material with a per-instance tint/alpha only exists after the
    // primer replay. Wait for that exact clone, compile it while it is still
    // alive, then reset once more: ModelFxRig reuses the prepared instance from
    // its pool, so the authoritative frame cannot be the opaque white Babylon
    // placeholder seen by the earlier screenshot audit.
    await this.scene.whenReadyAsync();
    const meshes = this.scene.meshes.filter((mesh) => mesh.isEnabled());
    await Promise.all(meshes.flatMap((mesh) =>
      mesh.material ? [mesh.material.forceCompilationAsync(mesh)] : [],
    ));
    if (this.disposed || seq !== this.seekSeq) return;
    this.replayTo(targetMs, true);
  }

  private replayTo(targetMs: number, notify: boolean): void {
    const target = Math.max(0, targetMs);
    this.reset();
    let rendered = false;
    // Babylon animation groups advance on render. Replaying events without
    // rendering made scrubbed model clips stay on their first frame even though
    // the event timeline said otherwise.
    while (this.nowMs + STEP_MS < target) {
      this.advanceFrame(true, STEP_MS, false);
      rendered = true;
    }
    if (target > this.nowMs) {
      this.advanceFrame(true, target - this.nowMs, false);
      rendered = true;
    }
    if (!rendered) this.renderScene();
    if (notify) this.emitOverlay("已定位");
  }

  advance(): number {
    this.advanceFrame(true);
    return this.nowMs;
  }

  resize(): void {
    this.engine.resize();
    // Resizing clears WebGL's drawing buffer.  ResizeObserver also fires when
    // the inspector width or preview mode changes, not only in fullscreen, so
    // relying on a later timeline seek leaves a perfectly healthy scene as an
    // all-black canvas until the author touches the playhead.  Repaint the
    // current deterministic frame immediately; do not reset/replay here (the
    // observer may fire several times during one layout transition).
    this.renderScene();
  }

  /** Inspect framing through the shipped, config-backed camera clamps. */
  zoomBy(wheelDeltaY: number): void {
    this.cameraRig.zoomBy(wheelDeltaY);
    this.cameraRig.update({
      dtMs: STEP_MS,
      localPos: this.cameraFocus(),
      cursor: null,
      panKeys: null,
      viewportWidth: this.engine.getRenderWidth(),
      viewportHeight: this.engine.getRenderHeight(),
    });
    this.applyReviewOrbit();
    this.renderScene();
    this.emitOverlay(wheelDeltaY < 0 ? "鏡頭拉近" : "鏡頭拉遠");
  }

  /** Toggle between a perpendicular authoring proof and the shipped lane view. */
  setSideReviewView(enabled: boolean): void {
    this.sideReviewView = enabled;
    this.cameraRig.update({
      dtMs: STEP_MS,
      localPos: this.cameraFocus(),
      cursor: null,
      panKeys: null,
      viewportWidth: this.engine.getRenderWidth(),
      viewportHeight: this.engine.getRenderHeight(),
    });
    this.applyReviewOrbit();
    this.renderScene();
    this.emitOverlay(enabled ? "側向驗收鏡頭" : "實戰俯視鏡頭");
  }

  /**
   * Capture the exact unsaved draft frame through the real renderer.
   *
   * The review record stores this image next to the candidate hash.  It is
   * deliberately a framebuffer capture rather than a DOM screenshot: browser
   * chrome, timeline selection and debug badges must not be mistaken for game
   * pixels during visual approval.
   */
  async captureVisualEvidence(label: string): Promise<VfxVisualEvidenceFrame> {
    await this.contentReady;
    if (this.visualAssetIssues.size > 0) {
      throw new Error(
        `3D 預覽完整性未通過，禁止建立視覺證據：${[...this.visualAssetIssues].join("；")}`,
      );
    }
    await this.scene.whenReadyAsync();
    this.renderScene();
    this.renderScene();
    const width = this.engine.getRenderWidth();
    const height = this.engine.getRenderHeight();
    const rgba = (await this.engine.readPixels(0, 0, width, height)) as Uint8Array;
    const frameAudit = auditBackdropFrame(rgba, width, height);
    if (frameAudit.unsafe) {
      throw new Error(frameAudit.reason ?? "目前關鍵格含有不安全的貼圖底板");
    }
    this.emitOverlay(
      `證據格 · 顯影 ${(frameAudit.litShare * 100).toFixed(1)}% · ` +
      `高光 ${(frameAudit.highlightShare * 100).toFixed(1)}%`,
    );
    const dataUrl = this.canvas.toDataURL("image/webp", 0.82);
    if (!dataUrl.startsWith("data:image/webp;base64,")) {
      throw new Error("瀏覽器無法產生 WebP 視覺證據");
    }
    return {
      label: label.trim() || `${(this.nowMs / 1000).toFixed(3)}秒`,
      dataUrl,
      atMs: Math.round(this.nowMs),
      view: this.sideReviewView ? "side" : "top",
      frameAudit,
    };
  }

  /** Translate a canvas drop point through the shipped camera into script facing offsets. */
  placementAt(canvasX: number, canvasY: number): { forwardU: number; sideU: number } | undefined {
    const point = this.scene.pick(canvasX, canvasY, (mesh) => mesh === this.groundFloor).pickedPoint;
    if (!point) return undefined;
    // Preview caster faces +z. Player semantics are z += forward, x += side.
    return {
      forwardU: Math.round((point.z - this.actors.caster.position.z) * 10) / 10,
      sideU: Math.round((point.x - this.actors.caster.position.x) * 10) / 10,
    };
  }

  /** Two-way bright/dark self-certification before any visual proof reading. */
  async calibrate(): Promise<{ brightControl: number; darkBright: number; darkLit: number }> {
    // Use the renderer's real framebuffer, not canvas.drawImage(). Safari and
    // Chromium can expose an opaque/composited WebGL canvas to 2D drawImage,
    // which made an actually dark scene look 100% bright to the ruler. This is
    // the same calibrated readback path used by the shipped feature-proof
    // audition: render twice (readPixels may otherwise return the prior frame),
    // then count the GPU pixels directly.
    await this.scene.whenReadyAsync();
    this.renderScene();
    const read = async () => {
      this.renderScene();
      this.renderScene();
      const w = this.engine.getRenderWidth();
      const h = this.engine.getRenderHeight();
      const px = (await this.engine.readPixels(0, 0, w, h)) as Uint8Array;
      let bright = 0;
      let lit = 0;
      for (let i = 0; i + 2 < px.length; i += 4) {
        const value = Math.max(px[i]!, px[i + 1]!, px[i + 2]!);
        if (value > 200) bright++;
        if (value > 96) lit++;
      }
      return { w, h, bright, lit };
    };
    const control = await calibrateTwoWay({
      scene: this.scene,
      camera: this.cameraRig.camera,
      rulers: { "engine.readPixels": read },
    });
    // Persist both directions in the UI/report. `calibrateTwoWay` already
    // fails unless the dark reading falls after the bright control; reading
    // once more here makes that second half visible instead of merely implied.
    const dark = await read();
    await this.scene.whenReadyAsync();
    this.renderScene();
    return { brightControl: control, darkBright: dark.bright, darkLit: dark.lit };
  }

  /**
   * Run the unsaved draft through the FULL shipped presentation and inspect
   * real GPU pixels. Saving calls this even while the author is using the
   * script-only isolation view, so ability art, projectile art and modelFx
   * cannot bypass the source-asset gate and surprise the actual match.
   */
  async auditBackdropTimeline(durationMs: number): Promise<BackdropTimelineAudit> {
    const restoreMode = this.mode;
    const restoreMs = this.nowMs;
    this.mode = "runtime";
    try {
      await this.contentReady;
      await this.preloadRuntimeAssets(this.ability);
      await this.groundReady;
      await this.scene.whenReadyAsync();
      this.reset();
      const stopAt = Math.max(0, durationMs);
      let sampledFrames = 0;
      let peakParticleCount = 0;
      let peakSystemCount = 0;
      let worstAtMs = 0;
      let suspects: readonly string[] = [];
      let worst: BackdropFrameAudit = {
        litShare: 0,
        highlightShare: 0,
        brightShare: 0,
        nearWhiteShare: 0,
        dominantBrightShare: 0,
        dominantNonBackgroundShare: 0,
        localWhiteCardShare: 0,
        diagnosticCheckerShare: 0,
        unsafe: false,
      };
      const read = async (): Promise<BackdropFrameAudit> => {
        this.renderScene();
        this.renderScene();
        const width = this.engine.getRenderWidth();
        const height = this.engine.getRenderHeight();
        const rgba = (await this.engine.readPixels(0, 0, width, height)) as Uint8Array;
        return auditBackdropFrame(rgba, width, height);
      };
      while (true) {
        let result = await read();
        peakParticleCount = Math.max(
          peakParticleCount,
          this.scene.particleSystems.reduce((sum, system) => sum + system.getActiveCount(), 0),
        );
        peakSystemCount = Math.max(peakSystemCount, this.scene.particleSystems.length);
        if (result.unsafe) {
          // Diagnostic A/B on the exact failed frame. This does not excuse a
          // telegraph from the gate; it names the layer that must be fixed.
          this.runtimeVfx?.telegraphs228.clear();
          const withoutTelegraph = await read();
          if (!withoutTelegraph.unsafe) {
            result = {
              ...result,
              reason: `${result.reason ?? "畫面底板"}（移除施法範圍預告後恢復，來源為 Telegraph）`,
            };
          } else {
            const isolateActor = async (role: "caster" | "target"): Promise<boolean> => {
              const actor = this.actors[role];
              const bodyWasEnabled = actor.bodyRoot?.isEnabled() ?? false;
              const fallbackWasEnabled = actor.fallback.isEnabled();
              actor.bodyRoot?.setEnabled(false);
              actor.fallback.setEnabled(false);
              const isolated = await read();
              actor.bodyRoot?.setEnabled(bodyWasEnabled);
              actor.fallback.setEnabled(fallbackWasEnabled);
              return !isolated.unsafe;
            };
            if (await isolateActor("caster")) {
              result = {
                ...result,
                reason: `${result.reason ?? "畫面底板"}（隱藏施法者後恢復，來源為施法者 3D Model）`,
              };
            } else if (await isolateActor("target")) {
              result = {
                ...result,
                reason: `${result.reason ?? "畫面底板"}（隱藏目標後恢復，來源為目標 3D Model）`,
              };
            } else {
              const actors = [this.actors.caster, this.actors.target];
              const actorStates = actors.map((actor) => ({
                body: actor.bodyRoot?.isEnabled() ?? false,
                fallback: actor.fallback.isEnabled(),
              }));
              for (const actor of actors) {
                actor.bodyRoot?.setEnabled(false);
                actor.fallback.setEnabled(false);
              }
              const withoutActors = await read();
              actors.forEach((actor, index) => {
                actor.bodyRoot?.setEnabled(actorStates[index]!.body);
                actor.fallback.setEnabled(actorStates[index]!.fallback);
              });
              if (!withoutActors.unsafe) {
                result = {
                  ...result,
                  reason: `${result.reason ?? "畫面底板"}（隱藏雙方模型後恢復，來源為 3D Model 疊加）`,
                };
              } else {
                const ground = this.scene.meshes.filter((mesh) => mesh.name.startsWith("zone-0-"));
                const groundStates = ground.map((mesh) => mesh.isEnabled());
                ground.forEach((mesh) => mesh.setEnabled(false));
                const withoutGround = await read();
                ground.forEach((mesh, index) => mesh.setEnabled(groundStates[index]!));
                if (!withoutGround.unsafe) {
                  let isolatedMesh = "場地";
                  for (const mesh of ground) {
                    const wasEnabled = mesh.isEnabled();
                    mesh.setEnabled(false);
                    const withoutMesh = await read();
                    mesh.setEnabled(wasEnabled);
                    if (!withoutMesh.unsafe) {
                      isolatedMesh = mesh.name;
                      break;
                    }
                  }
                  const materialStates = ground.map((mesh) => {
                    const material = mesh.material as unknown as {
                      name?: string;
                      albedoColor?: { r: number; g: number; b: number };
                      albedoTexture?: { name?: string } | null;
                      emissiveColor?: { r: number; g: number; b: number };
                      disableLighting?: boolean;
                      unlit?: boolean;
                      alpha?: number;
                    } | null;
                    const color = material?.albedoColor;
                    const emissive = material?.emissiveColor;
                    return material
                      ? `${mesh.name}/${material.name ?? "?"} albedo=${color ? `${color.r.toFixed(3)},${color.g.toFixed(3)},${color.b.toFixed(3)}` : "?"} emissive=${emissive ? `${emissive.r.toFixed(3)},${emissive.g.toFixed(3)},${emissive.b.toFixed(3)}` : "?"} alpha=${material.alpha ?? "?"} unlit=${material.unlit ?? material.disableLighting ?? false} texture=${material.albedoTexture?.name ?? "none"}`
                      : `${mesh.name}/無材質`;
                  }).join("；");
                  const image = this.scene.imageProcessingConfiguration;
                  const camera = this.scene.activeCamera;
                  const cameraState = camera
                    ? `camera=${camera.globalPosition.x.toFixed(2)},${camera.globalPosition.y.toFixed(2)},${camera.globalPosition.z.toFixed(2)} fov=${camera.fov.toFixed(3)} minZ=${camera.minZ.toFixed(3)}`
                    : "camera=none";
                  const sceneState = `exposure=${image.exposure.toFixed(2)} contrast=${image.contrast.toFixed(2)} tone=${image.toneMappingEnabled} ${cameraState} lights=${this.scene.lights.map((light) => `${light.name}:${light.intensity.toFixed(2)}`).join(",")}`;
                  result = {
                    ...result,
                    reason: `${result.reason ?? "畫面底板"}（隱藏 ${isolatedMesh} 後恢復：${materialStates}；${sceneState}）`,
                  };
                }
              }
            }
          }
        }
        sampledFrames++;
        // Pick the same worst frame the reviewer-facing score actually uses.
        // The old unweighted max could select a mildly lit frame while missing
        // a smaller near-white carrier whose weighted hygiene score was lower.
        const score = automaticVisualHygieneScore(result);
        const worstScore = automaticVisualHygieneScore(worst);
        if (score < worstScore || result.unsafe) {
          worst = result;
          worstAtMs = this.nowMs;
          suspects = this.backdropMeshSuspects();
        }
        if (result.unsafe || this.nowMs >= stopAt) break;
        // 15 Hz is dense enough to catch a one-shot VFX carrier (the minimum
        // shipped effect lifetime is longer than four 60 Hz frames) without
        // turning every save into a second 60 fps capture job.
        for (let frame = 0; frame < 4 && this.nowMs < stopAt; frame++) {
          this.advanceFrame(true, Math.min(STEP_MS, stopAt - this.nowMs), false);
        }
      }
      return {
        safe: !worst.unsafe,
        autoVisualScore: automaticVisualHygieneScore(worst),
        sampledFrames,
        peakParticleCount,
        peakSystemCount,
        worstAtMs,
        worst,
        suspects,
      };
    } finally {
      this.mode = restoreMode;
      this.seek(restoreMs);
    }
  }

  /** Names the largest visible non-arena meshes when a framebuffer audit fails. */
  private backdropMeshSuspects(): string[] {
    const eye = this.scene.activeCamera?.globalPosition;
    if (!eye) return [];
    return this.scene.meshes
      .filter((mesh) => mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0)
      .filter((mesh) => !mesh.name.startsWith("zone-0-") && mesh !== this.groundFloor)
      .map((mesh) => {
        const sphere = mesh.getBoundingInfo().boundingSphere;
        const distance = Vector3.Distance(eye, sphere.centerWorld);
        const score = sphere.radiusWorld / Math.max(0.01, distance);
        const chain: string[] = [];
        let node: { name?: string; parent?: unknown } | null = mesh;
        while (node && chain.length < 4) {
          if (node.name) chain.unshift(node.name);
          node = node.parent as typeof node;
        }
        return { score, label: `${chain.join("/")} · r/d=${score.toFixed(2)} · ${mesh.material?.name ?? "無材質"}` };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((item) => item.label);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.seekTimer);
    this.seekSeq++;
    this.generation++;
    // AssetContainer resolution can finish before Babylon's asynchronous RGBD
    // expansion shader. React StrictMode mounts and immediately tears down a
    // preview once in development; disposing the Scene in that gap leaves the
    // shader callback calling a null postProcessManager. Keep the dead stage
    // inert, wait for its already-started readiness work, then free it. This is
    // bounded by the asset promises themselves and does not keep rendering.
    void this.disposeAfterInflightWork();
  }

  private async disposeAfterInflightWork(): Promise<void> {
    if (this.teardownStarted) return;
    this.teardownStarted = true;
    await Promise.allSettled([this.groundReady, this.actorReady, this.contentReady]);
    if (!this.scene.isDisposed) {
      try {
        await this.scene.whenReadyAsync();
      } catch {
        // Teardown must still complete after a failed texture or shader.
      }
    }
    for (const actor of Object.values(this.actors)) this.disposeActor(actor);
    this.runtimeVfx?.dispose();
    this.modelRig.dispose();
    this.modelFxContainerPromises.clear();
    this.disposeParticles();
    this.renderer.dispose();
  }

  private makeActor(
    role: ForgeActor["role"],
    name: string,
    position: { x: number; z: number },
    facing: { x: number; z: number },
    color: Color3,
    champion: ChampionDef | null,
  ): ForgeActor {
    const mesh = MeshBuilder.CreateCapsule(name, { height: 1.7, radius: 0.38 }, this.scene);
    mesh.position.set(position.x, 0.85, position.z);
    const mat = new StandardMaterial(`${name}-mat`, this.scene);
    mat.diffuseColor = color;
    mat.emissiveColor = color.scale(0.12);
    mesh.material = mat;
    return {
      role,
      fallback: mesh,
      position: { ...position },
      facing,
      champion,
      view: null,
      bodyRoot: null,
      glbRoot: null,
      fallbackForced: false,
      idleAfterMs: 0,
      hiddenUntilMs: 0,
    };
  }

  /**
   * Replace the coloured fallback with the exact champion presentation used in
   * a match.  This deliberately delegates attachment, normalisation, ground
   * seating and clip timing to ChampionView; duplicating those rules here made
   * an Editor-only third renderer that could drift even when every individual
   * value looked plausible.
   */
  private async loadActor(actor: ForgeActor): Promise<void> {
    const champion = actor.champion;
    if (!champion) return;
    this.actorStatus[actor.role] = `載入 ${champion.name}…`;
    this.emitOverlay("載入 3D 角色…");
    try {
      const doc = await this.fetchDoc<ModelDoc>("models", champion.modelKey);
      const resolved = resolveAppearance(champion.id, champion, doc);
      if (!resolved.ok) throw new Error(`resolved-appearance@1: ${resolved.failure.kind}`);
      const appearance = resolved.appearance;
      if (this.disposed || this.scene.isDisposed) {
        return;
      }
      const entityId = actor.role === "caster" ? 900_001 : 900_002;
      const view = new ChampionView(this.scene, entityId, champion.modelKey, actor.role === "caster" ? 0 : 1);
      view.setPose(actor.position.x, actor.position.z, actor.facing.x, actor.facing.z);
      view.tryUpgradeToGlb(this.assets, doc, champion.bodyScale);
      actor.view = view;
      actor.bodyRoot = view.root;
      actor.fallback.setEnabled(false);
      // AssetManager's cache and the view's adoption callback are both async.
      // Wait only through the same bounded authoring window used by the Forge;
      // a missing GLB is a rejected visual candidate, never an infinite spinner.
      const deadline = Date.now() + ACTOR_READY_BUDGET_MS;
      while (!view.adoptedGlb && Date.now() < deadline && !this.disposed && !this.scene.isDisposed) {
        this.renderScene();
        await new Promise<void>((resolve) => globalThis.setTimeout(resolve, STEP_MS));
      }
      const glbRoot = this.scene.getTransformNodeByName(`champ-${entityId}-glb`);
      if (!view.adoptedGlb || !glbRoot) {
        actor.fallbackForced = true;
        view.root.setEnabled(false);
        actor.fallback.setEnabled(true);
        const issue = `${champion.name} · ${appearance.modelKey} 未在 ${ACTOR_READY_BUDGET_MS}ms 內採用遊戲 GLB`;
        this.visualAssetIssues.add(issue);
        this.actorStatus[actor.role] = `⚠ ${issue}，已顯示替身並封鎖視覺驗收`;
        this.emitOverlay("3D 模型未就緒，候選不得送審");
        return;
      }
      actor.glbRoot = glbRoot;
      const visible = glbRoot.getChildMeshes(false);
      applyModelTint(glbRoot, champion);
      // A normal game render loop reaches the PBR/texture-ready boundary on
      // its own. Forge commonly pauses at frame zero, so render once and give
      // the scene a bounded chance to settle before compiling this actor.
      // Waiting unboundedly on Scene.whenReadyAsync() was a deadlock: a cold
      // optional VFX pool could keep the preview at "載入角色" forever.
      this.renderScene();
      await Promise.race([
        this.scene.whenReadyAsync().catch(() => undefined),
        new Promise<void>((resolve) => globalThis.setTimeout(resolve, ACTOR_READY_BUDGET_MS)),
      ]);
      if (this.disposed || this.scene.isDisposed) return;
      // Compile the actor independently after that bounded scene turn. This
      // retains the real AssetManager/PBR path instead of swapping in a
      // preview-only loader that could accept pixels the game cannot render.
      await Promise.all(visible.flatMap((mesh) =>
        mesh.material ? [mesh.material.forceCompilationAsync(mesh)] : [],
      ));
      // `forceCompilationAsync` proves the shader variant exists, but browser
      // texture upload and KHR_parallel_shader_compile become visible only on
      // subsequent rendering tasks. The game naturally has them; a paused
      // Forge does not. Match the shipped audition's ten-frame settle window
      // so a frame-zero review is a real model, not its black/white bootstrap.
      await this.renderWarmupFrames(ACTOR_WARMUP_FRAMES);
      if (this.disposed || this.scene.isDisposed) return;
      const visibility = await this.measureActorVisibility(actor);
      if (!visibility.visible) {
        // Do not replace a missing model with an optimistic fake.  The coloured
        // capsule is an explicitly marked interaction fallback, while the
        // source issue prevents visual evidence from becoming reviewable.
        actor.fallbackForced = true;
        actor.bodyRoot.setEnabled(false);
        actor.fallback.setEnabled(true);
        const meshState = visible
          .slice(0, 5)
          .map((mesh) => `${mesh.name}:${mesh.isEnabled() ? "on" : "off"}/${mesh.isVisible ? "visible" : "hidden"}/v${mesh.visibility.toFixed(2)}`)
          .join(", ");
        const issue = `${champion.name} · ${appearance.modelKey} 3D 模型在真實 framebuffer 僅改變 ${visibility.changedPixels} 像素（${meshState || "0 meshes"}）`;
        this.visualAssetIssues.add(issue);
        this.actorStatus[actor.role] = `⚠ ${issue}，已顯示替身並封鎖視覺驗收`;
        this.emitOverlay("3D 模型不可辨識，候選不得送審");
        return;
      }
      this.actorStatus[actor.role] =
        `${appearance.isStandIn ? "⚠ 共用替身 · " : ""}${champion.name} · ${appearance.modelKey} · ` +
        `${visible.length} meshes · ` +
        `×${(view.declaredScale ?? 0).toFixed(3)} · Main ChampionView · 材質已預熱`;
      // The script may already be scrubbed past a pulse while this GLB loaded.
      this.seek(this.nowMs);
    } catch (error) {
      // A failed imported presentation must remain usable and visible. The GLB
      // may already have disabled the coloured capsule before a late texture
      // or shader failure surfaced; leaving both paths disabled produces an
      // empty stage and turns an asset failure into a misleading camera/VFX
      // failure. Dispose the partial presentation and restore the fallback.
      if (!this.disposed) {
        this.disposeActor(actor);
        actor.fallback.setEnabled(true);
        this.renderScene();
      }
      this.actorStatus[actor.role] = `${champion.name} · 替身（載入失敗）`;
      this.emitOverlay(`${champion.name} 3D 載入失敗，保留碰撞替身：${String(error)}`);
    }
  }

  private disposeActor(actor: ForgeActor): void {
    if (actor.glbRoot) releaseModelTint(actor.glbRoot);
    actor.view?.dispose();
    actor.view = null;
    actor.bodyRoot = null;
    actor.glbRoot = null;
    actor.fallbackForced = false;
  }

  private loadModelFxContainer(path: string): Promise<AssetContainer> {
    const cached = this.modelFxContainerPromises.get(path);
    if (cached) return cached;
    const pending = this.assets.load(path, "fx").then((container) => {
      if (!container) throw new Error(`GGD AssetManager 無法載入 ${path}`);
      if (this.disposed) {
        throw new Error("VFX Forge stage was disposed during model preload");
      }
      return container;
    });
    this.modelFxContainerPromises.set(path, pending);
    return pending;
  }

  /**
   * Make the first paused scrub truthful. AssetContainer resolution means the
   * GLB bytes were parsed, not that its textures/shaders are drawable. Runtime
   * modelFx clones those source materials on demand; if the source was never
   * compiled, the exact event frame appears as a solid white body for several
   * seconds and only fixes itself after real time passes. Compile the source
   * variants once before timeline controls are enabled. Clones then inherit
   * ready textures while tint/alpha remain the production rig's responsibility.
   */
  private async warmModelFxMaterials(container: AssetContainer): Promise<void> {
    await Promise.all(container.meshes.flatMap((mesh) =>
      mesh.material ? [mesh.material.forceCompilationAsync(mesh)] : [],
    ));
  }

  /** Resolve every referenced doc and GLB before the first deterministic replay. */
  private async preloadScriptAssets(script: VfxScriptDoc): Promise<void> {
    const modelKeys = [...new Set(script.segments.flatMap((segment) =>
      segment.kind === "modelFx" ? [segment.modelKey] : [],
    ))];
    const vfxIds = [...new Set(script.segments.flatMap((segment) =>
      segment.kind === "vfx" ? [segment.vfxId] : [],
    ))];
    await Promise.all(modelKeys.map(async (key) => {
      if (this.models.has(key)) return;
      try {
        this.models.set(key, await this.fetchDoc<ModelDoc>("models", key));
      } catch (error) {
        this.emitOverlay(`模型文件載入失敗：${key} · ${String(error)}`);
      }
    }));
    // Script-only presentation is still rendered by the shipped VfxSystem.
    // Warm the rig that will actually consume the synthetic modelFxSpawn
    // event; warming only the Forge fallback rig leaves the first deterministic
    // seek empty even though the GLB container itself has already loaded.
    this.runtimeVfx?.warmModelFx(modelKeys);
    if (!this.runtimeVfx) this.modelRig.warm(modelKeys);
    await Promise.all(modelKeys.flatMap((key) => {
      const doc = this.models.get(key);
      return doc
        ? [this.loadModelFxContainer(doc.glbPath)
            .then((container) => this.warmModelFxMaterials(container))
            .catch((error) => {
              this.emitOverlay(`模型資產預載失敗：${key} · ${String(error)}`);
            })]
        : [];
    }));
    await Promise.all(vfxIds.map(async (id) => {
      if (this.vfx.has(id)) return;
      try {
        this.vfx.set(id, await this.fetchDoc<VfxDoc>("vfx", id));
      } catch (error) {
        this.emitOverlay(`粒子文件載入失敗：${id} · ${String(error)}`);
      }
    }));
  }

  private actorForEntity(id: number): ForgeActor {
    return id === this.casterEntityId() ? this.actors.caster : this.actors.target;
  }

  private pulseActor(id: number, kind: AnimPulse, clipWindowMs?: number): void {
    const actor = this.actorForEntity(id);
    const windowMs = clipWindowMs ?? PRESENTATION_RECEIPT.actorPulses.defaultWindowMs[kind];
    const view = actor.view;
    if (view) {
      if (kind === "cast") view.beginCast(windowMs, this.nowMs);
      else if (kind === "attack") view.beginAttack(windowMs, this.nowMs);
      else view.pulse(kind, this.nowMs, { windowMs });
    }
    actor.idleAfterMs = this.nowMs + windowMs;
    this.emitOverlay(`動畫脈衝：${kind}`);
  }

  private hideActor(id: number, durationMs: number): void {
    const actor = this.actorForEntity(id);
    actor.hiddenUntilMs = this.nowMs + durationMs;
    actor.bodyRoot?.setEnabled(false);
    actor.fallback.setEnabled(false);
    this.emitOverlay(`隱藏本體 ${durationMs}ms`);
  }

  private reset(): void {
    this.generation++;
    this.nowMs = 0;
    this.nextEvent = 0;
    this.flash = null;
    this.flashUntilMs = 0;
    this.texts = [];
    this.lastVfxAim = null;
    for (const actor of Object.values(this.actors)) {
      actor.idleAfterMs = 0;
      actor.hiddenUntilMs = 0;
      actor.bodyRoot?.setEnabled(!actor.fallbackForced);
      actor.fallback.setEnabled(actor.bodyRoot === null || actor.fallbackForced);
    }
    this.setActorPose(this.homePose);
    // Timeline replay keeps preloaded GLB containers and reuses pooled geometry;
    // clearing the container map here makes the first scrub frame an empty shell.
    this.modelRig.resetForRound();
    this.runtimeVfx?.resetForRound({ preserveOneShotPool: true });
    this.disposeParticles();
    this.player = this.makePlayer();
    this.consumeEvents();
    if (this.mode === "runtime") this.runtimeVfx?.update(0);
    else {
      this.player.update(0);
      this.runtimeVfx?.update(0);
    }
    this.renderScene();
    this.emitOverlay("已重播");
  }

  private makePlayer(): VfxScriptPlayer {
    return new VfxScriptPlayer({
      scriptFor: (id) => (id === this.script.abilityId ? this.script : undefined),
      allScripts: () => [this.script],
      projectileIdsOf: (id) => id === this.ability.id ? projectileIdsOf(this.ability) : new Set(),
      entityPos: (id) => this.actorForEntity(id).position,
      dispatch: (ev, nowMs) => this.dispatch(ev, nowMs),
      enabled: () => true,
      pulseAnim: (id, kind, pulse) => this.pulseActor(id, kind, pulse?.clipWindowMs),
      hideBody: (id, ms) => this.hideActor(id, ms),
      playSfx: (key) => {
        this.emitOverlay(`音效：${key}`);
        return true;
      },
    });
  }

  private advanceFrame(render: boolean, dtMs = STEP_MS, notify = true): void {
    this.nowMs += dtMs;
    this.lighting.animate(this.nowMs / 1000);
    this.consumeEvents();
    if (this.mode === "runtime") this.runtimeVfx?.update(this.nowMs);
    else {
      this.player.update(this.nowMs);
      this.modelRig.tick(dtMs);
      this.runtimeVfx?.update(this.nowMs);
    }
    this.cameraRig.update({
      dtMs,
      localPos: this.cameraFocus(),
      cursor: null,
      panKeys: null,
      viewportWidth: this.engine.getRenderWidth(),
      viewportHeight: this.engine.getRenderHeight(),
    });
    this.applyReviewOrbit();
    for (const actor of Object.values(this.actors)) {
      const view = actor.view;
      if (!view) continue;
      const state = view.anim.update({ alive: true, moving: false }, this.nowMs);
      view.update(state, this.nowMs, dtMs);
    }
    this.reap();
    if (render) this.renderScene();
    if (notify) this.emitOverlay("播放中");
  }

  private consumeEvents(): void {
    while (
      this.nextEvent < this.schedule.length &&
      this.schedule[this.nextEvent]!.atMs <= this.nowMs + 0.001
    ) {
      const item = this.schedule[this.nextEvent++]!;
      if (item.actorPose) this.setActorPose(item.actorPose);
      if (this.mode === "runtime") {
        this.pulseActorsFromRuntimeEvent(item.event);
        this.runtimeVfx?.handleEvent(item.event, item.atMs);
      }
      else this.player.onEvent(item.event, item.atMs);
    }
  }

  /**
   * Character animation is owned by the shipped entity-view layer, not by
   * VfxSystem. The embedded Forge has no EntityViewRegistry, so it must bridge
   * the same real Sim events to the two preview actors or the models remain in
   * idle while the effects fire around them.
   */
  private pulseActorsFromRuntimeEvent(ev: EventMessage): void {
    const data = ev.data;
    if (ev.type === "abilityCast" && data.abilityId === this.ability.id) {
      const caster = Number(data.caster);
      if (Number.isFinite(caster)) {
        this.pulseActor(
          caster,
          "cast",
          Math.max(600, Math.round(Math.max(0, this.ability.castTimeSec ?? 0) * 1000)),
        );
      }
      return;
    }
    if (ev.type !== "comboStrike") return;
    if (abilityIdOfAuthoredOrigin(String(data.origin ?? "")) !== this.ability.id) return;
    const caster = Number(data.caster);
    const victim = Number(data.victim);
    if (Number.isFinite(caster)) this.pulseActor(caster, "attack", 420);
    if (Number.isFinite(victim)) this.pulseActor(victim, "hurt", 520);
  }

  private setActorPose(pose: PreviewActorPose): void {
    const caster = this.actors.caster;
    const target = this.actors.target;
    this.moveActor(caster, pose.caster.x, pose.caster.z);
    this.moveActor(target, pose.target.x, pose.target.z);
    const dx = target.position.x - caster.position.x;
    const dz = target.position.z - caster.position.z;
    const len = Math.hypot(dx, dz);
    if (len > 0.0001) {
      caster.facing.x = dx / len;
      caster.facing.z = dz / len;
      target.facing.x = -dx / len;
      target.facing.z = -dz / len;
      caster.view?.setPose(caster.position.x, caster.position.z, caster.facing.x, caster.facing.z);
      target.view?.setPose(target.position.x, target.position.z, target.facing.x, target.facing.z);
    }
  }

  private moveActor(actor: ForgeActor, x: number, z: number): void {
    actor.position.x = x;
    actor.position.z = z;
    actor.view?.setPose(x, z, actor.facing.x, actor.facing.z);
    actor.fallback.position.set(x, 0.85, z);
  }

  private cameraFocus(): { x: number; z: number } {
    if (this.castFocus) return this.castFocus;
    return {
      x: (this.actors.caster.position.x + this.actors.target.position.x) / 2,
      z: (this.actors.caster.position.z + this.actors.target.position.z) / 2,
    };
  }

  /**
   * Orbit the already-computed CameraRig eye around its ground focus. This is
   * deliberately a presentation-only transform: it does not touch Sim poses,
   * aim payloads, VFX orientation, dolly, pitch, or shake magnitude.
   */
  private applyReviewOrbit(): void {
    if (!this.sideReviewView) return;
    const focus = this.cameraFocus();
    const camera = this.cameraRig.camera;
    const dx = camera.position.x - focus.x;
    const dz = camera.position.z - focus.z;
    camera.position.x = focus.x - dz;
    camera.position.z = focus.z + dx;
    camera.setTarget(new Vector3(focus.x, 0, focus.z));
  }

  private renderScene(): void {
    this.scene.render();
  }

  /**
   * A successful GLB parse is not visual evidence. Sample the actual
   * framebuffer with just this actor hidden, once at load time: a model whose
   * textures/materials collapse into the background becomes an explicit blocked
   * asset rather than a deceptively "ready" black silhouette.
   */
  private async measureActorVisibility(actor: ForgeActor): Promise<{
    visible: boolean;
    changedPixels: number;
  }> {
    // `ChampionView.root` also carries a team ring and blob shadow. Those are
    // intentionally visible even when an adopted GLB fails to draw, so they
    // must never count as proof that the character body is renderable.
    const root = actor.glbRoot ?? actor.bodyRoot;
    const width = this.engine.getRenderWidth();
    const height = this.engine.getRenderHeight();
    if (!root || width <= 0 || height <= 0) return { visible: true, changedPixels: 0 };
    const read = async (): Promise<Uint8Array> => {
      this.renderScene();
      this.renderScene();
      return (await this.engine.readPixels(0, 0, width, height)) as Uint8Array;
    };
    const enabled = root.isEnabled();
    const shown = await read();
    root.setEnabled(false);
    try {
      const hidden = await read();
      let changedPixels = 0;
      for (let i = 0; i + 2 < shown.length && i + 2 < hidden.length; i += 4) {
        const delta =
          Math.abs(shown[i]! - hidden[i]!) +
          Math.abs(shown[i + 1]! - hidden[i + 1]!) +
          Math.abs(shown[i + 2]! - hidden[i + 2]!);
        if (delta >= MIN_ACTOR_PIXEL_DELTA) changedPixels++;
      }
      return { visible: changedPixels >= MIN_ACTOR_VISIBLE_PIXELS, changedPixels };
    } finally {
      root.setEnabled(enabled);
      this.renderScene();
    }
  }

  /** Render a bounded number of browser tasks while a paused actor settles. */
  private async renderWarmupFrames(frames: number): Promise<void> {
    for (let frame = 0; frame < frames; frame++) {
      if (this.disposed || this.scene.isDisposed) return;
      this.renderScene();
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, STEP_MS));
    }
    this.renderScene();
  }

  private casterEntityId(): number | undefined {
    for (const item of this.schedule) {
      if (item.event.type !== "abilityCast" || item.event.data.abilityId !== this.ability.id) continue;
      return Number(item.event.data.caster);
    }
    for (const item of this.schedule) {
      const data = item.event.data;
      if (
        item.event.type === "reflectSuccess" &&
        abilityIdOfAuthoredOrigin(String(data.origin ?? "")) === this.ability.id
      ) return Number(data.reflector);
      if (
        item.event.type === "comboStrike" &&
        abilityIdOfAuthoredOrigin(String(data.origin ?? "")) === this.ability.id
      ) return Number(data.caster);
    }
    return undefined;
  }

  /** Warm every model referenced by the draft ability or its shipped script. */
  private async preloadRuntimeAssets(ability: ForgeAbility): Promise<void> {
    const keys = new Set<string>();
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const child of value) visit(child);
        return;
      }
      if (value === null || typeof value !== "object") return;
      const record = value as Record<string, unknown>;
      if (typeof record["modelKey"] === "string") keys.add(record["modelKey"]);
      for (const child of Object.values(record)) visit(child);
    };
    visit(ability.effects);
    visit(ability.passive);
    const shippedScript = VfxScripts.tryGet(ability.id);
    if (shippedScript) visit(shippedScript.segments);
    for (const key of keys) {
      const doc = Models.tryGet(key);
      if (doc) this.models.set(key, doc);
    }
    const modelKeys = [...keys].filter((key) => this.models.has(key));
    this.runtimeVfx?.warmModelFx(modelKeys);
    await Promise.all(modelKeys.map(async (key) => {
      const doc = this.models.get(key);
      if (!doc) return;
      try {
        const container = await this.loadModelFxContainer(doc.glbPath);
        await this.warmModelFxMaterials(container);
      } catch (error) {
        this.emitOverlay(`Runtime 模型資產預載失敗：${key} · ${String(error)}`);
      }
    }));
  }

  private dispatch(ev: EventMessage, nowMs: number): void {
    const data = ev.data;
    if (ev.type === "modelFxSpawn") {
      if (this.runtimeVfx) {
        // The shipped ModelFxRig already owns model pooling, trail cadence and
        // the pre-warmed particle pool. Keeping a second Forge-only rig here
        // made the moving model visible while every trail burst raced a fresh
        // texture decode and disappeared during deterministic scrubbing.
        this.runtimeVfx.handleEvent(ev, nowMs);
        return;
      }
      const payload = data as unknown as ModelFxSpawnEvent;
      const generation = this.generation;
      const spawn = (): void => {
        if (generation === this.generation) this.modelRig.spawn(payload);
      };
      if (this.models.has(payload.modelKey)) spawn();
      else {
        void this.fetchDoc<ModelDoc>("models", payload.modelKey).then((doc) => {
          this.models.set(payload.modelKey, doc);
          spawn();
        }).catch((e) => this.emitOverlay(`模型載入失敗：${String(e)}`));
      }
      return;
    }
    if (ev.type === "vfxSpawn") {
      if (this.mode === "script" && this.runtimeVfx) {
        // Render through the exact shipped pool/factory.  The Forge player
        // still owns the authored schedule; VfxSystem owns only presentation.
        const x = Number(data.x ?? 0);
        const z = Number(data.z ?? 0);
        const caster = Number(data.caster);
        const casterPos = Number.isFinite(caster) ? this.actorForEntity(caster).position : null;
        const aimYaw = casterPos ? yawDegToward(x - casterPos.x, z - casterPos.z) : null;
        this.lastVfxAim = `${String(data.vfxId ?? "")} @ ${x.toFixed(2)},${z.toFixed(2)} yaw ${aimYaw?.toFixed(1) ?? "—"}°`;
        this.runtimeVfx.handleEvent(ev, nowMs);
        return;
      }
      const id = String(data.vfxId ?? "");
      const x = Number(data.x ?? 0);
      const z = Number(data.z ?? 0);
      const overrides = (data.overrides ?? {}) as AbilityVfxLayerOverride;
      const y = (overrides.flyHeight ?? 128) / WC3_UNITS_PER_WORLD_UNIT;
      const caster = Number(data.caster);
      const casterPos = Number.isFinite(caster) ? this.actorForEntity(caster).position : null;
      const aimYaw = casterPos ? yawDegToward(x - casterPos.x, z - casterPos.z) : null;
      this.lastVfxAim = `${id} @ ${x.toFixed(2)},${z.toFixed(2)} yaw ${aimYaw?.toFixed(1) ?? "—"}°`;
      void this.spawnVfx(id, x, z, y, overrides, Number(data.durationSec ?? 0) || undefined, aimYaw);
      return;
    }
    if (ev.type === "screenShake") {
      this.cameraRig.addShake(Number(data.amplitude ?? 0), Number(data.durationSec ?? 0) * 1000);
      return;
    }
    if (ev.type === "screenFlash") {
      this.flash = {
        color: (data.colorRgb as [number, number, number]) ?? [255, 255, 255],
        alpha: Number(data.peakAlpha ?? 0),
      };
      this.flashUntilMs = nowMs + Number(data.durationSec ?? 0) * 1000;
      return;
    }
    if (ev.type === "floatingText") {
      const subjects = Array.isArray(data.subjects) ? data.subjects : [];
      const subject = (subjects[0] ?? TARGET_POS) as { x?: number; z?: number };
      this.texts.push({
        id: ++this.textSerial,
        text: String(data.text ?? ""),
        x: subject.x ?? 0,
        z: subject.z ?? 0,
        untilMs: nowMs + Number(data.durationSec ?? 1) * 1000,
      });
    }
  }

  private async spawnVfx(
    id: string,
    x: number,
    z: number,
    y = 1,
    overrides: AbilityVfxLayerOverride = {},
    durationSec?: number,
    aimYaw?: number | null,
  ): Promise<void> {
    if (!id) return;
    const generation = this.generation;
    try {
      let doc = this.vfx.get(id);
      if (!doc) {
        doc = await this.fetchDoc<VfxDoc>("vfx", id);
        this.vfx.set(id, doc);
      }
      if (generation !== this.generation) return;
      const rendered = applyAimYaw(applyVfxOverrides(doc, overrides), aimYaw ?? null);
      const ps = toParticleSystem(rendered, this.scene);
      ps.emitter = new Vector3(x, y, z);
      // Babylon does not simulate a freshly constructed ParticleSystem until
      // start() is called.  `manualEmitCount` only queues the burst; it does
      // not start the system.  The shipped VfxSystem does both, and the Forge
      // script-only adapter must preserve that behaviour or every authored
      // particle segment is silently invisible despite a valid timeline.
      ps.start();
      burstNow(ps, rendered);
      this.particles.push({ ps, untilMs: this.nowMs + (durationSec ?? vfxHardMaxLifeSec()) * 1000 });
    } catch (e) {
      this.emitOverlay(`粒子載入失敗：${String(e)}`);
    }
  }

  private reap(): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      if (this.particles[i]!.untilMs <= this.nowMs) {
        this.particles[i]!.ps.dispose();
        this.particles.splice(i, 1);
      }
    }
    this.texts = this.texts.filter((t) => t.untilMs > this.nowMs);
    if (this.flashUntilMs <= this.nowMs) this.flash = null;
    for (const actor of Object.values(this.actors)) {
      if (actor.hiddenUntilMs > 0 && actor.hiddenUntilMs <= this.nowMs) {
        actor.hiddenUntilMs = 0;
        actor.bodyRoot?.setEnabled(!actor.fallbackForced);
        actor.fallback.setEnabled(actor.bodyRoot === null || actor.fallbackForced);
      }
      if (actor.idleAfterMs > 0 && actor.idleAfterMs <= this.nowMs) {
        actor.idleAfterMs = 0;
      }
    }
  }

  private disposeParticles(): void {
    for (const p of this.particles) p.ps.dispose();
    this.particles = [];
  }

  private emitOverlay(status: string): void {
    const eye = this.cameraRig?.eye;
    const visible = this.scene.getActiveMeshes().length;
    // Count the whole scene, including the shipped VfxSystem pool used by both
    // preview modes (not only the legacy direct-adapter systems).
    const particleCount = this.scene.particleSystems.reduce(
      (sum, system) => sum + system.getActiveCount(),
      0,
    );
    const aim = this.lastVfxAim ? ` · ${this.lastVfxAim}` : "";
    const view = eye
      ? `${status} · ${visible}/${this.scene.meshes.length} meshes · ${particleCount}/${this.scene.particleSystems.length} particles/systems · eye ${eye.x.toFixed(1)},${eye.y.toFixed(1)},${eye.z.toFixed(1)}${aim}`
      : status;
    this.onOverlay({ flash: this.flash, texts: this.texts, status: view, actors: { ...this.actorStatus } });
  }
}
