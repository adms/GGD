/**
 * voxelSkinTexture — the thin Babylon bridge for task #231's painted skin.
 *
 * `paintVoxelAtlas` (shared, pure) produces 16,384 RGBA bytes; this file turns
 * them into a texture and nothing else. It is the ONLY file in the skin feature
 * that imports Babylon, which is what keeps the generator and the painter
 * unit-testable, reusable by the admin contact sheet, and free of a canvas.
 *
 * WHY `RawTexture` AND NOT `DynamicTexture`. DynamicTexture allocates an
 * OffscreenCanvas and paints through a 2D context — neither of which exists in
 * the headless NullEngine the render tests run on (the menu's procedural
 * sprites have to install a canvas stub for exactly this reason). RawTexture
 * takes the byte array directly, so the same code path runs in the browser and
 * in vitest with no stubbing and no `getContext()` fallback branch to rot.
 *
 * NEAREST sampling and no mipmaps are load-bearing, not preferences: one texel
 * is one voxel-pixel, so any filtering would smear an 8×8 face into mush.
 *
 * CACHED AND REFCOUNTED per championId. Six champions in a duel zone all on the
 * same hero share ONE 16 KB texture, and the last view to release it disposes
 * it. Peak residency is therefore ~8 live textures (~131 KB), not 114 × 16 KB.
 */
import type { Scene } from "@babylonjs/core/scene";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { ATLAS_H, ATLAS_W, paintVoxelAtlas, type VoxelSkinRecipe } from "@ggd/shared/content/voxelSkin";

interface Entry {
  texture: RawTexture;
  refs: number;
}

/** Per-scene cache: `scene → championId → {texture, refs}`. */
const CACHES = new WeakMap<Scene, Map<string, Entry>>();

function cacheFor(scene: Scene): Map<string, Entry> {
  let c = CACHES.get(scene);
  if (!c) {
    c = new Map();
    CACHES.set(scene, c);
  }
  return c;
}

/**
 * The atlas texture for `recipe`, painted on first use and shared thereafter.
 * Every successful call takes ONE reference; pair it with `releaseVoxelSkinTexture`.
 * Returns null if the engine refuses the upload (never throws into a ctor).
 */
export function acquireVoxelSkinTexture(scene: Scene, recipe: VoxelSkinRecipe): RawTexture | null {
  const cache = cacheFor(scene);
  const key = recipe.championId;
  const hit = cache.get(key);
  if (hit) {
    hit.refs++;
    return hit.texture;
  }
  try {
    const bytes = paintVoxelAtlas(recipe);
    const tex = RawTexture.CreateRGBATexture(
      new Uint8Array(bytes.buffer.slice(0)),
      ATLAS_W,
      ATLAS_H,
      scene,
      false, // no mipmaps — 1 texel is 1 voxel-pixel
      true, // invertY: the atlas is authored top-down (see paint.ts)
      Texture.NEAREST_SAMPLINGMODE,
    );
    tex.name = `voxelskin-${key}`;
    tex.wrapU = Texture.CLAMP_ADDRESSMODE;
    tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    cache.set(key, { texture: tex, refs: 1 });
    return tex;
  } catch (err) {
    console.warn(`[voxelSkinTexture] could not build atlas for ${key}:`, err);
    return null;
  }
}

/** Drop one reference; the LAST release disposes the texture. */
export function releaseVoxelSkinTexture(scene: Scene, championId: string): void {
  const cache = CACHES.get(scene);
  const entry = cache?.get(championId);
  if (!cache || !entry) return;
  entry.refs--;
  if (entry.refs > 0) return;
  cache.delete(championId);
  entry.texture.dispose();
}

/** Live cache size — test/diagnostics seam only. */
export function voxelSkinTextureCacheSize(scene: Scene): number {
  return CACHES.get(scene)?.size ?? 0;
}

/** Reference count for one champion — test/diagnostics seam only. */
export function voxelSkinTextureRefs(scene: Scene, championId: string): number {
  return CACHES.get(scene)?.get(championId)?.refs ?? 0;
}
