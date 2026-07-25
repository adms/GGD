/**
 * Telegraph — ground ring + magic-circle fill for AoE casts, with a RESOLVE
 * POP payoff (task #33 retune). The outer ring shows the full area
 * immediately (readability-critical — unchanged); the inner disc scale-fills
 * over the telegraph duration while slowly spinning. When the AoE actually
 * FIRES (fill complete) the moment lands: an expanding ground shockwave ring
 * + a stretched ember kick + a low-alpha dust body puff, then the telegraph
 * fades with an exponential-out curve instead of the old linear fade.
 *
 * Zero per-cast allocation: ring/fill/shockwave meshes AND the kick particle
 * systems come from per-scene free-list pools (the magic-circle texture is
 * loaded once per scene, not per cast).
 */
import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import {
  BurstPool,
  ringShape,
  hotToCoolStops,
  popShrinkStops,
  softBodyColorStops,
  type BurstSpec,
  type RingSpec,
  type Rgb,
} from "./vfxPresets";
import {
  paletteFor,
  telegraphAlpha,
  telegraphPulse,
  type TelegraphPalette,
  type TelegraphRelation,
} from "./telegraphChannel";

const MAGIC_CIRCLE_URL = "/content/assets/textures/particles/magic_02.png";
const SPIN_RAD_PER_MS = 0.0012;

/** Telegraph identity colors (kept from the pre-retune look). */
const RING_TINT: Rgb = [0.95, 0.45, 0.2];
const FILL_TINT: Rgb = [1.0, 0.55, 0.25];
/**
 * Exported so the cast-telegraph PILLAR can be asserted against the real
 * number rather than a copied literal: the ground ring is the "where does it
 * land" contract and the column at the caster's feet may never out-shout it.
 */
export const BASE_ALPHA = 0.85;

/** Resolve-pop shockwave life (ms) — a punch accent, not a second telegraph. */
export const SHOCKWAVE_MS = 280;
/** Fill pops up to +12% scale while it fades — the "fires NOW" overshoot. */
const RESOLVE_POP_SCALE = 0.12;
/** Free-list cap per mesh kind (beyond it, released meshes are disposed). */
const MESH_POOL_CAP = 8;

/**
 * Pool key for per-radius ring meshes. The ring's diameter is BAKED into its
 * geometry (so the torus thickness stays a true 0.12 at every radius), which
 * means a pooled ring may only be reused for the radius it was built at — the
 * telegraph is the readability contract for "the AoE lands HERE" and must not
 * be off by a bucket width. 0.01u granularity: exact for authored ability
 * radii, still one shared free-list per distinct radius.
 */
function radiusKey(radius: number): string {
  return radius.toFixed(2);
}

// ---------------------------------------------------------------------------
// Per-scene shared assets: texture + mesh free-lists + kick particle pool
// ---------------------------------------------------------------------------

interface SharedAssets {
  circleTex: Texture;
  /** telegraph rings, free-list per EXACT radius (diameter is baked in) */
  rings: Map<string, Mesh[]>;
  /** unit magic-circle planes (scaled per cast) */
  fills: Mesh[];
  /** unit shockwave tori (scaled per frame while expanding) */
  shocks: Mesh[];
  /** pooled ember/dust kick systems (keys bake the radius bucket) */
  kicks: BurstPool;
}

const sharedByScene = new WeakMap<Scene, SharedAssets>();

function sharedFor(scene: Scene): SharedAssets {
  let s = sharedByScene.get(scene);
  if (!s) {
    const circleTex = new Texture(MAGIC_CIRCLE_URL, scene);
    circleTex.hasAlpha = true;
    s = { circleTex, rings: new Map(), fills: [], shocks: [], kicks: new BurstPool(scene) };
    sharedByScene.set(scene, s);
  }
  return s;
}

/** Test/observability seam: pooled free-list sizes for a scene. */
export function telegraphPoolStats(scene: Scene): { rings: number; fills: number; shocks: number } {
  const s = sharedByScene.get(scene);
  if (!s) return { rings: 0, fills: 0, shocks: 0 };
  let rings = 0;
  for (const list of s.rings.values()) rings += list.length;
  return { rings, fills: s.fills.length, shocks: s.shocks.length };
}

/**
 * The pre-#228 look, kept as the DEFAULT so every caller that has no relation
 * to express (guardianMark: a neutral tower is hostile to everyone equally)
 * renders exactly as it did. Callers that DO know the relation pass
 * `paletteFor(relation)` and get the #228 channel colours instead.
 */
const LEGACY_PALETTE: TelegraphPalette = {
  ring: RING_TINT,
  fill: FILL_TINT,
  alpha: BASE_ALPHA,
  dashed: false,
  pulseHz: 0,
  startAlphaFactor: 1,
};

/** Convenience: a mesh's emissive Color3 (every mesh here uses StandardMaterial). */
function tintOf(mesh: Mesh): Color3 {
  return (mesh.material as StandardMaterial).emissiveColor;
}

/** Palette for a caster RELATION — the seam VfxSystem/TelegraphLayer use. */
export function telegraphPaletteFor(relation: TelegraphRelation): TelegraphPalette {
  return paletteFor(relation);
}

function emissiveMat(name: string, scene: Scene, tint: Rgb): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.disableLighting = true;
  mat.emissiveColor = new Color3(tint[0], tint[1], tint[2]);
  mat.alpha = BASE_ALPHA;
  return mat;
}

function release(list: Mesh[], mesh: Mesh): void {
  mesh.setEnabled(false);
  if (list.length >= MESH_POOL_CAP) mesh.dispose(false, true);
  else list.push(mesh);
}

// ---------------------------------------------------------------------------
// Resolve-pop kick specs (vfxPresets toolkit ramps; keys bake the radius)
// ---------------------------------------------------------------------------

function emberKickSpec(radius: number): BurstSpec {
  return {
    count: 14,
    lifetimeSec: { min: 0.15, max: 0.3 },
    speed: { min: 5, max: 8.5 },
    sizeStops: popShrinkStops(0.3),
    colorStops: hotToCoolStops(FILL_TINT),
    blend: "additive",
    gravityY: -12,
    drag: 0.4,
    stretched: true,
    tailLength: 2.2,
    emitterRadius: Math.max(0.15, radius * 0.5),
    texture: "assets/textures/particles/spark_05_rotated.png",
  };
}

function dustKickSpec(radius: number): BurstSpec {
  return {
    count: 12,
    lifetimeSec: { min: 0.3, max: 0.5 },
    speed: { min: 2.2, max: 4 },
    sizeStops: popShrinkStops(0.8, { popT: 0.25 }),
    colorStops: softBodyColorStops([0.5, 0.44, 0.38], 0.3),
    blend: "alpha", // standard blend = the weight layer
    gravityY: 0.6,
    drag: 0.85,
    emitterRadius: Math.max(0.2, radius * 0.6),
    texture: "assets/textures/particles/smoke_05.png",
  };
}

// ---------------------------------------------------------------------------
// Telegraph
// ---------------------------------------------------------------------------

/**
 * Per-instance look/behaviour knobs added by task #228. All optional, so the
 * pre-#228 positional constructor keeps working unchanged.
 */
export interface TelegraphOptions {
  /**
   * Which CHANNEL this ring belongs to — the whole point of #228's requirement
   * 4. Defaults to the pre-#228 amber, which is what `guardianMark` and any
   * relation-less caller still get.
   */
  palette?: TelegraphPalette;
  /**
   * Budget degradation (telegraphChannel.telegraphTier === "outline"): ring
   * only, no magic-circle fill and no resolve kick. Still warns, costs almost
   * nothing, and keeps a crowded floor readable.
   */
  outlineOnly?: boolean;
  /**
   * Suppress the resolve PAYOFF (shockwave + ember/dust kick) but keep the
   * fade. Used by the instant-cast landing flash: an ability with no wind-up
   * has no dodge window, so it gets a "it landed HERE" mark, not a full
   * pop on top of the impact FX that already fire on the same frame.
   */
  quiet?: boolean;
}

export class Telegraph {
  private readonly shared: SharedAssets;
  private readonly ringKey: string;
  private ring: Mesh | null;
  private fill: Mesh | null;
  private shock: Mesh | null = null;
  private readonly bornMs: number;
  private resolvedAtMs = -1;
  /**
   * When the FADE clock starts. Anchored to the moment the fill COMPLETED, not
   * to the frame the pop happened, so a frame-quantised update cannot make a
   * telegraph linger past its window.
   */
  private fadeAnchorMs = -1;
  private readonly palette: TelegraphPalette;
  private readonly outlineOnly: boolean;
  private readonly quiet: boolean;
  /**
   * Externally-driven wind-up fraction (task #228). `null` = fall back to the
   * wall-clock `fillMs` timer, which is what the pre-#228 callers use.
   *
   * WHY IT EXISTS. A wall-clock fill DRIFTS from the sim: `CastResolveSystem`
   * pauses `ticksLeft` during hitstop and hitstun and aborts on stun/knockdown,
   * so a locally-timed ring both fills too early and still fires its "it lands
   * HERE" pop for a cast that was interrupted. Driven from the cast bar's own
   * source (`CastTracker.progressFor`) instead, the ring can never disagree
   * with the bar the player is reading above the caster's head.
   */
  private drivenT: number | null = null;
  done = false;

  constructor(
    private readonly scene: Scene,
    private x: number,
    private z: number,
    private readonly radius: number,
    nowMs: number,
    private readonly fillMs = 300,
    private readonly holdMs = 150,
    opts: TelegraphOptions = {},
  ) {
    this.bornMs = nowMs;
    this.shared = sharedFor(scene);
    this.ringKey = radiusKey(radius);
    this.palette = opts.palette ?? LEGACY_PALETTE;
    this.outlineOnly = opts.outlineOnly === true;
    this.quiet = opts.quiet === true || this.outlineOnly;

    // ---- outer ring (pooled per exact radius: thickness stays 0.12) ----
    let list = this.shared.rings.get(this.ringKey);
    if (!list) {
      list = [];
      this.shared.rings.set(this.ringKey, list);
    }
    this.ring =
      list.pop() ??
      MeshBuilder.CreateTorus(
        "telegraph-ring",
        { diameter: radius * 2, thickness: 0.12, tessellation: 48 },
        scene,
      );
    if (!this.ring.material) this.ring.material = emissiveMat("telegraph-ring", scene, this.palette.ring);
    // A POOLED mesh keeps the material it was built with, so the channel tint
    // has to be (re)applied on every acquire or a recycled enemy ring would
    // render an ally's cast in danger crimson.
    tintOf(this.ring).set(this.palette.ring[0], this.palette.ring[1], this.palette.ring[2]);
    (this.ring.material as StandardMaterial).alpha = telegraphAlpha(this.palette, 0);
    this.ring.position.set(x, 0.06, z);
    this.ring.isPickable = false;
    this.ring.setEnabled(true);

    // ---- magic-circle fill (pooled unit plane, scaled per cast) ----
    if (this.outlineOnly) {
      this.fill = null;
      return;
    }
    this.fill =
      this.shared.fills.pop() ??
      MeshBuilder.CreatePlane("telegraph-fill", { size: 1, sideOrientation: 2 /* DOUBLESIDE */ }, scene);
    if (!this.fill.material) {
      const mat = emissiveMat("telegraph-fill", scene, this.palette.fill);
      mat.emissiveTexture = this.shared.circleTex;
      mat.opacityTexture = this.shared.circleTex;
      this.fill.material = mat;
    }
    tintOf(this.fill).set(this.palette.fill[0], this.palette.fill[1], this.palette.fill[2]);
    (this.fill.material as StandardMaterial).alpha = telegraphAlpha(this.palette, 0);
    this.fill.rotation.x = Math.PI / 2;
    this.fill.rotation.y = 0;
    this.fill.position.set(x, 0.05, z);
    this.fill.isPickable = false;
    this.fill.scaling.set(0.01, 0.01, 1);
    this.fill.setEnabled(true);
  }

  /**
   * Feed the SIM's wind-up fraction (0→1). Once called, the wall-clock timer is
   * ignored for the rest of this telegraph's life and the ring resolves exactly
   * when `t` reaches 1 — i.e. when the cast bar completes and the damage lands.
   */
  setProgress(t: number): void {
    if (this.done) return;
    this.drivenT = t < 0 ? 0 : t > 1 ? 1 : t;
  }

  /**
   * Re-anchor a CASTER-CENTRED telegraph (the `self` marker). A ground AoE is
   * pinned to `cast.point` and must never move — this is only called for shapes
   * whose sim anchor is the caster's live position.
   */
  moveTo(x: number, z: number): void {
    if (this.done || !Number.isFinite(x) || !Number.isFinite(z)) return;
    this.x = x;
    this.z = z;
    this.ring?.position.set(x, 0.06, z);
    this.fill?.position.set(x, 0.05, z);
  }

  /**
   * INTERRUPTED (stun / knockdown / death mid-cast). Tear down with no resolve
   * pop and no shockwave: a telegraph that still says "it lands HERE" after the
   * caster was stunned out of the cast is a lie, and the cast PILLAR has always
   * handled this correctly while the ring did not.
   */
  cancel(): void {
    if (this.done) return;
    this.releaseTelegraphMeshes();
    if (this.shock) {
      release(this.shared.shocks, this.shock);
      this.shock = null;
    }
    this.done = true;
  }

  /** True once the resolve payoff (shockwave + kick) has fired. */
  get resolveFired(): boolean {
    return this.resolvedAtMs >= 0;
  }

  /** The RESOLVE moment: expanding shockwave + ember streaks + dust body. */
  private fireResolvePop(nowMs: number): void {
    this.resolvedAtMs = nowMs;
    // QUIET (instant-cast flash / outline tier): mark resolved and fade. The
    // #33/#39 impact layers already fire on this exact frame; a second payoff
    // would be budget spent saying the same thing twice.
    if (this.quiet) return;
    // shockwave: pooled unit torus, expanded/faded per frame by update()
    this.shock =
      this.shared.shocks.pop() ??
      MeshBuilder.CreateTorus("telegraph-shock", { diameter: 1, thickness: 0.09, tessellation: 40 }, this.scene);
    if (!this.shock.material) this.shock.material = emissiveMat("telegraph-shock", this.scene, this.palette.ring);
    tintOf(this.shock).set(this.palette.ring[0], this.palette.ring[1], this.palette.ring[2]);
    this.shock.position.set(this.x, 0.08, this.z);
    this.shock.isPickable = false;
    this.shock.setEnabled(true);
    this.updateShock(nowMs);
    // layered kick, pooled per radius bucket (specs bake the emitter radius)
    this.shared.kicks.fireAt(`ember/${this.ringKey}`, emberKickSpec(this.radius), this.x, this.z, 0.3, nowMs);
    this.shared.kicks.fireAt(`dust/${this.ringKey}`, dustKickSpec(this.radius), this.x, this.z, 0.25, nowMs);
  }

  private shockSpec(): RingSpec {
    return {
      startRadius: this.radius * 0.35,
      endRadius: this.radius * 1.15,
      lifeMs: SHOCKWAVE_MS,
      alpha: this.palette.alpha,
    };
  }

  /**
   * Wind-up fraction this frame. The DRIVEN value (the cast bar's own source)
   * wins whenever it has been supplied; the wall-clock ratio is only the
   * fallback for callers with a real tick-derived window and no per-frame
   * feed (guardianMark: `impactTick − tick`).
   */
  private progressAt(age: number): number {
    if (this.drivenT !== null) return this.drivenT;
    return this.fillMs > 0 ? age / this.fillMs : 1;
  }

  private updateShock(nowMs: number): void {
    if (!this.shock) return;
    const t = (nowMs - this.resolvedAtMs) / SHOCKWAVE_MS;
    if (t >= 1) {
      release(this.shared.shocks, this.shock);
      this.shock = null;
      return;
    }
    const { radius, alpha } = ringShape(t, this.shockSpec()); // ease-out + (1-t)² fade
    const d = radius * 2;
    this.shock.scaling.set(d, 1, d);
    (this.shock.material as StandardMaterial).alpha = alpha;
  }

  update(nowMs: number): void {
    if (this.done) return;
    const age = nowMs - this.bornMs;
    this.shared.kicks.update(nowMs); // reap idle pooled kick systems

    if (this.fill) this.fill.rotation.y = age * SPIN_RAD_PER_MS;

    if (this.resolvedAtMs < 0) {
      const t = this.progressAt(age);
      if (t < 1) {
        // fill phase: disc scale-fills the ring (readability look unchanged)
        if (this.fill) {
          const d = this.radius * 2 * Math.max(0.01, t);
          this.fill.scaling.set(d, d, 1);
        }
        // URGENCY (#228 requirement 3): brightness ramp + a late pulse, so
        // "about to land" reads without measuring the disc — and reads through
        // the #85 spectator desaturation, which flattens hue but not value.
        const a = telegraphAlpha(this.palette, t) * telegraphPulse(this.palette, t, nowMs);
        if (this.ring) (this.ring.material as StandardMaterial).alpha = a;
        if (this.fill) (this.fill.material as StandardMaterial).alpha = a;
        return;
      }
      // the AoE fires HERE — payoff pop exactly once, on the resolve frame
      this.fadeAnchorMs = this.drivenT !== null ? nowMs : this.bornMs + this.fillMs;
      this.fireResolvePop(nowMs);
    }
    this.updateShock(nowMs);

    const peakAlpha = telegraphAlpha(this.palette, 1);
    const fade = Math.min((nowMs - this.fadeAnchorMs) / this.holdMs, 1);
    if (fade < 1) {
      const eased = (1 - fade) * (1 - fade); // exponential-out, not linear
      const pop = 1 + RESOLVE_POP_SCALE * (1 - eased); // slight overshoot as it fires
      if (this.fill) {
        const d = this.radius * 2 * pop;
        this.fill.scaling.set(d, d, 1);
        (this.fill.material as StandardMaterial).alpha = peakAlpha * eased;
      }
      if (this.ring) (this.ring.material as StandardMaterial).alpha = peakAlpha * eased;
    } else {
      this.releaseTelegraphMeshes();
      // stay alive until the shockwave finishes its expansion
      if (!this.shock) this.finish();
    }
  }

  private releaseTelegraphMeshes(): void {
    if (this.ring) {
      release(this.shared.rings.get(this.ringKey)!, this.ring);
      this.ring = null;
    }
    if (this.fill) {
      release(this.shared.fills, this.fill);
      this.fill = null;
    }
  }

  private finish(): void {
    this.done = true;
  }

  dispose(): void {
    if (this.done) return;
    this.releaseTelegraphMeshes();
    if (this.shock) {
      release(this.shared.shocks, this.shock);
      this.shock = null;
    }
    this.done = true;
  }
}
