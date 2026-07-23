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

export class Telegraph {
  private readonly shared: SharedAssets;
  private readonly ringKey: string;
  private ring: Mesh | null;
  private fill: Mesh | null;
  private shock: Mesh | null = null;
  private readonly bornMs: number;
  private resolvedAtMs = -1;
  done = false;

  constructor(
    private readonly scene: Scene,
    private readonly x: number,
    private readonly z: number,
    private readonly radius: number,
    nowMs: number,
    private readonly fillMs = 300,
    private readonly holdMs = 150,
  ) {
    this.bornMs = nowMs;
    this.shared = sharedFor(scene);
    this.ringKey = radiusKey(radius);

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
    if (!this.ring.material) this.ring.material = emissiveMat("telegraph-ring", scene, RING_TINT);
    (this.ring.material as StandardMaterial).alpha = BASE_ALPHA;
    this.ring.position.set(x, 0.06, z);
    this.ring.isPickable = false;
    this.ring.setEnabled(true);

    // ---- magic-circle fill (pooled unit plane, scaled per cast) ----
    this.fill =
      this.shared.fills.pop() ??
      MeshBuilder.CreatePlane("telegraph-fill", { size: 1, sideOrientation: 2 /* DOUBLESIDE */ }, scene);
    if (!this.fill.material) {
      const mat = emissiveMat("telegraph-fill", scene, FILL_TINT);
      mat.emissiveTexture = this.shared.circleTex;
      mat.opacityTexture = this.shared.circleTex;
      this.fill.material = mat;
    }
    (this.fill.material as StandardMaterial).alpha = BASE_ALPHA;
    this.fill.rotation.x = Math.PI / 2;
    this.fill.rotation.y = 0;
    this.fill.position.set(x, 0.05, z);
    this.fill.isPickable = false;
    this.fill.scaling.set(0.01, 0.01, 1);
    this.fill.setEnabled(true);
  }

  /** True once the resolve payoff (shockwave + kick) has fired. */
  get resolveFired(): boolean {
    return this.resolvedAtMs >= 0;
  }

  /** The RESOLVE moment: expanding shockwave + ember streaks + dust body. */
  private fireResolvePop(nowMs: number): void {
    this.resolvedAtMs = nowMs;
    // shockwave: pooled unit torus, expanded/faded per frame by update()
    this.shock =
      this.shared.shocks.pop() ??
      MeshBuilder.CreateTorus("telegraph-shock", { diameter: 1, thickness: 0.09, tessellation: 40 }, this.scene);
    if (!this.shock.material) this.shock.material = emissiveMat("telegraph-shock", this.scene, RING_TINT);
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
      alpha: BASE_ALPHA,
    };
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

    if (age <= this.fillMs) {
      // fill phase: disc scale-fills the ring (readability look unchanged)
      if (this.fill) {
        const t = Math.max(0.01, age / this.fillMs);
        const d = this.radius * 2 * t;
        this.fill.scaling.set(d, d, 1);
      }
      return;
    }

    // the AoE fires HERE — payoff pop exactly once, on the resolve frame
    if (this.resolvedAtMs < 0) this.fireResolvePop(nowMs);
    this.updateShock(nowMs);

    const fade = Math.min((age - this.fillMs) / this.holdMs, 1);
    if (fade < 1) {
      const eased = (1 - fade) * (1 - fade); // exponential-out, not linear
      const pop = 1 + RESOLVE_POP_SCALE * (1 - eased); // slight overshoot as it fires
      if (this.fill) {
        const d = this.radius * 2 * pop;
        this.fill.scaling.set(d, d, 1);
        (this.fill.material as StandardMaterial).alpha = BASE_ALPHA * eased;
      }
      if (this.ring) (this.ring.material as StandardMaterial).alpha = BASE_ALPHA * eased;
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
