/**
 * GroundDecalPool — pooled, hard-capped, fading ground splats (task #39).
 *
 * A blood pool is the only part of the spray that OUTLIVES the hit, so it is
 * also the only part that can wreck a frame budget: without a cap, a 3v3v3v3
 * teamfight would carpet the arena in translucent quads and blow out overdraw
 * on exactly the frames that matter most. So:
 *   · MAX_DECALS meshes exist, ever. The pool grows to the cap and then
 *     STEALS the oldest (its splat is already the faintest on screen).
 *   · meshes/materials/textures are allocated ONCE and reused forever —
 *     spawning a splat only re-points a transform and restarts a timer.
 *   · a spent decal is disabled, not disposed, so it costs nothing while idle.
 *
 * The splats are unlit dark quads lying flat on the ground with a per-instance
 * yaw (a deterministic golden-angle spin — no RNG in the render loop, and no
 * two neighbouring pools share a silhouette). Alpha follows `decalFade`:
 * held at peak, then a smooth square fade to EXACTLY zero.
 */
import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { decalFade, type DecalSpec } from "./bloodPresets";
import type { PresetSystemOptions } from "./vfxPresets";
import { lifecycleLedger } from "../render/lifecycleLedger";

/** Hard ceiling on concurrent ground decals (LRU-stolen beyond). */
export const MAX_DECALS = 20;

/** Height above the floor — enough to beat z-fighting, low enough to hug it. */
export const DECAL_Y = 0.035;

/** Golden angle (rad): successive splats never repeat a yaw for 20 spawns. */
const GOLDEN_ANGLE = 2.399963229728653;

const CONTENT_BASE = "/content/";

interface Decal {
  mesh: Mesh;
  mat: StandardMaterial;
  bornMs: number;
  lifeMs: number;
  alpha: number;
  active: boolean;
}

export class GroundDecalPool {
  private readonly decals: Decal[] = [];
  private spawnCount = 0;
  /** one texture per content path, shared by every decal that uses it */
  private readonly textures = new Map<string, BaseTexture | null>();

  constructor(
    private readonly scene: Scene,
    private readonly opts: PresetSystemOptions & { maxDecals?: number } = {},
  ) {
    // 🔬 GH#610 —— 一行接上生命週期登記表。⭐ 這一格是**對照組**:它有硬上限
    //（`cap`）,所以長到頂就會平掉 ⇒ 警報第三條件（最後一段仍在增）會讓它熄燈。
    // 一個「本來就該平掉的池子」持續被指名,代表警報條件寫錯了,⛔ 不是它洩漏。
    lifecycleLedger.gaugeContainers("decal", { pool: this.decals, textures: this.textures });
  }

  /** Splats currently visible (test/observability seam). */
  get activeCount(): number {
    return this.decals.filter((d) => d.active).length;
  }

  /** Meshes allocated so far — never exceeds the cap (test seam). */
  get poolSize(): number {
    return this.decals.length;
  }

  private get cap(): number {
    return Math.max(1, this.opts.maxDecals ?? MAX_DECALS);
  }

  private textureFor(path: string): BaseTexture | null {
    let tex = this.textures.get(path);
    if (tex === undefined) {
      const url = (this.opts.resolveTextureUrl ?? ((p: string): string => CONTENT_BASE + p))(path);
      const make =
        this.opts.createTexture ??
        ((u: string, s: Scene): BaseTexture => new Texture(u, s, false, false));
      tex = make(url, this.scene);
      if (tex) tex.hasAlpha = true;
      this.textures.set(path, tex);
    }
    return tex;
  }

  private make(): Decal {
    const mat = new StandardMaterial("vfx-decal-mat", this.scene);
    mat.disableLighting = true;
    mat.emissiveColor = new Color3(0.3, 0.02, 0.03);
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    mat.useAlphaFromDiffuseTexture = true;
    mat.backFaceCulling = false;
    // pull the splat toward the camera in depth so it never fights the floor
    mat.zOffset = -2;
    // unit ground quad in XZ facing +Y; scaled per spawn
    const mesh = MeshBuilder.CreateGround("vfx-decal", { width: 1, height: 1 }, this.scene);
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    mesh.setEnabled(false);
    return { mesh, mat, bornMs: -Infinity, lifeMs: 1, alpha: 0, active: false };
  }

  /**
   * Spawn (or steal) one splat at a world point. Reuses a spent decal, else
   * grows to the cap, else steals the OLDEST active one. Returns the decal's
   * index (test seam).
   */
  spawn(x: number, z: number, spec: DecalSpec, nowMs: number): number {
    let idx = this.decals.findIndex((d) => !d.active);
    if (idx < 0 && this.decals.length < this.cap) {
      this.decals.push(this.make());
      idx = this.decals.length - 1;
    }
    if (idx < 0) {
      // every splat is live: steal the oldest (already the faintest)
      idx = 0;
      for (let i = 1; i < this.decals.length; i++) {
        if (this.decals[i]!.bornMs < this.decals[idx]!.bornMs) idx = i;
      }
    }
    const d = this.decals[idx]!;
    const tex = this.textureFor(spec.texture);
    if (tex) d.mat.diffuseTexture = tex as Texture;
    d.mat.emissiveColor.set(spec.tint[0], spec.tint[1], spec.tint[2]);
    d.bornMs = nowMs;
    d.lifeMs = Math.max(1, spec.lifeMs);
    d.alpha = spec.alpha;
    d.active = true;
    const size = Math.max(0.01, spec.radius) * 2;
    d.mesh.scaling.set(size, 1, size);
    d.mesh.position.set(x, DECAL_Y, z);
    d.mesh.rotation.y = GOLDEN_ANGLE * this.spawnCount++;
    d.mesh.setEnabled(true);
    d.mat.alpha = spec.alpha;
    return idx;
  }

  /** Advance every live splat's fade; disable the spent ones. Once per frame. */
  update(nowMs: number): void {
    for (const d of this.decals) {
      if (!d.active) continue;
      const t = (nowMs - d.bornMs) / d.lifeMs;
      if (t >= 1) {
        d.active = false;
        d.mat.alpha = 0;
        d.mesh.setEnabled(false);
        continue;
      }
      d.mat.alpha = d.alpha * decalFade(t);
    }
  }

  /** Current alpha of a pooled decal (test seam). */
  alphaAt(index: number): number {
    return this.decals[index]?.mat.alpha ?? 0;
  }

  /**
   * ROUND BOUNDARY (#16 / #259): every splat off the floor NOW, without
   * throwing the pool away. 焦痕是「上一場打到哪裡」的紀錄 —— 進商店、換場地
   * 之後它就只是垃圾；等它自己 fade 完是不行的，因為場地會在下一回合換掉，
   * 焦痕會留在新地圖上完全對不上的位置。池子本身留著（有 cap，不會長大）。
   */
  clear(): void {
    for (const d of this.decals) {
      d.active = false;
      d.mat.alpha = 0;
      d.mesh.setEnabled(false);
    }
  }

  dispose(): void {
    for (const d of this.decals) {
      d.mesh.dispose(false, true);
    }
    for (const tex of this.textures.values()) tex?.dispose();
    this.textures.clear();
    this.decals.length = 0;
  }
}
