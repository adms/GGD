/**
 * Boss-battle DYNAMIC FX for the login vista — the dragons, kamehameha beams,
 * explosions and combat flashes that keep the dark arena alive. Each FX is a
 * self-contained controller: it builds its own procedural meshes / particles in
 * the constructor, advances them every frame from the pure schedulers in
 * ./math (so the timing is deterministic + staggered), and tears itself down in
 * dispose().
 *
 * HOT-LOOP RULE: `update()` must never allocate. Every controller reuses a
 * single scratch state/point object and mutates Babylon vectors/colours in
 * place (`.set` / `.setAll` / `.copyFrom`), and returns a scalar bloom-boost
 * the caller sums — no per-frame objects.
 *
 * Only render/* / vfx/* may import @babylonjs/*; this lives under render/menu/.
 */
import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer, InstantiatedEntries } from "@babylonjs/core/assetContainer";
import {
  writeDragonPoint,
  writeBeamState,
  writeExplosionState,
  writeFlashState,
  cycleTime,
  clamp01,
  type DragonPathConfig,
  type Vec3Like,
  type BeamPhaseConfig,
  type BeamState,
  type ExplosionPhaseConfig,
  type ExplosionState,
  type FlashPhaseConfig,
  type FlashState,
} from "./math";

/** A dynamic login-scene effect: advanced each frame, returns a bloom boost. */
export interface FxController {
  /** Advance the effect to time `t` (seconds). Returns a 0..~1 bloom boost. */
  update(t: number, dt: number): number;
  dispose(): void;
}

const BILLBOARD_ALL = TransformNode.BILLBOARDMODE_ALL;

// ---------------------------------------------------------------------------
// FIRE DRAGON — a segmented serpentine body weaving a smooth flight path, with
// an ember trail and a periodic breath-fire burst.
// ---------------------------------------------------------------------------

export interface DragonOptions {
  path: DragonPathConfig;
  /** body segment count (head → tail) */
  segments?: number;
  /** seconds each following segment lags the one ahead (the "wave") */
  segDelay?: number;
  /** breath-fire cycle */
  breathPeriod?: number;
  breathDuration?: number;
  breathOffset?: number;
}

export class DragonController implements FxController {
  private readonly segMeshes: Mesh[] = [];
  private readonly mat: StandardMaterial;
  private readonly trail: ParticleSystem;
  private readonly path: DragonPathConfig;
  private readonly segDelay: number;
  private readonly nSeg: number;
  private readonly breathPeriod: number;
  private readonly breathDuration: number;
  private readonly breathOffset: number;
  // reused scratch (allocation-free hot path)
  private readonly head: Vec3Like = { x: 0, y: 0, z: 0 };
  private readonly ahead: Vec3Like = { x: 0, y: 0, z: 0 };

  constructor(scene: Scene, dotTex: Texture, opts: DragonOptions) {
    this.path = opts.path;
    this.nSeg = opts.segments ?? 16;
    this.segDelay = opts.segDelay ?? 0.13;
    this.breathPeriod = opts.breathPeriod ?? 11;
    this.breathDuration = opts.breathDuration ?? 1.6;
    this.breathOffset = opts.breathOffset ?? 0;

    this.mat = new StandardMaterial("login-dragon-mat", scene);
    this.mat.emissiveColor = new Color3(1.0, 0.42, 0.14);
    this.mat.diffuseColor = new Color3(0.05, 0.02, 0.0);
    this.mat.specularColor = new Color3(0, 0, 0);
    this.mat.disableLighting = true;

    for (let i = 0; i < this.nSeg; i++) {
      const f = i / this.nSeg; // 0 head → ~1 tail
      const w = 1.15 * (1 - f * 0.75); // taper the body toward the tail
      const seg = MeshBuilder.CreateSphere(`login-dragon-seg-${i}`, { diameter: 1, segments: 6 }, scene);
      seg.material = this.mat;
      seg.isPickable = false;
      seg.scaling.set(w, w, w * 1.9); // elongate along local +Z → serpentine
      this.segMeshes.push(seg);
    }

    this.trail = new ParticleSystem("login-dragon-trail", 120, scene);
    this.trail.particleTexture = dotTex;
    this.trail.emitter = new Vector3(0, 0, 0); // mutated in place to follow the head
    this.trail.minEmitBox = new Vector3(-0.3, -0.3, -0.3);
    this.trail.maxEmitBox = new Vector3(0.3, 0.3, 0.3);
    this.trail.color1 = new Color4(1.0, 0.6, 0.2, 0.9);
    this.trail.color2 = new Color4(1.0, 0.28, 0.1, 0.85);
    this.trail.colorDead = new Color4(0.5, 0.12, 0.05, 0);
    this.trail.minSize = 0.15;
    this.trail.maxSize = 0.7;
    this.trail.minLifeTime = 0.4;
    this.trail.maxLifeTime = 1.3;
    this.trail.emitRate = 40;
    this.trail.direction1 = new Vector3(-0.4, 0.2, -0.4);
    this.trail.direction2 = new Vector3(0.4, 0.8, 0.4);
    this.trail.minEmitPower = 0.2;
    this.trail.maxEmitPower = 1.0;
    this.trail.gravity = new Vector3(0, 0.5, 0);
    this.trail.blendMode = ParticleSystem.BLENDMODE_ADD;
    this.trail.start();
  }

  update(t: number): number {
    const path = this.path;
    for (let i = 0; i < this.nSeg; i++) {
      const st = t - i * this.segDelay;
      writeDragonPoint(this.head, st, path);
      writeDragonPoint(this.ahead, st + 0.06, path); // small look-ahead → tangent
      const seg = this.segMeshes[i]!;
      seg.position.set(this.head.x, this.head.y, this.head.z);
      const dx = this.ahead.x - this.head.x;
      const dy = this.ahead.y - this.head.y;
      const dz = this.ahead.z - this.head.z;
      const horiz = Math.sqrt(dx * dx + dz * dz) || 1e-6;
      seg.rotation.set(-Math.atan2(dy, horiz), Math.atan2(dx, dz), 0);
    }
    // ember trail rides the head
    const emitter = this.trail.emitter as Vector3;
    emitter.set(this.segMeshes[0]!.position.x, this.segMeshes[0]!.position.y, this.segMeshes[0]!.position.z);

    // breath-fire burst
    const lt = cycleTime(t, this.breathPeriod, this.breathOffset);
    let breathK = 0;
    if (lt < this.breathDuration) {
      const p = lt / this.breathDuration;
      breathK = p < 0.3 ? p / 0.3 : clamp01(1 - (p - 0.3) / 0.7);
    }
    this.trail.emitRate = 40 + 150 * breathK;
    const glow = 0.82 + 0.18 * Math.sin(t * 4 + path.phase);
    this.mat.emissiveColor.set(glow, 0.42 * glow + 0.2 * breathK, 0.14 * glow);
    return 0.22 * breathK;
  }

  dispose(): void {
    this.trail.dispose();
    for (const m of this.segMeshes) m.dispose();
    this.segMeshes.length = 0;
    this.mat.dispose();
  }
}

// ---------------------------------------------------------------------------
// MODEL FIRE DRAGON — a real rigged, textured glb dragon (CC-BY 4.0 LasquetiSpice
// "Animated Dragon Three Motion Loops", a semi-realistic Western 炎龍) SOARING the
// vista like a bird: it travels forward along a grand slow ellipse FACING its
// direction of travel, pitches gently as it climbs/dives, and BANKS into its
// turns — a majestic arc, not a hover-in-place. Its real baked wing-flap loop
// plays throughout; a molten-orange emissive tint + ember/fire streams make it
// read as a fire dragon and blow out under the heavy bloom. Falls back to the
// procedural DragonController until (or unless) the model loads, so the login
// screen never waits on or breaks over the asset.
//
// Model facts (measured, see integrate notes): head faces LOCAL +Z (so
// yawOffset = 0), skinned body centre sits ~2.54 units above / ~0.30 behind the
// file origin at scale 1 (we re-pivot to the body centre so banking/pitch rotate
// about the torso, not the feet), and the single "Flying" clip is one long
// continuous flap cycle that loops cleanly.
// ---------------------------------------------------------------------------

/** Model body centre at scale 1 (measured over the flap) → re-pivot offset. */
const DRAGON_CENTER_Y = 2.54;
const DRAGON_CENTER_Z = -0.3;
/** flight-time look-ahead (s) for orientation — big enough to smooth path wobble */
const DRAGON_LOOK = 0.3;
/** how hard the dragon banks into a turn (rad of roll per rad/s of heading change) */
const DRAGON_BANK_GAIN = 2.6;
const DRAGON_MAX_BANK = 0.7;
/** gentle pitch scaling + clamp so climbs/dives read as a soaring arc, not a dive-bomb */
const DRAGON_PITCH_GAIN = 0.8;
const DRAGON_MAX_PITCH = 0.6;
/** playback rate of the wing-flap clip — <1 for majestic, slow, powerful beats */
const DRAGON_FLAP_RATE = 0.6;

/** Loads a glb into an AssetContainer TEMPLATE (never added to the scene). */
export type DragonContainerLoader = (scene: Scene, url: string) => Promise<AssetContainer | null>;

/**
 * SHARED per-(scene, url) glb template cache — the login vista mounts TWO
 * `ModelDragonController`s that both stream the SAME `dragon2.glb` (~4.3 MB). Each
 * used to call `LoadAssetContainerAsync` itself, so the file was FETCHED AND
 * PARSED TWICE at login (two concurrent 4.3 MB downloads). Now the first request
 * for a url wins the load and both dragons INSTANTIATE from the one cached
 * container — halving the login glb payload with no visual change (each instance
 * clones its own materials + animation groups, so they still flap and shimmer
 * independently). Keyed by Scene via a WeakMap, so a disposed LoginScene never
 * reuses a stale container and the entry is GC'd with the scene (the container's
 * GPU buffers are freed by the scene's `engine.dispose()`; the template is a pure
 * off-scene template, exactly like AssetManager's champion-glb cache).
 */
const dragonTemplates = new WeakMap<Scene, Map<string, Promise<AssetContainer | null>>>();

/** Real loader: register the glTF plugin on demand, then parse into a container. */
const realDragonLoader: DragonContainerLoader = async (scene, url) => {
  try {
    await import("@babylonjs/loaders/glTF");
    return await LoadAssetContainerAsync(url, scene);
  } catch {
    return null; // caller keeps its procedural fallback
  }
};

/** Resolve the shared template for (scene, url), loading it at most once. */
function acquireDragonTemplate(
  scene: Scene,
  url: string,
  loader: DragonContainerLoader,
): Promise<AssetContainer | null> {
  let byUrl = dragonTemplates.get(scene);
  if (!byUrl) {
    byUrl = new Map();
    dragonTemplates.set(scene, byUrl);
  }
  let pending = byUrl.get(url);
  if (!pending) {
    pending = loader(scene, url);
    byUrl.set(url, pending);
  }
  return pending;
}

export interface ModelDragonOptions extends DragonOptions {
  /** content-relative url, e.g. "/content/assets/models/menu/dragon2.glb" */
  url: string;
  /** uniform scale for the loaded model */
  scale?: number;
  /** extra yaw (rad) so the model's forward axis aligns with the flight tangent */
  yawOffset?: number;
  /**
   * Test seam: override how the glb TEMPLATE is loaded (default: the real,
   * per-scene-cached glTF loader). Two controllers sharing a scene+url still hit
   * the shared cache, so the loader runs at most once regardless of this override.
   */
  loadContainer?: DragonContainerLoader;
  /**
   * Fires ONCE at the start of each breath/roar cycle (login-immersion #20):
   * the scene turns it into a panned, near/far dragon-roar SFX. `worldPos` is
   * the dragon's current flight position (a reused scratch — read it now, don't
   * retain it) and `scale` its configured size, so the scene can attenuate by
   * distance/size. Independent of whether the model or the procedural fallback
   * is currently rendering, so the roar cadence never waits on the asset.
   */
  onRoar?: (worldPos: Vec3Like, scale: number) => void;
}

export class ModelDragonController implements FxController {
  private fallback: FxController | null;
  /** THIS controller's clone of the shared template (its nodes/materials/clips). */
  private instance: InstantiatedEntries | null = null;
  private root: TransformNode | null = null;
  private trail: ParticleSystem | null = null;
  private fire: ParticleSystem | null = null;
  private readonly emissives: Color3[] = []; // material emissive refs, pulsed molten
  private readonly scene: Scene;
  private readonly dotTex: Texture;
  private readonly path: DragonPathConfig;
  private readonly scale: number;
  private readonly yawOffset: number;
  private readonly breathPeriod: number;
  private readonly breathDuration: number;
  private readonly breathOffset: number;
  private readonly onRoar?: (worldPos: Vec3Like, scale: number) => void;
  private readonly loader: DragonContainerLoader;
  /** roar edge latch: true while inside the current breath window (fired once) */
  private roared = false;
  private disposed = false;
  // reused scratch (allocation-free hot path): position + two look-ahead samples
  private readonly pos: Vec3Like = { x: 0, y: 0, z: 0 };
  private readonly ahead: Vec3Like = { x: 0, y: 0, z: 0 };
  private readonly ahead2: Vec3Like = { x: 0, y: 0, z: 0 };

  constructor(scene: Scene, dotTex: Texture, opts: ModelDragonOptions) {
    this.scene = scene;
    this.dotTex = dotTex;
    this.path = opts.path;
    this.scale = opts.scale ?? 2.8;
    this.yawOffset = opts.yawOffset ?? 0; // this dragon faces +Z → tangent yaw needs no flip
    this.breathPeriod = opts.breathPeriod ?? 11;
    this.breathDuration = opts.breathDuration ?? 1.6;
    this.breathOffset = opts.breathOffset ?? 0;
    this.onRoar = opts.onRoar;
    this.loader = opts.loadContainer ?? realDragonLoader;
    // procedural dragon renders immediately; swapped out once the model loads
    this.fallback = new DragonController(scene, dotTex, opts);
    void this.load(opts.url);
  }

  private async load(url: string): Promise<void> {
    try {
      // ONE fetch+parse per (scene, url): both login dragons share this template
      // and INSTANTIATE their own clone from it (see acquireDragonTemplate).
      const template = await acquireDragonTemplate(this.scene, url, this.loader);
      if (!template || this.disposed) return; // keep the procedural fallback

      // Clone the template INTO the scene: cloneMaterials so each dragon's molten
      // emissive pulses independently; doNotInstantiate so the rigged mesh clones
      // (not hardware instances) and its "Flying" clip animates per-dragon. The
      // template itself is never added to the scene — it stays an off-scene
      // source both controllers clone from.
      const inst = template.instantiateModelsToScene((n) => n, true, { doNotInstantiate: true });
      this.instance = inst;

      // root (position/orientation/scale) → inner (static re-pivot to body centre)
      // → the model. Re-pivoting means bank/pitch rotate about the torso, so the
      // dragon rolls cleanly around its own spine instead of swinging its whole
      // body about its feet.
      const root = new TransformNode("login-model-dragon", this.scene);
      const inner = new TransformNode("login-model-dragon-pivot", this.scene);
      inner.parent = root;
      inner.position.set(0, -DRAGON_CENTER_Y, -DRAGON_CENTER_Z);
      for (const node of inst.rootNodes) node.parent = inner;
      const meshes = root.getChildMeshes(false);
      for (const m of meshes) m.isPickable = false;
      root.scaling.setAll(this.scale);

      // loop the real baked wing-flap ("Flying") — one continuous flap cycle that
      // loops cleanly; play it slow for majestic, powerful wingbeats.
      const groups = inst.animationGroups;
      const fly =
        groups.find((g) => /fast[_ ]?flying/i.test(g.name)) ??
        groups.find((g) => /fly/i.test(g.name)) ??
        groups[0];
      for (const g of groups) if (g !== fly) g.stop();
      fly?.start(true, DRAGON_FLAP_RATE);

      // molten 炎龍 look: a hot orange emissive over the PBR skin so it reads as
      // a fire dragon and blows out under the bloom — kept moderate so the scaled
      // reptilian skin/wings still show through (not a solid orange blob). Refs
      // are pulsed each frame for a breathing-ember shimmer. These are the
      // INSTANCE's cloned materials, so mutating them never touches the shared
      // template or the other dragon (dedup-safe).
      const seenMats = new Set<unknown>();
      for (const mesh of meshes) {
        const mat = mesh.material;
        if (!mat || seenMats.has(mat)) continue;
        seenMats.add(mat);
        const m = mat as unknown as {
          emissiveColor?: Color3;
          emissiveIntensity?: number;
          specularColor?: Color3;
          fogEnabled?: boolean;
        };
        if (m.emissiveColor) {
          const e = new Color3(1.15, 0.42, 0.1);
          m.emissiveColor = e;
          this.emissives.push(e);
        }
        if (typeof m.emissiveIntensity === "number") m.emissiveIntensity = 1.35;
        if (m.specularColor) m.specularColor = new Color3(0.6, 0.24, 0.08);
        // the scene's dark EXP2 depth fog was swallowing the dragon into black
        // when it flew far along its arc (glow "sometimes on, sometimes off").
        // Opt the dragon out of fog so its molten emissive glows CONSTANTLY.
        if (typeof m.fogEnabled === "boolean") m.fogEnabled = false;
      }

      // ember trail streaming off the body
      const trail = new ParticleSystem("login-model-dragon-trail", 140, this.scene);
      trail.particleTexture = this.dotTex;
      trail.emitter = new Vector3(0, 0, 0);
      trail.minEmitBox = new Vector3(-0.4, -0.3, -0.4);
      trail.maxEmitBox = new Vector3(0.4, 0.3, 0.4);
      trail.color1 = new Color4(1.0, 0.6, 0.2, 0.9);
      trail.color2 = new Color4(1.0, 0.28, 0.1, 0.85);
      trail.colorDead = new Color4(0.5, 0.12, 0.05, 0);
      trail.minSize = 0.2;
      trail.maxSize = 0.9;
      trail.minLifeTime = 0.4;
      trail.maxLifeTime = 1.4;
      trail.emitRate = 60;
      trail.direction1 = new Vector3(-0.4, 0.2, -0.4);
      trail.direction2 = new Vector3(0.4, 0.9, 0.4);
      trail.minEmitPower = 0.2;
      trail.maxEmitPower = 1.1;
      trail.gravity = new Vector3(0, 0.6, 0);
      trail.blendMode = ParticleSystem.BLENDMODE_ADD;
      trail.start();

      // broad fire aura across the wings/body — a wide, hot, additive flame sheet
      // that flickers off the whole silhouette for the "炎龍 on fire" read.
      const fireSpan = 2.4 * this.scale;
      const fire = new ParticleSystem("login-model-dragon-fire", 160, this.scene);
      fire.particleTexture = this.dotTex;
      fire.emitter = new Vector3(0, 0, 0);
      fire.minEmitBox = new Vector3(-fireSpan, -0.5 * this.scale, -fireSpan * 0.6);
      fire.maxEmitBox = new Vector3(fireSpan, 1.0 * this.scale, fireSpan * 0.6);
      fire.color1 = new Color4(1.0, 0.78, 0.34, 0.95);
      fire.color2 = new Color4(1.0, 0.36, 0.08, 0.9);
      fire.colorDead = new Color4(0.6, 0.12, 0.03, 0);
      fire.minSize = 0.45 * this.scale;
      fire.maxSize = 1.3 * this.scale;
      fire.minLifeTime = 0.3;
      fire.maxLifeTime = 0.85;
      fire.emitRate = 150;
      fire.direction1 = new Vector3(-0.2, 0.6, -0.2);
      fire.direction2 = new Vector3(0.2, 1.6, 0.2);
      fire.minEmitPower = 0.5;
      fire.maxEmitPower = 1.9;
      fire.gravity = new Vector3(0, 1.8, 0);
      fire.blendMode = ParticleSystem.BLENDMODE_ADD;
      fire.start();

      this.root = root;
      this.trail = trail;
      this.fire = fire;
      // A dispose that raced the async load (screen switched out mid-load) already
      // set `disposed` AND ran with no instance to tear down — honour it now.
      if (this.disposed) {
        this.teardownModel();
        return;
      }
      // model has taken over — retire the procedural stand-in
      this.fallback?.dispose();
      this.fallback = null;
    } catch {
      // keep the procedural fallback rendering
    }
  }

  /** Dispose THIS controller's model clone + its particles (never the template). */
  private teardownModel(): void {
    this.trail?.dispose();
    this.trail = null;
    this.fire?.dispose();
    this.fire = null;
    this.emissives.length = 0;
    this.root?.dispose();
    this.root = null;
    // free the clone's nodes, cloned materials + animation groups; the shared
    // template stays cached for the scene lifetime (freed by engine.dispose()).
    this.instance?.dispose();
    this.instance = null;
  }

  update(t: number, dt: number): number {
    // roar edge — independent of model/fallback state so the cadence is stable
    this.maybeRoar(t);
    if (this.fallback) return this.fallback.update(t, dt);
    const root = this.root;
    if (!root) return 0;
    // sample the flight at t, t+LOOK, t+2·LOOK → position, heading, and turn rate.
    // The wide look-ahead smooths the path's micro-wobble so the dragon tracks the
    // grand ellipse (a soaring arc) rather than jittering.
    writeDragonPoint(this.pos, t, this.path);
    writeDragonPoint(this.ahead, t + DRAGON_LOOK, this.path);
    writeDragonPoint(this.ahead2, t + 2 * DRAGON_LOOK, this.path);
    root.position.set(this.pos.x, this.pos.y, this.pos.z);

    const dx = this.ahead.x - this.pos.x;
    const dy = this.ahead.y - this.pos.y;
    const dz = this.ahead.z - this.pos.z;
    const horiz = Math.sqrt(dx * dx + dz * dz) || 1e-6;

    // FACE the direction of travel (yaw), nose up when climbing / down when diving
    // (pitch, gently scaled + clamped for a majestic arc).
    const yaw = Math.atan2(dx, dz) + this.yawOffset;
    let pitch = -Math.atan2(dy, horiz) * DRAGON_PITCH_GAIN;
    if (pitch > DRAGON_MAX_PITCH) pitch = DRAGON_MAX_PITCH;
    else if (pitch < -DRAGON_MAX_PITCH) pitch = -DRAGON_MAX_PITCH;

    // BANK into the turn: roll ∝ heading change rate (second heading − first).
    const head1 = Math.atan2(dx, dz);
    const head2 = Math.atan2(this.ahead2.x - this.ahead.x, this.ahead2.z - this.ahead.z);
    let turn = head2 - head1;
    if (turn > Math.PI) turn -= 2 * Math.PI; // wrap to (-π, π]
    else if (turn < -Math.PI) turn += 2 * Math.PI;
    let bank = -turn * (DRAGON_BANK_GAIN / DRAGON_LOOK);
    if (bank > DRAGON_MAX_BANK) bank = DRAGON_MAX_BANK;
    else if (bank < -DRAGON_MAX_BANK) bank = -DRAGON_MAX_BANK;
    // a whisper of idle roll on top so a near-straight glide still feels alive
    bank += Math.sin(t * 0.6 + this.path.phase) * 0.06;

    root.rotation.set(pitch, yaw, bank);

    // breath-fire burst + molten shimmer ride the body + boost bloom
    const lt = cycleTime(t, this.breathPeriod, this.breathOffset);
    let breathK = 0;
    if (lt < this.breathDuration) {
      const p = lt / this.breathDuration;
      breathK = p < 0.3 ? p / 0.3 : clamp01(1 - (p - 0.3) / 0.7);
    }
    const shimmer = 0.9 + 0.12 * Math.sin(t * 5 + this.path.phase) + 0.3 * breathK;
    for (let i = 0; i < this.emissives.length; i++) {
      this.emissives[i]!.set(1.15 * shimmer, 0.42 * shimmer + 0.2 * breathK, 0.1 * shimmer);
    }
    if (this.trail) {
      this.trail.emitter = root.position;
      this.trail.emitRate = 60 + 170 * breathK;
    }
    if (this.fire) {
      this.fire.emitter = root.position;
      this.fire.emitRate = 90 + 120 * breathK;
    }
    return 0.18 * breathK + 0.05;
  }

  /**
   * Fire the roar callback ONCE per breath cycle: on the rising edge into the
   * breath window (`lt < breathDuration`), sample the current flight position
   * into the reused scratch and hand it + the scale to the scene. Latched by
   * `roared` so a held frame can't re-fire; reset when the window closes.
   * Allocation-free (no callback ⇒ early-out; firing reuses `this.pos`).
   */
  private maybeRoar(t: number): void {
    if (!this.onRoar) return;
    const lt = cycleTime(t, this.breathPeriod, this.breathOffset);
    if (lt < this.breathDuration) {
      if (!this.roared) {
        writeDragonPoint(this.pos, t, this.path);
        this.onRoar(this.pos, this.scale);
        this.roared = true;
      }
    } else {
      this.roared = false;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.fallback?.dispose();
    this.fallback = null;
    this.teardownModel();
  }
}

// ---------------------------------------------------------------------------
// BEAM / SHOCKWAVE PILLAR — kamehameha: charge-glow → bright beam → shockwave
// ring at the muzzle. Skyward, or aimed at another arena.
// ---------------------------------------------------------------------------

export interface BeamOptions {
  start: Vector3;
  end: Vector3;
  offset: number; // stagger clock offset
  cfg: BeamPhaseConfig;
  color: readonly [number, number, number];
}

export class BeamController implements FxController {
  private readonly node: TransformNode;
  private readonly beam: Mesh;
  private readonly glow: Mesh;
  private readonly charge: Mesh;
  private readonly shock: Mesh;
  private readonly beamMat: StandardMaterial;
  private readonly glowMat: StandardMaterial;
  private readonly chargeMat: StandardMaterial;
  private readonly shockMat: StandardMaterial;
  private readonly offset: number;
  private readonly cfg: BeamPhaseConfig;
  private readonly cr: number;
  private readonly cg: number;
  private readonly cb: number;
  private readonly out: BeamState = { charging: false, firing: false, chargeK: 0, beamK: 0, shockK: 0, shockRadius: 0 };

  constructor(scene: Scene, opts: BeamOptions) {
    this.offset = opts.offset;
    this.cfg = opts.cfg;
    [this.cr, this.cg, this.cb] = opts.color;

    const start = opts.start;
    const end = opts.end;
    const len = Vector3.Distance(start, end);

    this.node = new TransformNode("login-beam-node", scene);
    this.node.position.copyFrom(start);
    // orient the node so local +Z points from start toward end
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const flatHoriz = Math.sqrt(dx * dx + dz * dz);
    if (flatHoriz < 0.05) {
      // (near-)vertical: point +Z straight up (lookAt would gimbal here)
      this.node.rotation.x = -Math.PI / 2;
    } else {
      this.node.lookAt(end); // aligns local +Z toward the target arena
    }

    // beam cylinder: length along +Z (built along Y, rotated), radius via scaling.x/z
    this.beamMat = unlitMat(scene, "login-beam-mat", this.cr, this.cg, this.cb);
    this.beam = MeshBuilder.CreateCylinder("login-beam", { height: len, diameter: 1, tessellation: 14 }, scene);
    this.beam.rotation.x = Math.PI / 2; // local +Y length → +Z
    this.beam.position.z = len / 2;
    this.beam.material = this.beamMat;
    this.beam.isPickable = false;
    this.beam.parent = this.node;
    this.beam.isVisible = false;

    // soft additive GLOW SHEATH around the core beam — the SCATTERED energy
    // halo that makes it read as a real kamehameha/衝擊波, not a solid glowing
    // rod. A wider, translucent, additively-blended cylinder over the core;
    // the pipeline bloom then feathers it into a diffuse light bloom.
    this.glowMat = unlitMat(scene, "login-beam-glow", this.cr, this.cg, this.cb);
    this.glowMat.alphaMode = 1; // Constants.ALPHA_ADD → light accumulates/scatters
    this.glowMat.alpha = 0;
    this.glowMat.backFaceCulling = false;
    this.glow = MeshBuilder.CreateCylinder("login-beam-glow-mesh", { height: len, diameter: 1, tessellation: 18 }, scene);
    this.glow.rotation.x = Math.PI / 2;
    this.glow.position.z = len / 2;
    this.glow.material = this.glowMat;
    this.glow.isPickable = false;
    this.glow.parent = this.node;
    this.glow.isVisible = false;

    // charge orb at the muzzle
    this.chargeMat = unlitMat(scene, "login-beam-charge", this.cr, this.cg, this.cb);
    this.charge = MeshBuilder.CreateSphere("login-beam-charge-mesh", { diameter: 1, segments: 8 }, scene);
    this.charge.material = this.chargeMat;
    this.charge.isPickable = false;
    this.charge.parent = this.node;
    this.charge.isVisible = false;

    // shockwave ring at the muzzle (base radius 1 → scaling = radius); plane ⟂ beam
    this.shockMat = unlitMat(scene, "login-beam-shock", this.cr, this.cg, this.cb);
    this.shock = MeshBuilder.CreateTorus("login-beam-shock-mesh", { diameter: 2, thickness: 0.08, tessellation: 40 }, scene);
    this.shock.rotation.x = Math.PI / 2; // torus lies in the plane whose normal is +Z
    this.shock.material = this.shockMat;
    this.shock.isPickable = false;
    this.shock.parent = this.node;
    this.shock.isVisible = false;
  }

  update(t: number): number {
    const s = writeBeamState(this.out, t, this.offset, this.cfg);

    this.charge.isVisible = s.chargeK > 0.01;
    if (this.charge.isVisible) {
      this.charge.scaling.setAll(0.25 + 1.3 * s.chargeK);
      this.chargeMat.emissiveColor.set(this.cr * s.chargeK, this.cg * s.chargeK, this.cb * s.chargeK);
    }

    this.beam.isVisible = s.beamK > 0.01;
    if (this.beam.isVisible) {
      const rad = 0.35 + 1.1 * s.beamK;
      this.beam.scaling.set(rad, 1, rad);
      const g = 0.5 + 0.5 * s.beamK;
      this.beamMat.emissiveColor.set(this.cr * g, this.cg * g, this.cb * g);
      // wide soft halo (~3.4× the core) scatters the beam's light outward
      const gr = rad * 3.4;
      this.glow.scaling.set(gr, 1, gr);
      this.glowMat.alpha = 0.3 * s.beamK;
      const gg = 0.55 + 0.45 * s.beamK;
      this.glowMat.emissiveColor.set(this.cr * gg, this.cg * gg, this.cb * gg);
    }
    this.glow.isVisible = this.beam.isVisible;

    this.shock.isVisible = s.shockK > 0.01;
    if (this.shock.isVisible) {
      this.shock.scaling.setAll(s.shockRadius < 0.01 ? 0.01 : s.shockRadius);
      this.shockMat.alpha = s.shockK;
      this.shockMat.emissiveColor.set(this.cr, this.cg, this.cb);
    }

    return s.beamK * 0.5 + s.shockK * 0.3 + s.chargeK * 0.1;
  }

  dispose(): void {
    this.beam.dispose();
    this.glow.dispose();
    this.charge.dispose();
    this.shock.dispose();
    this.beamMat.dispose();
    this.glowMat.dispose();
    this.chargeMat.dispose();
    this.shockMat.dispose();
    this.node.dispose();
  }
}

// ---------------------------------------------------------------------------
// EXPLOSION — expanding emissive core + spark burst + lingering smoke, on a
// loose per-index timer around the arenas.
// ---------------------------------------------------------------------------

export interface ExplosionOptions {
  site: Vector3;
  index: number;
  cfg: ExplosionPhaseConfig;
  color: readonly [number, number, number];
}

export class ExplosionController implements FxController {
  private readonly core: Mesh;
  private readonly smoke: Mesh;
  private readonly sparks: ParticleSystem;
  private readonly coreMat: StandardMaterial;
  private readonly smokeMat: StandardMaterial;
  private readonly index: number;
  private readonly cfg: ExplosionPhaseConfig;
  private readonly cr: number;
  private readonly cg: number;
  private readonly cb: number;
  private readonly out: ExplosionState = { active: false, k: 0, radius: 0, coreAlpha: 0, smokeAlpha: 0, flash: 0 };

  constructor(scene: Scene, dotTex: Texture, opts: ExplosionOptions) {
    this.index = opts.index;
    this.cfg = opts.cfg;
    [this.cr, this.cg, this.cb] = opts.color;

    this.coreMat = unlitMat(scene, `login-expl-core-${this.index}`, this.cr, this.cg, this.cb);
    this.core = MeshBuilder.CreateSphere(`login-expl-core-mesh-${this.index}`, { diameter: 2, segments: 10 }, scene);
    this.core.position.copyFrom(opts.site);
    this.core.material = this.coreMat;
    this.core.isPickable = false;
    this.core.isVisible = false;

    this.smokeMat = unlitMat(scene, `login-expl-smoke-${this.index}`, 0.14, 0.12, 0.13);
    this.smoke = MeshBuilder.CreateSphere(`login-expl-smoke-mesh-${this.index}`, { diameter: 2, segments: 8 }, scene);
    this.smoke.position.copyFrom(opts.site);
    this.smoke.material = this.smokeMat;
    this.smoke.isPickable = false;
    this.smoke.isVisible = false;

    this.sparks = new ParticleSystem(`login-expl-sparks-${this.index}`, 80, scene);
    this.sparks.particleTexture = dotTex;
    this.sparks.emitter = opts.site.clone();
    this.sparks.minEmitBox = new Vector3(-0.4, -0.4, -0.4);
    this.sparks.maxEmitBox = new Vector3(0.4, 0.4, 0.4);
    this.sparks.color1 = new Color4(1.0, 0.8, 0.35, 1);
    this.sparks.color2 = new Color4(1.0, 0.45, 0.15, 1);
    this.sparks.colorDead = new Color4(0.5, 0.15, 0.05, 0);
    this.sparks.minSize = 0.1;
    this.sparks.maxSize = 0.42;
    this.sparks.minLifeTime = 0.3;
    this.sparks.maxLifeTime = 0.9;
    this.sparks.emitRate = 0; // pulsed at ignition
    this.sparks.direction1 = new Vector3(-1, -1, -1);
    this.sparks.direction2 = new Vector3(1, 1, 1);
    this.sparks.minEmitPower = 2;
    this.sparks.maxEmitPower = 7;
    this.sparks.gravity = new Vector3(0, -3, 0);
    this.sparks.blendMode = ParticleSystem.BLENDMODE_ADD;
    this.sparks.start();
  }

  update(t: number): number {
    const s = writeExplosionState(this.out, t, this.index, this.cfg);

    this.core.isVisible = s.active && s.coreAlpha > 0.01;
    if (this.core.isVisible) {
      this.core.scaling.setAll(s.radius < 0.01 ? 0.01 : s.radius);
      this.coreMat.alpha = s.coreAlpha;
      const g = 0.7 + 0.6 * s.flash;
      this.coreMat.emissiveColor.set(this.cr * g, this.cg * g, this.cb * g);
    }

    this.smoke.isVisible = s.active && s.smokeAlpha > 0.01;
    if (this.smoke.isVisible) {
      this.smoke.scaling.setAll(s.radius < 0.01 ? 0.01 : s.radius * 1.4);
      this.smokeMat.alpha = s.smokeAlpha;
    }

    this.sparks.emitRate = s.flash > 0.6 ? 240 : 0; // brief burst at the flash
    return s.flash * 0.5;
  }

  dispose(): void {
    this.sparks.dispose();
    this.core.dispose();
    this.smoke.dispose();
    this.coreMat.dispose();
    this.smokeMat.dispose();
  }
}

// ---------------------------------------------------------------------------
// COMBAT FLASHES — quick clash sparkle pops between the islands (unseen
// fighters). Cheap billboarded sprites, staggered per point.
// ---------------------------------------------------------------------------

export interface CombatFlashOptions {
  points: Vector3[];
  cfg: FlashPhaseConfig;
  color?: readonly [number, number, number];
}

export class CombatFlashController implements FxController {
  private readonly planes: Mesh[] = [];
  private readonly mats: StandardMaterial[] = [];
  private readonly cfg: FlashPhaseConfig;
  private readonly out: FlashState = { active: false, k: 0, alpha: 0, scale: 0 };

  constructor(scene: Scene, dotTex: Texture, opts: CombatFlashOptions) {
    this.cfg = opts.cfg;
    const [cr, cg, cb] = opts.color ?? [1.0, 0.95, 0.8];
    for (let i = 0; i < opts.points.length; i++) {
      const mat = new StandardMaterial(`login-flash-mat-${i}`, scene);
      mat.diffuseTexture = dotTex;
      mat.opacityTexture = dotTex;
      mat.useAlphaFromDiffuseTexture = true;
      mat.emissiveColor = new Color3(cr, cg, cb);
      mat.diffuseColor = new Color3(0, 0, 0);
      mat.specularColor = new Color3(0, 0, 0);
      mat.disableLighting = true;
      mat.alpha = 0;
      const plane = MeshBuilder.CreatePlane(`login-flash-${i}`, { size: 2 }, scene);
      plane.material = mat;
      plane.billboardMode = BILLBOARD_ALL;
      plane.isPickable = false;
      plane.position.copyFrom(opts.points[i]!);
      plane.isVisible = false;
      this.planes.push(plane);
      this.mats.push(mat);
    }
  }

  update(t: number): number {
    let bloom = 0;
    for (let i = 0; i < this.planes.length; i++) {
      const s = writeFlashState(this.out, t, i, this.cfg);
      const vis = s.active && s.alpha > 0.01;
      this.planes[i]!.isVisible = vis;
      if (vis) {
        this.planes[i]!.scaling.setAll(s.scale);
        this.mats[i]!.alpha = s.alpha;
        bloom += s.alpha * 0.05;
      }
    }
    return bloom > 0.3 ? 0.3 : bloom;
  }

  dispose(): void {
    for (const m of this.planes) m.dispose();
    for (const mt of this.mats) mt.dispose();
    this.planes.length = 0;
    this.mats.length = 0;
  }
}

// ---------------------------------------------------------------------------

/** A shared unlit emissive material (disableLighting) at a base colour. */
function unlitMat(scene: Scene, name: string, r: number, g: number, b: number): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.emissiveColor = new Color3(r, g, b);
  m.diffuseColor = new Color3(0, 0, 0);
  m.specularColor = new Color3(0, 0, 0);
  m.disableLighting = true;
  return m;
}
