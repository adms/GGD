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
 *
 * ---------------------------------------------------------------------------
 * #251 —— 文件現在**真的**套用得上去了
 * ---------------------------------------------------------------------------
 * 到 2026-08-01 為止，上面那句「trail's texture/tint comes from the
 * projectile's vfx doc when one exists (data-driven)」是**這份文件唯一到得了
 * 畫面的兩件事**。實測（餵一份把 count/size/lifetime/speed/blend/gravity 全部
 * 改掉的文件進來，再從 Babylon 讀回）capacity / emitRate / lifeTime /
 * emitPower / blendMode / gravity / sizeStops **一位元都沒動** —— 它們全部是
 * 這個檔案裡的常數，所以一顆冰彈、一道貫穿波、一發平砍是同一顆彗星換個顏色。
 *
 * 現在這些數字從 `views/projectileArt.ts` 來（純函式，它的檔頭有完整量測），
 * 而**彈體的體積跟著 `projectile@1.hitRadius` 走** —— 貫穿波的 0.9 在畫面上
 * 就是比平砍的 0.4 大，和 #136「顯示值 == 實際值」同一條原則。
 * 三格旋鈕在 `config.vfx-families@1`（`projectileArtFromDoc` /
 * `projectileRadiusGain` / `projectileFlyHeightY`），關掉就回到升級前的彗星。
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
import { blendModeFor } from "../../vfx/particleFactory";
import {
  MAX_TRAIL_CAPACITY,
  projectileTuning,
  resolveProjectileArt,
  SHIPPED_BODY_GIRTH,
  SHIPPED_BODY_LENGTH,
  SHIPPED_HEAD_SIZE,
  type ProjectileArt,
  type ProjectileMeshShape,
} from "./projectileArt";

export type { ProjectileMeshShape } from "./projectileArt";

const SPRITE_URL = "/content/assets/textures/particles/flare_01.png";
const TRAIL_FALLBACK_URL = "/content/assets/textures/particles/flame_02.png";

/** Backward streak speed (world-units/s) + stretched tail ratio. */
const TRAIL_SPEED = { min: 1.6, max: 2.6 };
const TRAIL_TAIL_LENGTH = 1.8;
const DEFAULT_TINT: Rgb = [1, 0.6, 0.2];

/**
 * 拖尾 `ParticleSystem` 的容量在 Babylon 裡是**建構時就鎖死**的，所以池化的
 * view 一律開到上限、再用 `emitRate` 決定實際密度。照 `art.trailCapacity` 開
 * 會讓一顆 18 顆的冰彈之後永遠再也長不回 96 顆的貫穿波（重建 system 才行，
 * 那就把池化的意義丟掉了）。
 */
const TRAIL_POOL_CAPACITY = MAX_TRAIL_CAPACITY;

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
    return MeshBuilder.CreateSphere(name, { diameter: SHIPPED_BODY_GIRTH * 2, segments: 6 }, scene);
  }
  // bolt + shard are the same tapered spike; a shard is flattened into a blade
  const mesh = MeshBuilder.CreateCylinder(
    name,
    {
      height: SHIPPED_BODY_LENGTH,
      diameterTop: 0,
      diameterBottom: SHIPPED_BODY_GIRTH,
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
  /** 這一發生效的規格 —— `setPose` 讀它的 `flyHeightY`。 */
  private art: ProjectileArt = resolveProjectileArt(null, undefined);
  /** 目前烘在 system 上的尺寸斜坡峰值(重建 gradient 的判斷依據)。 */
  private trailPeak = -1;
  // last rendered position — the motion delta aims the backward streak
  private lastX = 0;
  private lastZ = 0;
  private hasPose = false;

  constructor(scene: Scene) {
    this.scene = scene;
    const id = ProjectileView.counter++;
    this.id = id;
    // 建構時用出貨基準邊長；每一發的體積倍率走 `mesh.scaling`(見 applyArt)，
    // 因為池化的 view 會被不同 hitRadius 的彈道輪流用，重建平面等於放棄池化。
    this.mesh = MeshBuilder.CreatePlane(`proj-${id}`, { size: SHIPPED_HEAD_SIZE }, scene);
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

    this.trail = new ParticleSystem(`proj-${id}-trail`, TRAIL_POOL_CAPACITY, scene);
    this.trail.emitter = this.mesh;
    this.trail.minEmitBox = new Vector3(-0.05, -0.05, -0.05);
    this.trail.maxEmitBox = new Vector3(0.05, 0.05, 0.05);
    this.trail.minEmitPower = TRAIL_SPEED.min;
    this.trail.maxEmitPower = TRAIL_SPEED.max;
    this.trail.direction1 = new Vector3(0, 0, 0);
    this.trail.direction2 = new Vector3(0, 0, 0);
    this.aimNeutral();
    // no updraft: embers sag slightly behind the comet instead of floating up
    this.trail.gravity = new Vector3(0, -1.0, 0);
    // tail quads stretch along their backward velocity = the comet streak
    this.trail.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
    this.trail.minScaleY = TRAIL_TAIL_LENGTH;
    this.trail.maxScaleY = TRAIL_TAIL_LENGTH;
    this.trail.updateSpeed = 0.016;
    // emitRate / lifetime / blend / size ramp are per-activation now (#251):
    // they come from the projectile's OWN vfx doc + hitRadius via `applyArt`,
    // which the constructor calls once so a never-activated view is still sane.
    this.applyArt(resolveProjectileArt(null, undefined, projectileTuning()));
    this.setTrailStyle(null);
  }

  /**
   * #251 —— 把一發子彈的規格**真的寫進引擎**。
   *
   * 這是「文件到得了畫面」的那一行。守衛(`projectileArtApplied.test.ts`)量的
   * 就是這裡寫下去之後 Babylon 手上那顆 `ParticleSystem` 的值,不是 `art` 物件。
   */
  private applyArt(art: ProjectileArt): void {
    this.art = art;
    this.mesh.scaling.setAll(art.sizeMult);
    this.bodyPivot.scaling.setAll(art.sizeMult);
    this.trail.emitRate = art.trailRate;
    this.trail.minLifeTime = art.trailLife.min;
    this.trail.maxLifeTime = art.trailLife.max;
    this.trail.blendMode = blendModeFor(art.trailBlend);
    if (art.trailPeakSize !== this.trailPeak) {
      this.trailPeak = art.trailPeakSize;
      // 尺寸斜坡是烘進 system 的 —— 峰值變了就要重建,否則池化重用會沿用上一發。
      const old = this.trail.getSizeGradients();
      if (old) for (const g of [...old]) this.trail.removeSizeGradient(g.gradient);
      for (const [t, s] of popShrinkStops(art.trailPeakSize)) this.trail.addSizeGradient(t, s);
    }
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

  /**
   * @param hitRadius 這一發 `projectile@1.hitRadius` —— 它決定畫面上的體積
   *   (`projectileRadiusGain`)。省略 = 用參考半徑,也就是「不放大也不縮小」。
   */
  activate(
    doc: VfxDoc | null = null,
    shape: ProjectileMeshShape = "bolt",
    hitRadius?: number,
  ): void {
    this.setBodyShape(shape);
    // #251 —— 每一次啟用都重新解一次:池化的 view 會被不同的彈道輪流用,
    // 沿用上一發的大小/密度就是「貫穿波長得跟平砍一樣」的另一種版本。
    this.applyArt(resolveProjectileArt(doc, hitRadius, projectileTuning()));
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
    this.mesh.position.set(x, this.art.flyHeightY, z);
    this.bodyPivot.position.set(x, this.art.flyHeightY, z);
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
