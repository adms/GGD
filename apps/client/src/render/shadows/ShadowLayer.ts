/**
 * ShadowLayer — soft blob shadows under every live body (task #147).
 *
 * The playtest flagged that champions/flowers float — nothing grounds them to
 * the floor. This is a SELF-CONTAINED layer that draws one soft dark disc per
 * live entity and follows it every frame. It reads NOTHING itself: the caller
 * (VfxSystem) hands it a plain list of `{ id, x, z, radius }` each frame, built
 * from the rendered positions the render layer already exposes (frameBus +
 * `ctx.entityPos`). It therefore never imports ChampionView / the HUD store /
 * the sim, and never mutates a shared `.glb` — it just parents a pooled quad
 * under each foot.
 *
 * POOLING. One disc mesh per live id, kept in a Map; when an id disappears its
 * disc is disabled and returned to a free list, so a champion that dies and
 * respawns reuses the same mesh and a 12-body arena allocates at most ~a dozen
 * discs, ever. Discs/materials/textures are created ONCE and reused; a spent
 * disc is disabled, not disposed, so idle bodies cost nothing.
 *
 * The disc is an unlit ground quad, black, with a soft radial alpha texture and
 * ALPHA_COMBINE blend — so `out = ground·(1−a·texA)`, i.e. it simply DARKENS the
 * floor under the body (never adds light), which is exactly a contact shadow.
 */
import type { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { SHADOW_ALPHA, SHADOW_Y, clampShadowRadius } from "./shadowMath";

const CONTENT_BASE = "/content/";

/** A soft filled-circle sprite doubles as the blob-shadow alpha mask. */
const SHADOW_TEXTURE = "assets/textures/particles/circle_05.png";

/** Hard ceiling on concurrent shadow discs — a duel arena never needs more. */
export const MAX_SHADOWS = 32;

/** One live body's shadow request for a frame. */
export interface ShadowInput {
  /** entity id — the pool key, so a disc follows the SAME body frame to frame */
  id: number;
  x: number;
  z: number;
  /** footprint radius (world units) — the disc is scaled to a disc of this */
  radius: number;
}

/** Test seam: how a content-relative texture path becomes a Babylon texture. */
export interface ShadowLayerOptions {
  resolveTextureUrl?: (contentPath: string) => string;
  createTexture?: (url: string, scene: Scene) => BaseTexture | null;
}

interface Disc {
  mesh: Mesh;
  active: boolean;
}

export class ShadowLayer {
  /** entity id → its live disc */
  private readonly active = new Map<number, Disc>();
  /** discs whose body vanished, ready to re-home under a new body */
  private readonly free: Disc[] = [];
  private tex: BaseTexture | null = null;
  private texLoaded = false;

  constructor(
    private readonly scene: Scene,
    private readonly opts: ShadowLayerOptions = {},
  ) {}

  /** Discs currently drawn (test/observability seam). */
  get activeCount(): number {
    return this.active.size;
  }

  /** Total discs allocated so far — never exceeds MAX_SHADOWS (test seam). */
  get poolSize(): number {
    return this.active.size + this.free.length;
  }

  /** Current world position of a body's disc, or null (test seam). */
  positionOf(id: number): { x: number; z: number } | null {
    const d = this.active.get(id);
    return d ? { x: d.mesh.position.x, z: d.mesh.position.z } : null;
  }

  private texture(): BaseTexture | null {
    if (!this.texLoaded) {
      const url = (this.opts.resolveTextureUrl ?? ((p) => CONTENT_BASE + p))(SHADOW_TEXTURE);
      const make =
        this.opts.createTexture ??
        ((u: string, s: Scene): BaseTexture => new Texture(u, s, false, false));
      this.tex = make(url, this.scene);
      if (this.tex) {
        // the circle sprites are white shapes: read alpha from luminance so the
        // soft radial falloff becomes the shadow's soft edge regardless of
        // whether the PNG ships a real alpha channel
        this.tex.getAlphaFromRGB = true;
        this.tex.hasAlpha = true;
      }
      this.texLoaded = true;
    }
    return this.tex;
  }

  private make(): Disc {
    const mat = new StandardMaterial("blob-shadow-mat", this.scene);
    mat.disableLighting = true;
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.emissiveColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    mat.alpha = SHADOW_ALPHA;
    const tex = this.texture();
    if (tex) mat.opacityTexture = tex as Texture;
    mat.backFaceCulling = false;
    // pull toward the camera in depth so the disc never fights the floor
    mat.zOffset = -2;
    const mesh = MeshBuilder.CreateGround("blob-shadow", { width: 1, height: 1 }, this.scene);
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.receiveShadows = false;
    mesh.alwaysSelectAsActiveMesh = true; // a tiny quad; skip the cull round-trip
    mesh.setEnabled(false);
    return { mesh, active: false };
  }

  /** Claim a disc for a body: reuse a free one, else grow to the cap, else null. */
  private claim(): Disc | null {
    const spare = this.free.pop();
    if (spare) return spare;
    if (this.active.size + this.free.length < MAX_SHADOWS) return this.make();
    return null;
  }

  /**
   * Re-home every disc onto THIS frame's live bodies. Bodies present get a disc
   * positioned + scaled under them; discs whose body is gone this frame are
   * disabled and freed for reuse. `_nowMs` is accepted for a uniform per-frame
   * signature (the shadow has no time-based animation of its own).
   */
  sync(inputs: readonly ShadowInput[], _nowMs?: number): void {
    // 1) reap: any active id NOT in this frame's inputs releases its disc
    if (this.active.size > 0) {
      const present = new Set<number>();
      for (const s of inputs) present.add(s.id);
      for (const [id, disc] of this.active) {
        if (!present.has(id)) {
          disc.mesh.setEnabled(false);
          disc.active = false;
          this.active.delete(id);
          this.free.push(disc);
        }
      }
    }
    // 2) place / update a disc under every live body
    for (const s of inputs) {
      if (!Number.isFinite(s.x) || !Number.isFinite(s.z)) continue;
      let disc = this.active.get(s.id);
      if (!disc) {
        const claimed = this.claim();
        if (!claimed) continue; // at the cap — silently skip the overflow body
        disc = claimed;
        disc.active = true;
        disc.mesh.setEnabled(true);
        this.active.set(s.id, disc);
      }
      const d = clampShadowRadius(s.radius) * 2;
      disc.mesh.scaling.set(d, 1, d);
      disc.mesh.position.set(s.x, SHADOW_Y, s.z);
    }
  }

  /** Release everything (round reset / scene teardown). */
  dispose(): void {
    for (const disc of this.active.values()) disc.mesh.dispose(false, true);
    for (const disc of this.free) disc.mesh.dispose(false, true);
    this.active.clear();
    this.free.length = 0;
    this.tex?.dispose();
    this.tex = null;
    this.texLoaded = false;
  }
}
