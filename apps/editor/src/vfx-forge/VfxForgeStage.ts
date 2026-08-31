import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { EventMessage } from "@ggd/shared/protocol/messages";
import type { ModelDoc, VfxDoc } from "@ggd/shared/content";
import { Models, VfxDefs, VfxScripts } from "@ggd/shared/content/registries";
import type { VfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import { abilityIdOfAuthoredOrigin, type ChampionDef } from "@ggd/shared/sim";
import type { AbilityVfxLayerOverride } from "@ggd/shared/content/schema/abilityVfx";
import type { ModelFxSpawnEvent } from "../../../client/src/render/modelFxPath";
import { ModelFxRig } from "../../../client/src/render/modelFxRig";
import { CameraRig } from "../../../client/src/render/CameraRig";
import { buildZoneGround } from "../../../client/src/render/ArenaGround";
import { facingToYaw } from "../../../client/src/render/math/motion";
import { glbYawOffset } from "../../../client/src/render/views/glbFacing";
import {
  applyHiddenPrimitives,
  ENABLED_ONLY,
} from "../../../client/src/render/views/hiddenPrimitives";
import {
  applyModelTint,
  releaseModelTint,
} from "../../../client/src/render/views/modelTint";
import { normalizedModelScale } from "../../../client/src/render/views/modelSizing";
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
import { loadGlbContainer } from "../preview3d/loadGlb";
import { assetUrl } from "../preview3d/assetUrl";
import { resolveClip } from "../preview3d/clips";
import { burstNow, toParticleSystem } from "../preview3d/particles";
import { projectileIdsOf, type ForgeAbility, type ScheduledSimEvent } from "./model";
import { calibrateTwoWay } from "../../../client/src/vfx/auditionCalibrate";
import type { PreviewActorPose } from "../preview/PreviewController";

const STEP_MS = 1000 / 60;
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
  container: AssetContainer | null;
  bodyRoot: TransformNode | null;
  glbRoot: TransformNode | null;
  groups: AnimationGroup[];
  clipMap: ModelDoc["clipMap"] | null;
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
  private generation = 0;
  private textSerial = 0;
  private disposed = false;
  private homePose: PreviewActorPose;
  private castFocus: { x: number; z: number } | null;
  private flash: ForgeOverlay["flash"] = null;
  private readonly actorStatus = { caster: "替身", target: "替身" };
  private flashUntilMs = 0;
  private texts: { id: number; text: string; x: number; z: number; untilMs: number }[] = [];
  private particles: LiveParticle[] = [];
  private readonly models = new Map<string, ModelDoc>();
  private readonly vfx = new Map<string, VfxDoc>();
  private readonly modelFxContainerPromises = new Map<string, Promise<AssetContainer>>();
  private readonly ownedModelFxContainers = new Set<AssetContainer>();
  private readonly fetchDoc: NonNullable<VfxForgeStageOptions["fetchDoc"]>;
  private readonly onOverlay: NonNullable<VfxForgeStageOptions["onOverlay"]>;
  private readonly modelRig: ModelFxRig;
  private readonly groundFloor: ReturnType<typeof buildZoneGround>["floor"];
  private readonly actors: { caster: ForgeActor; target: ForgeActor };
  private actorReady: Promise<void> = Promise.resolve();
  private prepareSeq = 0;
  private player: VfxScriptPlayer;
  private readonly mode: VfxForgeStageMode;
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
    this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false }, true);
    this.engine.setHardwareScalingLevel(1 / Math.min(globalThis.devicePixelRatio || 1, 2));
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.035, 0.045, 0.07, 1);
    this.scene.useConstantAnimationDeltaTime = true;

    const root = new TransformNode("vfx-forge-arena", this.scene);
    const hemi = new HemisphericLight("vfx-forge-hemi", new Vector3(0.3, 1, 0.2), this.scene);
    hemi.intensity = 0.75;
    new DirectionalLight("vfx-forge-sun", new Vector3(-0.4, -1, 0.35), this.scene).intensity = 1.05;
    const ground = buildZoneGround(
      this.scene,
      root,
      { center: { ...this.homePose.caster }, boundaryRadius: 24 },
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
    this.groundFloor = ground.floor;
    this.groundFloor.isPickable = true;
    this.actors = {
      caster: this.makeActor("caster", "施法者", this.homePose.caster, { x: 0, z: 1 }, new Color3(0.24, 0.55, 0.95), opts.actors?.caster ?? null),
      target: this.makeActor("target", "目標", this.homePose.target, { x: 0, z: -1 }, new Color3(0.92, 0.28, 0.24), opts.actors?.target ?? null),
    };

    this.cameraRig = new CameraRig(this.scene, this.cameraFocus());
    this.cameraRig.update({
      dtMs: STEP_MS,
      localPos: this.cameraFocus(),
      cursor: null,
      panKeys: null,
      viewportWidth: canvas.clientWidth || 960,
      viewportHeight: canvas.clientHeight || 540,
    });

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

  async setContent(
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
    this.player.invalidate();
    this.runtimeVfx?.invalidateVfxScripts();
    this.emitOverlay("預載角色與腳本素材…");
    await Promise.all([
      this.actorReady,
      this.mode === "runtime"
        ? this.preloadRuntimeAssets(ability)
        : this.preloadScriptAssets(script),
    ]);
    const warmDocs = script.segments.flatMap((segment) => {
      if (segment.kind !== "vfx") return [];
      const doc = this.vfx.get(segment.vfxId) ?? VfxDefs.tryGet(segment.vfxId);
      return doc ? [doc] : [];
    });
    this.runtimeVfx?.warmVfxDocs(warmDocs);
    // `warmVfxDocs` creates the exact shipped textures but emits nothing.
    // Wait once here; deterministic seeks below must never race image decode.
    await this.scene.whenReadyAsync();
    return !this.disposed && seq === this.prepareSeq;
  }

  /** Rebuild and deterministically replay from frame zero to the requested time. */
  seek(targetMs: number): void {
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
    this.emitOverlay("已定位");
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
    this.renderScene();
    this.emitOverlay(wheelDeltaY < 0 ? "鏡頭拉近" : "鏡頭拉遠");
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
  async calibrate(): Promise<number> {
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
    await this.scene.whenReadyAsync();
    this.renderScene();
    return control;
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
    for (const actor of Object.values(this.actors)) this.disposeActor(actor);
    this.runtimeVfx?.dispose();
    this.modelRig.dispose();
    for (const container of this.ownedModelFxContainers) container.dispose();
    this.ownedModelFxContainers.clear();
    this.modelFxContainerPromises.clear();
    this.disposeParticles();
    this.scene.dispose();
    this.engine.dispose();
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
      container: null,
      bodyRoot: null,
      glbRoot: null,
      groups: [],
      clipMap: null,
      idleAfterMs: 0,
      hiddenUntilMs: 0,
    };
  }

  /** Replace the coloured fallback with the same champion GLB presentation used in game. */
  private async loadActor(actor: ForgeActor): Promise<void> {
    const champion = actor.champion;
    if (!champion) return;
    this.actorStatus[actor.role] = `載入 ${champion.name}…`;
    this.emitOverlay("載入 3D 角色…");
    try {
      const doc = await this.fetchDoc<ModelDoc>("models", champion.modelKey);
      const container = await loadGlbContainer(this.scene, doc.glbPath);
      if (this.disposed || this.scene.isDisposed) {
        container.dispose();
        return;
      }
      container.addAllToScene();
      const bodyRoot = new TransformNode(`forge-${actor.role}-body`, this.scene);
      bodyRoot.position.set(actor.position.x, 0, actor.position.z);
      bodyRoot.rotation.y = facingToYaw(actor.facing.x, actor.facing.z);
      const glbRoot = new TransformNode(`forge-${actor.role}-glb`, this.scene);
      glbRoot.parent = bodyRoot;
      glbRoot.rotation.y = glbYawOffset(doc);
      for (const node of container.rootNodes) node.parent = glbRoot;
      const visible = applyHiddenPrimitives(glbRoot.getChildMeshes(false), doc.hiddenPrimitives);
      if (visible.length === 0) {
        container.dispose();
        bodyRoot.dispose(false, false);
        return;
      }
      glbRoot.computeWorldMatrix(true);
      const native = glbRoot.getHierarchyBoundingVectors(true, ENABLED_ONLY);
      const finalScale = normalizedModelScale(
        native.max.y - native.min.y,
        doc.scale,
        champion.bodyScale,
      );
      glbRoot.scaling.setAll(finalScale);
      glbRoot.computeWorldMatrix(true);
      const rendered = glbRoot.getHierarchyBoundingVectors(true, ENABLED_ONLY);
      if (Number.isFinite(rendered.min.y)) glbRoot.position.y = -rendered.min.y;
      applyModelTint(glbRoot, champion);
      actor.container = container;
      actor.bodyRoot = bodyRoot;
      actor.glbRoot = glbRoot;
      actor.groups = [...container.animationGroups];
      actor.clipMap = doc.clipMap;
      actor.fallback.setEnabled(false);
      this.playActor(actor, "idle", true);
      const height = rendered.max.y - rendered.min.y;
      const centerX = (rendered.min.x + rendered.max.x) / 2;
      const centerZ = (rendered.min.z + rendered.max.z) / 2;
      this.actorStatus[actor.role] =
        `${champion.name} · ${champion.modelKey} · ${visible.length} meshes · ` +
        `h${height.toFixed(2)} · ×${finalScale.toFixed(3)} · @${centerX.toFixed(1)},${centerZ.toFixed(1)}`;
      // The script may already be scrubbed past a pulse while this GLB loaded.
      this.seek(this.nowMs);
    } catch (error) {
      this.actorStatus[actor.role] = `${champion.name} · 替身（載入失敗）`;
      this.emitOverlay(`${champion.name} 3D 載入失敗，保留碰撞替身：${String(error)}`);
    }
  }

  private disposeActor(actor: ForgeActor): void {
    if (actor.glbRoot) releaseModelTint(actor.glbRoot);
    actor.container?.dispose();
    actor.bodyRoot?.dispose(false, false);
    actor.container = null;
    actor.bodyRoot = null;
    actor.glbRoot = null;
    actor.groups = [];
  }

  private loadModelFxContainer(path: string): Promise<AssetContainer> {
    const cached = this.modelFxContainerPromises.get(path);
    if (cached) return cached;
    const pending = loadGlbContainer(this.scene, path).then((container) => {
      if (this.disposed) {
        container.dispose();
        throw new Error("VFX Forge stage was disposed during model preload");
      }
      this.ownedModelFxContainers.add(container);
      return container;
    });
    this.modelFxContainerPromises.set(path, pending);
    return pending;
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
    this.modelRig.warm(modelKeys);
    await Promise.all(modelKeys.flatMap((key) => {
      const doc = this.models.get(key);
      return doc
        ? [this.loadModelFxContainer(doc.glbPath).catch((error) => {
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

  private playActor(actor: ForgeActor, clip: "idle" | "attack" | "cast" | "hurt", loop: boolean): void {
    if (!actor.clipMap) return;
    for (const group of actor.groups) group.stop();
    const group = resolveClip(actor.groups, actor.clipMap[clip]);
    if (group) group.start(loop, 1);
  }

  private actorForEntity(id: number): ForgeActor {
    return id === this.casterEntityId() ? this.actors.caster : this.actors.target;
  }

  private pulseActor(id: number, kind: "attack" | "cast" | "hurt", clipWindowMs = 600): void {
    const actor = this.actorForEntity(id);
    this.playActor(actor, kind, false);
    actor.idleAfterMs = this.nowMs + clipWindowMs;
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
    for (const actor of Object.values(this.actors)) {
      actor.idleAfterMs = 0;
      actor.hiddenUntilMs = 0;
      actor.bodyRoot?.setEnabled(true);
      actor.fallback.setEnabled(actor.bodyRoot === null);
      this.playActor(actor, "idle", true);
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
      if (caster.bodyRoot) caster.bodyRoot.rotation.y = facingToYaw(caster.facing.x, caster.facing.z);
      if (target.bodyRoot) target.bodyRoot.rotation.y = facingToYaw(target.facing.x, target.facing.z);
    }
  }

  private moveActor(actor: ForgeActor, x: number, z: number): void {
    actor.position.x = x;
    actor.position.z = z;
    actor.bodyRoot?.position.set(x, 0, z);
    actor.fallback.position.set(x, 0.85, z);
  }

  private cameraFocus(): { x: number; z: number } {
    if (this.castFocus) return this.castFocus;
    return {
      x: (this.actors.caster.position.x + this.actors.target.position.x) / 2,
      z: (this.actors.caster.position.z + this.actors.target.position.z) / 2,
    };
  }

  private renderScene(): void {
    this.scene.render();
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
        await this.loadModelFxContainer(doc.glbPath);
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
        actor.bodyRoot?.setEnabled(true);
        actor.fallback.setEnabled(actor.bodyRoot === null);
      }
      if (actor.idleAfterMs > 0 && actor.idleAfterMs <= this.nowMs) {
        actor.idleAfterMs = 0;
        this.playActor(actor, "idle", true);
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
    const view = eye
      ? `${status} · ${visible}/${this.scene.meshes.length} meshes · ${particleCount}/${this.scene.particleSystems.length} particles/systems · eye ${eye.x.toFixed(1)},${eye.y.toFixed(1)},${eye.z.toFixed(1)}`
      : status;
    this.onOverlay({ flash: this.flash, texts: this.texts, status: view, actors: { ...this.actorStatus } });
  }
}
