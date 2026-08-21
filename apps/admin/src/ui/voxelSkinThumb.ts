/**
 * voxelSkinThumb — the contact-sheet portrait compositor.
 *
 * WHY 2D AND NOT 114 BABYLON CANVASES. Rendering 114 live WebGL previews will
 * not hold framerate, and it is unnecessary: `paintVoxelAtlas` already produces
 * the exact texels the game samples, so blitting those rects into a paper-doll
 * elevation shows the OWNER THE SHIPPED PIXELS rather than an approximation of
 * them. 114 tiny putImageData calls are a trivial 2D workload.
 *
 * The layout is a front elevation (head over torso, arms flanking, legs below)
 * plus a narrow side strip, drawn at 1 texel = 1 pixel and then scaled up with
 * `imageSmoothingEnabled = false` so the blocks stay hard-edged.
 *
 * GH#96 —— 這一頁的用途就是「給 owner 看出貨的像素」，所以它必須跟遊戲吃同一份
 * 條碼：少了第二個參數，對照表畫的是 L3 產生器的猜測，而遊戲裡（條碼串進去之後）
 * 畫的是 L0 條碼 —— 兩張圖不一樣，而**畫面上看不出來哪一張才是真的**。
 */
import {
  ATLAS_FACES,
  ATLAS_W,
  paintVoxelAtlas,
  type AtlasRect,
  type VoxelBarcode,
  type VoxelSkinRecipe,
} from "@ggd/shared/content/voxelSkin";

/** Paper-doll canvas size in TEXELS (scaled up by the caller). */
export const THUMB_W = 24;
export const THUMB_H = 34;

/** Where each atlas rect lands on the paper doll, in thumb-local texels. */
interface Placement {
  src: AtlasRect;
  dx: number;
  dy: number;
}

/**
 * Front elevation. x is centred on an 24-wide sheet: arms at 4 and 16, torso
 * and head at 8, legs at 8 and 12 — the same left/right relationship the boxes
 * have in world space, so the thumbnail reads as the champion, not as a chart.
 */
function frontPlacements(): Placement[] {
  const F = ATLAS_FACES;
  return [
    { src: F.head.front, dx: 8, dy: 1 },
    { src: F.torso.front, dx: 8, dy: 9 },
    { src: F.armL.front, dx: 4, dy: 9 },
    { src: F.armR.front, dx: 20, dy: 9 },
    { src: F.legs.front, dx: 8, dy: 21 },
    { src: F.legs.front, dx: 12, dy: 21 },
    // side strip: the profile is what shows a hood / cape / long hair
    { src: F.head.right, dx: 0, dy: 1 },
    { src: F.torso.right, dx: 0, dy: 9 },
  ];
}

/**
 * Compose the paper doll into a fresh ImageData-compatible buffer.
 * PURE — no DOM. The caller decides where to put it.
 */
export function composeThumb(
  recipe: VoxelSkinRecipe,
  barcode?: VoxelBarcode | null,
): Uint8ClampedArray {
  const atlas = paintVoxelAtlas(recipe, barcode ?? null);
  const out = new Uint8ClampedArray(THUMB_W * THUMB_H * 4);
  for (const { src, dx, dy } of frontPlacements()) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const tx = dx + x;
        const ty = dy + y;
        if (tx < 0 || ty < 0 || tx >= THUMB_W || ty >= THUMB_H) continue;
        const si = ((src.y + y) * ATLAS_W + (src.x + x)) * 4;
        const di = (ty * THUMB_W + tx) * 4;
        out[di] = atlas[si] as number;
        out[di + 1] = atlas[si + 1] as number;
        out[di + 2] = atlas[si + 2] as number;
        out[di + 3] = 255;
      }
    }
  }
  return out;
}

/**
 * Draw the paper doll into a canvas at `scale`× nearest-neighbour. Returns
 * false when the browser refuses a 2D context (the caller then shows the
 * palette chips alone rather than a blank tile).
 */
export function drawThumb(
  canvas: HTMLCanvasElement,
  recipe: VoxelSkinRecipe,
  scale = 4,
  barcode?: VoxelBarcode | null,
): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const data = composeThumb(recipe, barcode);
  canvas.width = THUMB_W * scale;
  canvas.height = THUMB_H * scale;
  const small = ctx.createImageData(THUMB_W, THUMB_H);
  small.data.set(data);
  // putImageData ignores transforms, so stage at 1× then scale through a
  // second canvas-free path: draw each texel as a rect. At 24×34 that is 816
  // fills, which is cheaper than allocating 114 offscreen canvases.
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < THUMB_H; y++) {
    for (let x = 0; x < THUMB_W; x++) {
      const i = (y * THUMB_W + x) * 4;
      if ((data[i + 3] as number) === 0) continue;
      ctx.fillStyle = `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return true;
}
