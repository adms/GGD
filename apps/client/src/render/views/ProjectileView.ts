/**
 * ProjectileView — pooled COMET: a real 3D BODY flying nose-first along its
 * path, wrapped in a white-hot billboard glow and a stretched-billboard trail
 * streaking backward (fewer/bigger/brighter/shorter — task #33 retune on the
 * vfxPresets ramps).
 *
 * The 3D body (task #60) is what makes a ranged basic attack read as a missile
 * travelling toward its victim: a billboard alone is a flat decal that looks
 * identical from the fixed camera whichever way it flies, so ranged autos were
 * indistinguishable from ambient sparkle. The body is PROCEDURAL — a tapered
 * bolt / orb / shard chosen by the projectile doc's `meshShape` and tinted from
 * its vfx doc — so every projectile in the game gets one with no art
 * dependency, and it is oriented from the same motion delta that aims the
 * trail. It is render-only and never feeds the sim.
 * The EntityViewRegistry acquires a view when a projectile entity appears and
 * releases it back to the pool on despawn (projectiles churn fast; pooling
 * avoids per-cast allocations). The trail's texture/tint comes from the
 * projectile's vfx doc when one exists (data-driven), warm default otherwise.
 *
 * Comet mechanics: setPose() tracks the motion delta and points the trail
 * emitter BACKWARD along it, so particles fly opposite the travel direction
 * with BILLBOARDMODE_STRETCHED stretching each quad along that velocity —
 * young white-hot particles hug the head (bright core), older ones cool and
 * shrink down the tail (hot→cool 4-stop ramp + pop-shrink size ramp).
 *
 * Allocation discipline: textures are shared per scene (a pooled view restyles
 * on every cast, so per-activation `new Texture` would decode the same image
 * over and over and strand the old ones), and dispose() therefore tears down
 * only what the view itself owns.
 */
import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { VfxDoc } from "@ggd/shared/content";
import { hotToCoolStops, popShrinkStops, type Rgb } from "../../vfx/vfxPresets";

/** 3D body shape of the flying missile (projectile@1 `meshShape`). */
export type ProjectileMeshShape = "bolt" | "orb" | "shard";

const FLY_HEIGHT = 1.0;
const SPRITE_URL = "/content/assets/textures/particles/flare_01.png";
const TRAIL_FALLBACK_URL = "/content/assets/textures/particles/flame_02.png";

/** Head sprite size (world units) — the bright comet head reads first. */
const HEAD_SIZE = 1.15;
/** Trail budget: fewer-bigger-brighter-shorter than the old 80cap/70rate. */
const TRAIL_CAPACITY = 48;
const TRAIL_RATE = 55;
const TRAIL_LIFE = { min: 0.14, max: 0.3 };
/** Backward streak speed (world-units/s) + stretched tail ratio. */
const TRAIL_SPEED = { min: 1.6, max: 2.6 };
const TRAIL_TAIL_LENGTH = 1.8;
/** Peak trail-particle size (pop-shrink ramp shrinks it to nothing). */
const TRAIL_PEAK_SIZE = 0.42;
const DEFAULT_TINT: Rgb = [1, 0.6, 0.2];

/** 3D body: nose-to-tail length and cross-section (world units). */
const BODY_LENGTH = 0.95;
const BODY_GIRTH = 0.26;

/**
 * Per-scene texture cache. Projectile views are POOLED and restyled per cast
 * (a fire bolt view is reused for a thorn), so a fresh `new Texture(url)` per
 * activation would decode the same image again and strand the previous one in
 * `scene.textures` for the whole match. Keyed by URL, loaded once, disposed
 * with the scene.
 */
const texCacheByScene = new WeakMap<Scene, Map<string, Texture>>();

function sharedTexture(scene: Scene, url: string): Texture {
  let cache = texCacheByScene.get(scene);
  if (!cache) {
    cache = new Map();
    texCacheByScene.set(scene, cache);
  }
  let tex = cache.get(url);
  if (!tex) {
    tex = new Texture(url, scene);
    tex.hasAlpha = true;
    cache.set(url, tex);
  }
  return tex;
}

/**
 * Build the procedural 3D missile body, modelled along its own local +Y so the
 * pivot node below can point it with a single yaw. Low-poly on purpose: at most
 * a dozen of these fly at once and they are on screen for a fraction of a
 * second, so silhouette is all that matters.
 */
function buildBody(scene: Scene, id: number, shape: ProjectileMeshShape): Mesh {
  const name = `proj-${id}-body`;
  if (shape === "orb") {
    return MeshBuilder.CreateSphere(name, { diameter: BODY_GIRTH * 2, segments: 6 }, scene);
  }
  // bolt + shard are the same tapered spike; a shard is flattened into a blade
  const mesh = MeshBuilder.CreateCylinder(
    name,
    {
      height: BODY_LENGTH,
      diameterTop: 0,
      diameterBottom: BODY_GIRTH,
      tessellation: shape === "shard" ? 4 : 6,
    },
    scene,
  );
  if (shape === "shard") mesh.scaling.x = 0.35;
  return mesh;
}

export class ProjectileView {
  private static counter = 0;
  readonly mesh: Mesh;
  /** Pivot carrying the 3D body's position + travel yaw (see setPose). */
  readonly bodyPivot: TransformNode;
  private body: Mesh;
  private bodyShape: ProjectileMeshShape = "bolt";
  private readonly bodyMat: StandardMaterial;
  private readonly mat: StandardMaterial;
  private readonly trail: ParticleSystem;
  private readonly scene: Scene;
  private readonly id: number;
  private trailTextureUrl = "";
  private trailTintKey = "";
  // last rendered position — the motion delta aims the backward streak
  private lastX = 0;
  private lastZ = 0;
  private hasPose = false;

  constructor(scene: Scene) {
    this.scene = scene;
    const id = ProjectileView.counter++;
    this.id = id;
    this.mesh = MeshBuilder.CreatePlane(`proj-${id}`, { size: HEAD_SIZE }, scene);
    this.mesh.billboardMode = 7; // BILLBOARDMODE_ALL
    this.mat = new StandardMaterial(`proj-${id}-mat`, scene);
    this.mat.disableLighting = true;
    this.mat.emissiveColor = new Color3(1.0, 0.8, 0.45);
    const sprite = sharedTexture(scene, SPRITE_URL);
    this.mat.emissiveTexture = sprite;
    this.mat.opacityTexture = sprite;
    this.mesh.material = this.mat;
    this.mesh.isPickable = false;
    this.mesh.setEnabled(false);

    // 3D body under the glow. The pivot owns position + yaw; the body itself
    // carries a fixed 90° pitch so its local +Y (the modelling axis) points
    // along the pivot's +Z, which setPose then yaws onto the travel direction.
    this.bodyPivot = new TransformNode(`proj-${id}-pivot`, scene);
    this.bodyMat = new StandardMaterial(`proj-${id}-body-mat`, scene);
    this.bodyMat.disableLighting = true;
    this.bodyMat.emissiveColor = new Color3(1, 0.8, 0.45);
    this.body = buildBody(scene, id, this.bodyShape);
    this.attachBody();
    this.bodyPivot.setEnabled(false);

    this.trail = new ParticleSystem(`proj-${id}-trail`, TRAIL_CAPACITY, scene);
    this.trail.emitter = this.mesh;
    this.trail.minEmitBox = new Vector3(-0.05, -0.05, -0.05);
    this.trail.maxEmitBox = new Vector3(0.05, 0.05, 0.05);
    this.trail.emitRate = TRAIL_RATE;
    this.trail.minLifeTime = TRAIL_LIFE.min;
    this.trail.maxLifeTime = TRAIL_LIFE.max;
    this.trail.minEmitPower = TRAIL_SPEED.min;
    this.trail.maxEmitPower = TRAIL_SPEED.max;
    this.trail.direction1 = new Vector3(0, 0, 0);
    this.trail.direction2 = new Vector3(0, 0, 0);
    this.aimNeutral();
    // no updraft: embers sag slightly behind the comet instead of floating up
    this.trail.gravity = new Vector3(0, -1.0, 0);
    this.trail.blendMode = ParticleSystem.BLENDMODE_ADD;
    // tail quads stretch along their backward velocity = the comet streak
    this.trail.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
    this.trail.minScaleY = TRAIL_TAIL_LENGTH;
    this.trail.maxScaleY = TRAIL_TAIL_LENGTH;
    this.trail.updateSpeed = 0.016;
    for (const [t, s] of popShrinkStops(TRAIL_PEAK_SIZE)) this.trail.addSizeGradient(t, s);
    this.setTrailStyle(null);
  }

  /** Parent + orient the body under the pivot (shared by build and reshape). */
  private attachBody(): void {
    this.body.parent = this.bodyPivot;
    this.body.rotation.x = Math.PI / 2; // local +Y → pivot +Z (nose forward)
    this.body.material = this.bodyMat;
    this.body.isPickable = false;
  }

  /**
   * Swap the 3D body when a pooled view is reused for a differently-shaped
   * projectile. A no-op for the common case (same shape), so recycling a bolt
   * as a bolt allocates nothing.
   */
  private setBodyShape(shape: ProjectileMeshShape): void {
    if (shape === this.bodyShape) return;
    this.bodyShape = shape;
    this.body.dispose(false, false);
    this.body = buildBody(this.scene, this.id, shape);
    this.attachBody();
  }

  /** Style the head + trail from the projectile's vfx doc (or defaults). */
  private setTrailStyle(doc: VfxDoc | null): void {
    // tint = the doc's full-tint stop (stop[1] of a hot→cool ramp) when
    // authored, else the legacy start color, else the warm default
    const authored = doc?.colorStops && doc.colorStops.length > 1 ? doc.colorStops[1]![1] : doc?.color.start;
    const tint: Rgb = authored ? [authored[0], authored[1], authored[2]] : DEFAULT_TINT;
    const tintKey = tint.join(",");
    if (tintKey !== this.trailTintKey) {
      this.trailTintKey = tintKey;
      // gradients are baked per system — rebuild them when the tint changes
      const old = this.trail.getColorGradients();
      if (old) for (const g of [...old]) this.trail.removeColorGradient(g.gradient);
      for (const [t, c] of hotToCoolStops(tint)) {
        this.trail.addColorGradient(t, new Color4(c[0], c[1], c[2], c[3]));
      }
    }
    // white-hot head: strongly whitened tint so the core reads bright
    this.mat.emissiveColor = new Color3(
      0.65 + tint[0] * 0.35,
      0.65 + tint[1] * 0.35,
      0.65 + tint[2] * 0.35,
    );
    // the solid body keeps the doc's own colour (less whitened than the glow)
    // so the missile still has a silhouette against the bloom around it
    this.bodyMat.emissiveColor = new Color3(
      0.25 + tint[0] * 0.75,
      0.25 + tint[1] * 0.75,
      0.25 + tint[2] * 0.75,
    );
    const url = doc?.texture ? `/content/${doc.texture}` : TRAIL_FALLBACK_URL;
    if (url !== this.trailTextureUrl) {
      this.trailTextureUrl = url;
      this.trail.particleTexture = sharedTexture(this.scene, url);
    }
  }

  /** Until a motion delta lands, embers just sag off the head. */
  private aimNeutral(): void {
    this.trail.direction1.set(-0.2, -0.6, -0.2);
    this.trail.direction2.set(0.2, -0.2, 0.2);
  }

  activate(doc: VfxDoc | null = null, shape: ProjectileMeshShape = "bolt"): void {
    this.setBodyShape(shape);
    this.setTrailStyle(doc);
    // pooled reuse: the previous projectile's motion delta AND the streak it
    // aimed are both meaningless — the view teleports to a new cast
    this.hasPose = false;
    this.aimNeutral();
    this.mesh.setEnabled(true);
    this.bodyPivot.setEnabled(true);
    this.trail.start();
  }

  deactivate(): void {
    this.mesh.setEnabled(false);
    this.bodyPivot.setEnabled(false);
    this.trail.stop();
  }

  setPose(x: number, z: number): void {
    this.mesh.position.set(x, FLY_HEIGHT, z);
    this.bodyPivot.position.set(x, FLY_HEIGHT, z);
    if (this.hasPose) {
      const dx = this.lastX - x; // points BACKWARD along the motion
      const dz = this.lastZ - z;
      const len = Math.hypot(dx, dz);
      if (len > 1e-4) {
        const bx = dx / len;
        const bz = dz / len;
        // narrow backward cone (±0.18 spread) so the tail stays a streak
        this.trail.direction1.set(bx - 0.18, -0.18, bz - 0.18);
        this.trail.direction2.set(bx + 0.18, 0.18, bz + 0.18);
        // …and the 3D body points NOSE-FIRST down the same delta (forward, so
        // negate the backward vector). Render-only: trig here can never reach
        // the sim, which carries facing as a vector and uses no trigonometry.
        this.bodyPivot.rotation.y = Math.atan2(-bx, -bz);
      }
    }
    this.lastX = x;
    this.lastZ = z;
    this.hasPose = true;
  }

  dispose(): void {
    // the head sprite + trail textures are SHARED per scene (sharedTexture):
    // dispose only what this view owns, never the cached textures — another
    // pooled view is still drawing with them.
    this.trail.dispose(false);
    this.mesh.dispose(false, false);
    this.mat.dispose();
    this.body.dispose(false, false);
    this.bodyPivot.dispose();
    this.bodyMat.dispose();
  }
}
