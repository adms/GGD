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
 *
 * ---------------------------------------------------------------------------
 * GH#96 —— L0 條碼在執行期的入口（姊妹條的另一半）
 * ---------------------------------------------------------------------------
 * `paintVoxelAtlas` 從批次三起就收第二個參數 `barcode`，而在此之前**全遊戲唯一
 * 傳它的呼叫點是 `tools/voxel-gen/build.ts`（離線烘焙）** —— 執行期這條路一律
 * 單參數，所以「條碼是角色的特徵主視覺」在遊戲裡從來沒有成立過。
 *
 * ⚠️ 快取鍵**必須跟著條碼走**，⛔ 不可以只用 championId。同一個 championId 在
 * 「還沒載到條碼」與「載到條碼」兩個時刻會畫出**兩張不同的圖**，而舊的鍵會把先
 * 到的那一張永遠餵給後面每一個 view —— 那是失敗形態⑤（被畫出來的不是出貨的那
 * 個），而且它**看起來完全正常**：畫面上就是一隻上了色的英雄，只是上錯了色。
 */
import type { Scene } from "@babylonjs/core/scene";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import {
  ATLAS_H,
  ATLAS_W,
  fnv1a32,
  paintVoxelAtlas,
  type VoxelBarcode,
  type VoxelSkinRecipe,
} from "@ggd/shared/content/voxelSkin";

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
 * The cache key for one painted atlas — `championId` alone when there is no
 * barcode, `championId` PLUS a fingerprint of the barcode when there is one.
 *
 * Pure and exported so the "a barcoded champion never gets served the
 * un-barcoded texture" property is asserted directly rather than inferred from
 * a screenshot. The fingerprint is a hash of the whole record (not just its
 * `v`): an edited band is a different picture even at the same version.
 */
export function voxelSkinCacheKey(championId: string, barcode?: VoxelBarcode | null): string {
  if (!barcode) return championId;
  return `${championId}#${fnv1a32(JSON.stringify(barcode)).toString(36)}`;
}

/**
 * The atlas texture for `recipe`, painted on first use and shared thereafter.
 * Every successful call takes ONE reference; pair it with `releaseVoxelSkinTexture`.
 * Returns null if the engine refuses the upload (never throws into a ctor).
 *
 * `barcode` (GH#96) is the L0 signature when the champion has one; omitting it
 * keeps the L3 generator's look, which is still the answer for every w3x
 * original unit that has no real person to compare against.
 */
export function acquireVoxelSkinTexture(
  scene: Scene,
  recipe: VoxelSkinRecipe,
  barcode?: VoxelBarcode | null,
): RawTexture | null {
  const cache = cacheFor(scene);
  const key = voxelSkinCacheKey(recipe.championId, barcode);
  const hit = cache.get(key);
  if (hit) {
    hit.refs++;
    return hit.texture;
  }
  try {
    const bytes = paintVoxelAtlas(recipe, barcode ?? null);
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

/**
 * Drop one reference; the LAST release disposes the texture.
 *
 * `barcode` must be the SAME record the acquire used — pass nothing and you are
 * releasing the un-barcoded entry, which is the correct (and unchanged) answer
 * for every champion that has no barcode.
 */
export function releaseVoxelSkinTexture(
  scene: Scene,
  championId: string,
  barcode?: VoxelBarcode | null,
): void {
  const cache = CACHES.get(scene);
  const key = voxelSkinCacheKey(championId, barcode);
  const entry = cache?.get(key);
  if (!cache || !entry) return;
  entry.refs--;
  if (entry.refs > 0) return;
  cache.delete(key);
  entry.texture.dispose();
}

/** Live cache size — test/diagnostics seam only. */
export function voxelSkinTextureCacheSize(scene: Scene): number {
  return CACHES.get(scene)?.size ?? 0;
}

/** Reference count for one champion — test/diagnostics seam only. */
export function voxelSkinTextureRefs(
  scene: Scene,
  championId: string,
  barcode?: VoxelBarcode | null,
): number {
  return CACHES.get(scene)?.get(voxelSkinCacheKey(championId, barcode))?.refs ?? 0;
}
