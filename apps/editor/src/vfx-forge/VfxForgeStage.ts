import type { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Shaders/postprocess.vertex";
import "@babylonjs/core/Shaders/rgbdDecode.fragment";
import "@babylonjs/core/Shaders/pbr.vertex";
import "@babylonjs/core/Shaders/pbr.fragment";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import type { ModelDoc, VfxDoc } from "@ggd/shared/content";
import type { AnimPulse } from "@ggd/shared/content/animPulse";
import {
  resolveAbilityPresentation,
  type PresentationActor,
  type PresentationTrigger,
} from "@ggd/shared/content/abilityPresentation";
import { resolveAppearance } from "@ggd/shared/content/import/resolvedAppearance";
import { Models, VfxDefs, VfxScripts } from "@ggd/shared/content/registries";
import { CAMERA_DOC_ID, Configs, resolveCamera } from "@ggd/shared/content";
import type { VfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import { abilityIdOfAuthoredOrigin, Champions, type ChampionDef } from "@ggd/shared/sim";
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
import { championTintForId } from "../../../client/src/render/views/championTint";
import {
  applyModelTint,
  releaseModelTint,
} from "../../../client/src/render/views/modelTint";
import { VfxScriptPlayer } from "../../../client/src/vfx/VfxScriptPlayer";
import { VfxSystem } from "../../../client/src/vfx/VfxSystem";
import { channelTakeover } from "../../../client/src/render/channelTakeover";
import {
  moveBodyFor,
  resetScriptedMoves,
  scriptedOffset,
} from "../../../client/src/render/scriptedMove";
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
import { projectileIdsOf, scriptVisualFocus, type ForgeAbility, type ScheduledSimEvent } from "./model";
import { calibrateTwoWay } from "../../../client/src/vfx/auditionCalibrate";
import type { PreviewActorPose } from "../preview/PreviewController";
import {
  auditBackdropFrame,
  automaticVisualHygieneScore,
  type BackdropFrameAudit,
} from "./backdropFrameAudit";
import { PRESENTATION_RECEIPT } from "./presentationContract";

const STEP_MS = 1000 / 60;
const EVIDENCE_SEEK_PRIMER_MS = 150;
/**
 * A paused Forge has no natural render loop to carry Babylon over its first
 * PBR/texture-ready boundary. Wait briefly for the scene when preparing an
 * actor, but never make one unrelated lazy resource able to deadlock the
 * authoring surface.
 */
const ACTOR_READY_BUDGET_MS = 750;
/** Retry the framebuffer proof across layout/texture-upload turns before falling back. */
const ACTOR_VISIBILITY_RETRIES = 6;
const ACTOR_VISIBILITY_RETRY_FRAMES = 3;
/** Keep the real GPU progressing while a paused Forge compiles imported PBR materials. */
const ACTOR_SHADER_BUDGET_MS = 4_000;
// Main's model-audition proof advances imported Stand tracks to 600ms. Several
// WC3 geoset-alpha clips are intentionally all-off at exact tick zero, which
// is not representative of a living actor once the game loop has advanced.
const ACTOR_IDLE_PRIME_MS = 600;
/** Same deterministic Stand-track settling window used by the shipped model audition. */
const ACTOR_WARMUP_FRAMES = Math.ceil(ACTOR_IDLE_PRIME_MS / STEP_MS);
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
  /** Peak live particles before actor/arena isolation for framebuffer readback. */
  peakParticleCountBeforeIsolation?: number;
  peakSystemCount: number;
  peakStartedSystemCount?: number;
  peakManualEmitCount?: number;
  /** Maximum non-background framebuffer coverage with actors and arena hidden. */
  peakPresentationPixelShare?: number;
  /** Presentation events actually consumed by the selected proof route. */
  presentationEventCount?: number;
  /** vfxSpawn events that started a real shipped ParticleSystem. */
  acceptedVfxEventCount?: number;
  /** Ability-specific reaction/movement actions, excluding generic probe attacks/casts. */
  semanticActionCount?: number;
  worstAtMs: number;
  worst: BackdropFrameAudit;
  suspects: readonly string[];
  /** Wall-clock cost of this audit, used by the repeatable performance gate. */
  elapsedMs: number;
  gpuReadbacks: number;
}

/** A candidate-bound framebuffer used by the one-page human review gate. */
export interface VfxVisualEvidenceFrame {
  label: string;
  dataUrl: string;
  atMs: number;
  view: "side" | "top";
  /** Both values use the shipped CameraRig; detail is its configured nearest clamp. */
  framing?: "gameplay" | "detail";
  /** Failure evidence only; never eligible for approval or Promote. */
  diagnosticOnly?: boolean;
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
  /** Request one bounded whole-scene remount when a textured GLB drew as white bootstrap. */
  onColdAssetRetry?(role: "caster" | "target"): boolean;
  /**
   * script: author the pure VFX script in isolation.
   * runtime: feed the real Sim trace through the shipped VfxSystem.
   */
  mode?: VfxForgeStageMode;
  /** True only after AssetSafetyGate accepted every ref in the exact draft. */
  assetRefsVerifiedSafe?: boolean;
}

interface LiveParticle {
  ps: ParticleSystem;
  untilMs: number;
}

interface ForgeActor {
  readonly role: "caster" | "target" | "summon";
  /** Entity id from the authoritative Sim trace; presentation uses viewEntityId. */
  readonly simEntityId: number | undefined;
  readonly viewEntityId: number;
  readonly teamId: number;
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
  active: boolean;
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
  private presentationEventCount = 0;
  private acceptedVfxEventCount = 0;
  private semanticActionCount = 0;
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
  private readonly onColdAssetRetry: VfxForgeStageOptions["onColdAssetRetry"];
  private readonly modelRig: ModelFxRig;
  private readonly groundRoot: TransformNode;
  private readonly groundFloor: ReturnType<typeof buildZoneGround>["floor"];
  private readonly groundReady: Promise<void>;
  private readonly actors: { caster: ForgeActor; target: ForgeActor };
  /** Summoned combat bodies are real ChampionViews driven by summonSpawn/despawn. */
  private readonly summonActors = new Map<number, ForgeActor>();
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
  private evidenceFraming: "gameplay" | "detail" = "gameplay";
  private readonly runtimeVfx: VfxSystem | null;
  private readonly canvas: HTMLCanvasElement;
  private readonly assetRefsVerifiedSafe: boolean;

  constructor(
    canvas: HTMLCanvasElement,
    script: VfxScriptDoc,
    ability: ForgeAbility,
    schedule: readonly ScheduledSimEvent[],
    opts: VfxForgeStageOptions = {},
  ) {
    this.canvas = canvas;
    this.assetRefsVerifiedSafe = opts.assetRefsVerifiedSafe === true;
    this.mode = opts.mode ?? "script";
    this.script = script;
    this.ability = ability;
    this.schedule = schedule;
    this.homePose = homePoseOf(schedule);
    this.castFocus = castFocusOf(schedule, this.homePose);
    this.fetchDoc = opts.fetchDoc ?? ((collection, id) => api.doc(collection, id));
    this.onOverlay = opts.onOverlay ?? (() => undefined);
    this.onColdAssetRetry = opts.onColdAssetRetry;
    // Use the Main renderer as-is.  Reconstructing just Engine + Scene in the
    // editor looked equivalent, but silently skipped the client render policy
    // (quality-backed resolution, scene setup and its module side effects).
    // That left real GLB meshes loaded and enabled yet visually absent in the
    // Forge.  This remains a local editor canvas; no game session is mounted.
    this.renderer = new Renderer(canvas);
    this.engine = this.renderer.engine;
    this.scene = this.renderer.scene;
    // A near-black clear colour made black-haired/dark-armour heroes disappear
    // even when their GLB and textures were healthy.  The Forge is an
    // inspection lightbox, so use a neutral mid-charcoal behind the shipped
    // lighting; this changes no model/VFX material and keeps additive effects
    // honest without condemning dark silhouettes as missing assets.
    this.scene.clearColor = new Color4(0.13, 0.145, 0.18, 1);
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
      [ground.floor, new Color3(0.16, 0.175, 0.21)],
      [ground.rim, new Color3(0.095, 0.105, 0.13)],
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
      caster: this.makeActor("caster", "施法者", this.homePose.caster, { x: 0, z: 1 }, new Color3(0.24, 0.55, 0.95), opts.actors?.caster ?? null, this.casterEntityId(), 900_001, 0),
      target: this.makeActor("target", "目標", this.homePose.target, { x: 0, z: -1 }, new Color3(0.92, 0.28, 0.24), opts.actors?.target ?? null, this.targetEntityId(), 900_002, 1),
    };
    this.prepareSummonActors();

    this.cameraRig = new CameraRig(this.scene, this.cameraFocus());
    // Start at Main's config-backed gameplay dolly. Forcing the authoring lens
    // to the 10u minimum cropped the caster out of ordinary 11u line skills,
    // which in turn made healthy bodies fail the framebuffer proof. Authors
    // can still use the visible near/far controls, but the first evidence frame
    // must be the same truthful baseline a player receives.
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
          moveBody: (id, offset, ms, arc) => moveBodyFor(id, offset, ms, arc, this.nowMs),
          screenFxHost: canvas.parentElement,
          // Runtime preview must render the unsaved authoring draft. The
          // shipped game leaves these callbacks absent and still reads the
          // registered content collection.
          // Script isolation already has an outer VfxScriptPlayer supplying
          // authored events. Registering that same draft inside VfxSystem as
          // well makes its duplicate-presentation guard discard every
          // synthetic vfxSpawn. Runtime mode instead lets Main own both script
          // scheduling and replacement, exactly like a match.
          vfxScriptFor: (id) => this.mode === "runtime" && id === this.script.abilityId
            ? this.script
            : undefined,
          allVfxScripts: () => this.mode === "runtime" ? [this.script] : [],
        });
    this.runtimeVfx?.installShakeSink((amplitude, durationMs) => {
      this.cameraRig.addShake(amplitude, durationMs);
    });
    this.reset();
    // Shader compilation and framebuffer hide/show proof share one Scene and
    // therefore cannot be run concurrently. Parallel actor loads let one's
    // hidden baseline land inside the other's shown frame, and two cold PBR
    // compiles also contend for the same RGBD helper. Keep ordinary content
    // preloads parallel, but certify the two visible bodies in a stable order.
    const actors = this.actors;
    this.actorReady = (async (): Promise<void> => {
      await this.loadActor(actors.caster);
      await this.loadActor(actors.target);
      for (const actor of this.summonActors.values()) await this.loadActor(actor);
    })();
    // An imperative batch audit can arrive in the render/effect gap after the
    // Stage exists but before React's setContent effect runs. Leaving the
    // default Promise.resolve() here allowed that first audit to photograph
    // the target's coloured collision capsule while actorReady was still
    // loading. The constructor snapshot is already valid content, so its
    // minimum readiness latch must include both actors and the ground.
    this.contentReady = Promise.all([this.groundReady, this.actorReady]).then(() => undefined);
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
      // Scene readiness does not include stopped ParticleSystem textures, so
      // explicitly wait for these exact pool entries. Otherwise the audit can
      // consume a front-loaded burst while its image is still decoding and
      // report 0 pixels, even though a later evidence seek draws correctly.
      await this.waitForParticleTexturesReady(warmDocs.map((doc) => doc.id));
      await this.waitForSceneReadyBounded();
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
    }, EVIDENCE_SEEK_PRIMER_MS);
  }

  /**
   * Evidence cannot photograph the asynchronous primer used by interactive
   * scrubbing. Await the exact same cold-upload window, material compilation
   * and authoritative replay before reading the framebuffer.
   */
  private async seekForEvidence(targetMs: number): Promise<void> {
    const target = Math.max(0, targetMs);
    clearTimeout(this.seekTimer);
    const seq = ++this.seekSeq;
    if (target <= 0 || !this.runtimeVfx) {
      this.replayTo(target, true);
      return;
    }
    this.replayTo(target, false);
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, EVIDENCE_SEEK_PRIMER_MS));
    await this.finishPrimedSeek(target, seq);
  }

  private async finishPrimedSeek(targetMs: number, seq: number): Promise<void> {
    // A modelFx material with a per-instance tint/alpha only exists after the
    // primer replay. Wait for that exact clone, compile it while it is still
    // alive, then reset once more: ModelFxRig reuses the prepared instance from
    // its pool, so the authoritative frame cannot be the opaque white Babylon
    // placeholder seen by the earlier screenshot audit.
    await this.waitForSceneReadyBounded();
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

  /** Frame review through the real config-backed CameraRig, never a Forge-only camera. */
  setEvidenceFraming(framing: "gameplay" | "detail"): void {
    this.evidenceFraming = framing;
    this.cameraRig.homeZoom();
    if (framing === "detail") {
      // A detail frame is a readable review crop, not the most extreme zoom.
      // Driving CameraRig into minDolly put the camera inside large capes and
      // wings (Avalon became a black half-screen). Derive a moderate 55% point
      // from Main's live config so min/default/wheel changes stay authoritative.
      const cameraDoc = Configs.tryGet(CAMERA_DOC_ID);
      const limits = resolveCamera(cameraDoc?.schema === "config.camera@1" ? cameraDoc : undefined);
      const detailDolly = limits.minDolly + (limits.defaultDolly - limits.minDolly) * 0.55;
      this.cameraRig.zoomBy((detailDolly - limits.defaultDolly) / limits.wheelStep);
    }
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
    this.assertActorsReadyForEvidence();
    await this.waitForSceneReadyBounded();
    await this.waitForVisibleGroundDecalTextures();
    this.renderScene();
    this.renderScene();
    const width = this.engine.getRenderWidth();
    const height = this.engine.getRenderHeight();
    const rgba = (await this.engine.readPixels(0, 0, width, height)) as Uint8Array;
    let frameAudit = auditBackdropFrame(rgba, width, height);
    if (frameAudit.unsafe) {
      const activeParticleSuspects = this.activeParticleSuspects();
      // A same-frame Telegraph A/B separates a broken texture carrier from a
      // receipted but visually grid-like targeting pattern. The latter remains
      // visible in the evidence and receives a high-severity art issue; only a
      // carrier that survives removal is a technical framebuffer blocker.
      const captureAtMs = this.nowMs;
      const telegraphGridCandidate = frameAudit.diagnosticCheckerShare > 0;
      const comparison = await this.runtimeVfx!.telegraphs228.withHiddenForAudit(async () => {
        this.renderScene();
        this.renderScene();
        const withoutTelegraph = auditBackdropFrame(
          (await this.engine.readPixels(0, 0, width, height)) as Uint8Array,
          width,
          height,
        );
        const withoutVerifiedLayers = withoutTelegraph.unsafe
          ? await this.auditWithoutVerifiedPresentationLayers(async () => {
          this.renderScene();
          this.renderScene();
          return auditBackdropFrame(
            (await this.engine.readPixels(0, 0, width, height)) as Uint8Array,
            width,
            height,
          );
          })
          : null;
        return { withoutTelegraph, withoutVerifiedLayers };
      });
      const { withoutTelegraph, withoutVerifiedLayers } = comparison;
      if (withoutTelegraph.unsafe && withoutVerifiedLayers?.unsafe !== false) {
        const suspects = this.backdropMeshSuspects();
        throw new Error(
          `${frameAudit.reason ?? "目前關鍵格含有不安全的貼圖底板"} @ ${captureAtMs}ms` +
          (suspects.length > 0 ? `；可疑載體：${suspects.join(" | ")}` : ""),
        );
      }
      frameAudit = {
        ...frameAudit,
        unsafe: false,
        reason: (withoutTelegraph.unsafe
          ? "透明／混合收據與同格剝離已定位呈現層異常；不是未知載體，但玩家畫面仍須人工裁決"
          : telegraphGridCandidate
          ? "Telegraph 格狀圖樣已通過同格剝離；不是遺失貼圖，但玩家畫面仍須人工裁決"
          : "施法範圍 Telegraph 已通過同格剝離驗證；素材層未檢出底板") +
          (activeParticleSuspects.length > 0
            ? `；活動粒子：${activeParticleSuspects.join(" | ")}`
            : ""),
      };
      this.renderScene();
      this.renderScene();
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
      framing: this.evidenceFraming,
      frameAudit,
    };
  }

  /** Deterministic batch-proof entrypoint: seek, let the GPU present, capture. */
  async captureVisualEvidenceAt(
    atMs: number,
    label: string,
    framing: "gameplay" | "detail" = "gameplay",
  ): Promise<VfxVisualEvidenceFrame> {
    this.setEvidenceFraming(framing);
    await this.seekForEvidence(atMs);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return this.captureVisualEvidence(label);
  }

  /**
   * Capture the exact failed framebuffer without weakening the approval gate.
   *
   * The ordinary evidence method must throw on an unsafe carrier or unresolved
   * actor.  A 46-case batch still needs the bad pixels as durable evidence, so
   * this diagnostic-only path waits for all bounded loaders, renders the live
   * scene and records the same audit fields without claiming review eligibility.
   */
  async captureDiagnosticEvidenceAt(atMs: number, label: string): Promise<VfxVisualEvidenceFrame> {
    await Promise.allSettled([this.contentReady, this.actorReady, this.groundReady]);
    const exactMs = Math.max(0, atMs);
    // Do not use public seek() here: its cold-GPU primer intentionally commits
    // the authoritative replay from a later timer. A diagnostic capture could
    // therefore photograph the primer frame instead of audit.worstAtMs.
    this.replayTo(exactMs, false);
    await this.waitForVisibleGroundDecalTextures();
    this.replayTo(exactMs, false);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    this.renderScene();
    this.renderScene();
    const width = this.engine.getRenderWidth();
    const height = this.engine.getRenderHeight();
    const rgba = (await this.engine.readPixels(0, 0, width, height)) as Uint8Array;
    const frameAudit = auditBackdropFrame(rgba, width, height);
    const dataUrl = this.canvas.toDataURL("image/webp", 0.82);
    if (!dataUrl.startsWith("data:image/webp;base64,")) {
      throw new Error("瀏覽器無法產生 WebP 診斷畫面");
    }
    return {
      label: label.trim() || `${(this.nowMs / 1000).toFixed(3)}秒 · 失敗診斷`,
      dataUrl,
      atMs: Math.round(this.nowMs),
      view: this.sideReviewView ? "side" : "top",
      framing: this.evidenceFraming,
      diagnosticOnly: true,
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
    await this.waitForSceneReadyBounded();
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
    await this.waitForSceneReadyBounded();
    this.renderScene();
    return { brightControl: control, darkBright: dark.bright, darkLit: dark.lit };
  }

  /**
   * Run the unsaved draft through the FULL shipped presentation and inspect
   * real GPU pixels. Saving calls this even while the author is using the
   * script-only isolation view, so ability art, projectile art and modelFx
   * cannot bypass the source-asset gate and surprise the actual match.
   */
  async auditBackdropTimeline(
    durationMs: number,
    auditMode: VfxForgeStageMode = "runtime",
  ): Promise<BackdropTimelineAudit> {
    const restoreMode = this.mode;
    const restoreMs = this.nowMs;
    const startedAt = performance.now();
    let gpuReadbacks = 0;
    const modeChanged = restoreMode !== auditMode;
    this.mode = auditMode;
    if (modeChanged) this.runtimeVfx?.invalidateVfxScripts();
    try {
      await this.contentReady;
      this.assertActorsReadyForEvidence();
      if (auditMode === "runtime") await this.preloadRuntimeAssets(this.ability);
      await this.groundReady;
      await this.waitForSceneReadyBounded();
      this.reset();
      const stopAt = Math.max(0, durationMs);
      let sampledFrames = 0;
      let peakParticleCount = 0;
      let peakParticleCountBeforeIsolation = 0;
      let peakSystemCount = 0;
      let peakStartedSystemCount = 0;
      let peakManualEmitCount = 0;
      let peakPresentationPixelShare = 0;
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
      const readFramebuffer = async (): Promise<BackdropFrameAudit> => {
        this.renderScene();
        this.renderScene();
        const width = this.engine.getRenderWidth();
        const height = this.engine.getRenderHeight();
        const rgba = (await this.engine.readPixels(0, 0, width, height)) as Uint8Array;
        gpuReadbacks++;
        return auditBackdropFrame(rgba, width, height);
      };
      // Opaque champion bodies and the arena floor are legitimate scene
      // geometry, not VFX texture carriers. Audit the presentation layer with
      // those three roots hidden; actor texture collapse has its own stricter
      // per-GLB framebuffer gate in loadActor().
      const read = async (): Promise<BackdropFrameAudit> => {
        const actors = this.allActors();
        const actorStates = actors.map((actor) => ({
          body: actor.bodyRoot?.isEnabled() ?? false,
          fallback: actor.fallback.isEnabled(),
        }));
        const ground = this.scene.meshes.filter((mesh) => mesh.name.startsWith("zone-0-"));
        const groundStates = ground.map((mesh) => mesh.isEnabled());
        for (const actor of actors) {
          actor.bodyRoot?.setEnabled(false);
          actor.fallback.setEnabled(false);
        }
        ground.forEach((mesh) => mesh.setEnabled(false));
        try {
          return await readFramebuffer();
        } finally {
          actors.forEach((actor, index) => {
            actor.bodyRoot?.setEnabled(actorStates[index]!.body);
            actor.fallback.setEnabled(actorStates[index]!.fallback);
          });
          ground.forEach((mesh, index) => mesh.setEnabled(groundStates[index]!));
          // Do not repaint the actor layer after every audit sample. The next
          // sample immediately hides it again, and final restoration replays
          // the requested UI frame. This removes one full GPU render per
          // sample without changing any simulated update or readback.
        }
      };
      while (true) {
        await this.waitForVisibleGroundDecalTextures();
        // Babylon's ParticleSystem derives its animation ratio from a real
        // browser frame. A tight readPixels loop can keep that ratio at zero:
        // the emitter is started and manualEmitCount is set, yet no live
        // particle is ever materialised. One rAF per 15 Hz audit sample keeps
        // the renderer truthful without replaying the whole skill in real time.
        await this.waitForBrowserFrame();
        peakParticleCountBeforeIsolation = Math.max(
          peakParticleCountBeforeIsolation,
          this.scene.particleSystems.reduce((sum, system) => sum + system.getActiveCount(), 0),
        );
        peakStartedSystemCount = Math.max(
          peakStartedSystemCount,
          this.scene.particleSystems.filter((system) => system.isStarted()).length,
        );
        peakManualEmitCount = Math.max(
          peakManualEmitCount,
          this.scene.particleSystems.reduce((sum, system) => sum + system.manualEmitCount, 0),
        );
        let result = await read();
        peakPresentationPixelShare = Math.max(
          peakPresentationPixelShare,
          result.presentationPixelShare ?? 0,
        );
        peakParticleCount = Math.max(
          peakParticleCount,
          this.scene.particleSystems.reduce((sum, system) => sum + system.getActiveCount(), 0),
        );
        peakSystemCount = Math.max(peakSystemCount, this.scene.particleSystems.length);
        if (result.unsafe) {
          // Distinguish a Telegraph-owned grid from a carrier that survives
          // the A/B. Preserve the original checker ratio so the batch report
          // never turns a visually objectionable pattern into a clean score.
          const frameAtMs = this.nowMs;
          const telegraphGridCandidate = result.diagnosticCheckerShare > 0;
          const comparison = await this.runtimeVfx!.telegraphs228.withHiddenForAudit(async () => {
            const withoutTelegraph = await read();
            const withoutVerifiedLayers = withoutTelegraph.unsafe
              ? await this.auditWithoutVerifiedPresentationLayers(read)
              : null;
            return { withoutTelegraph, withoutVerifiedLayers };
          });
          const { withoutTelegraph, withoutVerifiedLayers } = comparison;
          if (!withoutTelegraph.unsafe || withoutVerifiedLayers?.unsafe === false) {
            result = {
              ...result,
              unsafe: false,
              reason: withoutTelegraph.unsafe
                ? "透明／混合收據與同格剝離已定位呈現層異常；不是未知載體，但玩家畫面仍須人工裁決"
                : telegraphGridCandidate
                ? "Telegraph 格狀圖樣已通過同格剝離；不是遺失貼圖，但玩家畫面仍須人工裁決"
                : "施法範圍 Telegraph 已通過同格剝離驗證；素材層未檢出底板",
            };
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
        // Keep expensive framebuffer readback at 15 Hz, but render every
        // simulated 60 Hz frame. Babylon consumes `manualEmitCount` and
        // advances imported animation groups during Scene.render(); skipping
        // three renders made the audit report zero particles while the exact
        // evidence seek (which renders every frame) visibly drew the effect.
        for (let frame = 0; frame < 4 && this.nowMs < stopAt; frame++) {
          this.advanceFrame(true, Math.min(STEP_MS, stopAt - this.nowMs), false);
        }
      }
      const audit: BackdropTimelineAudit = {
        safe: !worst.unsafe,
        autoVisualScore: automaticVisualHygieneScore(worst),
        sampledFrames,
        peakParticleCount,
        peakParticleCountBeforeIsolation,
        peakSystemCount,
        peakStartedSystemCount,
        peakManualEmitCount,
        peakPresentationPixelShare,
        presentationEventCount: this.presentationEventCount,
        acceptedVfxEventCount: this.acceptedVfxEventCount,
        semanticActionCount: this.semanticActionCount,
        worstAtMs,
        worst,
        suspects,
        elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
        gpuReadbacks,
      };
      return audit;
    } finally {
      this.mode = restoreMode;
      if (modeChanged) this.runtimeVfx?.invalidateVfxScripts();
      this.seek(restoreMs);
    }
  }

  /**
   * Separate asset safety from art direction on the exact failed frame.
   * Decals must have a decoded alpha texture, procedural rings must stay
   * textureless, and particles are removable only after the exact draft refs
   * passed AssetSafetyGate. If removing those layers does not clear the frame,
   * an opaque model/material carrier remains and the proof stays blocked.
   */
  private async auditWithoutVerifiedPresentationLayers(
    read: () => Promise<BackdropFrameAudit>,
  ): Promise<BackdropFrameAudit | null> {
    const decals = this.scene.meshes.filter(
      (mesh) => mesh.name === "vfx-decal" && mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0,
    );
    const rings = this.scene.meshes.filter(
      (mesh) => (mesh.name === "vfx-ring" || /^champ-\d+-(?:teamring|selfring)$/u.test(mesh.name)) &&
        mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0,
    );
    const allParticleSystems = [...this.scene.particleSystems];
    const activeParticles = allParticleSystems.filter((system) => system.getActiveCount() > 0);
    if (decals.length === 0 && rings.length === 0 && activeParticles.length === 0) return null;
    const verifiedDecals = decals.every((mesh) => {
      const material = mesh.material;
      if (!(material instanceof StandardMaterial)) return false;
      const texture = material.diffuseTexture;
      return texture !== null && texture.isReady() && texture.hasAlpha && material.useAlphaFromDiffuseTexture;
    });
    const verifiedRings = rings.every((mesh) => (mesh.material?.getActiveTextures().length ?? 0) === 0);
    const verifiedParticles = activeParticles.length === 0 || (
      this.assetRefsVerifiedSafe && activeParticles.every((system) => system.particleTexture?.isReady() === true)
    );
    if (!verifiedDecals || !verifiedRings || !verifiedParticles) return null;
    const overlays = [...decals, ...rings];
    const states = overlays.map((mesh) => mesh.isEnabled());
    overlays.forEach((mesh) => mesh.setEnabled(false));
    const activeSet = new Set(activeParticles);
    this.scene.particleSystems.splice(
      0,
      this.scene.particleSystems.length,
      ...allParticleSystems.filter((system) => !activeSet.has(system)),
    );
    try {
      return await read();
    } finally {
      this.scene.particleSystems.splice(0, this.scene.particleSystems.length, ...allParticleSystems);
      overlays.forEach((mesh, index) => mesh.setEnabled(states[index]!));
      this.renderScene();
    }
  }

  /**
   * Deterministic evidence for a presentation-layer washout. Names only live
   * particle systems; pooled but idle systems cannot have changed this frame.
   * The receipt deliberately records texture/blend/count rather than guessing
   * which artistic parameter is wrong.
   */
  private activeParticleSuspects(): string[] {
    return this.scene.particleSystems
      .map((system) => ({
        system,
        count: system.getActiveCount(),
      }))
      .filter(({ count }) => count > 0)
      .sort((a, b) => b.count - a.count || a.system.name.localeCompare(b.system.name))
      .slice(0, 8)
      .map(({ system, count }) => {
        const texture = system.particleTexture?.name?.split("/").pop() ?? "無貼圖";
        return `${system.name} · ${count}顆 · blend=${system.blendMode} · ${texture}`;
      });
  }

  /**
   * A paused scrub has no game loop to finish a newly spawned decal texture.
   * Pump a short, bounded render window before the framebuffer verdict; a
   * texture that is still pending afterwards is intentionally left unsafe.
   */
  private async waitForVisibleGroundDecalTextures(): Promise<void> {
    const textures = () => this.scene.meshes
      // VfxSystem keeps pooled decal meshes enabled after their visible life
      // ends. Waiting on every pooled texture made a long combo pay the full
      // 750 ms cold-texture budget at every audit sample even though no decal
      // was on screen. Only a carrier that can affect this framebuffer may
      // delay the verdict; dormant pool entries are irrelevant by definition.
      .filter((mesh) => mesh.name === "vfx-decal" && mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0)
      .map((mesh) => mesh.material)
      .filter((material): material is StandardMaterial => material instanceof StandardMaterial)
      .map((material) => material.diffuseTexture)
      .filter((texture): texture is NonNullable<typeof texture> => texture !== null);
    const deadline = Date.now() + ACTOR_READY_BUDGET_MS;
    while (textures().some((texture) => !texture.isReady()) && Date.now() < deadline) {
      this.renderScene();
      await this.waitForBrowserFrame();
    }
  }

  /**
   * Stopped, pre-warmed particle systems are absent from Scene readiness.
   * Their textures are nevertheless required before a deterministic burst:
   * VFX docs emit every particle on the impact frame and cannot recover a
   * burst that happened before image decode/upload completed.
   */
  private async waitForParticleTexturesReady(docIds: readonly string[]): Promise<void> {
    if (docIds.length === 0) return;
    const names = new Set(docIds.map((id) => `vfx-${id}`));
    const targetSystems = () => this.scene.particleSystems
      .filter((system) => names.has(system.name));
    const targetTextures = () => targetSystems()
      .map((system) => system.particleTexture)
      .filter((texture): texture is NonNullable<typeof texture> => texture !== null);
    const deadline = Date.now() + ACTOR_SHADER_BUDGET_MS;
    let systems = targetSystems();
    let textures = targetTextures();
    while (
      (textures.some((texture) => !texture.isReady()) ||
        systems.some((system) => !system.isReady())) &&
      Date.now() < deadline &&
      !this.disposed &&
      !this.scene.isDisposed
    ) {
      this.renderScene();
      await this.waitForBrowserFrame();
      systems = targetSystems();
      textures = targetTextures();
    }
    const pending = textures.filter((texture) => !texture.isReady());
    const pendingSystems = systems.filter((system) => !system.isReady());
    if (pending.length > 0 || pendingSystems.length > 0) {
      throw new Error(
        `VFX 粒子貼圖 ${textures.length - pending.length}/${textures.length}、` +
        `shader ${systems.length - pendingSystems.length}/${systems.length} 在 ${ACTOR_SHADER_BUDGET_MS}ms 內可繪`,
      );
    }

    // Texture/shader readiness alone is insufficient for Babylon's stopped
    // ParticleSystem: its first manual burst also creates the live particle
    // buffers. Prime one particle per exact pool entry, prove that it becomes
    // active, then return the systems to a clean reusable state. This is a
    // renderer warm-up only; the authoritative skill timeline still begins at
    // zero and remains the sole source of review evidence.
    for (const system of systems) {
      system.stop();
      system.reset();
      system.start();
      system.manualEmitCount = 1;
    }
    const emissionDeadline = Date.now() + ACTOR_READY_BUDGET_MS;
    while (
      systems.some((system) => system.getActiveCount() === 0) &&
      Date.now() < emissionDeadline &&
      !this.disposed &&
      !this.scene.isDisposed
    ) {
      this.renderScene();
      await this.waitForBrowserFrame();
    }
    const cold = systems.filter((system) => system.getActiveCount() === 0);
    for (const system of systems) {
      system.stop();
      system.reset();
    }
    if (cold.length > 0) {
      throw new Error(
        `VFX 粒子緩衝只有 ${systems.length - cold.length}/${systems.length} 個在 ${ACTOR_READY_BUDGET_MS}ms 內完成暖機`,
      );
    }
  }

  /** Names the largest visible non-arena meshes when a framebuffer audit fails. */
  private backdropMeshSuspects(): string[] {
    const eye = this.scene.activeCamera?.globalPosition;
    if (!eye) return [];
    const actorMeshes = new Set<AbstractMesh>();
    for (const actor of this.allActors()) {
      actorMeshes.add(actor.fallback);
      for (const mesh of actor.bodyRoot?.getChildMeshes(false) ?? []) actorMeshes.add(mesh);
    }
    return this.scene.meshes
      .filter((mesh) => mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0)
      .filter((mesh) => !mesh.name.startsWith("zone-0-") && mesh !== this.groundFloor)
      .filter((mesh) => !actorMeshes.has(mesh))
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
        const textures = mesh.material?.getActiveTextures() ?? [];
        const textureState = textures.length === 0
          ? "無貼圖"
          : textures.map((texture) => `${texture.name || "貼圖"}:${texture.isReady() ? "ready" : "pending"}/${texture.hasAlpha ? "alpha" : "opaque"}`).join(",");
        return {
          score,
          label: `${chain.join("/")} · r/d=${score.toFixed(2)} · ${mesh.material?.name ?? "無材質"} · ${textureState}`,
        };
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
    // Scene teardown waits for in-flight GLB/shader work, but the screen flash
    // is a DOM layer. Clear it now so a mode/fixture switch cannot leave the
    // retired preview painted over its replacement during that grace window.
    this.runtimeVfx?.screenFxLayer.resetForRound();
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
    for (const actor of this.allActors()) this.disposeActor(actor);
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
    simEntityId: number | undefined,
    viewEntityId: number,
    teamId: number,
    active = true,
  ): ForgeActor {
    const mesh = MeshBuilder.CreateCapsule(name, { height: 1.7, radius: 0.38 }, this.scene);
    mesh.position.set(position.x, 0.85, position.z);
    const mat = new StandardMaterial(`${name}-mat`, this.scene);
    mat.disableLighting = true;
    mat.diffuseColor = Color3.Black();
    mat.emissiveColor = color.scale(0.72);
    mesh.material = mat;
    mesh.setEnabled(active);
    return {
      role,
      simEntityId,
      viewEntityId,
      teamId,
      fallback: mesh,
      position: { ...position },
      facing,
      champion,
      view: null,
      bodyRoot: null,
      glbRoot: null,
      fallbackForced: false,
      active,
      idleAfterMs: 0,
      hiddenUntilMs: 0,
    };
  }

  /**
   * Build every summoned body up front from the real Sim event trace so its
   * GLB can be certified before a deterministic seek reaches summonSpawn.
   * The event remains the sole lifetime authority; preloading never makes the
   * body visible early.
   */
  private prepareSummonActors(): void {
    for (const item of this.schedule) {
      if (item.event.type !== "summonSpawn") continue;
      const data = item.event.data;
      const id = Number(data.id);
      if (!Number.isFinite(id) || this.summonActors.has(id)) continue;
      const championId = String(data.championId ?? "");
      const champion = Champions.tryGet(championId as never) ?? null;
      if (!champion) {
        this.visualAssetIssues.add(`召喚實體 ${id} 的英雄來源 ${championId || "(空)"} 無法解析`);
        continue;
      }
      const x = Number(data.x);
      const z = Number(data.z);
      const teamId = Number(data.teamId);
      const actor = this.makeActor(
        "summon",
        `召喚物 ${id}`,
        { x: Number.isFinite(x) ? x : this.homePose.caster.x, z: Number.isFinite(z) ? z : this.homePose.caster.z },
        { x: 0, z: 1 },
        new Color3(0.58, 0.42, 0.92),
        champion,
        id,
        9_100_000 + id,
        Number.isFinite(teamId) ? teamId : 0,
        false,
      );
      this.summonActors.set(id, actor);
    }
  }

  private allActors(): ForgeActor[] {
    return [this.actors.caster, this.actors.target, ...this.summonActors.values()];
  }

  private setActorEnabled(actor: ForgeActor, enabled: boolean): void {
    actor.active = enabled;
    actor.bodyRoot?.setEnabled(enabled && !actor.fallbackForced && actor.hiddenUntilMs <= this.nowMs);
    actor.fallback.setEnabled(enabled && (actor.bodyRoot === null || actor.fallbackForced) && actor.hiddenUntilMs <= this.nowMs);
  }

  private setActorStatus(actor: ForgeActor, value: string): void {
    if (actor.role !== "summon") this.actorStatus[actor.role] = value;
  }

  private requestColdActorRetry(actor: ForgeActor): boolean {
    return actor.role !== "summon" && this.onColdAssetRetry?.(actor.role) === true;
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
    this.setActorStatus(actor, `載入 ${champion.name}…`);
    this.emitOverlay("載入 3D 角色…");
    try {
      const doc = await this.fetchDoc<ModelDoc>("models", champion.modelKey);
      const resolved = resolveAppearance(champion.id, champion, doc);
      if (!resolved.ok) throw new Error(`resolved-appearance@1: ${resolved.failure.kind}`);
      const appearance = resolved.appearance;
      if (this.disposed || this.scene.isDisposed) {
        return;
      }
      const entityId = actor.viewEntityId;
      const view = new ChampionView(this.scene, entityId, champion.modelKey, actor.teamId);
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
        this.setActorStatus(actor, `⚠ ${issue}，已顯示替身並封鎖視覺驗收`);
        this.emitOverlay("3D 模型未就緒，候選不得送審");
        return;
      }
      actor.glbRoot = glbRoot;
      const visible = glbRoot.getChildMeshes(false);
      // EntityViewRegistry normally owns the alive/in-range root writer in a
      // match. Forge mounts ChampionView directly, so it must establish that
      // same initial state before any script-driven hideBody cue is replayed.
      // This toggles only the two presentation roots; hiddenPrimitives remain
      // disabled on their own mesh nodes.
      view.root.setEnabled(true);
      glbRoot.setEnabled(true);
      // Use Main's champion-id resolver instead of treating the champion doc
      // itself as a ModelTint. Shared models can carry per-champion vertex
      // colours, so the old call made Forge disagree with the actual match.
      applyModelTint(glbRoot, championTintForId(champion.id) ?? null);
      // A WC3-imported GLB can drive geoset visibility from its Stand track.
      // Asset adoption alone does not sample that track: the real match calls
      // ChampionView.update() on the next render tick, while a paused Forge at
      // 0 ms used to jump straight to framebuffer proof and see zero body
      // pixels. Prime the same living/idle state before shader warm-up so the
      // proof measures the model the game would actually draw, not its
      // pre-animation import pose.
      const initialState = view.anim.update({ alive: true, moving: false }, this.nowMs);
      view.update(initialState, this.nowMs, STEP_MS);
      // A normal game render loop keeps feeding WebGL while Babylon's
      // KHR_parallel_shader_compile / RGBD helpers are pending. A paused Forge
      // used to await forceCompilationAsync with no render loop, so a cold PBR
      // body timed out and every later framebuffer proof measured 0 pixels.
      // Pump only through a bounded actor-specific compile; optional dormant
      // VFX resources are deliberately not part of this readiness boundary.
      await this.compileActorMaterialsWithRenderPump(visible);
      // The material was compiled by real scene renders above, through the
      // same path as a match. Match the shipped audition's ten-frame settle
      // window so a frame-zero review is a real model, not its bootstrap.
      await this.renderActorWarmupLoop(ACTOR_WARMUP_FRAMES, view);
      if (this.disposed || this.scene.isDisposed) return;
      // A direct route can mount the canvas before ResizeObserver and the
      // browser texture upload complete. One zero-delta read used to condemn
      // both perfectly healthy actors for the rest of the session. Resize and
      // retry the real framebuffer across bounded render turns; the final
      // result remains fail-closed.
      this.engine.resize();
      // ResizeObserver may replay a stale scrub while the GLB is still
      // adopting. Readiness is about the living source model, not a transient
      // hideBody cue from that replay; the selected frame is replayed again
      // after certification below.
      actor.bodyRoot?.setEnabled(true);
      glbRoot.setEnabled(true);
      let visibility = await this.measureActorVisibility(actor);
      for (let attempt = 1; !visibility.visible && attempt < ACTOR_VISIBILITY_RETRIES; attempt++) {
        // Layout/texture upload can still land between the warm loop and the
        // readback. Retry a few nearby frames; the authored Stand progression
        // itself already happened in renderActorWarmupLoop above.
        await this.renderWarmupFrames(ACTOR_VISIBILITY_RETRY_FRAMES);
        visibility = await this.measureActorVisibility(actor);
      }
      const texturedMeshes = visible.filter((mesh) =>
        Boolean((mesh.material as { albedoTexture?: unknown } | null)?.albedoTexture),
      ).length;
      if (texturedMeshes > 0 && visibility.nearWhiteShare >= 0.8) {
        const issue = `${champion.name} · ${appearance.modelKey} 的貼圖模型在 framebuffer 退化為 ${(visibility.nearWhiteShare * 100).toFixed(1)}% 純白`;
        if (this.requestColdActorRetry(actor)) {
          this.visualAssetIssues.add(`${issue}，正在執行一次冷載入重試`);
          this.setActorStatus(actor, `↻ ${issue}，重建預覽場景…`);
          this.emitOverlay("3D 貼圖冷載入重試中，暫停視覺驗收");
          return;
        }
        actor.fallbackForced = true;
        actor.bodyRoot.setEnabled(false);
        actor.fallback.setEnabled(true);
        this.visualAssetIssues.add(issue);
        this.setActorStatus(actor, `⚠ ${issue}，已顯示替身並封鎖視覺驗收`);
        this.emitOverlay("3D 模型貼圖不可辨識，候選不得送審");
        return;
      }
      if (!visibility.visible) {
        const retryIssue = `${champion.name} · ${appearance.modelKey} 3D 模型在真實 framebuffer 僅改變 ${visibility.changedPixels} 像素`;
        if (this.requestColdActorRetry(actor)) {
          this.visualAssetIssues.add(`${retryIssue}，正在執行一次冷載入重試`);
          this.setActorStatus(actor, `↻ ${retryIssue}，重建預覽場景…`);
          this.emitOverlay("3D 模型冷載入重試中，暫停視覺驗收");
          return;
        }
        // Do not replace a missing model with an optimistic fake.  The coloured
        // capsule is an explicitly marked interaction fallback, while the
        // source issue prevents visual evidence from becoming reviewable.
        const preFallbackRoots =
          `view=${actor.bodyRoot?.isEnabled() ? "on" : "off"}/glb=${actor.glbRoot?.isEnabled() ? "on" : "off"}`;
        const preFallbackMeshState = visible
          .slice(0, 5)
          .map((mesh) =>
            `${mesh.name}:local-${mesh.isEnabled(false) ? "on" : "off"}/tree-${mesh.isEnabled() ? "on" : "off"}`,
          )
          .join(", ");
        const adoptedRootState = glbRoot
          .getChildren()
          .slice(0, 5)
          .map((node) => `${node.name}:local-${node.isEnabled(false) ? "on" : "off"}/tree-${node.isEnabled() ? "on" : "off"}`)
          .join(", ");
        actor.fallbackForced = true;
        actor.bodyRoot.setEnabled(false);
        actor.fallback.setEnabled(true);
        const meshState = visible
          .slice(0, 5)
          .map((mesh) => `${mesh.name}:${mesh.isEnabled() ? "on" : "off"}/${mesh.isVisible ? "visible" : "hidden"}/v${mesh.visibility.toFixed(2)}`)
          .join(", ");
        const materials = visible.filter((mesh) => mesh.material !== null);
        const readyMaterials = materials.filter((mesh) => mesh.material?.isReady(mesh) === true).length;
        const textures = new Set(materials.flatMap((mesh) => mesh.material?.getActiveTextures() ?? []));
        const readyTextures = [...textures].filter((texture) => texture.isReady()).length;
        glbRoot.computeWorldMatrix(true);
        const bounds = glbRoot.getHierarchyBoundingVectors(true);
        const issue = `${champion.name} · ${appearance.modelKey} 3D 模型在真實 framebuffer 僅改變 ${visibility.changedPixels} 像素` +
          `（材質 ${readyMaterials}/${materials.length} ready · 貼圖 ${readyTextures}/${textures.size} ready · ` +
          `roots ${preFallbackRoots} · ` +
          `adopted ${adoptedRootState || "0 roots"} · pre ${preFallbackMeshState || "0 meshes"} · ` +
          `bbox ${bounds.min.x.toFixed(1)},${bounds.min.y.toFixed(1)},${bounds.min.z.toFixed(1)} → ` +
          `${bounds.max.x.toFixed(1)},${bounds.max.y.toFixed(1)},${bounds.max.z.toFixed(1)} · ${meshState || "0 meshes"}）`;
        this.visualAssetIssues.add(issue);
        this.setActorStatus(actor, `⚠ ${issue}，已顯示替身並封鎖視覺驗收`);
        this.emitOverlay("3D 模型不可辨識，候選不得送審");
        return;
      }
      this.setActorStatus(actor,
        `${appearance.isStandIn ? "⚠ 共用替身 · " : ""}${champion.name} · ${appearance.modelKey} · ` +
        `${visible.length} meshes · ` +
        `×${(view.declaredScale ?? 0).toFixed(3)} · Main ChampionView · 材質正常`);
      this.setActorEnabled(actor, actor.active);
      // The script may already be scrubbed past a pulse while this GLB loaded.
      this.seek(this.nowMs);
    } catch (error) {
      const reason = String(error);
      const retryableColdGpuFailure =
        /3D 角色(?:貼圖|材質)只有/.test(reason) ||
        reason.includes("Operation timed out after maximum retries");
      if (!this.disposed && retryableColdGpuFailure && this.requestColdActorRetry(actor)) {
        this.visualAssetIssues.add(`${champion.name} · ${reason}，正在執行有界冷載入重試`);
        this.setActorStatus(actor, `↻ ${champion.name} · ${reason}，重建預覽場景…`);
        this.emitOverlay("3D 材質冷載入重試中，暫停視覺驗收");
        return;
      }
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
      const issue = `${champion.name} · 3D 載入失敗：${reason}`;
      this.visualAssetIssues.add(issue);
      this.setActorStatus(actor, `${champion.name} · 替身（載入失敗：${reason}）`);
      this.emitOverlay(`${champion.name} 3D 載入失敗，保留碰撞替身：${reason}`);
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
    const summon = this.summonActors.get(id);
    if (summon) return summon;
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
    this.presentationEventCount = 0;
    this.acceptedVfxEventCount = 0;
    this.semanticActionCount = 0;
    this.lastVfxAim = null;
    resetScriptedMoves();
    for (const actor of this.allActors()) {
      actor.idleAfterMs = 0;
      actor.hiddenUntilMs = 0;
      this.setActorEnabled(actor, actor.role !== "summon");
    }
    this.setActorPose(this.homePose);
    // Timeline replay keeps preloaded GLB containers and reuses pooled geometry;
    // clearing the container map here makes the first scrub frame an empty shell.
    this.modelRig.resetForRound();
    this.runtimeVfx?.resetForRound({ preserveOneShotPool: true });
    // The runtime player claims this same ledger before the default body
    // presentation is selected. Resetting a deterministic Forge replay must
    // therefore also clear expiring claims from the previous scrub.
    channelTakeover.reset();
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
      pulseAnim: (id, kind, pulse) => {
        this.semanticActionCount++;
        this.pulseActor(id, kind, pulse?.clipWindowMs);
      },
      hideBody: (id, ms) => {
        this.semanticActionCount++;
        this.hideActor(id, ms);
      },
      moveBody: (id, offset, ms, arc) => {
        this.semanticActionCount++;
        moveBodyFor(id, offset, ms, arc, this.nowMs);
      },
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
    for (const actor of this.allActors()) {
      if (!actor.active) continue;
      const id = actor.simEntityId;
      const offset = id === undefined ? null : scriptedOffset(id, this.nowMs);
      const x = actor.position.x + (offset?.x ?? 0);
      const z = actor.position.z + (offset?.z ?? 0);
      actor.fallback.position.set(x, 0.85 + (offset?.y ?? 0), z);
      const view = actor.view;
      if (!view) continue;
      view.setPose(x, z, actor.facing.x, actor.facing.z, offset?.y ?? 0);
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
      this.applySummonLifecycleEvent(item.event);
      if (this.mode === "runtime") {
        this.recordRuntimePresentationEvent(item.event);
        this.runtimeVfx?.handleEvent(item.event, item.atMs);
        // VfxScriptPlayer claims `replaces` synchronously while handling the
        // event. Default body motion must be selected afterwards, exactly as
        // Main's EntityViewRegistry does, or Forge would visually certify a
        // double animation that the runtime suppresses (or vice versa).
        this.pulseActorsFromRuntimeEvent(item.event, item.atMs);
      }
      else this.player.onEvent(item.event, item.atMs);
    }
  }

  /** The Sim trace, not an Editor timer, owns summoned-body visibility. */
  private applySummonLifecycleEvent(event: EventMessage): void {
    const data = event.data;
    const id = Number(data.id);
    const actor = Number.isFinite(id) ? this.summonActors.get(id) : undefined;
    if (!actor) return;
    if (event.type === "summonSpawn") {
      const x = Number(data.x);
      const z = Number(data.z);
      if (Number.isFinite(x) && Number.isFinite(z)) this.moveActor(actor, x, z);
      this.setActorEnabled(actor, true);
    } else if (event.type === "summonDespawn") {
      this.setActorEnabled(actor, false);
    }
  }

  /**
   * Character animation is owned by the shipped entity-view layer, not by
   * VfxSystem. The embedded Forge has no EntityViewRegistry, so it must bridge
   * the same real Sim events to the two preview actors or the models remain in
   * idle while the effects fire around them.
   */
  private pulseActorsFromRuntimeEvent(ev: EventMessage, nowMs: number): void {
    const data = ev.data;
    let trigger: PresentationTrigger | null = null;
    let ids: Partial<Record<PresentationActor, number>> = {};
    let windowMs = 520;
    if (ev.type === "abilityCast" && data.abilityId === this.ability.id) {
      trigger = "abilityCast";
      ids = { caster: Number(data.caster) };
      windowMs = Math.max(600, Math.round(Math.max(0, this.ability.castTimeSec ?? 0) * 1000));
    } else if (ev.type === "basicAttack") {
      trigger = "basicAttack";
      ids = { caster: Number(data.source) };
      windowMs = 420;
    } else if (ev.type === "comboStrike") {
      if (abilityIdOfAuthoredOrigin(String(data.origin ?? "")) !== this.ability.id) return;
      trigger = "comboStrike";
      ids = { caster: Number(data.caster), target: Number(data.victim) };
    } else if (ev.type === "projectileHit") {
      trigger = "projectileHit";
      ids = { target: Number(data.target) };
    } else if (ev.type === "hitImpact") {
      trigger = data.blocked === true ? "hitImpactBlocked" : "hitImpact";
      ids = { target: Number(data.target) };
    } else if (ev.type === "evade") {
      trigger = "evade";
      ids = { target: Number(data.target ?? data.evader) };
    } else if (ev.type === "reflectSuccess") {
      trigger = "reflectSuccess";
      ids = { target: Number(data.reflector) };
    } else if (ev.type === "displace" && data.phase === "start") {
      trigger = "displace";
      ids = { caster: Number(data.entity ?? data.caster) };
      const durationSec = Number(data.durationSec);
      if (Number.isFinite(durationSec) && durationSec > 0) windowMs = Math.round(durationSec * 1000);
    }
    if (!trigger) return;
    let applied = false;
    for (const rule of resolveAbilityPresentation(trigger)) {
      const id = ids[rule.actor];
      if (!Number.isFinite(id)) continue;
      if (!channelTakeover.heldBy(id!, rule.channel, nowMs)) {
        this.pulseActor(id!, rule.pulse, windowMs);
        applied = true;
      }
    }
    if (applied && ["comboStrike", "evade", "reflectSuccess", "displace"].includes(trigger)) {
      this.semanticActionCount++;
    }
  }

  /**
   * Count only presentation Main actually routes to the renderer. Generic
   * attack/cast probes are excluded: they prove the stimulus happened, not
   * that the passive proc has a distinct readable presentation.
   */
  private recordRuntimePresentationEvent(ev: EventMessage): void {
    if ([
      "vfxSpawn",
      "modelFxSpawn",
      "screenFlash",
      "screenShake",
      "floatingText",
      "projectileSpawn",
      "summonSpawn",
    ].includes(ev.type)) this.presentationEventCount++;
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
    if (this.mode === "script") {
      const authored = scriptVisualFocus(this.script, this.homePose);
      if (authored) return authored;
    }
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
    nearWhiteShare: number;
  }> {
    // `ChampionView.root` also carries a team ring and blob shadow. Those are
    // intentionally visible even when an adopted GLB fails to draw, so they
    // must never count as proof that the character body is renderable.
    const root = actor.glbRoot ?? actor.bodyRoot;
    const width = this.engine.getRenderWidth();
    const height = this.engine.getRenderHeight();
    if (!root || width <= 0 || height <= 0) {
      return { visible: true, changedPixels: 0, nearWhiteShare: 0 };
    }
    const read = async (): Promise<Uint8Array> => {
      this.renderScene();
      this.renderScene();
      return (await this.engine.readPixels(0, 0, width, height)) as Uint8Array;
    };
    const enabled = root.isEnabled();
    const peers = this.allActors().filter((candidate) => candidate !== actor);
    const peerStates = peers.map((peer) => ({
      body: peer.bodyRoot?.isEnabled() ?? false,
      fallback: peer.fallback.isEnabled(),
    }));
    const body = actor.bodyRoot;
    const bodyX = body?.position.x ?? 0;
    const bodyZ = body?.position.z ?? 0;
    // Side-review intentionally looks along the combat lane. At some cast
    // ranges the two silhouettes overlap completely, so leaving the peer on
    // screen makes a healthy body measure as zero changed pixels. Isolate the
    // actor under test; restore both peer presentations byte-for-byte below.
    for (const peer of peers) {
      peer.bodyRoot?.setEnabled(false);
      peer.fallback.setEnabled(false);
    }
    // Model readiness is independent of authored cast range. Bring the body to
    // the already-framed combat midpoint for this A/B read; otherwise a valid
    // long-range caster outside the current viewport is indistinguishable from
    // a non-rendering GLB. The real pose is restored before the next frame.
    if (body) {
      const focus = this.cameraFocus();
      body.position.x = focus.x;
      body.position.z = focus.z;
    }
    try {
      const shown = await read();
      root.setEnabled(false);
      try {
        const hidden = await read();
        let changedPixels = 0;
        let nearWhitePixels = 0;
        for (let i = 0; i + 2 < shown.length && i + 2 < hidden.length; i += 4) {
          const delta =
            Math.abs(shown[i]! - hidden[i]!) +
            Math.abs(shown[i + 1]! - hidden[i + 1]!) +
            Math.abs(shown[i + 2]! - hidden[i + 2]!);
          if (delta >= MIN_ACTOR_PIXEL_DELTA) {
            changedPixels++;
            const hi = Math.max(shown[i]!, shown[i + 1]!, shown[i + 2]!);
            const lo = Math.min(shown[i]!, shown[i + 1]!, shown[i + 2]!);
            if (lo >= 245 && hi - lo <= 8) nearWhitePixels++;
          }
        }
        return {
          visible: changedPixels >= MIN_ACTOR_VISIBLE_PIXELS,
          changedPixels,
          nearWhiteShare: changedPixels > 0 ? nearWhitePixels / changedPixels : 0,
        };
      } finally {
        root.setEnabled(enabled);
      }
    } finally {
      peers.forEach((peer, index) => {
        peer.bodyRoot?.setEnabled(peerStates[index]!.body);
        peer.fallback.setEnabled(peerStates[index]!.fallback);
      });
      if (body) {
        body.position.x = bodyX;
        body.position.z = bodyZ;
      }
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

  /**
   * Advance imported AnimationGroups through Babylon's real engine clock.
   * Calling scene.render() by hand does compile materials, but it does not
   * advance the Engine delta used by WC3 geoset-alpha Stand tracks. Main's
   * model-audition surface uses a short runRenderLoop for this exact boundary;
   * Forge mirrors it only during preload, then stops so scrubbing stays fully
   * deterministic.
   */
  private renderActorWarmupLoop(frames: number, view: ChampionView): Promise<void> {
    return new Promise<void>((resolve) => {
      let remaining = Math.max(1, Math.floor(frames));
      let actorNowMs = 0;
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeout);
        this.engine.stopRenderLoop(render);
        resolve();
      };
      const render = (): void => {
        if (this.disposed || this.scene.isDisposed) return finish();
        // GameApp advances ChampionView on every engine frame; a bare
        // scene.render() advances Babylon's AnimationGroups but omits the
        // view-level writer that selects/keeps the living Stand clip. Imported
        // geoset visibility can therefore remain on its disabled bootstrap
        // frame in a paused Forge even though the same model is visible in a
        // match. Mirror the real loop during this bounded preload window.
        actorNowMs += STEP_MS;
        const state = view.anim.update({ alive: true, moving: false }, actorNowMs);
        view.update(state, actorNowMs, STEP_MS);
        this.renderScene();
        remaining--;
        if (remaining <= 0) finish();
      };
      const timeout = globalThis.setTimeout(finish, Math.max(1_200, frames * 60));
      this.engine.runRenderLoop(render);
    });
  }

  /**
   * Compile imported actor materials by advancing the real WebGL scene. Do not
   * call `forceCompilationAsync()`: that helper compiles an artificial material
   * pass and can leave a paused PBR material on its white bootstrap binding.
   * A match compiles through `scene.render()`, so the authoring surface must use
   * that same path while it waits for textures and the final mesh variant.
   */
  private async compileActorMaterialsWithRenderPump(meshes: readonly AbstractMesh[]): Promise<void> {
    const materials = [...new Set(meshes.flatMap((mesh) => mesh.material ? [mesh.material] : []))];
    const textures = [...new Set(materials.flatMap((material) => material.getActiveTextures()))];
    const textureDeadline = Date.now() + ACTOR_SHADER_BUDGET_MS;
    // Compiling before an embedded GLB albedo texture is drawable produces a
    // valid PBR effect without the ALBEDO define. The later-ready texture then
    // sits on the material while the paused Forge keeps rendering the cached
    // all-white variant. Main's continuous loop naturally reaches this boundary
    // first; reproduce that ordering explicitly here.
    while (
      textures.some((texture) => !texture.isReady()) &&
      Date.now() < textureDeadline &&
      !this.disposed &&
      !this.scene.isDisposed
    ) {
      this.renderScene();
      await this.waitForBrowserFrame();
    }
    const readyTextures = textures.filter((texture) => texture.isReady()).length;
    if (readyTextures < textures.length) {
      throw new Error(`3D 角色貼圖只有 ${readyTextures}/${textures.length} 張在 ${ACTOR_SHADER_BUDGET_MS}ms 內可繪`);
    }
    for (const material of materials) material.markAsDirty(Material.TextureDirtyFlag);

    // Texture upload and final shader compilation are two independent GPU
    // boundaries. Sharing one deadline let a legitimate cold texture consume
    // the whole budget and left the now-dirty PBR variants zero frames to
    // compile. Give each phase the same bounded window; retries remain capped
    // by VfxForgePreview and failures still block visual evidence.
    const materialDeadline = Date.now() + ACTOR_SHADER_BUDGET_MS;
    const readyCount = (): number => meshes.filter((mesh) =>
      mesh.material === null || mesh.material.isReady(mesh),
    ).length;
    let ready = readyCount();
    while (
      ready < meshes.length &&
      Date.now() < materialDeadline &&
      !this.disposed &&
      !this.scene.isDisposed
    ) {
      this.renderScene();
      await this.waitForBrowserFrame();
      ready = readyCount();
    }
    if (ready < meshes.length) {
      throw new Error(`3D 角色材質只有 ${ready}/${meshes.length} 個在 ${ACTOR_SHADER_BUDGET_MS}ms 內可繪`);
    }
  }

  /** One visible-browser frame, with a timer fallback for background tabs. */
  private waitForBrowserFrame(): Promise<void> {
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        globalThis.clearTimeout(timer);
        resolve();
      };
      const timer = globalThis.setTimeout(finish, 34);
      globalThis.requestAnimationFrame?.(() => finish());
    });
  }

  /**
   * Scene.whenReadyAsync() is intentionally absent here. Besides including
   * dormant optional pools, it starts Babylon's RGBD readiness polling while
   * this paused scene has no render loop; Chromium can exhaust that poll before
   * the PBR helper ever receives a GPU frame. Explicit asset preloads and the
   * actor compile pump own readiness, so generic callers only owe two actual
   * frames before the framebuffer gates inspect the result.
   */
  private async waitForSceneReadyBounded(): Promise<void> {
    if (!this.disposed && !this.scene.isDisposed) await this.renderWarmupFrames(2);
  }

  /**
   * A coloured capsule is an interaction fallback, never review evidence.
   * Batch capture previously checked the issue set before actorReady settled;
   * a later fallback could therefore be photographed and reported as a clean
   * character animation. Recheck the live presentation after contentReady.
   */
  private assertActorsReadyForEvidence(): void {
    if (this.visualAssetIssues.size > 0) {
      throw new Error(
        `3D 預覽完整性未通過，禁止建立視覺證據：${[...this.visualAssetIssues].join("；")}`,
      );
    }
    const fallbackActors = this.allActors()
      .filter((actor) => actor.champion && (
        actor.fallbackForced || actor.bodyRoot === null || actor.fallback.isEnabled()
      ))
      .map((actor) => `${actor.role === "caster" ? "施法者" : actor.role === "target" ? "目標" : "召喚物"} ${actor.champion!.id}`);
    if (fallbackActors.length > 0) {
      throw new Error(`3D 預覽仍顯示碰撞替身，禁止建立視覺證據：${fallbackActors.join("、")}`);
    }
  }

  private casterEntityId(): number | undefined {
    for (const item of this.schedule) {
      if (item.event.type !== "editorPreviewScenario" || item.event.data.abilityId !== this.ability.id) continue;
      return Number(item.event.data.caster);
    }
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

  /** Resolve the other visible participant without inventing a fixed entity id. */
  private targetEntityId(): number | undefined {
    const caster = this.casterEntityId();
    for (const item of this.schedule) {
      const data = item.event.data as Record<string, unknown>;
      for (const key of ["victim", "target", "attacker", "source"] as const) {
        const id = Number(data[key]);
        if (Number.isFinite(id) && id !== caster) return id;
      }
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
    // Script mode emits its authored presentation through this callback. The
    // real runtime route is counted in consumeEvents before VfxSystem handles
    // it, so the two modes never inflate one another.
    if (this.mode === "script") this.recordRuntimePresentationEvent(ev);
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
        const before = new Map(this.scene.particleSystems.map((system) => [
          system,
          { started: system.isStarted(), manualEmitCount: system.manualEmitCount },
        ]));
        this.runtimeVfx.handleEvent(ev, nowMs);
        if (this.scene.particleSystems.some((system) => {
          const prior = before.get(system);
          return system.isStarted() && system.manualEmitCount > 0 &&
            (!prior || !prior.started || prior.manualEmitCount !== system.manualEmitCount);
        })) this.acceptedVfxEventCount++;
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
    for (const actor of this.allActors()) {
      if (actor.hiddenUntilMs > 0 && actor.hiddenUntilMs <= this.nowMs) {
        actor.hiddenUntilMs = 0;
        this.setActorEnabled(actor, actor.active);
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
