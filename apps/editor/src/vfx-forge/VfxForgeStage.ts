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
import type { EventMessage } from "@ggd/shared/protocol/messages";
import type { ModelDoc, VfxDoc } from "@ggd/shared/content";
import type { VfxScriptDoc } from "@ggd/shared/content/schema/vfxScript";
import type { AbilityVfxLayerOverride } from "@ggd/shared/content/schema/abilityVfx";
import type { ModelFxSpawnEvent } from "../../../client/src/render/modelFxPath";
import { ModelFxRig } from "../../../client/src/render/modelFxRig";
import { CameraRig } from "../../../client/src/render/CameraRig";
import { buildZoneGround } from "../../../client/src/render/ArenaGround";
import { VfxScriptPlayer } from "../../../client/src/vfx/VfxScriptPlayer";
import { vfxHardMaxLifeSec } from "../../../client/src/vfx/vfxCleanupPolicy";
import {
  applyVfxOverrides,
  WC3_UNITS_PER_WORLD_UNIT,
} from "../../../client/src/render/vfx/abilityLayers";
import { api } from "../api/client";
import { loadGlbContainer } from "../preview3d/loadGlb";
import { burstNow, toParticleSystem } from "../preview3d/particles";
import type { ForgeAbility, TriggerCue } from "./model";
import { calibrateTwoWay } from "../../../client/src/vfx/auditionCalibrate";

const STEP_MS = 1000 / 60;
const CASTER = 101;
const TARGET = 202;
const CASTER_POS = { x: -2.5, z: 0 };
const TARGET_POS = { x: 2.5, z: 0 };

export interface ForgeOverlay {
  flash: { color: readonly [number, number, number]; alpha: number } | null;
  texts: readonly { id: number; text: string; x: number; z: number; untilMs: number }[];
  status: string;
}

export interface VfxForgeStageOptions {
  fetchDoc?<T>(collection: "models" | "vfx", id: string): Promise<T>;
  onOverlay?(overlay: ForgeOverlay): void;
}

interface LiveParticle {
  ps: ParticleSystem;
  untilMs: number;
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
  private cues: readonly TriggerCue[];
  private nowMs = 0;
  private nextCue = 0;
  private generation = 0;
  private textSerial = 0;
  private flash: ForgeOverlay["flash"] = null;
  private flashUntilMs = 0;
  private texts: { id: number; text: string; x: number; z: number; untilMs: number }[] = [];
  private particles: LiveParticle[] = [];
  private readonly models = new Map<string, ModelDoc>();
  private readonly vfx = new Map<string, VfxDoc>();
  private readonly fetchDoc: NonNullable<VfxForgeStageOptions["fetchDoc"]>;
  private readonly onOverlay: NonNullable<VfxForgeStageOptions["onOverlay"]>;
  private readonly modelRig: ModelFxRig;
  private readonly groundFloor: ReturnType<typeof buildZoneGround>["floor"];
  private player: VfxScriptPlayer;
  private readonly canvas: HTMLCanvasElement;

  constructor(
    canvas: HTMLCanvasElement,
    script: VfxScriptDoc,
    ability: ForgeAbility,
    cues: readonly TriggerCue[],
    opts: VfxForgeStageOptions = {},
  ) {
    this.canvas = canvas;
    this.script = script;
    this.ability = ability;
    this.cues = cues;
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
    const ground = buildZoneGround(this.scene, root, { center: { x: 0, z: 0 }, boundaryRadius: 24 }, 0, "stone");
    this.groundFloor = ground.floor;
    this.groundFloor.isPickable = true;
    this.makeActor("施法者", CASTER_POS.x, CASTER_POS.z, new Color3(0.24, 0.55, 0.95));
    this.makeActor("目標", TARGET_POS.x, TARGET_POS.z, new Color3(0.92, 0.28, 0.24));

    this.cameraRig = new CameraRig(this.scene, { x: 0, z: 0 });
    this.cameraRig.update({
      dtMs: STEP_MS,
      localPos: { x: 0, z: 0 },
      cursor: null,
      panKeys: null,
      viewportWidth: canvas.clientWidth || 960,
      viewportHeight: canvas.clientHeight || 540,
    });

    this.modelRig = new ModelFxRig(this.scene, {
      resolveModel: (id) => this.models.get(id) ?? null,
      loadContainer: (path) => loadGlbContainer(this.scene, path),
      spawnTrail: (id, x, y, z) => void this.spawnVfx(id, x, z, y),
      maxEffectSec: vfxHardMaxLifeSec(),
    });
    this.player = this.makePlayer();
    this.reset();
  }

  get timeMs(): number {
    return this.nowMs;
  }

  setContent(script: VfxScriptDoc, ability: ForgeAbility, cues: readonly TriggerCue[]): void {
    this.script = script;
    this.ability = ability;
    this.cues = cues;
    this.player.invalidate();
  }

  /** Rebuild and deterministically replay from frame zero to the requested time. */
  seek(targetMs: number): void {
    const target = Math.max(0, targetMs);
    this.reset();
    while (this.nowMs + STEP_MS < target) this.advanceFrame(false);
    if (target > this.nowMs) this.advanceFrame(false, target - this.nowMs);
    this.scene.render();
    this.emitOverlay("已定位");
  }

  advance(): number {
    this.advanceFrame(true);
    return this.nowMs;
  }

  resize(): void {
    this.engine.resize();
  }

  /** Translate a canvas drop point through the shipped camera into script facing offsets. */
  placementAt(canvasX: number, canvasY: number): { forwardU: number; sideU: number } | undefined {
    const point = this.scene.pick(canvasX, canvasY, (mesh) => mesh === this.groundFloor).pickedPoint;
    if (!point) return undefined;
    // Preview caster faces +x. Player semantics are x += forward, z -= side.
    return {
      forwardU: Math.round((point.x - CASTER_POS.x) * 10) / 10,
      sideU: Math.round((CASTER_POS.z - point.z) * 10) / 10,
    };
  }

  /** Two-way bright/dark self-certification before any visual proof reading. */
  async calibrate(): Promise<number> {
    const measure = document.createElement("canvas");
    const ctx = measure.getContext("2d", { willReadFrequently: true });
    const read = () => {
      this.scene.render();
      const w = this.canvas.width;
      const h = this.canvas.height;
      measure.width = w;
      measure.height = h;
      if (!ctx) return { w, h, bright: 0, lit: 0 };
      ctx.drawImage(this.canvas, 0, 0);
      const px = ctx.getImageData(0, 0, w, h).data;
      let bright = 0;
      let lit = 0;
      for (let i = 0; i + 2 < px.length; i += 4) {
        const value = Math.max(px[i]!, px[i + 1]!, px[i + 2]!);
        if (value > 200) bright++;
        if (value > 96) lit++;
      }
      return { w, h, bright, lit };
    };
    return calibrateTwoWay({ scene: this.scene, camera: this.cameraRig.camera, rulers: { canvas: read } });
  }

  dispose(): void {
    this.generation++;
    this.modelRig.dispose();
    this.disposeParticles();
    this.scene.dispose();
    this.engine.dispose();
  }

  private makeActor(name: string, x: number, z: number, color: Color3): void {
    const mesh = MeshBuilder.CreateCapsule(name, { height: 1.7, radius: 0.38 }, this.scene);
    mesh.position.set(x, 0.85, z);
    const mat = new StandardMaterial(`${name}-mat`, this.scene);
    mat.diffuseColor = color;
    mat.emissiveColor = color.scale(0.12);
    mesh.material = mat;
  }

  private reset(): void {
    this.generation++;
    this.nowMs = 0;
    this.nextCue = 0;
    this.flash = null;
    this.flashUntilMs = 0;
    this.texts = [];
    this.modelRig.hardReset();
    this.disposeParticles();
    this.player = this.makePlayer();
    this.fireInitialCast();
    this.consumeCues();
    this.player.update(0);
    this.scene.render();
    this.emitOverlay("已重播");
  }

  private makePlayer(): VfxScriptPlayer {
    return new VfxScriptPlayer({
      scriptFor: (id) => (id === this.script.abilityId ? this.script : undefined),
      allScripts: () => [this.script],
      projectileIdsOf: () => new Set(),
      entityPos: (id) => (id === CASTER ? CASTER_POS : id === TARGET ? TARGET_POS : null),
      dispatch: (ev, nowMs) => this.dispatch(ev, nowMs),
      enabled: () => true,
      pulseAnim: (_id, kind) => this.emitOverlay(`動畫脈衝：${kind}`),
      hideBody: (_id, ms) => this.emitOverlay(`隱藏本體 ${ms}ms`),
      playSfx: (key) => {
        this.emitOverlay(`音效：${key}`);
        return true;
      },
    });
  }

  private fireInitialCast(): void {
    const data = {
      abilityId: this.ability.id,
      caster: CASTER,
      point: TARGET_POS,
      direction: { x: 1, z: 0 },
    };
    this.player.onEvent({ type: "abilityCast", tick: 0, data }, 0);
    if ((this.ability.castTimeSec ?? 0) > 0) {
      this.player.onEvent({ type: "castBegin", tick: 0, data }, 0);
    }
  }

  private advanceFrame(render: boolean, dtMs = STEP_MS): void {
    this.nowMs += dtMs;
    this.consumeCues();
    this.player.update(this.nowMs);
    this.modelRig.tick(dtMs);
    this.cameraRig.update({
      dtMs,
      localPos: { x: 0, z: 0 },
      cursor: null,
      panKeys: null,
      viewportWidth: this.engine.getRenderWidth(),
      viewportHeight: this.engine.getRenderHeight(),
    });
    this.reap();
    if (render) this.scene.render();
    this.emitOverlay("播放中");
  }

  private consumeCues(): void {
    while (this.nextCue < this.cues.length && this.cues[this.nextCue]!.atMs <= this.nowMs + 0.001) {
      const cue = this.cues[this.nextCue++]!;
      if (cue.on === "castEffect" && (this.ability.castTimeSec ?? 0) > 0) {
        this.player.onEvent(
          { type: "castEnd", tick: Math.round(cue.atMs / SIM_TICK_MS), data: { abilityId: this.ability.id, caster: CASTER } },
          cue.atMs,
        );
      } else if (cue.on === "strike") {
        this.player.onEvent(
          {
            type: "comboStrike",
            tick: Math.round(cue.atMs / SIM_TICK_MS),
            data: {
              caster: CASTER,
              victim: TARGET,
              origin: `ability:${this.ability.id}`,
              index: cue.strikeIndex,
              x: TARGET_POS.x,
              z: TARGET_POS.z,
            },
          },
          cue.atMs,
        );
      }
    }
  }

  private dispatch(ev: EventMessage, nowMs: number): void {
    const data = ev.data;
    if (ev.type === "modelFxSpawn") {
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
      const id = String(data.vfxId ?? "");
      const x = Number(data.x ?? 0);
      const z = Number(data.z ?? 0);
      const overrides = (data.overrides ?? {}) as AbilityVfxLayerOverride;
      const y = (overrides.flyHeight ?? 128) / WC3_UNITS_PER_WORLD_UNIT;
      void this.spawnVfx(id, x, z, y, overrides, Number(data.durationSec ?? 0) || undefined);
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
      const rendered = applyVfxOverrides(doc, overrides);
      const ps = toParticleSystem(rendered, this.scene);
      ps.emitter = new Vector3(x, y, z);
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
  }

  private disposeParticles(): void {
    for (const p of this.particles) p.ps.dispose();
    this.particles = [];
  }

  private emitOverlay(status: string): void {
    this.onOverlay({ flash: this.flash, texts: this.texts, status });
  }
}

const SIM_TICK_MS = 1000 / 30;
