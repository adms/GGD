/**
 * vfxPresets — SHARED combat-vfx preset toolkit (task #33 toolkit phase).
 *
 * The retune phase builds ON this file; it deliberately does NOT change any
 * existing effect. What it provides:
 *
 *   1. PURE gradient helpers (Diablo/LoL school): hot→cool 4-stop color ramps
 *      with sharp-in/exponential-out alpha, pop-in-large→shrink-to-nothing
 *      size ramps, and `frontLoadCounts` to convert a trickle (continuous
 *      emitRate) into an impact-first burst + short tail.
 *   2. `BurstSpec` + `makeBurstSystem`/`fireBurst` — a burst-emitter factory
 *      (count / speed / gravity / drag / lifetime / blend / stretch) so every
 *      layer is authored with the same 8 knobs.
 *   3. `BurstPool` — keyed free-list pool (cap per key, LRU steal, idle reap)
 *      so repeated impacts NEVER allocate a new ParticleSystem per hit.
 *   4. `ImpactComposer` — the layered impact: white-hot core flash (1–3
 *      frames) + gravity/drag stretched sparks + low-alpha standard-blend
 *      smoke body + expanding shockwave ring on heavy/EX, all from ONE
 *      `fire(intensity, x, z, nowMs)` call with a light/heavy/ex knob.
 *
 * Layered particles land on the existing hit-sync frame for free: callers
 * fire from the same GameApp event drain that drives hitstop/shake/flash.
 *
 * Usage sketch (retune phase):
 *   const composer = new ImpactComposer(scene);
 *   composer.fire("heavy", x, z, nowMs, { tint: IMPACT_TINTS.physical });
 *   composer.update(nowMs);   // once per frame
 *   composer.dispose();       // scene teardown
 *
 * Everything pure is unit-tested on NullEngine in vfxPresets.test.ts.
 */
import type { Scene } from "@babylonjs/core/scene";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { VfxBlendMode } from "@ggd/shared/content";
import { blendModeFor, type ColorStop, type SizeStop } from "./particleFactory";

export type { ColorStop, SizeStop };

/** [r, g, b] each 0..1 */
export type Rgb = readonly [number, number, number];

const CONTENT_BASE = "/content/";

// ---------------------------------------------------------------------------
// Pure gradient helpers
// ---------------------------------------------------------------------------

/** True when stop `t`s are strictly ascending (valid Babylon gradient). */
export function stopsAscending(stops: readonly (readonly [number, unknown])[]): boolean {
  for (let i = 1; i < stops.length; i++) {
    if (stops[i]![0] <= stops[i - 1]![0]) return false;
  }
  return true;
}

/**
 * Hot→cool 4-stop color ramp: white-hot core → full tint → cooled/darkened
 * tint → transparent black. Alpha is sharp-in (starts at peak) with an
 * exponential-feeling fade-out (1 → 1 → ~0.35 → 0).
 */
export function hotToCoolStops(
  tint: Rgb,
  opts: {
    /** alpha at the white-hot start (default 1) */
    peakAlpha?: number;
    /** t where the ramp reaches full tint (default 0.15) */
    hotT?: number;
  } = {},
): ColorStop[] {
  const a = opts.peakAlpha ?? 1;
  const hotT = opts.hotT ?? 0.15;
  const coolT = Math.min(0.999, hotT + (1 - hotT) * 0.45);
  const cool = tint.map((c) => c * 0.35) as unknown as Rgb;
  return [
    [0, [1, 1, 1, a]], // white-hot core
    [hotT, [tint[0], tint[1], tint[2], a]], // full tint
    [coolT, [cool[0], cool[1], cool[2], a * 0.35]], // cooled + fading
    [1, [0, 0, 0, 0]], // gone
  ];
}

/**
 * Pop-in-large → shrink-to-nothing size ramp: starts under peak, overshoots
 * to `peak` fast, then shrinks linearly to (near) zero. Never constant-size.
 */
export function popShrinkStops(
  peak: number,
  opts: {
    /** t of the peak overshoot (default 0.12) */
    popT?: number;
    /** end size as a fraction of peak (default 0 = shrink to nothing) */
    endFrac?: number;
  } = {},
): SizeStop[] {
  const popT = opts.popT ?? 0.12;
  const endFrac = opts.endFrac ?? 0;
  return [
    [0, peak * 0.45],
    [popT, peak],
    [1, peak * endFrac],
  ];
}

/**
 * Low-alpha "body" color ramp for standard-blend smoke/dust: constant hue,
 * alpha in at peak then exponential-feeling fade to 0. Gives hits WEIGHT
 * without additive bloom.
 */
export function softBodyColorStops(
  rgb: Rgb,
  /** peak smoke alpha (keep LOW, ~0.25–0.4 — it's a body layer, not a wall) */
  peakAlpha: number,
): ColorStop[] {
  return [
    [0, [rgb[0], rgb[1], rgb[2], peakAlpha]],
    [0.35, [rgb[0], rgb[1], rgb[2], peakAlpha * 0.55]],
    [1, [rgb[0], rgb[1], rgb[2], 0]],
  ];
}

/**
 * Impact-first energy split for retuning CONTINUOUS trickle docs: the same
 * total particle count (rate × avg life) lands as an immediate burst plus a
 * short low-rate tail, instead of being spread flat over the play window.
 * `tailShare` is the fraction of the energy kept in the tail (default 25%).
 */
export function frontLoadCounts(
  ratePerSec: number,
  avgLifeSec: number,
  tailShare = 0.25,
): { burstCount: number; tailRate: number } {
  const total = Math.max(1, ratePerSec * avgLifeSec);
  const clampedShare = Math.min(Math.max(tailShare, 0), 1);
  return {
    burstCount: Math.max(1, Math.ceil(total * (1 - clampedShare))),
    tailRate: Math.ceil(ratePerSec * clampedShare),
  };
}

// ---------------------------------------------------------------------------
// BurstSpec — the 8-knob burst layer definition
// ---------------------------------------------------------------------------

export interface BurstSpec {
  /** particles per burst BEFORE the quality scale (impact target: 24–80) */
  count: number;
  /** per-particle life seconds (impact layers: 0.15–0.5; smoke may reach 0.6) */
  lifetimeSec: { min: number; max: number };
  /** emit power range (world-units/s initial velocity) */
  speed: { min: number; max: number };
  /** size-over-life stops (use popShrinkStops — never constant-size) */
  sizeStops: readonly SizeStop[];
  /** color+alpha-over-life stops (use hotToCoolStops / softBodyColorStops) */
  colorStops: readonly ColorStop[];
  /** blend: "additive" for flash/sparks, "alpha" for smoke body */
  blend: VfxBlendMode;
  /** world-units/s² vertical accel; negative pulls sparks down (default 0) */
  gravityY?: number;
  /** 0..1 velocity damping over life; higher = particles stop sooner */
  drag?: number;
  /** stretch billboards along velocity (spark streaks) */
  stretched?: boolean;
  /** stretch ratio for stretched billboards (default 1) */
  tailLength?: number;
  /** sphere-shell emitter radius (radial spray); absent = up-biased point */
  emitterRadius?: number;
  /**
   * DIRECTED spray (task #39 blood/debris): a sphere-shell emitter whose
   * velocity cone is aimed per-fire via `setBurstDirection`, so one pooled
   * system serves every incoming angle (direction is NOT baked into the pool
   * key). Takes precedence over `emitterRadius`.
   */
  directed?: { radius: number; spreadRad: number };
  /**
   * FLAT RING spray (task #39 landing dust): a cylinder emitter throwing
   * particles radially outward and barely upward — the shape a body/landing
   * kicks off the floor, which neither a sphere nor a cone can express.
   * Lower precedence than `directed`, higher than `emitterRadius`.
   */
  flatRing?: { radius: number; height: number };
  /** content-relative texture path (assets/…); absent = default quad */
  texture?: string;
}

/** Quality-scaled particle count (mobile halves budgets; never below 1). */
export function scaledCount(count: number, scale = 1): number {
  return Math.max(1, Math.ceil(count * scale));
}

/** Absolute per-system capacity ceiling (overdraw discipline). */
export const HARD_CAPACITY_CAP = 256;

/** Pool capacity for a burst count: 2 bursts in flight, clamped 8..cap. */
export function capacityForCount(count: number, scale = 1): number {
  return Math.min(HARD_CAPACITY_CAP, Math.max(8, scaledCount(count, scale) * 2));
}

export interface PresetSystemOptions {
  /** quality-tier particle budget multiplier (RenderConfig), default 1 */
  scale?: number;
  /** ParticleSystem name (debug/inspector) */
  name?: string;
  /** content-relative texture path → URL (default: "/content/" + path) */
  resolveTextureUrl?: (contentPath: string) => string;
  /** test seam: URL → Babylon texture (NullEngine tests inject () => null) */
  createTexture?: (url: string, scene: Scene) => BaseTexture | null;
}

/**
 * Build a (stopped) ParticleSystem for a BurstSpec. Caller owns lifecycle;
 * prefer BurstPool/ImpactComposer which pool + reuse these per key.
 */
export function makeBurstSystem(
  spec: BurstSpec,
  scene: Scene,
  opts: PresetSystemOptions = {},
): ParticleSystem {
  const scale = opts.scale ?? 1;
  const ps = new ParticleSystem(opts.name ?? "vfx-preset", capacityForCount(spec.count, scale), scene);

  if (spec.texture) {
    const url = (opts.resolveTextureUrl ?? ((p: string): string => CONTENT_BASE + p))(spec.texture);
    const make =
      opts.createTexture ?? ((u: string, s: Scene): BaseTexture => new Texture(u, s, false, false));
    ps.particleTexture = make(url, scene) as Texture | null;
  }

  ps.emitter = new Vector3(0, 1, 0);
  if (spec.directed) {
    // aimed cone — direction1/direction2 are re-pointed per fire, never baked
    ps.createDirectedSphereEmitter(spec.directed.radius, new Vector3(0, 1, 0), new Vector3(0, 1, 0));
  } else if (spec.flatRing) {
    ps.createCylinderEmitter(spec.flatRing.radius, spec.flatRing.height, 1, 0.2); // radial floor kick
  } else if (spec.emitterRadius !== undefined && spec.emitterRadius > 0) {
    ps.createSphereEmitter(spec.emitterRadius, 0.35); // radial spray
  } else {
    ps.createPointEmitter(new Vector3(-0.6, 0.3, -0.6), new Vector3(0.6, 1, 0.6)); // up-biased splash
  }

  ps.minLifeTime = spec.lifetimeSec.min;
  ps.maxLifeTime = spec.lifetimeSec.max;
  ps.minEmitPower = spec.speed.min;
  ps.maxEmitPower = spec.speed.max;
  ps.updateSpeed = 0.016;

  for (const [t, s] of spec.sizeStops) ps.addSizeGradient(t, s);
  for (const [t, c] of spec.colorStops) ps.addColorGradient(t, new Color4(c[0], c[1], c[2], c[3]));

  ps.blendMode = blendModeFor(spec.blend);
  ps.gravity = spec.gravityY !== undefined ? new Vector3(0, spec.gravityY, 0) : Vector3.Zero();
  if (spec.drag !== undefined && spec.drag > 0) {
    // ramp drag up over life: full speed at birth, decelerating into death
    ps.addDragGradient(0, spec.drag * 0.5);
    ps.addDragGradient(1, spec.drag);
  }
  if (spec.stretched) {
    ps.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
    const tail = spec.tailLength ?? 1;
    ps.minScaleY = tail;
    ps.maxScaleY = tail;
  }

  // burst-only: fired via fireBurst() / manualEmitCount, never emitRate
  ps.emitRate = 0;
  ps.manualEmitCount = 0;
  return ps;
}

/** Queue one quality-scaled burst on a preset system. Returns the count. */
export function fireBurst(ps: ParticleSystem, spec: BurstSpec, scale = 1): number {
  const n = scaledCount(spec.count, scale);
  ps.manualEmitCount = n;
  return n;
}

/** Minimal shape of Babylon's SphereDirectedParticleEmitter we drive. */
interface DirectedEmitter {
  direction1: Vector3;
  direction2: Vector3;
}

function asDirected(ps: ParticleSystem): DirectedEmitter | null {
  const t = ps.particleEmitterType as Partial<DirectedEmitter> | null;
  return t && t.direction1 instanceof Vector3 && t.direction2 instanceof Vector3
    ? (t as DirectedEmitter)
    : null;
}

/**
 * Aim a `directed` burst system's velocity cone (see BurstSpec.directed).
 * Particles are only created on the next animate(), so this may be applied
 * AFTER fireBurst/fireAt has queued the burst — which is exactly what lets one
 * pooled system serve every incoming hit angle. No-op on a non-directed system.
 * Returns true when the aim was applied (test seam).
 */
export function setBurstDirection(
  ps: ParticleSystem,
  d1: readonly [number, number, number],
  d2: readonly [number, number, number],
): boolean {
  const emitter = asDirected(ps);
  if (!emitter) return false;
  emitter.direction1.set(d1[0], d1[1], d1[2]);
  emitter.direction2.set(d2[0], d2[1], d2[2]);
  return true;
}

/** Read a directed system's current aim (test/observability seam). */
export function burstDirection(
  ps: ParticleSystem,
): { d1: [number, number, number]; d2: [number, number, number] } | null {
  const emitter = asDirected(ps);
  if (!emitter) return null;
  return {
    d1: [emitter.direction1.x, emitter.direction1.y, emitter.direction1.z],
    d2: [emitter.direction2.x, emitter.direction2.y, emitter.direction2.z],
  };
}

// ---------------------------------------------------------------------------
// BurstPool — keyed free-list pooling (no allocation per hit)
// ---------------------------------------------------------------------------

/** Max pooled systems per key (mirrors VfxSystem's per-doc discipline). */
export const MAX_POOL_PER_KEY = 4;

/** Idle ms after which a pooled system is disposed (auto-dispose one-shots). */
export const IDLE_REAP_MS = 8000;

interface PoolEntry {
  ps: ParticleSystem;
  spec: BurstSpec;
  lastUsedMs: number;
}

/**
 * Keyed ParticleSystem free-list: same-frame replays each get their own
 * system, the list caps at MAX_POOL_PER_KEY (LRU stolen beyond), idle
 * systems are reused, and systems idle past `idleReapMs` are disposed by
 * update(). The KEY must uniquely identify the spec (bake tint/intensity
 * into it) because gradients are baked at system creation.
 */
export class BurstPool {
  private readonly pool = new Map<string, PoolEntry[]>();

  constructor(
    private readonly scene: Scene,
    private readonly opts: PresetSystemOptions & {
      /** free-list cap per key (default MAX_POOL_PER_KEY) */
      maxPerKey?: number;
      /** idle ms before a pooled system is disposed (default IDLE_REAP_MS) */
      idleReapMs?: number;
    } = {},
  ) {}

  /** pooled instances currently held for a key (test/observability seam) */
  countFor(key: string): number {
    return this.pool.get(key)?.length ?? 0;
  }

  /**
   * Fire `spec` at a world position: reuse an idle system, else grow the
   * free-list to the cap, else steal the least-recently-used. Returns the
   * system used.
   */
  fireAt(key: string, spec: BurstSpec, x: number, z: number, y: number, nowMs: number, scale = 1): ParticleSystem {
    let list = this.pool.get(key);
    if (!list) {
      list = [];
      this.pool.set(key, list);
    }
    const busyMs = spec.lifetimeSec.max * 1000;
    // 1) an idle instance (all its particles have expired)
    let entry = list.find((e) => nowMs - e.lastUsedMs >= busyMs);
    // 2) grow the free-list up to the cap
    if (!entry && list.length < (this.opts.maxPerKey ?? MAX_POOL_PER_KEY)) {
      entry = {
        ps: makeBurstSystem(spec, this.scene, { ...this.opts, name: `vfx-preset-${key}` }),
        spec,
        lastUsedMs: -Infinity,
      };
      list.push(entry);
    }
    // 3) steal the least-recently-used (its particles are the oldest on screen)
    if (!entry) {
      entry = list[0]!;
      for (const e of list) if (e.lastUsedMs < entry.lastUsedMs) entry = e;
    }
    entry.lastUsedMs = nowMs;
    const ps = entry.ps;
    (ps.emitter as Vector3).set(x, y, z);
    if (!ps.isStarted()) ps.start();
    fireBurst(ps, spec, scale);
    return ps;
  }

  /** Reap systems idle past idleReapMs (call once per frame). */
  update(nowMs: number): void {
    const reapMs = this.opts.idleReapMs ?? IDLE_REAP_MS;
    for (const [key, list] of this.pool) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (nowMs - list[i]!.lastUsedMs >= reapMs) {
          list[i]!.ps.dispose();
          list.splice(i, 1);
        }
      }
      if (list.length === 0) this.pool.delete(key);
    }
  }

  dispose(): void {
    for (const list of this.pool.values()) for (const e of list) e.ps.dispose();
    this.pool.clear();
  }
}

// ---------------------------------------------------------------------------
// Shockwave ring — expanding ground disc for heavy/EX hits
// ---------------------------------------------------------------------------

export interface RingSpec {
  /** ring radius at t=0 (world units) */
  startRadius: number;
  /** ring radius at t=1 */
  endRadius: number;
  /** ring life in ms (short — it's a punch accent, not a telegraph) */
  lifeMs: number;
  /** starting alpha (fades to 0) */
  alpha: number;
}

/** Pure ring shape at normalized time t: ease-out radius, (1-t)² alpha. */
export function ringShape(t: number, spec: RingSpec): { radius: number; alpha: number } {
  const k = Math.min(Math.max(t, 0), 1);
  const easeOut = 1 - (1 - k) * (1 - k);
  return {
    radius: spec.startRadius + (spec.endRadius - spec.startRadius) * easeOut,
    alpha: spec.alpha * (1 - k) * (1 - k),
  };
}

/** Max pooled ring meshes across the composer (steal oldest beyond). */
export const MAX_RINGS = 6;

/** Pooled expanding-ring mesh (torus, emissive, alpha fade). */
class ShockwaveRing {
  readonly mesh: Mesh;
  private readonly mat: StandardMaterial;
  private spec: RingSpec = { startRadius: 0.3, endRadius: 1.5, lifeMs: 240, alpha: 0.8 };
  private bornMs = -Infinity;
  active = false;

  constructor(scene: Scene) {
    this.mat = new StandardMaterial("vfx-ring-mat", scene);
    this.mat.disableLighting = true;
    this.mat.emissiveColor = new Color3(1, 1, 1);
    // unit-diameter torus lying flat on XZ; scaled per spec each frame
    this.mesh = MeshBuilder.CreateTorus("vfx-ring", { diameter: 1, thickness: 0.09, tessellation: 40 }, scene);
    this.mesh.material = this.mat;
    this.mesh.isPickable = false;
    this.mesh.setEnabled(false);
  }

  reset(x: number, z: number, nowMs: number, spec: RingSpec, tint: Rgb): void {
    this.spec = spec;
    this.bornMs = nowMs;
    this.active = true;
    this.mat.emissiveColor.set(tint[0], tint[1], tint[2]);
    this.mesh.position.set(x, 0.08, z); // hug the ground — shockwaves read at floor level
    this.mesh.setEnabled(true);
    this.update(nowMs);
  }

  update(nowMs: number): void {
    if (!this.active) return;
    const t = (nowMs - this.bornMs) / this.spec.lifeMs;
    if (t >= 1) {
      this.active = false;
      this.mesh.setEnabled(false);
      return;
    }
    const { radius, alpha } = ringShape(t, this.spec);
    const d = radius * 2;
    this.mesh.scaling.set(d, 1, d);
    this.mat.alpha = alpha;
  }

  get ageMs(): number {
    return this.bornMs;
  }

  dispose(): void {
    this.mesh.dispose(false, true);
  }
}

// ---------------------------------------------------------------------------
// Impact composer — layered flash + sparks + smoke (+ ring) in one call
// ---------------------------------------------------------------------------

export type ImpactIntensity = "light" | "heavy" | "ex";

export interface ImpactRecipe {
  /** layer 1: white-hot additive core flash, 1–3 frames */
  flash: BurstSpec;
  /** layer 2: fast gravity+drag stretched spark streaks */
  sparks: BurstSpec;
  /** layer 3: low-alpha standard-blend smoke body (weight) */
  smoke: BurstSpec;
  /** layer 4: expanding ground shockwave ring (heavy/ex only) */
  ring?: RingSpec;
}

/** Convenience impact tints (dmgType colors mirror VfxSystem's spark map). */
export const IMPACT_TINTS = {
  physical: [1, 0.72, 0.28],
  magic: [0.68, 0.5, 1],
  true: [1, 1, 1],
  guardBreak: [0.9, 0.95, 1],
} as const satisfies Record<string, Rgb>;

/** Per-intensity tuning: counts/lifetimes/sizes per the AAA-target ranges. */
const IMPACT_TUNING = {
  light: { flashN: 2, flashSize: 0.9, flashLife: 0.04, sparkN: 24, sparkLife: 0.28, sparkSize: 0.12, sparkSpeed: 8.5, smokeN: 6, smokeSize: 0.55, smokeAlpha: 0.28, ring: undefined as RingSpec | undefined },
  heavy: { flashN: 3, flashSize: 1.3, flashLife: 0.045, sparkN: 36, sparkLife: 0.32, sparkSize: 0.15, sparkSpeed: 10, smokeN: 10, smokeSize: 0.75, smokeAlpha: 0.33, ring: { startRadius: 0.3, endRadius: 1.7, lifeMs: 240, alpha: 0.8 } as RingSpec },
  ex: { flashN: 4, flashSize: 1.8, flashLife: 0.05, sparkN: 56, sparkLife: 0.35, sparkSize: 0.18, sparkSpeed: 12, smokeN: 14, smokeSize: 0.95, smokeAlpha: 0.38, ring: { startRadius: 0.4, endRadius: 2.6, lifeMs: 320, alpha: 0.9 } as RingSpec },
} as const;

/**
 * PURE recipe for a layered impact at an intensity, tinted by damage type.
 * All energy lands at t=0 (manual bursts), lifetimes are short, gradients
 * are hot→cool with pop-shrink sizes — fewer/bigger/brighter/shorter.
 */
export function impactRecipe(intensity: ImpactIntensity, tint: Rgb): ImpactRecipe {
  const t = IMPACT_TUNING[intensity];
  return {
    flash: {
      count: t.flashN,
      lifetimeSec: { min: 0.033, max: t.flashLife }, // 1–3 frames at 60fps
      speed: { min: 0, max: 0.4 }, // stays on the impact point
      sizeStops: popShrinkStops(t.flashSize, { popT: 0.2, endFrac: 0.4 }),
      colorStops: hotToCoolStops(tint, { hotT: 0.3 }),
      blend: "additive",
      texture: "assets/textures/particles/flare_01.png",
    },
    sparks: {
      count: t.sparkN,
      lifetimeSec: { min: 0.15, max: t.sparkLife },
      speed: { min: t.sparkSpeed * 0.55, max: t.sparkSpeed },
      sizeStops: popShrinkStops(t.sparkSize),
      colorStops: hotToCoolStops(tint),
      blend: "additive",
      gravityY: -14, // sparks arc down hard
      drag: 0.4,
      stretched: true,
      tailLength: 2.2,
      emitterRadius: 0.15, // radial spray from the hit point
      texture: "assets/textures/particles/spark_05_rotated.png",
    },
    smoke: {
      count: t.smokeN,
      lifetimeSec: { min: 0.4, max: 0.6 },
      speed: { min: 0.6, max: 1.6 },
      sizeStops: popShrinkStops(t.smokeSize, { popT: 0.25 }),
      colorStops: softBodyColorStops([0.45, 0.45, 0.5], t.smokeAlpha),
      blend: "alpha", // standard blend = the WEIGHT layer
      gravityY: 0.5, // drifts up gently
      drag: 0.85,
      emitterRadius: 0.35,
      texture: "assets/textures/particles/smoke_05.png",
    },
    ring: t.ring,
  };
}

/**
 * Layered impact composer: ONE call fires core flash + sparks + smoke (+
 * shockwave ring on heavy/ex) at a world point, pooled per intensity+tint so
 * repeated hits allocate nothing. Call update(nowMs) once per frame and
 * dispose() on scene teardown.
 */
export class ImpactComposer {
  private readonly pool: BurstPool;
  private readonly rings: ShockwaveRing[] = [];

  constructor(
    private readonly scene: Scene,
    opts: PresetSystemOptions = {},
  ) {
    this.pool = new BurstPool(scene, opts);
  }

  /** Active (still-expanding) shockwave rings (test/observability seam). */
  get activeRingCount(): number {
    return this.rings.filter((r) => r.active).length;
  }

  /**
   * Fire a layered impact. `tint` is the damage-type color (IMPACT_TINTS),
   * `scale` the quality-tier particle budget, `y` the impact height.
   * Returns the particle systems used (flash, sparks, smoke) for tests.
   */
  fire(
    intensity: ImpactIntensity,
    x: number,
    z: number,
    nowMs: number,
    opts: { tint?: Rgb; y?: number; scale?: number } = {},
  ): ParticleSystem[] {
    const tint = opts.tint ?? IMPACT_TINTS.physical;
    const y = opts.y ?? 1.0;
    const scale = opts.scale ?? 1;
    const recipe = impactRecipe(intensity, tint);
    // pool key bakes intensity + tint: gradients are baked per system
    const keyBase = `${intensity}/${tint[0]},${tint[1]},${tint[2]}`;
    const used = [
      this.pool.fireAt(`${keyBase}/flash`, recipe.flash, x, z, y, nowMs, scale),
      this.pool.fireAt(`${keyBase}/sparks`, recipe.sparks, x, z, y, nowMs, scale),
      this.pool.fireAt(`${keyBase}/smoke`, recipe.smoke, x, z, y, nowMs, scale),
    ];
    if (recipe.ring) this.fireRing(x, z, nowMs, recipe.ring, tint);
    return used;
  }

  private fireRing(x: number, z: number, nowMs: number, spec: RingSpec, tint: Rgb): void {
    // reuse an inactive ring, else grow to MAX_RINGS, else steal the oldest
    let ring = this.rings.find((r) => !r.active);
    if (!ring && this.rings.length < MAX_RINGS) {
      ring = new ShockwaveRing(this.scene);
      this.rings.push(ring);
    }
    if (!ring) {
      ring = this.rings[0]!;
      for (const r of this.rings) if (r.ageMs < ring.ageMs) ring = r;
    }
    ring.reset(x, z, nowMs, spec, tint);
  }

  /** Advance rings + reap idle pooled systems. Call once per frame. */
  update(nowMs: number): void {
    for (const r of this.rings) r.update(nowMs);
    this.pool.update(nowMs);
  }

  dispose(): void {
    this.pool.dispose();
    for (const r of this.rings) r.dispose();
    this.rings.length = 0;
  }
}
